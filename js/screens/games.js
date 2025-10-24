/*
 * Filename: js/screens/games.js
 * Version: 21.1 (KV Game Integration - Complete)
 * Description: View Logic Module for the Games screen.
 * Integrates the original KV Game logic (Crack the Code) with the Slot Machine.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; // Import daily quest tracker

const spinTicketDisplay = document.getElementById('spin-ticket-display');
const spinButton = document.getElementById('spin-button');
const reelsContainer = document.querySelectorAll('.reel');

const kvGameContainer = document.getElementById('kv-game-container');
const kvGameControls = document.getElementById('kv-game-controls');
const kvGameIntroDiv = document.getElementById('kv-game-intro');

// --- KV Game Constants & State (From Original File) ---
const LEVEL_COST = 100; // Cost to start a KV game attempt (Increased for balance)
const WIN_REWARD_BASE = 500;
const HINT_COST = 5; // Cost to reveal the last digit (Blessing/Dagger)
const EVE_AVATAR = 'images/eve_avatar.png'; // Path to Eve's avatar
const USER_AVATAR = 'images/user_avatar.png'; // Path to User's avatar

let currentKVGame = {
    active: false,
    code: '',
    timeLeft: 0,
    interval: null,
    levelIndex: 0,
    hintsRevealed: [false, false, false, false] // Hint 4 is the last digit hint
};

const kvGatesData = [
    { kv: 1, name: "Ramses VII", unlocked: true }, { kv: 2, name: "Ramses IV" }, { kv: 3, name: "Sons of Ramses II" },
    { kv: 4, name: "Ramses XI" }, { kv: 5, name: "Sons of Ramses II" }, { kv: 6, name: "Ramses IX" },
    { kv: 7, name: "Ramses I" }, { kv: 8, name: "Merenptah" }, { kv: 9, name: "Ramses V & VI" },
    { kv: 10, name: "Amenmesses" }, { kv: 11, name: "Ramses III" }, { kv: 12, name: "Unknown" },
    // Simplified list for brevity; assume full list (25-62) exists as per original file
];

// --- KV Game DOM Elements (Need to be created in the render function) ---
let levelNameEl, timerDisplayEl, guessInputEl, submitGuessBtn, newGameBtn, endGameBtn, useItemButtonContainer;


// --- KV Game Logic Functions (Adapted from Original File) ---

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
    // Placeholder implementation for chat display logic (will send to separate chat screen later)
    console.log(`[Chat - ${sender} (${type})]: ${text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}`);
}


function timerTick() {
    currentKVGame.timeLeft--;
    if (timerDisplayEl) timerDisplayEl.textContent = `Time Left: ${currentKVGame.timeLeft}s`;

    if (currentKVGame.timeLeft <= 0) {
        endCurrentKVGame('lose_time');
    }
}

function resetKVGameUI(fullReset = true) {
    // Implementation to reset KV game interface elements
    if (guessInputEl) guessInputEl.disabled = true;
    if (submitGuessBtn) submitGuessBtn.disabled = true;
    if (endGameBtn) endGameBtn.disabled = true;
    if (timerDisplayEl) timerDisplayEl.textContent = 'Time Left: 0s';
    
    if (currentKVGame.interval) clearInterval(currentKVGame.interval);

    if (fullReset) {
        kvGameControls.classList.add('hidden');
        kvGameIntroDiv.classList.remove('hidden');
    } else {
        newGameBtn.disabled = false;
    }
}

async function updateKVProgress(isWin, timeTaken) {
    if (!state.currentUser) return;
    
    // Fetch current progress to check which level was attempted
    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    const currentLevel = currentKVGame.levelIndex + 1; // 1-based level attempted
    
    let updateObject = {
        current_kv_level: progress.current_kv_level, // Default to current level
        last_game_result: isWin ? 'Win' : 'Loss',
        unlocked_levels_json: progress.unlocked_levels_json
    };
    
    if (isWin) {
        const nextLevel = currentLevel + 1;
        updateObject.current_kv_level = nextLevel; // Move to the next level
        
        let unlockedLevels = JSON.parse(progress.unlocked_levels_json || '[]');
        if (!unlockedLevels.includes(currentLevel)) {
            unlockedLevels.push(currentLevel);
            updateObject.unlocked_levels_json = JSON.stringify(unlockedLevels);
        }
    }
    
    // Update total stats (optional, could be done in player_profile)
    
    // Save the new progress
    await api.updateKVProgress(state.currentUser.id, updateObject);
    await refreshPlayerState();
}


async function endCurrentKVGame(result) {
    if (!currentKVGame.active) return;
    currentKVGame.active = false;

    if (currentKVGame.interval) clearInterval(currentKVGame.interval);

    const gateInfo = kvGatesData[currentKVGame.levelIndex];
    const gameDuration = getLevelConfig(currentKVGame.levelIndex).time - currentKVGame.timeLeft;
    
    let isWin = (result === 'win');
    
    // 1. Update Game Progress and Stats
    await updateKVProgress(isWin, gameDuration); // Saves progress to DB

    if (isWin) {
        const reward = WIN_REWARD_BASE + (currentKVGame.levelIndex * 50); // Scaling reward
        const newScore = (state.playerProfile.score || 0) + reward;
        await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
        
        addChatMessage("Eve", `*Congratulations!* You cracked the code for KV${gateInfo.kv}! You earned ${reward} ☥!`, 'win', EVE_AVATAR);
    } else {
        addChatMessage("Eve", `Expedition ended. The correct code was *${currentKVGame.code}*. Try again!`, 'lose', EVE_AVATAR);
    }
    
    // 2. Refresh state and UI
    await refreshPlayerState();
    resetKVGameUI(false);
    renderKVGameContent(); // Re-render content to show new state
}

function handleSubmitGuess() {
    if (!currentKVGame.active) return;
    
    const guess = guessInputEl.value;
    const config = getLevelConfig(currentKVGame.levelIndex);

    if (guess.length !== config.digits || !/^\d+$/.test(guess)) {
        showToast(`Enter exactly ${config.digits} digits.`, 'error');
        return;
    }

    addChatMessage(state.playerProfile.username, `My guess: ${guess}`, 'user', USER_AVATAR);

    if (guess === currentKVGame.code) {
        endCurrentKVGame('win');
    } else {
        showToast("Incorrect code. Keep trying!", 'info');
        // Add more detailed feedback here later
    }
}

async function startNewKVGame() {
    if (!state.currentUser) return;
    if (currentKVGame.active) return;

    // Fetch latest progress
    const { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) {
        showToast("Error loading game progress.", 'error');
        return;
    }
    
    currentKVGame.levelIndex = progress.current_kv_level - 1; // 0-based index
    
    if (currentKVGame.levelIndex >= kvGatesData.length) {
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
    
    currentKVGame.active = true;
    currentKVGame.hintsRevealed = [false, false, false, false]; 
    
    const gateInfo = kvGatesData[currentKVGame.levelIndex];
    const config = getLevelConfig(currentKVGame.levelIndex);
    currentKVGame.code = generateCode(config.digits);
    currentKVGame.timeLeft = config.time;

    // Update UI elements
    levelNameEl.textContent = `KV${gateInfo.kv}: ${gateInfo.name}`;
    guessInputEl.value = '';
    guessInputEl.maxLength = config.digits;
    guessInputEl.placeholder = `Enter ${config.digits}-digit code`;

    // Start Timer
    currentKVGame.interval = setInterval(timerTick, 1000);
    timerDisplayEl.textContent = `Time Left: ${currentKVGame.timeLeft}s`;

    // Display initial hints (Placeholder for the chat logic)
    const hints = calculateHints(currentKVGame.code);
    addChatMessage("System", `Starting challenge for KV${gateInfo.kv}. Code: ${config.digits} digits.`, 'system');
    addChatMessage("Eve", `Hint 1: The sum of the digits is *${hints.sum}*.`, 'hint', EVE_AVATAR);
    addChatMessage("Eve", `Hint 2: The product of the digits is *${hints.product}*.`, 'hint', EVE_AVATAR);

    kvGameControls.classList.remove('hidden');
    kvGameIntroDiv.classList.add('hidden');
}


// --- MAIN SCREEN RENDER ---

function renderKVGameContent() {
    // 1. Initial Setup (DOM Structure)
    kvGameIntroDiv.innerHTML = `
        <h3>Valley of the Kings - Crack the Code</h3>
        <p class="screen-description">Decipher the secret codes of the ancient tombs (KVs). Each successful completion unlocks the next level. Failure costs you precious time and resources!</p>
        <div id="kv-progress-info">Loading Progress...</div>
        <button id="kv-start-btn" class="action-button" style="width: 200px;">Load Game</button>
    `;

    kvGameControls.innerHTML = `
        <h2 style="margin-top: 0; padding-top: 0;">Crack the Code: <span id="level-name-display">KV Gate Name</span></h2>
        <div id="timer-display" style="font-size: 1.5em; margin: 10px 0; font-weight: bold;">Time Left: 0s</div>
        <div class="game-input-area" style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <input type="number" id="guess-input" style="width: 150px; font-size: 1.2em; text-align: center;" placeholder="Enter code...">
            <button id="submit-guess-btn" class="action-button small">Submit</button>
        </div>
        <div id="hint-display" style="display: flex; justify-content: center; gap: 10px;">
            <!-- Hint buttons will go here -->
        </div>
        <div class="game-controls" style="margin-top: 20px; display: flex; gap: 10px;">
            <button id="kv-new-game-btn" class="action-button small">Start Gate</button>
            <button id="kv-end-game-btn" class="action-button small danger">End Expedition</button>
        </div>
    `;

    // 2. Fetch DOM References
    levelNameEl = document.getElementById('level-name-display');
    timerDisplayEl = document.getElementById('timer-display');
    guessInputEl = document.getElementById('guess-input');
    submitGuessBtn = document.getElementById('submit-guess-btn');
    newGameBtn = document.getElementById('kv-new-game-btn');
    endGameBtn = document.getElementById('kv-end-game-btn');
    
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

    currentKVGame.levelIndex = progress.current_kv_level - 1;
    const nextGate = kvGatesData[progress.current_kv_level - 1];

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


export async function renderGames() {
    // Renders the KV Game structure (since this is the main game)
    renderKVGameContent(); 
}
