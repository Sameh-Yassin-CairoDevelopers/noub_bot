/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v2.1.3 (Idle Drop Generator Dedicated Screen)
 * Description: Implements the full functionality and rendering for the Royal Vault 
 * (Idle Drop Generator).
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const ONE_SECOND = 1000;
const msGameContainer = document.getElementById('ms-game-screen');
let idleGeneratorInterval = null;

// --- IDLE GENERATOR CONFIGURATION (Duplicated for MS Game to be self-contained) ---
const IDLE_GENERATOR_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// --------------------------------------------------------
// --- CORE LOGIC FUNCTIONS ---
// --------------------------------------------------------

/**
 * Formats milliseconds into H:MM:SS format.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} Formatted time string.
 */
function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / ONE_SECOND);
    const hours = Math.floor((totalSeconds / 3600));
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Calculates the current production rate, capacity, and upgrade cost.
 * @param {number} level - The current level of the Idle Generator.
 * @returns {object} The configuration object for the current level.
 */
function calculateIdleDrop(level) {
    const config = IDLE_GENERATOR_CONFIG;
    const capacityMinutes = (config.BASE_CAPACITY_HOURS * 60) + ((level - 1) * config.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMinute = config.BASE_RATE_PER_MINUTE + ((level - 1) * config.RATE_INCREASE_PER_LEVEL);
    const ratePerMs = ratePerMinute / (60 * 1000); // Rate per millisecond
    const maxNoub = Math.floor(ratePerMinute * capacityMinutes);

    return {
        capacityMs: capacityMinutes * 60 * 1000,
        ratePerMinute: ratePerMinute,
        ratePerMs: ratePerMs,
        maxNoub: maxNoub,
        upgradeCost: Math.floor(config.UPGRADE_COST_BASE * Math.pow(config.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

/**
 * Handles the logic for claiming accumulated NOUB from the Idle Generator.
 */
async function handleClaimIdleDrop() {
    if (!state.currentUser) return;
    const playerId = state.currentUser.id;
    
    // Fetch latest profile state
    const { data: profile } = await api.fetchIdleDropState(playerId);
    if (!profile) return showToast("Error fetching generator state.", 'error');

    const generatorLevel = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(generatorLevel);
    const lastClaimTime = new Date(profile.last_claim_time).getTime();
    const elapsedTime = Date.now() - lastClaimTime;
    
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);

    if (noubGenerated < 1) return showToast("Nothing to claim yet.", 'info');

    showToast(`Claiming ${noubGenerated} NOUB...`, 'success');

    const updateObject = {
        noub_score: profile.noub_score + noubGenerated,
        last_claim_time: new Date().toISOString() // Reset timer
    };

    const { error } = await api.updatePlayerProfile(playerId, updateObject);

    if (error) {
        showToast("Claim failed!", 'error');
        return;
    }

    const { leveledUp, newLevel } = await api.addXp(playerId, 1);
    if (leveledUp) showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
    
    await refreshPlayerState();
    renderMsGame(); // Re-render the dedicated screen
}

/**
 * Handles the upgrade transaction for the Idle Generator.
 */
async function handleUpgradeIdleDrop(currentLevel, upgradeCost) {
    if (state.playerProfile.noub_score < upgradeCost) return showToast("Not enough NOUB to upgrade!", 'error');
    
    const playerId = state.currentUser.id;
    const newLevel = currentLevel + 1;
    
    showToast(`Upgrading Idle Generator to Level ${newLevel}...`, 'info');

    const { error: profileError } = await api.updatePlayerProfile(playerId, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: newLevel
    });

    if (profileError) return showToast("Upgrade failed!", 'error');

    const { leveledUp, newLevel: playerNewLevel } = await api.addXp(playerId, 50);
    if (leveledUp) showToast(`LEVEL UP! You have reached Level ${playerNewLevel}!`, 'success');

    showToast(`Idle Generator upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState();
    renderMsGame();
}


// --------------------------------------------------------
// --- RENDER FUNCTION (The export) ---
// --------------------------------------------------------

export async function renderMsGame() {
    if (!state.currentUser || !msGameContainer) return;

    await refreshPlayerState(); 
    
    // 1. Fetch State
    const { data: profile } = await api.fetchIdleDropState(state.currentUser.id);
    if (!profile) return;
    
    const generatorLevel = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(generatorLevel);
    const lastClaimTimeMs = new Date(profile.last_claim_time).getTime();
    const elapsedTime = Date.now() - lastClaimTimeMs;
    
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);
    const remainingTimeMs = generatorState.capacityMs - timeToCount;
    const capacityPercent = (timeToCount / generatorState.capacityMs) * 100;
    const isFull = remainingTimeMs <= 0;
    
    const timeDisplay = isFull ? 'FULL' : formatTime(remainingTimeMs);
    const buttonText = isFull ? `CLAIM ${noubGenerated} 🪙` : `CLAIM ${noubGenerated} 🪙 (Still Producing)`;

    // 2. Set UI Content
    msGameContainer.innerHTML = `
        <h2>Royal Vault (Idle Drop)</h2>
        <div class="idle-generator-card game-container">
            <div class="generator-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3a3a3c; padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="margin:0; color: var(--primary-accent);">Vault Status - Lvl ${generatorLevel}</h3>
                <img src="images/idle_vault.png" alt="Vault Icon" style="width: 50px; height: 50px; filter: drop-shadow(0 0 5px var(--primary-accent));">
            </div>
            
            <div class="generator-info" style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 20px; font-size: 0.9em;">
                <p>Rate: <strong style="color: var(--success-color);">${generatorState.ratePerMinute.toFixed(2)} 🪙/min</strong></p>
                <p>Capacity: <strong style="color: var(--accent-blue);">${(generatorState.capacityMs / 3600000).toFixed(1)} hrs</strong></p>
            </div>
            
            <div class="generator-timer" style="text-align: center; margin-bottom: 15px;">
                <p style="font-size: 1.2em; font-weight: bold; color: ${isFull ? 'var(--danger-color)' : 'var(--primary-accent)'};">
                    ${isFull ? `CAPACITY REACHED! (Max: ${generatorState.maxNoub} 🪙)` : `Time to Full: ${timeDisplay}`}
                </p>
            </div>
            
            <div class="progress-bar-container" style="margin-bottom: 20px;">
                <div class="progress-bar" style="height: 20px; border-radius: 10px;">
                    <div class="progress-bar-inner" id="idle-progress-inner" style="width: ${capacityPercent}%; background: linear-gradient(to right, #4caf50, var(--primary-accent)); border-radius: 10px;"></div>
                </div>
                <p style="text-align: center; margin-top: 5px; font-size: 0.9em;">
                    Accumulated: <strong id="idle-accumulated-noub">${noubGenerated} 🪙</strong> of ${generatorState.maxNoub} 🪙
                </p>
            </div>

            <button id="claim-idle-drop-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''} style="margin-bottom: 10px;">
                ${buttonText}
            </button>
            
            <button id="upgrade-idle-drop-btn" class="action-button small" style="background-color: var(--accent-blue); box-shadow: 0 4px 0 #006b72;">
                UPGRADE (Cost: ${generatorState.upgradeCost} 🪙)
            </button>
        </div>
    `;

    // 3. Attach Event Listeners
    document.getElementById('claim-idle-drop-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-drop-btn').onclick = () => handleUpgradeIdleDrop(generatorLevel, generatorState.upgradeCost);

    // 4. Start Live Timer (Crucial for smooth UI)
    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
    if (!isFull) {
        // We use the lastClaimTimeMs from the fetched profile for the timer
        const lastClaimTimeMs = new Date(profile.last_claim_time).getTime(); 

        idleGeneratorInterval = setInterval(() => {
            const timeSinceLastClaim = Date.now() - lastClaimTimeMs;
            const timeRemaining = generatorState.capacityMs - timeSinceLastClaim;

            if (timeRemaining <= 0) {
                renderMsGame(); // Recalculate and update to FULL state
                return;
            }
            
            const generated = Math.floor(timeSinceLastClaim * generatorState.ratePerMs);
            const percent = (timeSinceLastClaim / generatorState.capacityMs) * 100;
            const timeFull = formatTime(timeRemaining);
            
            // Update DOM directly for smooth timer
            const timerEl = msGameContainer.querySelector('.generator-timer p');
            const progressEl = document.getElementById('idle-progress-inner');
            const noubEl = document.getElementById('idle-accumulated-noub');
            const claimBtn = document.getElementById('claim-idle-drop-btn');

            if (timerEl) timerEl.innerHTML = `Time to Full: ${timeFull}`;
            if (progressEl) progressEl.style.width = `${percent}%`;
            if (noubEl) noubEl.innerHTML = `${generated} 🪙`;
            if (claimBtn) claimBtn.textContent = `CLAIM ${generated} 🪙 (Still Producing)`;
            if (claimBtn) claimBtn.disabled = generated < 1;

        }, ONE_SECOND);
    }
}