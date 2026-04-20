import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

let ort = null;
let imageSession = null;
let labels = [];

const getAssetsDir = () => {
    return path.join(process.cwd(), 'lib', 'assets');
};

const ASSETS_DIR = getAssetsDir();

const CONFIG = {
    MODEL_PATH: path.join(ASSETS_DIR, 'image_detector.onnx'),
    LABELS_PATH: path.join(ASSETS_DIR, 'labels.txt'),
    INPUT_SIZE: 224,
};

async function loadAssets() {
    try {
        console.log(`Image AI: Initializing from ${ASSETS_DIR}`);
        if (!ort) {
            const onnx = await import('onnxruntime-node');
            ort = onnx.default || onnx;
        }
        
        if (labels.length === 0) {
            try {
                const labelContent = await fs.readFile(CONFIG.LABELS_PATH, 'utf8');
                labels = labelContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => {
                        const parts = line.split(' ');
                        return parts.length > 1 ? parts.slice(1).join(' ') : line;
                    });
            } catch (e) {
                console.error('Image AI: Labels missing', e.message);
            }
        }

        if (!imageSession) {
            try {
                const modelBuffer = await fs.readFile(CONFIG.MODEL_PATH);
                imageSession = await ort.InferenceSession.create(modelBuffer);
                console.log('Image AI: Cloud Model Ready (Sharp Engine)');
            } catch (e) {
                console.error('Image AI: Cloud Model failed to load', e.message);
                throw e;
            }
        }
    } catch (error) {
        console.error('Image AI: Init major failure', error.message);
    }
}

export async function checkImage(buffer) {
    if (!imageSession) await loadAssets();
    if (!imageSession) {
        console.error('Image AI: Session not available');
        return false;
    }

    try {
        // 1. Resize and extract raw pixels using Sharp (Reliable & supports WebP)
        const { data, info } = await sharp(buffer)
            .resize(CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, { fit: 'cover' })
            .ensureAlpha(1.0)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const floatData = new Float32Array(CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE * 3);
        
        // 2. Normalize [0, 255] to [-1, 1] and remove Alpha channel
        for (let i = 0; i < CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE; i++) {
            floatData[i * 3 + 0] = (data[i * 4 + 0] / 127.5) - 1.0; // R
            floatData[i * 3 + 1] = (data[i * 4 + 1] / 127.5) - 1.0; // G
            floatData[i * 3 + 2] = (data[i * 4 + 2] / 127.5) - 1.0; // B
        }

        // 3. Run Inference
        const inputName = imageSession.inputNames[0];
        const outputName = imageSession.outputNames[0];
        
        const tensor = new ort.Tensor('float32', floatData, [1, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, 3]);
        const results = await imageSession.run({ [inputName]: tensor });
        const output = results[outputName].data;

        // Get top prediction
        let maxIdx = 0;
        let maxVal = -1;
        for (let i = 0; i < output.length; i++) {
            if (output[i] > maxVal) {
                maxVal = output[i];
                maxIdx = i;
            }
        }

        const label = labels[maxIdx] || `Index ${maxIdx}`;
        console.log(`Cloud Image AI Prediction: ${label} (${(maxVal * 100).toFixed(1)}%)`);

        // Index 0 is 'Safe'
        // Lowered threshold to 0.5 for better protection
        const isSensitive = maxIdx !== 0 && maxVal > 0.5;
        
        if (isSensitive) {
            console.warn(`!!! CLOUD AI BLOCKED IMAGE: ${label} (Confidence: ${maxVal.toFixed(2)}) !!!`);
        }
        
        return isSensitive;
    } catch (error) {
        console.error('Cloud Image AI check failed:', error.message);
        return false;
    }
}




