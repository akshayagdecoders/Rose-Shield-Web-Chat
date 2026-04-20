const ort = require('onnxruntime-node');
const path = require('path');
const fs = require('fs');

async function checkModel() {
    try {
        const modelPath = path.join(process.cwd(), 'lib', 'assets', 'image_detector.onnx');
        const session = await ort.InferenceSession.create(modelPath);
        console.log('Input Names:', session.inputNames);
        console.log('Output Names:', session.outputNames);
        
        // Check input metadata
        const inputName = session.inputNames[0];
        const inputMeta = session.handler.inputNamesToTypeAndShape[inputName];
        console.log('Input Metadata:', inputMeta);
    } catch (err) {
        console.error('Error checking model:', err);
    }
}

checkModel();
