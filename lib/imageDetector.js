import path from 'path';
import fs from 'fs/promises';

let ort = null;
let sharp = null;
let imageSession = null;
let labels = [];
let isInitializing = false;

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
        if (!ort) ort = await import('onnxruntime-node');
        if (!sharp) sharp = (await import('sharp')).default;
        
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
                console.log('Image AI: Cloud Model Ready');
                console.log('Image AI Inputs:', imageSession.inputNames);
                console.log('Image AI Outputs:', imageSession.outputNames);
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
    if (!imageSession || !sharp) {
        console.error('Image AI: Session or Sharp not available');
        return false;
    }

    try {
        // 1. Resize and extract raw pixels using sharp
        const resized = await sharp(buffer)
            .resize(CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { data } = resized;

        // 2. Normalize [0, 255] to [-1, 1]
        const floatData = new Float32Array(CONFIG.INPUT_SIZE * CONFIG.INPUT_SIZE * 3);
        let targetIdx = 0;
        for (let i = 0; i < data.length; i += 4) {
            floatData[targetIdx++] = (data[i + 0] / 127.5) - 1.0; // R
            floatData[targetIdx++] = (data[i + 1] / 127.5) - 1.0; // G
            floatData[targetIdx++] = (data[i + 2] / 127.5) - 1.0; // B
        }

        // 3. Run Inference with dynamic names
        const inputName = imageSession.inputNames[0];
        const outputName = imageSession.outputNames[0];
        
        const tensor = new ort.Tensor('float32', floatData, [1, CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE, 3]);
        const results = await imageSession.run({ [inputName]: tensor });
        const output = results[outputName].data;

        // Sort results for better logging
        const scoredLabels = Array.from(output).map((score, idx) => ({
            label: labels[idx] || `Index ${idx}`,
            score: score,
            idx: idx
        })).sort((a, b) => b.score - a.score);

        const top = scoredLabels[0];
        console.log(`Cloud Image AI Top Prediction: ${top.label} (${(top.score * 100).toFixed(1)}%)`);

        // Index 0 is 'Safe'
        const isSensitive = top.idx !== 0 && top.score > 0.6; // Use a reasonable threshold
        
        if (isSensitive) {
            console.warn(`!!! CLOUD AI BLOCKED IMAGE: ${top.label} !!!`);
        }
        
        return isSensitive;
    } catch (error) {
        console.error('Cloud Image AI check failed:', error.message);
        return false;
    }
}




