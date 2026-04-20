const { checkImage } = require('./lib/imageDetector');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        console.log('Testing Image Detector...');
        // Create a dummy 224x224 buffer if we don't have a real image
        const buffer = Buffer.alloc(100, 0); // Not a real image, Jimp will fail to read it but we want to see if it even gets there
        
        // Let's try to load the assets first
        const assetsDir = path.join(process.cwd(), 'lib', 'assets');
        console.log('Assets Dir:', assetsDir);
        console.log('Model exists:', fs.existsSync(path.join(assetsDir, 'image_detector.onnx')));
        console.log('Labels exists:', fs.existsSync(path.join(assetsDir, 'labels.txt')));

        // We can't really run checkImage without a real image buffer because Jimp.read will fail
        // but we can check if it initializes correctly.
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
