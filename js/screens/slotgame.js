/*
 * Filename: js/screens/slotgame.js
 * Version: NOUB 0.0.11 (SLOT GAME - CRITICAL FIX: Stable Random Payout Logic)
 * Description: Implements the Slot Machine game with a simplified, stable, random multiplier system 
 * to guarantee correct and reliable payouts (replacing the faulty Video Poker logic).
 * FIXED: Payout logic is now simple random-based.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 

const spinTicketDisplay = document.getElementById('spin-ticket-display');
const spinButton = document.getElementById('spin-button');
const reelsContainer = document.querySelectorAll('.reel');
const slotGameContainer = document.getElementById('slot-machine-container');
const multiplierButtonsContainer = document.getElementById('multiplier-buttons-container'); 
const spinsAvailableDisplay = document.getElementById('spins-available-display'); 

// --- UPDATED SYMBOLS (More Thematic) ---
const SYMBOLS = ['👑', '☥', '💎', '🏺', '📜', '🔥', '🐞', '𓂀']; // 8 symbols
const REEL_ITEM_HEIGHT = 45; 
const REEL_COUNT = 5; 

// --- BETTING CONSTANTS ---
const MULTIPLIERS = [1, 5, 10];
let currentMultiplier = 1; 
let isSpinning = false;

// --- STABLE RANDOM PAYOUTS ---
const PAYOUTS = [
    { type: 'No Match', multiplier: 0, weight: 60 },
    { type: 'Small Find', multiplier: 1, weight: 20 },
    { type: 'Good Find', multiplier: 1.5, weight: 10 },
    { type: 'Rare Find', multiplier: 3, weight: 5 },
    { type: 'Epic Find', multiplier: 5, weight: 3 },
    { type: 'Legendary Find', multiplier: 10, weight: 2 },
];
// Base Payout for 1 ticket
const BASE_PAYOUT = 50;


// --- Utility and Setup Functions (Unchanged) ---

function createReelSymbols(reelEl) {
    const inner = document.createElement('div');
    inner.className = 'reel-inner';
    
    for (let i = 0; i < 10; i++) { 
        const shuffledSymbols = [...SYMBOLS].sort(() => Math.random() - 0.5);
        shuffledSymbols.forEach(symbol => {
            const item = document.createElement('div');
            item.className = 'reel-item';
            item.textContent = symbol;
            inner.appendChild(item);
        });
    }
    reelEl.innerHTML = '';
    reelEl.appendChild(inner);
}

function spinReel(reelEl, finalIndex) {
    const reelInner = reelEl.querySelector('.reel-inner');
    const symbolCountPerCycle = SYMBOLS.length;
    
    const targetOffset = (7 * symbolCountPerCycle + finalIndex) * REEL_ITEM_HEIGHT;

    reelInner.style.transition = 'none'; 
    reelInner.style.transform = `translateY(0)`; 
    
    void reelInner.offsetWidth; 

    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex];
}


// --- Stable Random Payout Logic (CRITICAL REPLACEMENT) ---
function getWeightedRandomPayout() {
    const totalWeight = PAYOUTS.reduce((sum, p) => sum + p.weight, 0);
    let randomNum = Math.random() * totalWeight;

    for (const payout of PAYOUTS) {
        randomNum -= payout.weight;
        if (randomNum <= 0) {
            return payout;
        }
    }
    return PAYOUTS[0]; // Default to No Match if something goes wrong
}

async function determinePrize(results, multiplier) {
    // CRITICAL: Use the stable weighted random payout system
    const win = getWeightedRandomPayout();
    const basePayout = BASE_PAYOUT * multiplier; 
    
    if (win.multiplier > 0) {
        const rewardAmount = Math.floor(basePayout * win.multiplier);
        
        // 1. Grant reward in NOUB
        const newNoubScore = (state.playerProfile.noub_score || 0) + rewardAmount;
        await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });
        
        // 2. Display message
        const message = `${win.type} Payout! +${rewardAmount} NOUB`;
        displaySlotResultMessage(message, 'win');

    } else {
        displaySlotResultMessage(win.type + ". Try Again!", 'lose');
    }
    
    await refreshSlotGameScreen();
}

function displaySlotResultMessage(message, type) {
    let resultEl = document.getElementById('slot-result-message');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'slot-result-message';
        slotGameContainer.prepend(resultEl);
    }
    resultEl.className = `game-status-message ${type}`;
    resultEl.textContent = message;
}


async function runSlotMachine() {
    const betAmount = currentMultiplier;

    if (isSpinning) return;
    if ((state.playerProfile.spin_tickets || 0) < betAmount) {
        displaySlotResultMessage(`Not enough Spin Tickets (🎟️)! Need ${betAmount}.`, 'error');
        return;
    }
    
    isSpinning = true;
    spinButton.disabled = true;

    // 1. Consume tickets
    const newTickets = state.playerProfile.spin_tickets - betAmount;
    api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets }); 
    updateHeaderUI(state.playerProfile); 

    // 2. Track daily quest completion
    trackDailyActivity('games', 1);
    
    displaySlotResultMessage("Spinning...", 'info');

    // 3. Determine random results and spin (5 results required)
    const finalResultsIndices = [];
    const resultsSymbols = [];
    
    const reelElements = Array.from(reelsContainer);
    
    for(let i = 0; i < REEL_COUNT; i++) {
        // Generate a random symbol index
        const randomIndex = Math.floor(Math.random() * SYMBOLS.length);
        finalResultsIndices.push(randomIndex);
        resultsSymbols.push(spinReel(reelElements[i], randomIndex));
    }
    
    // 4. Wait for animation to finish
    setTimeout(async () => {
        // Reset transitions
        reelElements.forEach(el => {
            el.querySelector('.reel-inner').style.transition = 'none';
        });
        
        // Determine prize and update DB
        await determinePrize(resultsSymbols, betAmount); 
        
        spinButton.disabled = false;
        isSpinning = false;
        await refreshSlotGameScreen(); 
    }, 3500); 
}

async function checkDailyTicket() {
    const { data: profileData, error } = await api.getDailySpinTickets(state.currentUser.id);

    if (error || !profileData) {
        console.error("Error fetching daily spin data:", error);
        return;
    }

    const lastSpinTime = new Date(profileData.last_daily_spin).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    const available = (now - lastSpinTime) > twentyFourHours;

    if (available) {
        const currentTickets = profileData.spin_tickets || 0;
        const newTickets = currentTickets + 5; // Grant 5 tickets daily
        
        await api.updatePlayerProfile(state.currentUser.id, { 
            spin_tickets: newTickets,
            last_daily_spin: new Date().toISOString()
        });
        
        displaySlotResultMessage('Daily reward: 5 Spin Tickets received!', 'success');
    }
}

/**
 * NEW: Handles setting the bet multiplier
 */
function setMultiplier(multiplier) {
    currentMultiplier = multiplier;
    
    // Update active button state
    document.querySelectorAll('#multiplier-buttons-container button').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.multiplier) === multiplier) {
            btn.classList.add('active');
        }
    });
    
    // Update button text to reflect the new bet
    if (spinButton) {
        spinButton.textContent = `SPIN (${currentMultiplier} TICKET${currentMultiplier > 1 ? 'S' : ''})`;
    }
    
    refreshSlotGameScreen();
}

/**
 * NEW: Renders the multiplier buttons
 */
function renderMultiplierButtons() {
    // Check if the container element exists in the DOM after the new HTML is created
    const container = document.getElementById('multiplier-buttons-container');
    if (!container) return;
    
    container.innerHTML = MULTIPLIERS.map(m => `
        <button class="action-button small multiplier-btn ${m === currentMultiplier ? 'active' : ''}" 
                data-multiplier="${m}"
                onclick="window.setMultiplier(${m})">
            ${m}x
        </button>
    `).join('');
    
    // Make setMultiplier globally accessible for onclick
    window.setMultiplier = setMultiplier;
    
    // Set initial button text
    if (spinButton) {
        spinButton.textContent = `SPIN (${currentMultiplier} TICKET${currentMultiplier > 1 ? 'S' : ''})`;
    }
}


async function refreshSlotGameScreen() {
    await refreshPlayerState();
    
    const allDisplays = document.querySelectorAll('#spin-ticket-display');
    allDisplays.forEach(el => {
        el.textContent = state.playerProfile.spin_tickets || 0;
    });
    
    const spinsDisplayElement = document.getElementById('spins-available-display');
    if (spinsDisplayElement) {
        spinsDisplayElement.textContent = state.playerProfile.spin_tickets || 0;
    }

    if (spinButton) {
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < currentMultiplier);
    }
    updateHeaderUI(state.playerProfile);
}


/**
 * Main rendering function for the Slot Game Screen.
 */
export async function renderSlotGame() {
    if (!state.currentUser) return;
    
    // CRITICAL: Ensure the slot game container has the necessary sub-elements
    const gameContainer = document.getElementById('slot-machine-container');
    if (gameContainer && !gameContainer.querySelector('#multiplier-buttons-container')) {
         
         // 1. Change the Spin display area to use the new ID for easy access
         const spinInfoDiv = gameContainer.querySelector('.balance-info');
         if (spinInfoDiv) {
              spinInfoDiv.innerHTML = `Spins Available: <span id="spins-available-display">${state.playerProfile.spin_tickets || 0}</span> 🎟️`;
         }
         
         // 2. Create and insert the multiplier button container
         const reelsArea = gameContainer.querySelector('.reels-container');
         if (reelsArea) {
             const multiplierDiv = document.createElement('div');
             multiplierDiv.id = 'multiplier-buttons-container';
             multiplierDiv.style.cssText = 'margin-bottom: 10px; display: flex; justify-content: center; gap: 10px;';
             
             reelsArea.parentNode.insertBefore(multiplierDiv, reelsArea);
         }
    }

    await checkDailyTicket();
    await refreshPlayerState();
    
    // Initialize Slot Machine visuals (if it's the first time)
    if (reelsContainer.length === REEL_COUNT && (!reelsContainer[0].querySelector('.reel-inner') || reelsContainer[0].querySelector('.reel-inner').children.length === 0)) {
        reelsContainer.forEach(createReelSymbols);
    }
    
    renderMultiplierButtons(); // Render the new buttons

    // Set event listener and initial status
    if (spinButton) {
        spinButton.onclick = runSlotMachine;
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < currentMultiplier);
    }
    
    // Ensure message area is ready and displays status
    let resultEl = document.getElementById('slot-result-message');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'slot-result-message';
        slotGameContainer.prepend(resultEl);
    }
    displaySlotResultMessage("Ready to Spin! Select a bet amount.", 'info');
    
    await refreshSlotGameScreen();
}
