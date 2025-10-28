/*
 * Filename: js/screens/kvgame.js
 * Version: NOUB 0.0.2 (KV GAME LOGIC - FINAL CODE)
 * Description: Implements the full 62-level Valley of the Kings (Crack the Code) logic.
 * Merged core game engine from 'noub original game.html' with Supabase integration.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 

// --- KV Game Constants & State ---
const LEVEL_COST = 100;
const WIN_REWARD_BASE = 500;
const HINT_SCROLL_ITEM_KEY = 'hint_scroll'; 
const HINT_SCROLL_COST_BLESSING = 5; 
const TIME_AMULET_ITEM_KEY = 'time_amulet_45s'; 
const TIME_AMULET_COST_BLESSING = 10; 

let kvGameState = {
    active: false,
    code: '',
    timeLeft: 0,
    interval: null,
    levelIndex: 0, 
    attemptsLeft: 0, 
    hintsRevealed: [true, true, true, false], 
};

// --- CRITICAL DATA: Full 62 KV Gates Data ---
const kvGatesData = [
    { kv: 1, name: "Ramses VII" }, { kv: 2, name: "Ramses IV" }, { kv: 3, name: "Sons of Ramses II" },
    { kv: 4, name: "Ramses XI" }, { kv: 5, name: "Sons of Ramses II" }, { kv: 6, name: "Ramses IX" },
    { kv: 7, name: "Ramses I" }, { kv: 8, name: "Merenptah" }, { kv: 9, name: "Ramses V & VI" },
    { kv: 10, name: "Amenmesses" }, { kv: 11, name: "Ramses III" }, { kv: 12, name: "Unknown" },
    { kv: 13, name: "Bay" }, { kv: 14, name: "Tausert & Setnakht" }, { kv: 15, name: "Seti II" },
    { kv: 16, name: "Ramses" }, { kv: 17, name: "Seti I" }, { kv: 18, name: "Ramses X" },
    { kv: 19, name: "Montuherkhepshef" }, { kv: 20, name: "Thutmose I & Hatshepsut" }, { kv: 21, name: "Unknown" },
    { kv: 22, name: "Amenhotep III" }, { kv: 23, name: "Ay" }, { kv: 24, name: "Unknown" }, 
    { kv: 25, name: "Unknown" }, { kv: 26, name: "Unknown" }, { kv: 27, name: "Unknown" }, { kv: 28, name: "Unknown" },
    { kv: 29, name: "Unknown" }, { kv: 30, name: "Unknown" }, { kv: 31, name: "Unknown" }, { kv: 32, name: "Tia'a" },
    { kv: 33, name: "Unknown" }, { kv: 34, name: "Thutmose III" }, { kv: 35, name: "Amenhotep II" }, { kv: 36, name: "Maiherpri" },
    { kv: 37, name: "Unknown" }, { kv: 38, name: "Thutmose I" }, { kv: 39, name: "Unknown" }, { kv: 40, name: "Unknown" },
    { kv: 41, name: "Unknown" }, { kv: 42, name: "Hatshepsut-Meryet-Ra" }, { kv: 43, name: "Thutmose IV" }, { kv: 44, name: "Unknown" },
    { kv: 45, name: "Userhet" }, { kv: 46, name: "Yuya & Thuya" }, { kv: 47, name: "Siptah" }, 
    { kv: 48, name: "Amenemope" }, { kv: 49, name: "Unknown" }, { kv: 50, name: "Unknown" }, { kv: 51, name: "Unknown" },
    { kv: 52, name: "Unknown" },
    { kv: 53, name: "Unknown" }, { kv: 54, name: "Tutankhamun cache?" }, { kv: 55, name: "Amarna Cache (Akhenaten?)" }, { kv: 56, name: "Gold Tomb?" },
    { kv: 57, name: "Horemheb" }, { kv: 58, name: "Chariot Tomb?" }, { kv: 59, name: "Unknown" }, { kv: 60, name: "Sitre" },
    { kv: 61, name: "Unknown" }, { kv: 62, name: "Tutankhamun" }
];


// Local DOM Element Variables 
let levelNameEl, timerDisplayEl, guessInputEl, submitGuessBtn, newGameBtn, endGameBtn, progressInfoDiv, hintDisplayDiv, kvGameControlsEl;

// --- CORE LOGIC FUNCTIONS ---

/**
 * Calculates level configuration (digits, time, attempts) based on level index.
 */
function getLevelConfig(levelIndex) {
    const level = levelIndex + 1; 
    let digits = 3;
    let time = 70;
    let attempts = 4; 

    if (level >= 53) { digits = 6; time = 160; attempts = 5; }
    else if (level >= 41) { digits = 5; time = 120; attempts = 5; }
    else if (level >= 25) { digits = 4; time = 90; attempts = 5; }
    
    return { digits, time, attempts };
}

/**
 * Generates the secret code based on the required number of digits.
 */
function generateCode(digits) {
    let code = '';
    for (let i = 0; i < digits; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

/**
 * Calculates the three *Free* hints and the one *Paid* hint.
 */
function calculateCodeHints(code) {
    const digits = code.split('').map(Number);
    const sum = digits.reduce((a, b) => a + b, 0);
    const product = digits.reduce((a, b) => a * b, 1);
    const evens = digits.filter(d => d % 2 === 0).length;
    const odds = digits.length - evens;
    const lastDigit = digits[digits.length - 1];
    
    return { sum, product, evens, odds, lastDigit };
}

/**
 * Utility function to update game progress in Supabase.
 */
async function updateKVProgress(isWin) {
    if (!state.currentUser) return;
    
    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) return;
    
    const currentLevel = kvGameState.levelIndex + 1;
    let updateObject = {
        player_id: state.currentUser.id,
        current_kv_level: progress.current_kv_level,
        last_game_result: isWin ? 'Win' : 'Loss',
        unlocked_levels_json: progress.unlocked_levels_json
    };
    
    if (isWin) {
        const nextLevel = currentLevel + 1;
        updateObject.current_kv_level = nextLevel;
        
        let unlockedLevels = JSON.parse(progress.unlocked_levels_json || '[]');
        if (!unlockedLevels.includes(currentLevel)) {
            unlockedLevels.push(currentLevel);
            updateObject.unlocked_levels_json = JSON.stringify(unlockedLevels);
        }
    }
    
    await api.updateKVProgress(state.currentUser.id, updateObject);
    await refreshPlayerState();
}

function timerTick() {
    kvGameState.timeLeft--;
    if (timerDisplayEl) timerDisplayEl.textContent = `Time Left: ${kvGameState.timeLeft}s`;

    if (kvGameState.timeLeft <= 0) {
        endCurrentKVGame('lose_time');
    }
}

function updateHintDisplay() {
    if (!hintDisplayDiv || !kvGameState.code) return;
    
    hintDisplayDiv.innerHTML = '';
    const hints = calculateCodeHints(kvGameState.code);
    
    // Display all three free hints immediately (H1, H2, H3)
    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 1 (Sum): <span>${hints.sum}</span>. (Free)</li>`;
    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 2 (Product): <span>${hints.product}</span>. (Free)</li>`;
    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 3 (Even/Odd): <span>${hints.odds} odd / ${hints.evens} even</span>. (Free)</li>`;
    
    // H4: Last Digit (Paid Hint)
    if (kvGameState.hintsRevealed[3]) {
        hintDisplayDiv.innerHTML += `<li class="kv-hint-item" style="border-left-color: var(--success-color);">Hint 4: Last digit is <span>${hints.lastDigit}</span>. (Used)</li>`;
    } else {
        // Render the Consumable buttons if the game is active
        const scrollCount = state.consumables.get(HINT_SCROLL_ITEM_KEY) || 0;
        
        const hintBtn = document.createElement('button');
        hintBtn.className = 'action-button small';
        hintBtn.style.backgroundColor = 'var(--kv-gate-color)';
        hintBtn.textContent = (scrollCount > 0) 
            ? `Use Hint Scroll (${scrollCount})` 
            : `Buy Last Digit (${HINT_SCROLL_COST_BLESSING} 🗡️)`; 

        hintBtn.disabled = !kvGameState.active;
        hintBtn.onclick = () => handlePurchaseAndUseItem(HINT_SCROLL_ITEM_KEY, HINT_SCROLL_COST_BLESSING, 'hint');
        
        // Add a Time Amulet button for quick access too
        const amuletCount = state.consumables.get(TIME_AMULET_ITEM_KEY) || 0;
        const timeBtn = document.createElement('button');
        timeBtn.className = 'action-button small';
        timeBtn.style.backgroundColor = '#95a5a6'; 
        timeBtn.textContent = (amuletCount > 0)
            ? `Use Time Amulet (${amuletCount})`
            : `Buy Time (+45s) (${TIME_AMULET_COST_BLESSING} 🗡️)`;
            
        timeBtn.disabled = !kvGameState.active;
        timeBtn.onclick = () => handlePurchaseAndUseItem(TIME_AMULET_ITEM_KEY, TIME_AMULET_COST_BLESSING, 'time');
        
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'kv-use-item-button-container';
        buttonContainer.appendChild(hintBtn);
        buttonContainer.appendChild(timeBtn);
        hintDisplayDiv.appendChild(buttonContainer);
    }
}

/**
 * Handles purchase/use of consumables (Hint Scroll, Time Amulet).
 */
async function handlePurchaseAndUseItem(itemKey, blessingCost, itemType) {
    if (!kvGameState.active) return;
    
    const consumableCount = state.consumables.get(itemKey) || 0;
    const isHint = itemType === 'hint';
    const isTime = itemType === 'time';

    if (isHint && kvGameState.hintsRevealed[3]) {
        showToast("Last digit hint already revealed.", 'info');
        return;
    }

    let itemUsedSuccessfully = false;

    if (consumableCount > 0) {
        // Option 1: Use existing consumable (Consume 1 from Supabase)
        await api.updateConsumableQuantity(state.currentUser.id, itemKey, consumableCount - 1);
        showToast(`${itemKey.split('_')[0]} used!`, 'success');
        itemUsedSuccessfully = true;

    } else if ((state.playerProfile.blessing || 0) >= blessingCost) {
        // Option 2: Buy directly with Blessing 
        const newBlessing = state.playerProfile.blessing - blessingCost;
        await api.updatePlayerProfile(state.currentUser.id, { blessing: newBlessing });
        showToast(`${itemType} purchased with Blessing!`, 'success');
        itemUsedSuccessfully = true;
        
    } else {
        showToast(`Need ${blessingCost} Blessing (🗡️) or the consumable item.`, 'error');
        return;
    }
    
    if (itemUsedSuccessfully) {
        if (isHint) kvGameState.hintsRevealed[3] = true;
        if (isTime) kvGameState.timeLeft += 45; 
    }

    await refreshPlayerState();
    updateHintDisplay();
}


async function endCurrentKVGame(result) {
    if (!kvGameState.active) return;
    kvGameState.active = false;

    if (kvGameState.interval) clearInterval(kvGameState.interval);

    const gateInfo = kvGatesData[kvGameState.levelIndex];
    
    let isWin = (result === 'win');
    
    // 1. Update Supabase progress
    await updateKVProgress(isWin);

    // 2. Grant rewards/Display messages
    if (isWin) {
        const reward = WIN_REWARD_BASE + (kvGameState.levelIndex * 50);
        const newScore = (state.playerProfile.score || 0) + reward;
        await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
        showToast(`*Congratulations!* You cracked KV${gateInfo.kv}! +${reward} Ankh!`, 'success');
    } else {
        showToast(`Expedition ended. The correct code was ${kvGameState.code}. Try again!`, 'error');
    }
    
    // 3. Reset UI state
    await refreshPlayerState();
    renderKVGameContent();
}

function handleSubmitGuess() {
    if (!kvGameState.active || !guessInputEl) return;
    
    const guess = guessInputEl.value;
    const config = getLevelConfig(kvGameState.levelIndex);

    if (guess.length !== config.digits || !/^\d+$/.test(guess)) {
        showToast(`Enter exactly ${config.digits} digits.`, 'error');
        return;
    }

    // 1. Consume attempt
    kvGameState.attemptsLeft--;
    document.getElementById('kv-attempts-display').textContent = `Attempts Left: ${kvGameState.attemptsLeft}`;
    
    if (guess === kvGameState.code) {
        endCurrentKVGame('win');
    } else if (kvGameState.attemptsLeft <= 0) {
        endCurrentKVGame('lose_attempts');
    } else {
        showToast("Incorrect code. Keep trying!", 'info');
        guessInputEl.value = '';
    }
}


async function startNewKVGame() {
    if (!state.currentUser || kvGameState.active) return;

    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) {
        showToast("Error loading game progress. Try logging out/in.", 'error');
        return;
    }
    
    kvGameState.levelIndex = (progress.current_kv_level || 1) - 1;
    
    if (kvGameState.levelIndex >= kvGatesData.length) {
         showToast("Congratulations! You've conquered all known gates!", 'success');
         return;
    }

    if ((state.playerProfile.score || 0) < LEVEL_COST) {
        showToast(`You need ${LEVEL_COST} Ankh (☥) to start.`, 'error');
        return;
    }

    // 1. Deduct cost and save
    const newScore = (state.playerProfile.score || 0) - LEVEL_COST;
    await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
    await refreshPlayerState();

    // 2. Setup game state
    kvGameState.active = true;
    kvGameState.hintsRevealed = [true, true, true, false]; 
    
    const gateInfo = kvGatesData[kvGameState.levelIndex];
    const config = getLevelConfig(kvGameState.levelIndex);
    kvGameState.code = generateCode(config.digits);
    kvGameState.timeLeft = config.time;
    kvGameState.attemptsLeft = config.attempts;

    // 3. Update UI elements
    levelNameEl.textContent = `KV${gateInfo.kv}: ${gateInfo.name}`;
    document.getElementById('kv-attempts-display').textContent = `Attempts Left: ${kvGameState.attemptsLeft}`;
    
    if (guessInputEl) {
        guessInputEl.value = '';
        guessInputEl.maxLength = config.digits;
        guessInputEl.placeholder = `Enter code... (${config.digits} digits)`;
        guessInputEl.disabled = false;
    }

    // Show game elements
    kvGameControlsEl.classList.remove('hidden');
    progressInfoDiv.classList.remove('hidden');
    hintDisplayDiv.classList.remove('hidden');
    if (newGameBtn) newGameBtn.disabled = true;
    
    // 4. Start Timer
    if (kvGameState.interval) clearInterval(kvGameState.interval);
    kvGameState.interval = setInterval(timerTick, 1000);
    
    // 5. Render hints and track activity
    updateHintDisplay();
    trackDailyActivity('games', 1);
}


// --- MAIN SCREEN RENDER & UI SETUP ---

function renderKVGameContent() {
    // 1. Fetch DOM Elements safely (uses IDs injected in index.html)
    levelNameEl = document.getElementById('kv-level-name-display');
    timerDisplayEl = document.getElementById('kv-timer-display');
    guessInputEl = document.getElementById('kv-guess-input');
    submitGuessBtn = document.getElementById('kv-submit-guess-btn');
    newGameBtn = document.getElementById('kv-start-btn');
    endGameBtn = document.getElementById('kv-end-game-btn');
    progressInfoDiv = document.getElementById('kv-progress-info');
    hintDisplayDiv = document.getElementById('kv-hints-list');
    kvGameControlsEl = document.getElementById('kv-game-controls-content');

    // 2. Attach Listeners
    if (newGameBtn) newGameBtn.onclick = startNewKVGame;
    if (submitGuessBtn) submitGuessBtn.onclick = handleSubmitGuess;
    if (endGameBtn) endGameBtn.onclick = () => endCurrentKVGame('manual');
    if (guessInputEl) guessInputEl.onkeypress = (e) => {
        if (e.key === 'Enter') handleSubmitGuess();
    };


    // 3. Update Initial Progress Display
    updateKVProgressInfo();
}

async function updateKVProgressInfo() {
    const startBtn = document.getElementById('kv-start-btn');
    
    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) return;

    kvGameState.levelIndex = (progress.current_kv_level || 1) - 1;
    const nextGate = kvGatesData[kvGameState.levelIndex];

    if (nextGate) {
        // Hide game elements and show intro message
        kvGameControlsEl.classList.add('hidden');
        progressInfoDiv.classList.add('hidden');
        if (hintDisplayDiv) hintDisplayDiv.classList.add('hidden'); // Safety check
        
        startBtn.textContent = `Start KV Gate ${nextGate.kv}`;
        startBtn.disabled = false;
        if (levelNameEl) levelNameEl.textContent = `KV${nextGate.kv}: ${nextGate.name}`;

    } else {
        startBtn.textContent = `All Gates Conquered!`;
        startBtn.disabled = true;
    }
}


export async function renderKVGame() {
    // This is the exported function called by ui.js
    renderKVGameContent(); 
}
