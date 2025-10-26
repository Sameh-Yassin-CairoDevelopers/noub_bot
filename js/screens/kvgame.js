/*
 * Filename: js/screens/kvgame.js
 * Version: NOUB 0.0.1 Eve Edition (KV GAME RENDER FIX - Complete)
 * Description: Implements all core logic for the Valley of the Kings (Crack the Code) game.
 * FIXED: Reference errors caused by incorrect DOM fetching scope.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 

const kvGameContainer = document.getElementById('kv-game-content');

// --- KV Game Constants & State ---
const LEVEL_COST = 100;
const WIN_REWARD_BASE = 500;
const HINT_SCROLL_ITEM_KEY = 'hint_scroll'; 
const TIME_AMULET_ITEM_KEY = 'time_amulet_45s'; 
const HINT_SCROLL_COST_BLESSING = 5; 

let kvGameState = {
    active: false,
    code: '',
    timeLeft: 0,
    interval: null,
    levelIndex: 0, // 0-based index into kvGatesData
    hintsRevealed: [true, true, true, false], // T1, T2, T3 are FREE (Original Game Logic)
};

const kvGatesData = [
    { kv: 1, name: "Ramses VII" }, { kv: 2, name: "Ramses IV" }, { kv: 3, name: "Sons of Ramses II" },
    { kv: 4, name: "Ramses XI" }, { kv: 5, name: "Sons of Ramses II" }, { kv: 6, name: "Ramses IX" },
    // Include full list up to KV 62 here (assumed for runtime)
];

// Local DOM Element Variables (Initialized inside renderKVGameContent)
let levelNameEl, timerDisplayEl, guessInputEl, submitGuessBtn, newGameBtn, endGameBtn, introDiv, progressInfoDiv, hintDisplayDiv, kvGameControlsEl;


// --- CORE LOGIC FUNCTIONS ---

function getLevelConfig(levelIndex) {
    const level = levelIndex + 1;
    let digits = 3;
    let time = 70;
    if (level >= 53) { digits = 6; time = 160; }
    else if (level >= 41) { digits = 5; time = 120; }
    else if (level >= 25) { digits = 4; time = 90; }
    return { digits, time };
}

function generateCode(digits) {
    let code = '';
    for (let i = 0; i < digits; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

function calculateHints(code) {
    const digits = code.split('').map(Number);
    const sum = digits.reduce((a, b) => a + b, 0);
    const product = digits.reduce((a, b) => a * b, 1);
    const evens = digits.filter(d => d % 2 === 0).length;
    const odds = digits.length - evens;
    const lastDigit = digits[digits.length - 1];
    return { sum, product, evens, odds, lastDigit };
}

function addChatMessage(sender, text, type = 'system', avatar = null) {
    console.log(`[Chat - ${sender} (${type})]: ${text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}`);
}

function timerTick() {
    kvGameState.timeLeft--;
    if (timerDisplayEl) timerDisplayEl.textContent = `Time Left: ${kvGameState.timeLeft}s`;

    if (kvGameState.timeLeft <= 0) {
        endCurrentKVGame('lose_time');
    }
}

function updateHintDisplay() {
    if (!hintDisplayDiv) return;
    
    hintDisplayDiv.innerHTML = '';
    const hints = calculateHints(kvGameState.code);
    
    // T1: Sum (Always revealed if game active)
    hintDisplayDiv.innerHTML += `<div class="kv-hint-item">Hint 1: Sum of digits is <span>${hints.sum}</span>.</div>`;
    // T2: Product
    hintDisplayDiv.innerHTML += `<div class="kv-hint-item">Hint 2: Product of digits is <span>${hints.product}</span>.</div>`;
    // T3: Even/Odd
    hintDisplayDiv.innerHTML += `<div class="kv-hint-item">Hint 3: Code has <span>${hints.odds}</span> odd and <span>${hints.evens}</span> even digit(s).</div>`;
    
    // T4: Last Digit (Paid Hint)
    if (kvGameState.hintsRevealed[3]) {
        hintDisplayDiv.innerHTML += `<div class="kv-hint-item" style="border-left-color: var(--success-color);">Hint 4 (Used): Last digit is <span>${hints.lastDigit}</span>.</div>`;
    } else {
        const hintBtn = document.createElement('button');
        const scrollCount = state.consumables.get(HINT_SCROLL_ITEM_KEY) || 0;
        const buttonText = scrollCount > 0 ? `Use Scroll (${scrollCount})` : `Buy Hint (${HINT_SCROLL_COST_BLESSING} 🗡️)`;
        
        hintBtn.className = 'action-button small';
        hintBtn.style.backgroundColor = 'var(--kv-gate-color)';
        hintBtn.textContent = buttonText;
        hintBtn.disabled = !kvGameState.active;
        hintBtn.onclick = handlePurchaseAndUseHint;
        hintDisplayDiv.appendChild(hintBtn);
    }
}

async function handlePurchaseAndUseHint() {
    if (!kvGameState.active) return;
    
    const scrollCount = state.consumables.get(HINT_SCROLL_ITEM_KEY) || 0;

    if (scrollCount > 0) {
        // Option 1: Use existing scroll
        await api.updateConsumableQuantity(state.currentUser.id, HINT_SCROLL_ITEM_KEY, scrollCount - 1);
        showToast('Hint Scroll used!', 'success');
        kvGameState.hintsRevealed[3] = true;
    } else if ((state.playerProfile.blessing || 0) >= HINT_SCROLL_COST_BLESSING) {
        // Option 2: Buy directly with Blessing
        const newBlessing = state.playerProfile.blessing - HINT_SCROLL_COST_BLESSING;
        await api.updatePlayerProfile(state.currentUser.id, { blessing: newBlessing });
        showToast('Hint purchased with Blessing!', 'success');
        kvGameState.hintsRevealed[3] = true;
    } else {
        showToast(`Need ${HINT_SCROLL_COST_BLESSING} Blessing (🗡️) or a Hint Scroll. Visit the Shop!`, 'error');
        return;
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
    
    await updateKVProgress(isWin, 0);

    if (isWin) {
        const reward = WIN_REWARD_BASE + (kvGameState.levelIndex * 50);
        const newScore = (state.playerProfile.score || 0) + reward;
        await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
        
        showToast(`You cracked KV${gateInfo.kv}! +${reward} Ankh!`, 'success');
    } else {
        showToast(`Expedition ended. Code was ${kvGameState.code}.`, 'lose');
    }
    
    await refreshPlayerState();
    renderKVGameContent(); // Re-render the content to show the result and retry button
}

function handleSubmitGuess() {
    if (!kvGameState.active || !guessInputEl) return;
    
    const guess = guessInputEl.value;
    const config = getLevelConfig(kvGameState.levelIndex);

    if (guess.length !== config.digits || !/^\d+$/.test(guess)) {
        showToast(`Enter exactly ${config.digits} digits.`, 'error');
        return;
    }

    addChatMessage(state.playerProfile.username, `My guess: ${guess}`, 'user');

    if (guess === kvGameState.code) {
        endCurrentKVGame('win');
    } else {
        showToast("Incorrect code. Keep trying!", 'info');
        guessInputEl.value = '';
    }
}


async function startNewKVGame() {
    if (!state.currentUser || kvGameState.active) return;

    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) {
        showToast("Error loading game progress.", 'error');
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

    // Deduct cost and start
    const newScore = (state.playerProfile.score || 0) - LEVEL_COST;
    await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
    await refreshPlayerState();

    // Reset game state
    kvGameState.active = true;
    kvGameState.hintsRevealed = [true, true, true, false]; 
    
    const gateInfo = kvGatesData[kvGameState.levelIndex];
    const config = getLevelConfig(kvGameState.levelIndex);
    kvGameState.code = generateCode(config.digits);
    kvGameState.timeLeft = config.time;

    // Update UI elements
    if (levelNameEl) levelNameEl.textContent = `KV${gateInfo.kv}: ${gateInfo.name}`;
    if (guessInputEl) {
        guessInputEl.value = '';
        guessInputEl.maxLength = config.digits;
        guessInputEl.placeholder = `Enter ${config.digits}-digit code`;
        guessInputEl.disabled = false;
    }
    if (submitGuessBtn) submitGuessBtn.disabled = false;
    if (endGameBtn) endGameBtn.disabled = false;
    if (newGameBtn) newGameBtn.disabled = true;

    // Start Timer
    if (kvGameState.interval) clearInterval(kvGameState.interval);
    kvGameState.interval = setInterval(timerTick, 1000);
    
    // Display initial hints
    addChatMessage("System", `Starting challenge for KV${gateInfo.kv}. Code: ${config.digits} digits.`, 'system');
    updateHintDisplay();

    introDiv.classList.add('hidden');
    kvGameControlsEl.classList.remove('hidden'); // CRITICAL FIX: Use the local variable
}


// --- MAIN SCREEN RENDER & UI SETUP ---

function renderKVGameContent() {
    // 1. Initial Setup (DOM Structure) - Render the necessary elements
    kvGameContainer.innerHTML = `
        <div id="kv-game-intro-content">
             <h3>Valley of the Kings - Crack the Code</h3>
             <p class="screen-description">Decipher the secret codes of the ancient tombs (KVs). Cost: ${LEVEL_COST} ☥ per attempt.</p>
             <div id="kv-progress-info" style="margin-bottom: 20px;">Loading Progress...</div>
             <button id="kv-start-btn" class="action-button" style="width: 200px;">Load Game</button>
        </div>
        
        <div id="kv-game-controls-content" class="game-controls hidden" style="width: 100%;">
            <h2 style="margin-top: 0; padding-top: 0;">Crack the Code: <span id="level-name-display">KV Gate Name</span></h2>
            <div id="timer-display">Time Left: 0s</div>
            
            <div class="game-input-area" style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
                <input type="number" id="guess-input" style="width: 150px; font-size: 1.2em; text-align: center;" placeholder="Enter code...">
                <button id="submit-guess-btn" class="action-button small">Submit</button>
            </div>
            
            <div id="hint-display" style="margin-bottom: 15px; text-align: left;">
                 <!-- Dynamic hint content here -->
            </div>
            
            <div class="kv-controls-grid">
                <button id="kv-new-game-btn" class="action-button">Start Gate</button>
                <button id="kv-end-game-btn" class="action-button danger">End Expedition</button>
            </div>
        </div>
    `;

    // 2. Fetch DOM References (CRITICAL FIX: Fetch local variables after setting innerHTML)
    introDiv = document.getElementById('kv-game-intro-content');
    kvGameControlsEl = document.getElementById('kv-game-controls-content'); // CRITICAL FIX: Set the element reference
    
    levelNameEl = document.getElementById('level-name-display');
    timerDisplayEl = document.getElementById('timer-display');
    guessInputEl = document.getElementById('guess-input');
    submitGuessBtn = document.getElementById('submit-guess-btn');
    newGameBtn = document.getElementById('kv-new-game-btn');
    endGameBtn = document.getElementById('kv-end-game-btn');
    hintDisplayDiv = document.getElementById('hint-display');
    
    // 3. Attach Listeners
    if (newGameBtn) newGameBtn.onclick = startNewKVGame;
    if (submitGuessBtn) submitGuessBtn.onclick = handleSubmitGuess;
    if (endGameBtn) endGameBtn.onclick = () => endCurrentKVGame('manual');

    // 4. Update Initial Progress Display
    updateKVProgressInfo();
}

async function updateKVProgressInfo() {
    const startBtn = document.getElementById('kv-start-btn');
    const progressDiv = document.getElementById('kv-progress-info');

    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) return;

    kvGameState.levelIndex = (progress.current_kv_level || 1) - 1;
    const nextGate = kvGatesData[kvGameState.levelIndex];

    if (nextGate) {
        progressDiv.innerHTML = `
            <p>Your current challenge: <strong>KV${nextGate.kv}: ${nextGate.name}</strong>.</p>
            <p>Cost to attempt: ${LEVEL_COST} ☥.</p>
        `;
        if (startBtn) {
            startBtn.textContent = `Start KV Gate ${nextGate.kv}`;
            startBtn.onclick = startNewKVGame;
        }
    } else {
        progressDiv.innerHTML = `<p style="color:var(--success-color)">All known gates conquered!</p>`;
        if (startBtn) startBtn.style.display = 'none';
    }
}


export async function renderKVGame() {
    renderKVGameContent(); 
}
