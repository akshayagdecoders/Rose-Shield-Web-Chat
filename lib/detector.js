import pool from './db';
import path from 'path';
import fs from 'fs/promises';

const getAssetsDir = () => {
    const paths = [
        path.join(process.cwd(), 'public', 'assets'),
        path.join(process.cwd(), '.next', 'server', 'public', 'assets'),
        path.join(process.cwd(), 'assets'),
    ];
    return paths[0]; 
};

const ASSETS_DIR = getAssetsDir();

const CONFIG = {
    PHRASES_PATH: path.join(ASSETS_DIR, 'grooming_phrases.txt'),
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
        let phrasesContent = "";
        try {
            phrasesContent = await fs.readFile(CONFIG.PHRASES_PATH, 'utf8');
        } catch (e) {
            // Fallback for production environments
            const fallback = path.join(process.cwd(), '.next/server/public/assets/grooming_phrases.txt');
            try { phrasesContent = await fs.readFile(fallback, 'utf8'); } catch(e2) {}
        }

        const lines = phrasesContent.split('\n').map(p => p.trim()).filter(p => p && !p.startsWith('//'));

        // Load from DB
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
                bagOfWordsPhrases.push({
                    words: new Set(words),
                    requiredCount: Math.max(1, Math.floor(words.length * 0.75))
                });
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
    } catch (error) {
        console.error('Error loading detector assets:', error);
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
    
    if (!masterRegex) await initDetector();

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

    if (resultsCache.size >= CONFIG.CACHE_SIZE) resultsCache.clear();
    resultsCache.set(text, isOffensive);
    return isOffensive;
}

export async function appendNewPattern(text) {
    try {
        const word = aggressiveNormalize(text);
        if (!word || word.length < 2) return;
        
        await pool.execute(
            'INSERT IGNORE INTO blocked_patterns (pattern, type, source) VALUES (?, "text", "manual")',
            [word]
        );
        await initDetector(); // reload
    } catch (e) {
        console.error('Failed to append pattern:', e);
    }
}
