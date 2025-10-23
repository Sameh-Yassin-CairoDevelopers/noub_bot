/*
 * Filename: js/screens/games.js
 * Version: 20.1 (Slot Machine - Complete)
 * Description: View Logic Module for the Games screen.
 * Implements the Slot Machine logic and daily ticket reward system.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';

const spinTicketDisplay = document.getElementById('spin-ticket-display');
const spinButton = document.getElementById('spin-button');
const reelsContainer = document.querySelectorAll('.reel');

// Symbols for the Slot Machine (Egyptian themed)
const SYMBOLS = ['☥', '𓂀', '𓋹', '🐍', '🐞', '👑'];
const REEL_HEIGHT = 90; // Must match CSS reel-item height

let isSpinning = false;

/**
 * Generates a full set of symbols for a reel and populates the DOM.
 * This pattern ensures that there are enough symbols for the spin animation.
 */
function createReelSymbols(reelEl) {
    const inner = document.createElement('div');
    inner.className = 'reel-inner';
    
    // Repeat symbols 10 times to ensure smooth visual spin
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
    return inner;
}

/**
 * Calculates the random final position and animates the reel.
 * @returns {number} The index (0-5) of the winning symbol.
 */
function spinReel(reelInner, finalIndex) {
    // The final symbol is at SYMBOLS[finalIndex]
    
    // Target position is calculated based on the last full cycle of symbols,
    // plus the required offset to land on the finalIndex.
    // We target a specific point on the 7th cycle for a clean stop.
    const symbolCountPerCycle = SYMBOLS.length; // 6
    const finalSymbolPosition = (symbolCountPerCycle - 1 - finalIndex); // Calculate offset from top (0 is crown, 5 is ankh)
    
    // Target 7th cycle position: (6 * 6 symbols) + finalSymbolPosition
    const targetOffset = (7 * symbolCountPerCycle + finalSymbolPosition) * REEL_HEIGHT;

    // Apply animation
    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex]; // Return the winning symbol
}


/**
 * Determines the prize based on the slot machine result.
 */
async function determinePrize(results) {
    const isWin = (results[0] === results[1] && results[1] === results[2]);
    
    if (!isWin) {
        showToast('No match. Try again!', 'info');
        return;
    }

    // Fetch master list of rewards
    const { data: rewards } = await api.fetchSlotRewards();
    if (!rewards || rewards.length === 0) return;

    // Simplified: Find the highest weighted prize
    const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
    let randomNum = Math.random() * totalWeight;
    let selectedReward = null;

    for (const reward of rewards) {
        randomNum -= reward.weight;
        if (randomNum <= 0) {
            selectedReward = reward;
            break;
        }
    }

    if (!selectedReward) return;
    
    // Apply reward
    const profileUpdate = {};
    let message = `JACKPOT! You won ${selectedReward.value} ${selectedReward.prize_name}!`;
    
    switch (selectedReward.prize_type) {
        case 'ANKH':
            profileUpdate.score = state.playerProfile.score + selectedReward.value;
            break;
        case 'PRESTIGE':
            profileUpdate.prestige = state.playerProfile.prestige + selectedReward.value;
            break;
        case 'BLESSING':
            profileUpdate.blessing = state.playerProfile.blessing + selectedReward.value;
            break;
        case 'TICKET':
            profileUpdate.spin_tickets = state.playerProfile.spin_tickets + selectedReward.value;
            break;
        case 'CARD_PACK':
            // Logic for giving a card pack goes here (calls buyCardPack function)
            message = `JACKPOT! You won a Card Pack!`;
            break;
    }

    if (Object.keys(profileUpdate).length > 0) {
        await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    }
    
    showToast(message, 'success');
    await refreshGamesScreen();
}


/**
 * Runs the slot machine spin animation and logic.
 */
async function runSlotMachine() {
    if (isSpinning) return;
    if (state.playerProfile.spin_tickets < 1) {
        showToast('Not enough Spin Tickets (🗡️)!', 'error');
        return;
    }
    
    isSpinning = true;
    spinButton.disabled = true;

    // 1. Consume ticket
    const newTickets = state.playerProfile.spin_tickets - 1;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    state.playerProfile.spin_tickets = newTickets; // Update local state immediately

    // 2. Determine random results
    const finalResults = [
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
    ];
    
    const reelElements = Array.from(reelsContainer);
    
    const winSymbols = finalResults.map((result, i) => {
        return spinReel(reelElements[i].querySelector('.reel-inner'), result);
    });
    
    // 3. Wait for animation to finish
    setTimeout(async () => {
        // Reset transitions for next spin
        reelElements.forEach(el => el.querySelector('.reel-inner').style.transition = 'none');
        
        await determinePrize(winSymbols);
        
        spinButton.disabled = false;
        isSpinning = false;
        await refreshGamesScreen(); // Final refresh
    }, 3500);
}

/**
 * Checks for daily ticket eligibility and updates profile if needed.
 */
async function checkDailyTicket() {
    const { available } = await api.getDailySpinTickets(state.currentUser.id);
    
    if (available) {
        const currentTickets = state.playerProfile.spin_tickets || 0;
        const newTickets = currentTickets + 5; // Grant 5 tickets daily
        
        await api.updatePlayerProfile(state.currentUser.id, { 
            spin_tickets: newTickets,
            last_daily_spin: new Date().toISOString() // Update timestamp
        });
        
        state.playerProfile.spin_tickets = newTickets;
        showToast('Daily reward: 5 Spin Tickets received!', 'success');
    }
}


/**
 * Main rendering function for the Games Screen.
 */
export async function renderGames() {
    if (!state.currentUser) return;
    
    // 1. Check and grant daily tickets on screen load
    await checkDailyTicket();
    
    // 2. Initialize Slot Machine visuals
    if (reelsContainer.length > 0) {
        reelsContainer.forEach(createReelSymbols);
    }
    
    // 3. Update UI displays
    if (spinTicketDisplay) {
        spinTicketDisplay.textContent = state.playerProfile.spin_tickets || 0;
    }
    if (spinButton) {
        spinButton.onclick = runSlotMachine;
        spinButton.disabled = isSpinning || (state.playerProfile.spin_tickets < 1);
    }
}

/**
 * Refreshes game-specific UI elements (called after a spin or prize).
 */
async function refreshGamesScreen() {
    // Re-fetch profile to ensure all currency values are up-to-date
    await api.fetchProfile(state.currentUser.id);
    
    if (spinTicketDisplay) {
        spinTicketDisplay.textContent = state.playerProfile.spin_tickets || 0;
    }
    if (spinButton) {
        spinButton.disabled = isSpinning || (state.playerProfile.spin_tickets < 1);
    }
    updateHeaderUI(state.playerProfile); // Update global currency display
}
