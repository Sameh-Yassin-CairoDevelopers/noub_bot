
/*
 * Filename: js/screens/slotgame.js
 * Version: NOUB 0.0.1 Eve Edition (V34.0 - 5-REEL VIDEO POKER LOGIC - Complete)
 * Description: Implements all logic for the Slot Machine game (Tomb of Treasures) 
 * using 5 reels and video poker win conditions.
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

// NOTE: Now 5 reels required by CSS. We need 5 symbols for 5-reel logic.
const SYMBOLS = ['☥', '𓂀', '𓋹', '🐍', '🐞', '👑', '💎', '🏺']; // 8 symbols
const REEL_ITEM_HEIGHT = 90; 
const REEL_COUNT = 5; 
let isSpinning = false;


// --- Utility and Setup Functions ---

function createReelSymbols(reelEl) {
    const inner = document.createElement('div');
    inner.className = 'reel-inner';
    
    for (let i = 0; i < 10; i++) {
        SYMBOLS.forEach(symbol => {
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
    // ... (Spin animation logic remains the same) ...
    const reelInner = reelEl.querySelector('.reel-inner');
    const symbolCountPerCycle = SYMBOLS.length;
    const finalSymbolPosition = (symbolCountPerCycle - 1 - finalIndex); 
    const targetOffset = (7 * symbolCountPerCycle + finalSymbolPosition) * REEL_ITEM_HEIGHT;

    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex];
}


// --- Video Poker Winning Logic ---

function checkWinCondition(results) {
    // Use a frequency map for the 5 symbols
    const freq = {};
    results.forEach(s => freq[s] = (freq[s] || 0) + 1);

    const counts = Object.values(freq);
    const uniqueSymbols = counts.length;
    
    // Check for 5-of-a-kind (5x)
    if (counts.includes(5)) return { type: 'FiveX', multiplier: 50 };
    
    // Check for 4-of-a-kind (4x)
    if (counts.includes(4)) return { type: 'FourX', multiplier: 10 };
    
    // Check for Full House (3x and 2x)
    if (counts.includes(3) && counts.includes(2)) return { type: 'FullHouse', multiplier: 5 };
    
    // Check for 3-of-a-kind (3x)
    if (counts.includes(3)) return { type: 'ThreeX', multiplier: 3 };
    
    // Check for Two Pair (2x, 2x)
    if (uniqueSymbols === 3 && counts.filter(c => c === 2).length === 2) return { type: 'TwoPair', multiplier: 2 };
    
    // Check for One Pair (2x) (Min win condition)
    if (counts.includes(2)) return { type: 'OnePair', multiplier: 1.5 }; // Small payout
    
    return { type: 'Loss', multiplier: 0 };
}


async function determinePrize(results) {
    const win = checkWinCondition(results);
    const basePayout = 50; 
    
    // Find the master reward data (using Ankh type for consistency)
    const { data: rewards } = await api.fetchSlotRewards();
    const ankhRewardData = rewards.find(r => r.prize_type === 'ANKH' && r.prize_name.includes('Minor')) || { value: 50 };

    if (win.multiplier > 0) {
        const rewardAmount = Math.floor(basePayout * win.multiplier);
        
        // 1. Grant reward
        const newScore = (state.playerProfile.score || 0) + rewardAmount;
        await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
        
        // 2. Display message
        const message = `${win.type} Payout! +${rewardAmount} ☥`;
        displaySlotResultMessage(message, win.type.includes('Loss') ? 'lose' : 'win');
    } else {
        displaySlotResultMessage("No Match. Try Again!", 'lose');
    }
    
    await refreshSlotGameScreen();
}

function displaySlotResultMessage(message, type) {
    let resultEl = document.getElementById('slot-result-message');
    if (!resultEl) {
        // Create the element if it doesn't exist (assuming index.html was modified to include it)
        resultEl = document.createElement('div');
        resultEl.id = 'slot-result-message';
        slotGameContainer.prepend(resultEl);
    }
    resultEl.className = `game-status-message ${type}`;
    resultEl.textContent = message;
}


async function runSlotMachine() {
    if (isSpinning) return;
    if ((state.playerProfile.spin_tickets || 0) < 1) {
        displaySlotResultMessage('Not enough Spin Tickets (🗡️)!', 'error');
        return;
    }
    
    isSpinning = true;
    spinButton.disabled = true;

    // 1. Consume ticket
    const newTickets = state.playerProfile.spin_tickets - 1;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    state.playerProfile.spin_tickets = newTickets;
    updateHeaderUI(state.playerProfile);

    // 2. Track daily quest completion
    trackDailyActivity('games', 1);
    
    displaySlotResultMessage("Spinning...", 'info');

    // 3. Determine random results and spin (5 results required)
    const finalResultsIndices = [];
    const resultsSymbols = [];
    
    const reelElements = Array.from(reelsContainer);
    
    for(let i = 0; i < REEL_COUNT; i++) {
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
        await determinePrize(resultsSymbols);
        
        spinButton.disabled = false;
        isSpinning = false;
        await refreshSlotGameScreen();
    }, 3500);
}

async function checkDailyTicket() {
    const { available } = await api.getDailySpinTickets(state.currentUser.id); 
    
    if (available) {
        const currentTickets = state.playerProfile.spin_tickets || 0;
        const newTickets = currentTickets + 5; // Grant 5 tickets daily
        
        await api.updatePlayerProfile(state.currentUser.id, { 
            spin_tickets: newTickets,
            last_daily_spin: new Date().toISOString()
        });
        
        displaySlotResultMessage('Daily reward: 5 Spin Tickets received!', 'success');
    }
}


async function refreshSlotGameScreen() {
    await refreshPlayerState();
    
    if (spinTicketDisplay) {
        spinTicketDisplay.textContent = state.playerProfile.spin_tickets || 0;
    }
    if (spinButton) {
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < 1);
    }
    updateHeaderUI(state.playerProfile);
}


/**
 * Main rendering function for the Slot Game Screen.
 */
export async function renderSlotGame() {
    if (!state.currentUser) return;
    
    // 1. Check and grant daily tickets on screen load
    await checkDailyTicket();
    
    // 2. Refresh the entire player state to capture new tickets/currencies
    await refreshPlayerState();
    
    // 3. Initialize Slot Machine visuals (if it's the first time)
    if (reelsContainer.length === REEL_COUNT && !reelsContainer[0].querySelector('.reel-inner')) {
        reelsContainer.forEach(createReelSymbols);
    }
    
    // 4. Set event listener and initial status
    if (spinButton) {
        spinButton.onclick = runSlotMachine;
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < 1);
    }
    
    // Ensure message area is ready
    let resultEl = document.getElementById('slot-result-message');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'slot-result-message';
        slotGameContainer.prepend(resultEl);
        displaySlotResultMessage("Ready to Spin!", 'info');
    }
}
