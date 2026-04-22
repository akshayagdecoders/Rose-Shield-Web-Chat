import pool from './db.js';
import path from 'path';
import fs from 'fs/promises';

let ort = null;
let textSession = null;
let vocab = null;

const getAssetsDir = () => {
    // We use lib/assets which is part of the source tree and correctly bundled by Vercel
    return path.join(process.cwd(), 'lib', 'assets');
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

// ── SAFE PHRASES (LIFESAVERS) ──
// These phrases are allowed even if they contain blocked words like "gun" or "sex".
const SAFE_PHRASES = [
    'water gun', 'glue gun', 'massage gun', 'gunny bag', 'shogun',
    'essex', 'sussex', 'sextant', 'sexting', 'what is your sex', 'whats your sex'
];

const LEET_MAP = {
    '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', 'l': 'i',
    '0': 'o', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g',
    '|': 'i', '6': 'g', '2': 'z', 'µ': 'u', 'v': 'u', 'w': 'v'
};

const PHONETIC_MAP = {
    'ph': 'f', 'ck': 'k', 'qu': 'k', 'sh': 's', 'ts': 's', 'z': 's'
};

function foldUnicode(text) {
    if (!text) return "";
    return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, char => {
        const confusableMap = {
            'а': 'a', 'е': 'e', 'і': 'i', 'о': 'o', 'р': 'p', 'с': 's', 'у': 'y', 'х': 'x', 'ј': 'j', 'ѕ': 's', 'ц': 'u', 'к': 'k', 'и': 'i',
            '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9', '０': '0',
            'Ａ': 'a', 'Ｂ': 'b', 'Ｃ': 'c', 'Ｄ': 'd', 'Ｅ': 'e', 'Ｆ': 'f', 'Ｇ': 'g', 'Ｈ': 'h', 'Ｉ': 'i', 'Ｊ': 'j',
            'Ｋ': 'k', 'Ｌ': 'l', 'Ｍ': 'm', 'Ｎ': 'n', 'Ｏ': 'o', 'Ｐ': 'p', 'Ｑ': 'q', 'Ｒ': 'r', 'Ｓ': 's', 'Ｔ': 't',
            'Ｕ': 'u', 'Ｖ': 'v', 'Ｗ': 'w', 'Ｘ': 'x', 'Ｙ': 'y', 'Ｚ': 'z',
            'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'θ': 't', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'u', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'τ': 't', 'υ': 'u', 'φ': 'f', 'χ': 'x', 'ψ': 'p', 'ω': 'o'
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
        console.log(`Detector AI: Initializing from ${ASSETS_DIR}`);
        
        // 1. Load keywords/phrases
        try {
            const phrasesContent = await fs.readFile(CONFIG.PHRASES_PATH, 'utf8');
            const lines = phrasesContent.split('\n').map(p => p.trim()).filter(p => p && !p.startsWith('//'));
            
            // Load from DB
            let dbPatterns = [];
            try {
                const [rows] = await pool.execute('SELECT pattern FROM blocked_patterns WHERE type = "text"');
                dbPatterns = rows.map(r => r.pattern);
            } catch (dbErr) {}

            const allLines = [...lines, ...dbPatterns];
            const keywordSet = new Set();
            bagOfWordsPhrases = [];
            skeletonMap.clear();

            allLines.forEach(line => {
                const clean = line.toLowerCase().trim();
                const words = clean.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));
                if (words.length > 1) {
                    const required = words.length <= 3 ? words.length : Math.max(3, Math.ceil(words.length * 0.8));
                    bagOfWordsPhrases.push({ words: new Set(words), requiredCount: required });
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
        } catch (e) {
            console.error('Detector: Phrases load failed', e.message);
        }

        // 2. Load ONNX AI Assets
        try {
            if (!ort) ort = await import('onnxruntime-node');
            
            // Force trace: read files into memory if they exist
            const modelBuffer = await fs.readFile(CONFIG.MODEL_PATH);
            const vocabContent = await fs.readFile(CONFIG.VOCAB_PATH, 'utf8');
            
            vocab = JSON.parse(vocabContent);
            textSession = await ort.InferenceSession.create(modelBuffer);
            console.log('Detector AI: Cloud Model Ready');
        } catch (aiErr) {
            console.error('Detector AI: Cloud Model failed to load', aiErr.message);
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

    let scanText = text.toLowerCase();
    
    // Replace safe phrases with placeholders so layers don't trip over them
    SAFE_PHRASES.forEach(phrase => {
        scanText = scanText.replaceAll(phrase, "SAFE_OBJECT");
    });

    const folded = foldUnicode(scanText).toLowerCase();
    let isOffensive = false;

    // 1. De-spacing logic (Handle "s e x" -> "sex", "h e y" -> "hey")
    // We target sequences of single characters separated by spaces
    const deSpaced = folded.replace(/(\b[a-z0-9])\s+(?=[a-z0-9]\b)/gi, '$1')
                           .replace(/(\b[a-z0-9])\s+(?=[a-z0-9]\b)/gi, '$1'); // Run twice to catch "a b c d"

    const deSpacedTokens = deSpaced.split(/[^a-z0-9]+/).filter(t => t.length > 0);
    const tokenSet = new Set(deSpacedTokens);

    // 2. Phonetic & Regex Layer on Tokens
    for (const token of deSpacedTokens) {
        if (token.length >= 2) {
            // Phonetic
            const p = getPhonetic(token);
            if (p.length >= 2 && skeletonMap.has(p)) {
                isOffensive = true;
                break;
            }
        }
    }

    if (!isOffensive && masterRegex && (masterRegex.test(folded) || masterRegex.test(deSpaced))) {
        isOffensive = true;
    }

    // 3. Compact Layer (Last resort for highly obscured words)
    if (!isOffensive && masterRegex) {
        const compact = folded.replace(/[^a-z0-9]/g, '');
        if (compact.length >= 2 && masterRegex.test(compact)) {
            isOffensive = true;
        }
    }

    // 4. Bag of words
    if (!isOffensive) {
        isOffensive = bagOfWordsPhrases.some(phrase => {
            const matches = Array.from(phrase.words).filter(w => tokenSet.has(w)).length;
            return matches >= phrase.requiredCount;
        });
    }

    // 5. AI Layer (Model in the Cloud)
    if (!isOffensive && textSession) {
        const aiScore = await scanTextWithAI(scanText);
        if (aiScore > 0.85) {
            console.log(`Cloud AI Blocked: Score ${aiScore.toFixed(3)}`);
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



