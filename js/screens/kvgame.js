/*
 * Filename: js/screens/kvgame.js
 * Version: Pharaoh's Legacy 'NOUB' v1.5.1 (XP System Integration)
 * Description: Implements the Valley of the Kings (Crack the Code) logic. This version
 * integrates the new XP system, granting players experience points upon successfully
 * winning a game, making it a core part of player progression.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 
import { checkAndUnlockLibrary } from './library.js';

// --- KV Game Constants & State ---
const LEVEL_COST = 100;
const WIN_REWARD_BASE = 500;
const HINT_SCROLL_ITEM_KEY = 'hint_scroll';
const HINT_SCROLL_COST_ANKH_PREMIUM = 5;
const TIME_AMULET_ITEM_KEY = 'time_amulet_45s';
const TIME_AMULET_COST_ANKH_PREMIUM = 10;

let kvGameState = {
    active: false,
    code: '',
    timeLeft: 0,
    interval: null,
    levelIndex: 0,
    attemptsLeft: 0,
    hintsRevealed: [true, true, true, false],
};

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
    { kv: 33, name: "Unknown" },
    { kv: 34, name: "Thutmose III" }, { kv: 35, name: "Amenhotep II" }, { kv: 36, name: "Maiherpri" },
    { kv: 37, name: "Unknown" }, { kv: 38, name: "Thutmose I" }, { kv: 39, name: "Unknown" }, { kv: 40, name: "Unknown" },
    { kv: 41, name: "Unknown" }, { kv: 42, name: "Hatshepsut-Meryet-Ra" }, { kv: 43, name: "Thutmose IV" }, { kv: 44, name: "Unknown" },
    { kv: 45, name: "Userhet" }, { kv: 46, name: "Yuya & Thuya" }, { kv: 47, name: "Siptah" },
    { kv: 48, name: "Amenemope" }, { kv: 49, name: "Unknown" }, { kv: 50, name: "Unknown" }, { kv: 51, name: "Unknown" },
    { kv: 52, name: "Unknown" },
    { kv: 53, name: "Unknown" }, { kv: 54, name: "Tutankhamun cache?" }, { kv: 55, name: "Amarna Cache (Akhenaten?)" }, { kv: 56, name: "Gold Tomb?" },
    { kv: 57, name: "Horemheb" }, { kv: 58, name: "Unknown (Chariot Tomb?)" }, { kv: 59, name: "Unknown" }, { kv: 60, name: "Sitre" },
    { kv: 61, name: "Unknown" }, { kv: 62, name: "Tutankhamun" }
];

let levelNameEl, timerDisplayEl, guessInputEl, submitGuessBtn, newGameBtn, endGameBtn, progressInfoDiv, hintDisplayDiv, kvGameControlsEl, kvMessageLabel;

// --- CORE LOGIC FUNCTIONS ---

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

function generateCode(digits) {
    let code = '';
    for (let i = 0; i < digits; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

function calculateCodeHints(code) {
    const digits = code.split('').map(Number);
    const sum = digits.reduce((a, b) => a + b, 0);
    const product = digits.reduce((a, b) => a * b, 1);
    const evens = digits.filter(d => d % 2 === 0).length;
    const odds = digits.length - evens;
    const lastDigit = digits[digits.length - 1];

    return { sum, product, evens, odds, lastDigit };
}

function getBullAndCowFeedback(secret, guess) {
    let bulls = 0;
    let cows = 0;
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    const secretMap = new Map();

    for (let i = 0; i < secretArr.length; i++) {
        if (secretArr[i] === guessArr[i]) {
            bulls++;
            secretArr[i] = '#'; 
            guessArr[i] = '@';
        } else {
            secretMap.set(secretArr[i], (secretMap.get(secretArr[i]) || 0) + 1);
        }
    }

    for (let i = 0; i < guessArr.length; i++) {
        const digit = guessArr[i];
        if (digit !== '@' && secretMap.has(digit) && secretMap.get(digit) > 0) {
            cows++;
            secretMap.set(digit, secretMap.get(digit) - 1);
        }
    }

    return { bulls, cows };
}

async function updateKVProgress(isWin) {
    if (!state.currentUser) return;

    let { data: progress } = await api.fetchKVProgress(state.currentUser.id);

    if (!progress) {
        progress = {
            player_id: state.currentUser.id,
            current_kv_level: 1,
            last_game_result: null,
            unlocked_levels_json: '[]'
        };
        const { error: insertError } = await api.updateKVProgress(state.currentUser.id, progress);
        if (insertError) {
             console.error("Failed to initialize KV progress:", insertError);
             showToast("Error initializing game progress.", 'error');
             return;
        }
        ({ data: progress } = await api.fetchKVProgress(state.currentUser.id));
        if (!progress) {
            console.error("Failed to retrieve game progress.");
            showToast("Error retrieving game progress.", 'error');
            return;
        }
    }

    let unlockedLevels = [];
    try {
        unlockedLevels = JSON.parse(progress.unlocked_levels_json || '[]');
    } catch (e) {
        console.error("Error parsing unlocked_levels_json:", e, "Raw data:", progress.unlocked_levels_json);
        unlockedLevels = [];
    }

    const currentLevel = kvGameState.levelIndex + 1;
    let updateObject = {
        player_id: state.currentUser.id,
        current_kv_level: progress.current_kv_level,
        last_game_result: isWin ? 'Win' : 'Loss',
        unlocked_levels_json: progress.unlocked_levels_json
    };

    if (isWin) {
        const nextLevel = currentLevel + 1;
        if (nextLevel > progress.current_kv_level) {
            updateObject.current_kv_level = nextLevel;
        }

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

    if (kvGameState.timeLeft <= 10 && kvGameState.timeLeft > 0) {
        timerDisplayEl.style.color = 'orange';
    } else if (kvGameState.timeLeft <= 5 && kvGameState.timeLeft > 0) {
        timerDisplayEl.style.color = 'red';
    } else {
        timerDisplayEl.style.color = 'white';
    }
}

function updateHintDisplay() {
    if (!hintDisplayDiv || !kvGameState.code) return;

    hintDisplayDiv.innerHTML = '';
    const hints = calculateCodeHints(kvGameState.code);
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'kv-use-item-button-container';
    buttonContainer.style.cssText = 'display: flex; justify-content: center; flex-wrap: wrap; gap: 7px; margin-top: 10px;';

    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 1 (Sum): <span>${hints.sum}</span>. (Free)</li>`;
    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 2 (Product): <span>${hints.product}</span>. (Free)</li>`;
    hintDisplayDiv.innerHTML += `<li class="kv-hint-item">Hint 3 (Even/Odd): <span>${hints.odds} odd / ${hints.evens} even</span>. (Free)</li>`;

    if (kvGameState.hintsRevealed[3]) {
        hintDisplayDiv.innerHTML += `<li class="kv-hint-item" style="border-left-color: var(--success-color);">Hint 4: Last digit is <span>${hints.lastDigit}</span>. (Used)</li>`;
    } else {
        const scrollCount = state.consumables.get(HINT_SCROLL_ITEM_KEY) || 0;
        const hintBtn = document.createElement('button');
        hintBtn.className = 'action-button small';
        hintBtn.style.backgroundColor = 'var(--kv-gate-color)';
        hintBtn.textContent = (scrollCount > 0)
            ? `Use Hint Scroll (${scrollCount})`
            : `Buy Last Digit (${HINT_SCROLL_COST_ANKH_PREMIUM} ☥)`;

        hintBtn.disabled = !kvGameState.active;
        hintBtn.onclick = () => handlePurchaseAndUseItem(HINT_SCROLL_ITEM_KEY, HINT_SCROLL_COST_ANKH_PREMIUM, 'hint');
        buttonContainer.appendChild(hintBtn);
    }
    
    const amuletCount = state.consumables.get(TIME_AMULET_ITEM_KEY) || 0;
    const timeBtn = document.createElement('button');
    timeBtn.className = 'action-button small';
    timeBtn.style.backgroundColor = '#95a5a6';
    timeBtn.textContent = (amuletCount > 0)
        ? `Use Time Amulet (${amuletCount})`
        : `Buy Time (+45s) (${TIME_AMULET_COST_ANKH_PREMIUM} ☥)`;

    timeBtn.disabled = !kvGameState.active;
    timeBtn.onclick = () => handlePurchaseAndUseItem(TIME_AMULET_ITEM_KEY, TIME_AMULET_COST_ANKH_PREMIUM, 'time');
    buttonContainer.appendChild(timeBtn);

    hintDisplayDiv.appendChild(buttonContainer);
}

async function handlePurchaseAndUseItem(itemKey, ankhPremiumCost, itemType) {
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
        await api.updateConsumableQuantity(state.currentUser.id, itemKey, consumableCount - 1);
        showToast(`${itemKey.split('_')[0]} used!`, 'success');
        itemUsedSuccessfully = true;
    } else if ((state.playerProfile.ankh_premium || 0) >= ankhPremiumCost) {
        const newAnkhPremium = state.playerProfile.ankh_premium - ankhPremiumCost;
        await api.updatePlayerProfile(state.currentUser.id, { ankh_premium: newAnkhPremium });
        showToast(`${itemType} purchased with Ankh Premium!`, 'success');
        itemUsedSuccessfully = true;
    } else {
        showToast(`Need ${ankhPremiumCost} Ankh (☥) or the consumable item.`, 'error');
        return;
    }

    if (itemUsedSuccessfully) {
        if (isHint) kvGameState.hintsRevealed[3] = true;
        if (isTime) kvGameState.timeLeft += 45;
    }

    await refreshPlayerState();
    updateHintDisplay();
}

/**
 * Ends the current KV game session and processes the result.
 * NEW: Grants the player +25 XP upon a successful win.
 * @param {string} result - The outcome of the game ('win', 'lose_time', 'lose_attempts', 'manual').
 */
async function endCurrentKVGame(result) {
    if (!kvGameState.active) return;
    kvGameState.active = false;

    if (kvGameState.interval) clearInterval(kvGameState.interval);

    const gateInfo = kvGatesData[kvGameState.levelIndex];
    let isWin = (result === 'win');
    const timeSpent = getLevelConfig(kvGameState.levelIndex).time - kvGameState.timeLeft;

    const gameDetails = {
        player_id: state.currentUser.id,
        game_type: 'KV Game',
        level_kv: gateInfo.kv,
        result_status: isWin ? 'Win' : ((result === 'manual') ? 'Loss (Manual)' : 'Loss (Time)'),
        time_taken: timeSpent < 0 ? 0 : timeSpent, 
        code: kvGameState.code,
        date: new Date().toISOString()
    };
    await api.insertGameHistory(gameDetails);

    await updateKVProgress(isWin);

    if (isWin) {
        await checkAndUnlockLibrary(kvGameState.levelIndex + 1); 

        const reward = WIN_REWARD_BASE + (kvGameState.levelIndex * 50);
        const newNoubScore = (state.playerProfile.noub_score || 0) + reward;
        await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });
        
        // --- NEW: Grant XP for winning the KV game ---
        const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 25);
        if (leveledUp) {
            showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
        }
        // --- END NEW ---

        showToast(`*Congratulations!* You cracked KV${gateInfo.kv}! +${reward} 🪙 & +25 XP!`, 'success');
    } else {
        showToast(`Expedition ended. The correct code was ${kvGameState.code}. Try again!`, 'error');
    }

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

    kvGameState.attemptsLeft--;
    document.getElementById('kv-attempts-display').textContent = `Attempts Left: ${kvGameState.attemptsLeft}`;

    if (guess === kvGameState.code) {
        endCurrentKVGame('win');
    } else if (kvGameState.attemptsLeft <= 0) {
        endCurrentKVGame('lose_attempts'); 
    } else {
        const feedback = getBullAndCowFeedback(kvGameState.code, guess);
        
        if (kvMessageLabel) {
             kvMessageLabel.textContent = `Incorrect! Bulls: ${feedback.bulls}, Cows: ${feedback.cows}`;
        }

        showToast(`Incorrect! Bulls: ${feedback.bulls}, Cows: ${feedback.cows}`, 'info');
        guessInputEl.value = '';
        guessInputEl.focus();
    }
}

async function startNewKVGame() {
    if (!state.currentUser || kvGameState.active) return;

    let { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) {
        await api.updateKVProgress(state.currentUser.id, {
            player_id: state.currentUser.id,
            current_kv_level: 1,
            last_game_result: null,
            unlocked_levels_json: '[]'
        });
        ({ data: progress } = await api.fetchKVProgress(state.currentUser.id));
        if (!progress) {
            console.error("Failed to initialize KV progress for new player.");
            showToast("Error preparing game progress.", 'error');
            return;
        }
    }

    kvGameState.levelIndex = (progress.current_kv_level || 1) - 1;

    if (kvGameState.levelIndex >= kvGatesData.length) {
        showToast("Congratulations! You've conquered all known gates!", 'success');
        return;
    }

    if ((state.playerProfile.noub_score || 0) < LEVEL_COST) {
        showToast(`You need ${LEVEL_COST} NOUB (🪙) to start.`, 'error');
        return;
    }

    const newNoubScore = (state.playerProfile.noub_score || 0) - LEVEL_COST;
    await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });
    await refreshPlayerState();

    kvGameState.active = true;
    kvGameState.hintsRevealed = [true, true, true, false];

    const gateInfo = kvGatesData[kvGameState.levelIndex];
    const config = getLevelConfig(kvGameState.levelIndex);
    kvGameState.code = generateCode(config.digits);
    kvGameState.timeLeft = config.time;
    kvGameState.attemptsLeft = config.attempts;

    const kvGameIntroContent = document.getElementById('kv-game-intro-content');
    const kvGameActiveContent = document.getElementById('kv-game-controls-content');
    if (kvGameIntroContent) kvGameIntroContent.classList.add('hidden');
    if (kvGameActiveContent) kvGameActiveContent.classList.remove('hidden');

    document.getElementById('kv-level-name-display').textContent = `KV${gateInfo.kv}: ${gateInfo.name}`;
    document.getElementById('kv-attempts-display').textContent = `Attempts Left: ${kvGameState.attemptsLeft}`;
    document.getElementById('kv-message-label').textContent = `Code: ${config.digits} digits`;

    if (guessInputEl) {
        guessInputEl.value = '';
        guessInputEl.maxLength = config.digits;
        guessInputEl.placeholder = `Enter code... (${config.digits} digits)`;
        guessInputEl.disabled = false;
        guessInputEl.focus();
    }

    if (newGameBtn) newGameBtn.disabled = true;

    if (kvGameState.interval) clearInterval(kvGameState.interval);
    kvGameState.interval = setInterval(timerTick, 1000);

    updateHintDisplay();
    trackDailyActivity('games', 1);

    const hints = calculateCodeHints(kvGameState.code);
    showToast(`Hint 1 (Sum): ${hints.sum}`, 'info');
    setTimeout(() => { showToast(`Hint 2 (Product): ${hints.product}`, 'info'); }, 500);
    setTimeout(() => { showToast(`Hint 3 (Even/Odd): ${hints.odds} odd / ${hints.evens} even`, 'info'); }, 1000);
}

// --- MAIN SCREEN RENDER & UI SETUP ---

function renderKVGameContent() {
    levelNameEl = document.getElementById('kv-level-name-display');
    timerDisplayEl = document.getElementById('kv-timer-display');
    guessInputEl = document.getElementById('kv-guess-input');
    submitGuessBtn = document.getElementById('kv-submit-guess-btn');
    newGameBtn = document.getElementById('kv-start-btn');
    endGameBtn = document.getElementById('kv-end-game-btn');
    hintDisplayDiv = document.getElementById('kv-hints-list');
    kvGameControlsEl = document.getElementById('kv-game-controls-content');
    kvMessageLabel = document.getElementById('kv-message-label');
    
    if (!levelNameEl || !guessInputEl || !newGameBtn) {
         console.error("KV Game UI elements are missing from index.html. Cannot initialize game logic.");
         return;
    }

    if (newGameBtn) newGameBtn.onclick = startNewKVGame;
    if (submitGuessBtn) submitGuessBtn.onclick = handleSubmitGuess;
    if (endGameBtn) endGameBtn.onclick = () => endCurrentKVGame('manual');
    if (guessInputEl) guessInputEl.onkeypress = (e) => {
        if (e.key === 'Enter') handleSubmitGuess();
    };

    updateKVProgressInfo();
}

async function updateKVProgressInfo() {
    const startBtn = document.getElementById('kv-start-btn');
    const kvGameIntroContent = document.getElementById('kv-game-intro-content');
    const kvGameActiveContent = document.getElementById('kv-game-controls-content'); 

    let { data: progress } = await api.fetchKVProgress(state.currentUser.id);
    if (!progress) {
        await api.updateKVProgress(state.currentUser.id, {
            player_id: state.currentUser.id,
            current_kv_level: 1,
            last_game_result: null,
            unlocked_levels_json: '[]'
        });
        ({ data: progress } = await api.fetchKVProgress(state.currentUser.id));
        if (!progress) {
            console.error("Failed to initialize KV progress for UI info.");
            return;
        }
    }

    kvGameState.levelIndex = (progress.current_kv_level || 1) - 1;
    const nextGate = kvGatesData[kvGameState.levelIndex];

    if (nextGate) {
        if(kvGameIntroContent) kvGameIntroContent.classList.remove('hidden');
        if(kvGameActiveContent) kvGameActiveContent.classList.add('hidden');

        startBtn.textContent = `Start KV Gate ${nextGate.kv}`;
        startBtn.disabled = false;
        if (levelNameEl) levelNameEl.textContent = `KV${nextGate.kv}: ${nextGate.name}`;
    } else {
        startBtn.textContent = `All Gates Conquered!`;
        startBtn.disabled = true;
        if (levelNameEl) levelNameEl.textContent = `Valley of the Kings - Fully Explored!`;
    }
}

export async function renderKVGame() {
    renderKVGameContent();
}
