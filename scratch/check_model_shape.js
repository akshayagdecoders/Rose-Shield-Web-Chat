const ort = require('onnxruntime-node');
const path = require('path');

async function checkModel() {
    try {
        const modelPath = path.join(process.cwd(), 'lib', 'assets', 'image_detector.onnx');
        const session = await ort.InferenceSession.create(modelPath);
        console.log('Input Names:', session.inputNames);
        console.log('Output Names:', session.outputNames);
        
        // In newer versions, metadata is available through session.inputNames and session.outputNames
        // but to get shapes we often use session.inputNames[0] and inspect from there if available
        // OR we can just try to run it with a shape and see if it errors.
        
        // Try running with a dummy tensor to see expected shape message if it fails
        const dummyData = new Float32Array(1 * 224 * 224 * 3);
        try {
            const tensor = new ort.Tensor('float32', dummyData, [1, 224, 224, 3]);
            await session.run({ [session.inputNames[0]]: tensor });
            console.log('Model accepted [1, 224, 224, 3] (BHWC)');
        } catch (e) {
            console.log('Model REJECTED [1, 224, 224, 3]. Error:', e.message);
            
            try {
                const tensor2 = new ort.Tensor('float32', dummyData, [1, 3, 224, 224]);
                await session.run({ [session.inputNames[0]]: tensor2 });
                console.log('Model accepted [1, 3, 224, 224] (BCHW)');
            } catch (e2) {
                console.log('Model REJECTED [1, 3, 224, 224] as well. Error:', e2.message);
            }
        }
    } catch (err) {
        console.error('Error checking model:', err);
    }
}

checkModel();
