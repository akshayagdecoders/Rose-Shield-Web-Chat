let ort = null;
let textSession = null;
let vocab = null;
let isInitializing = false;

const CONFIG = {
    MODEL_PATH: '/assets/grooming_model.onnx',
    VOCAB_PATH: '/assets/vocab.json',
    MAX_SEQUENCE_LENGTH: 256,
};

async function loadVocab() {
    if (vocab) return;
    try {
        const response = await fetch(CONFIG.VOCAB_PATH);
        vocab = await response.json();
    } catch (error) {
        console.error('Failed to load vocab for client detector:', error);
    }
}

export async function initClientDetector() {
    if (textSession && vocab) return;
    if (isInitializing) return;
    isInitializing = true;

    try {
        if (typeof window === 'undefined') return;
        if (!ort) {
            const onnx = await import('onnxruntime-web');
            ort = onnx.default || onnx;
        }
        await loadVocab();
        // Use WASM backend for better compatibility in browsers
        textSession = await ort.InferenceSession.create(CONFIG.MODEL_PATH, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log('Client Text AI Engine Ready');
    } catch (error) {
        console.error('Client Text AI Initialization Error:', error);
    } finally {
        isInitializing = false;
    }
}

function tokenize(text) {
    if (!vocab) return new Int32Array(CONFIG.MAX_SEQUENCE_LENGTH).fill(0);
    // Simple normalization consistent with server-side logic
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    let words = normalized.split(' ').filter(w => w.length > 0);
    
    if (words.length > CONFIG.MAX_SEQUENCE_LENGTH) {
        words = words.slice(-CONFIG.MAX_SEQUENCE_LENGTH);
    }

    const sequence = new Int32Array(CONFIG.MAX_SEQUENCE_LENGTH).fill(0);
    const startIndex = CONFIG.MAX_SEQUENCE_LENGTH - words.length;
    words.forEach((word, i) => {
        sequence[startIndex + i] = vocab[word] || vocab['<OOV>'] || 1;
    });
    return sequence;
}

export async function scanTextLocally(text) {
    if (!text || text.length < 2) return 0; // Return confidence score
    
    if (!textSession || !vocab) {
        await initClientDetector();
    }
    if (!textSession || !vocab) return 0;

    try {
        const inputTokens = tokenize(text);
        const inputTensor = new ort.Tensor('float32', Float32Array.from(inputTokens), [1, 256]);
        
        // The input name must match the model's expected input (serving_default_keras_tensor:0)
        const results = await textSession.run({ 'serving_default_keras_tensor:0': inputTensor });
        
        // The output name must match (StatefulPartitionedCall_1:0)
        const score = results['StatefulPartitionedCall_1:0'].data[0];
        return score;
    } catch (error) {
        console.error('Client text scan failed:', error);
        return 0;
    }
}
