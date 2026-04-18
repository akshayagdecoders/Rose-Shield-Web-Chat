import pool from './db';
import path from 'path';
import fs from 'fs/promises';

let ort = null;
let textSession = null;
let vocab = null;

const getAssetsDir = () => {
    const paths = [
        path.join(process.cwd(), 'public', 'assets'),
        path.join(process.cwd(), '.next', 'server', 'public', 'assets'),
        path.join(process.cwd(), 'assets'),
    ];
    // Check which one exists
    for (const p of paths) {
        try {
            // Simplified check
            return p;
        } catch (e) {}
    }
    return paths[0]; 
};

const ASSETS_DIR = getAssetsDir();

const CONFIG = {
    PHRASES_PATH: path.join(ASSETS_DIR, 'grooming_phrases.txt'),
    MODEL_PATH: path.join(ASSETS_DIR, 'grooming_model.onnx'),
    VOCAB_PATH: path.join(ASSETS_DIR, 'vocab.json'),
    MAX_SEQUENCE_LENGTH: 256,
    CACHE_SIZE: 500,
};

let masterRegex = null;
let skeletonMap = new Set();
let bagOfWordsPhrases = []; 
let resultsCache = new Map();
let isInitializing = false;

const LEET_MAP = {
    '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', 'l': 'i',
    '0': 'o', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g'
};

const PHONETIC_MAP = {
    'ph': 'f', 'ck': 'k', 'qu': 'k', 'sh': 's', 'ts': 's', 'z': 's'
};

function foldUnicode(text) {
    if (!text) return "";
    return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, char => {
        const confusableMap = {
            'а': 'a', 'е': 'e', 'і': 'i', 'о': 'o', 'р': 'p', 'с': 's', 'у': 'y', 'х': 'x', 'ј': 'j',
            '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9', '０': '0',
            'Ａ': 'a', 'Ｂ': 'b', 'Ｃ': 'c', 'Ｄ': 'd', 'Ｅ': 'e'
        };
        return confusableMap[char] || char;
    });
}

function aggressiveNormalize(text) {
    if (!text) return "";
    let n = foldUnicode(text).toLowerCase();
    Object.keys(LEET_MAP).forEach(key => n = n.replaceAll(key, LEET_MAP[key]));
    n = n.replace(/[\u200B-\u200D\uFEFF]/g, '');
    n = n.replace(/(.)\1+/g, '$1');
    n = n.replace(/[^a-z0-9\s]/g, ''); 
    return n.trim();
}

function getPhonetic(text) {
    let p = aggressiveNormalize(text);
    Object.keys(PHONETIC_MAP).forEach(key => p = p.replaceAll(key, PHONETIC_MAP[key]));
    return p.replace(/[aeiou]/g, '').replace(/\s+/g, '');
}

async function loadAssets() {
    try {
        // 1. Load keywords/phrases
        let phrasesContent = "";
        try {
            phrasesContent = await fs.readFile(CONFIG.PHRASES_PATH, 'utf8');
        } catch (e) {
            const fallback = path.join(process.cwd(), '.next/server/public/assets/grooming_phrases.txt');
            try { phrasesContent = await fs.readFile(fallback, 'utf8'); } catch(e2) {}
        }
        const lines = phrasesContent.split('\n').map(p => p.trim()).filter(p => p && !p.startsWith('//'));

        // 2. Load from DB
        let dbPatterns = [];
        try {
            const [rows] = await pool.execute('SELECT pattern FROM blocked_patterns WHERE type = "text"');
            dbPatterns = rows.map(r => r.pattern);
        } catch (dbErr) {
            console.warn('Could not load patterns from DB:', dbErr.message);
        }

        const allLines = [...lines, ...dbPatterns];
        const keywordSet = new Set();
        bagOfWordsPhrases = [];
        skeletonMap.clear();

        allLines.forEach(line => {
            const clean = line.toLowerCase().trim();
            const words = clean.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));
            if (words.length > 1) {
                bagOfWordsPhrases.push({ words: new Set(words), requiredCount: Math.max(1, Math.floor(words.length * 0.75)) });
            } else {
                const wordOnly = clean.replace(/[^a-z0-9]/g, '');
                if (wordOnly.length >= 2) {
                    keywordSet.add(wordOnly);
                    skeletonMap.add(getPhonetic(wordOnly));
                }
            }
        });

        if (keywordSet.size > 0) {
            const sortedKeywords = Array.from(keywordSet).sort((a,b) => b.length - a.length);
            masterRegex = new RegExp(`\\b(${sortedKeywords.join('|')})\\b`, 'i');
        }

        // 3. Load ONNX AI Assets
        try {
            if (!ort) {
                ort = await import('onnxruntime-node');
            }
            if (!vocab) {
                const vocabContent = await fs.readFile(CONFIG.VOCAB_PATH, 'utf8');
                vocab = JSON.parse(vocabContent);
            }
            if (!textSession) {
                textSession = await ort.InferenceSession.create(CONFIG.MODEL_PATH);
                console.log('Server-side Text AI Engine Ready');
            }
        } catch (aiErr) {
            console.error('Failed to load server-side AI assets:', aiErr);
        }

    } catch (error) {
        console.error('Error loading detector assets:', error);
    }
}

function tokenize(text) {
    if (!vocab) return new Int32Array(CONFIG.MAX_SEQUENCE_LENGTH).fill(0);
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    let words = normalized.split(' ').filter(w => w.length > 0);
    if (words.length > CONFIG.MAX_SEQUENCE_LENGTH) words = words.slice(-CONFIG.MAX_SEQUENCE_LENGTH);
    const sequence = new Int32Array(CONFIG.MAX_SEQUENCE_LENGTH).fill(0);
    const startIndex = CONFIG.MAX_SEQUENCE_LENGTH - words.length;
    words.forEach((word, i) => { sequence[startIndex + i] = vocab[word] || vocab['<OOV>'] || 1; });
    return sequence;
}

async function scanTextWithAI(text) {
    if (!textSession || !vocab) return 0;
    try {
        const inputTokens = tokenize(text);
        const inputTensor = new ort.Tensor('float32', Float32Array.from(inputTokens), [1, 256]);
        const results = await textSession.run({ 'serving_default_keras_tensor:0': inputTensor });
        return results['StatefulPartitionedCall_1:0'].data[0];
    } catch (e) {
        console.error('Server AI Scan Error:', e);
        return 0;
    }
}

export async function initDetector() {
    if (isInitializing) return;
    isInitializing = true;
    try {
        await loadAssets();
    } finally {
        isInitializing = false;
    }
}

export async function checkMessage(text) {
    if (!text || text.length < 2) return false;
    if (resultsCache.has(text)) return resultsCache.get(text);
    
    if (!masterRegex || !textSession) await initDetector();

    const folded = foldUnicode(text).toLowerCase();
    const phonetic = getPhonetic(text);
    const tokens = folded.split(/[^a-z0-9]+/).filter(t => t.length > 0);
    const tokenSet = new Set(tokens);

    let isOffensive = false;

    // 1. Phonetic Layer
    if (phonetic.length >= 2 && skeletonMap.has(phonetic)) isOffensive = true;

    // 2. Regex Layer
    if (!isOffensive && masterRegex && masterRegex.test(folded)) isOffensive = true;

    // 3. Bag of words
    if (!isOffensive) {
        isOffensive = bagOfWordsPhrases.some(phrase => {
            const matches = Array.from(phrase.words).filter(w => tokenSet.has(w)).length;
            return matches >= phrase.requiredCount;
        });
    }

    // 4. AI Layer (Model in the Cloud)
    if (!isOffensive && textSession) {
        const aiScore = await scanTextWithAI(text);
        if (aiScore > 0.85) {
            console.log(`Server AI Blocked Message (Score: ${aiScore}): "${text.substring(0, 50)}..."`);
            isOffensive = true;
        }
    }

    if (resultsCache.size >= CONFIG.CACHE_SIZE) resultsCache.clear();
    resultsCache.set(text, isOffensive);
    return isOffensive;
}

export async function appendNewPattern(text) {
    try {
        const word = aggressiveNormalize(text);
        if (!word || word.length < 2) return;
        await pool.execute('INSERT IGNORE INTO blocked_patterns (pattern, type, source) VALUES (?, "text", "manual")', [word]);
        await initDetector(); 
    } catch (e) {
        console.error('Failed to append pattern:', e);
    }
}

