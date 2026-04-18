let ort = null;
let imageSession = null;
let labels = [];
let isInitializing = false;

const CONFIG = {
    MODEL_PATH: '/assets/image_detector.onnx',
    LABELS_PATH: '/assets/labels.txt',
    INPUT_SIZE: 224,
    INPUT_NAME: 'serving_default_sequential_27_input:0',
    OUTPUT_NAME: 'StatefulPartitionedCall:0',
};

async function loadLabels() {
    if (labels.length > 0) return;
    try {
        const response = await fetch(CONFIG.LABELS_PATH);
        const text = await response.text();
        labels = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const parts = line.split(' ');
                return parts.length > 1 ? parts.slice(1).join(' ') : line;
            });
    } catch (error) {
        console.error('Failed to load labels for client image detector:', error);
    }
}

export async function initClientImageDetector() {
    if (imageSession) return;
    if (isInitializing) return;
    isInitializing = true;

    try {
        if (typeof window === 'undefined') return;
        if (!ort) {
            const onnx = await import('onnxruntime-web');
            ort = onnx.default || onnx;
        }
        await loadLabels();
        imageSession = await ort.InferenceSession.create(CONFIG.MODEL_PATH, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log('Client Image AI Engine Ready');
    } catch (error) {
        console.error('Client Image AI Initialization Error:', error);
    } finally {
        isInitializing = false;
    }
}

async function preprocessImage(imageSource) {
    // imageSource can be an HTMLImageElement or Blob/File
    let img;
    if (imageSource instanceof Blob || imageSource instanceof File) {
        img = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageSource);
        });
    } else {
        img = imageSource;
    }

    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.INPUT_SIZE;
    canvas.height = CONFIG.INPUT_SIZE;
    const ctx = canvas.getContext('2d');
    
    // Draw and resize (equivalent to sharp's fill)
    ctx.drawImage(img, 0, 0, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE);
    
    const imageData = ctx.getImageData(0, 0, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE);
    const { data } = imageData; // RGBA

    const floatData = new Float32Array(CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE * 3);
    for (let i = 0; i < CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE; i++) {
        // Normalize [0, 255] to [-1, 1]
        floatData[i * 3 + 0] = (data[i * 4 + 0] / 127.5) - 1.0; // R
        floatData[i * 3 + 1] = (data[i * 4 + 1] / 127.5) - 1.0; // G
        floatData[i * 3 + 2] = (data[i * 4 + 2] / 127.5) - 1.0; // B
    }

    return new ort.Tensor('float32', floatData, [1, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, 3]);
}

export async function scanImageLocally(imageSource) {
    if (!imageSource) return false;

    if (!imageSession) {
        await initClientImageDetector();
    }
    if (!imageSession) return false;

    try {
        const tensor = await preprocessImage(imageSource);
        const results = await imageSession.run({ [CONFIG.INPUT_NAME]: tensor });
        const output = results[CONFIG.OUTPUT_NAME].data;

        let maxIdx = 0;
        let maxVal = -1;
        for (let i = 0; i < output.length; i++) {
            if (output[i] > maxVal) {
                maxVal = output[i];
                maxIdx = i;
            }
        }

        // Index 0 is 'Safe', anything else is suspicious/offensive
        const isSensitive = maxIdx !== 0;
        
        if (isSensitive) {
            console.warn('CLIENT SENSITIVE IMAGE DETECTED:', labels[maxIdx] || maxIdx, 'Confidence:', maxVal);
        }
        
        return {
            isSensitive,
            label: labels[maxIdx] || 'unknown',
            confidence: maxVal
        };
    } catch (error) {
        console.error('Client image scan failed:', error);
        return { isSensitive: false };
    }
}
