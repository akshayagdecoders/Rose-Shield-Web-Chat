// This file is deprecated. Image detection is now handled client-side in lib/clientImageDetector.js
// for Vercel serverless compatibility (to avoid native onnxruntime-node and sharp dependencies).

export async function checkImage(buffer) {
    console.warn('Server-side checkImage is deprecated and returns safe by default.');
    return false;
}
