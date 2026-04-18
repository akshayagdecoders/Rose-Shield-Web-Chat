import path from 'path';
import fs from 'fs/promises';

let ort = null;
let sharp = null;
let imageSession = null;
let labels = [];
let isInitializing = false;

const getAssetsDir = () => {
    return path.join(process.cwd(), 'public', 'assets');
};

const ASSETS_DIR = getAssetsDir();

const CONFIG = {
    MODEL_PATH: path.join(ASSETS_DIR, 'image_detector.onnx'),
    LABELS_PATH: path.join(ASSETS_DIR, 'labels.txt'),
    INPUT_SIZE: 224,
    INPUT_NAME: 'serving_default_sequential_27_input:0',
    OUTPUT_NAME: 'StatefulPartitionedCall:0',
};

async function loadAssets() {
    try {
        if (!ort) ort = await import('onnxruntime-node');
        if (!sharp) sharp = (await import('sharp')).default;
        
        if (labels.length === 0) {
            const labelContent = await fs.readFile(CONFIG.LABELS_PATH, 'utf8');
            labels = labelContent.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => {
                    const parts = line.split(' ');
                    return parts.length > 1 ? parts.slice(1).join(' ') : line;
                });
        }

        if (!imageSession) {
            imageSession = await ort.InferenceSession.create(CONFIG.MODEL_PATH);
            console.log('Server-side Image AI Engine Ready');
        }
    } catch (error) {
        console.error('Failed to load server-side Image AI assets:', error);
    }
}

export async function checkImage(buffer) {
    if (!imageSession) await loadAssets();
    if (!imageSession || !sharp) return false;

    try {
        // 1. Resize and extract raw pixels using sharp
        const { data, info } = await sharp(buffer)
            .resize(CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // 2. Normalize [0, 255] to [-1, 1]
        const floatData = new Float32Array(CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE * 3);
        for (let i = 0; i < CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE; i++) {
            floatData[i * 3 + 0] = (data[i * 4 + 0] / 127.5) - 1.0; // R
            floatData[i * 3 + 1] = (data[i * 4 + 1] / 127.5) - 1.0; // G
            floatData[i * 3 + 2] = (data[i * 4 + 2] / 127.5) - 1.0; // B
        }

        // 3. Run Inference
        const tensor = new ort.Tensor('float32', floatData, [1, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, 3]);
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

        // Index 0 is 'Safe'
        const isSensitive = maxIdx !== 0;
        if (isSensitive) {
            console.warn(`SERVER SENSITIVE IMAGE DETECTED: ${labels[maxIdx]} (Confidence: ${maxVal})`);
        }
        
        return isSensitive;
    } catch (error) {
        console.error('Server image AI check failed:', error);
        return false;
    }
}

