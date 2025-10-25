/*
 * Filename: js/screens/slotgame.js
 * Version: 22.1 (Slot Game Module - Complete)
 * Description: Implements all logic for the Slot Machine game.
*/

import { state } from './state.js';
import * as api from './api.js';
import { showToast, updateHeaderUI } from './ui.js';
import { refreshPlayerState } from './auth.js';
import { trackDailyActivity } from '../contracts.js'; // To track 'spin_slot' quest

const spinTicketDisplay = document.getElementById('spin-ticket-display');
const spinButton = document.getElementById('spin-button');
const reelsContainer = document.querySelectorAll('.reel');

const SYMBOLS = ['☥', '𓂀', '𓋹', '🐍', '🐞', '👑'];
const REEL_ITEM_HEIGHT = 90; 
let isSpinning = false;

// --- Utility and Setup ---

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
    const reelInner = reelEl.querySelector('.reel-inner');
    const symbolCountPerCycle = SYMBOLS.length;
    const finalSymbolPosition = (symbolCountPerCycle - 1 - finalIndex); 
    const targetOffset = (7 * symbolCountPerCycle + finalSymbolPosition) * REEL_ITEM_HEIGHT;

    reelInner.style.transition = 'none';
    reelInner.style.transform = 'translateY(0)';
    
    void reelInner.offsetWidth; 

    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex];
}

async function determinePrize(results) {
    const isWin = (results[0] === results[1] && results[1] === results[2]);
    
    if (!isWin) {
        showToast('No match. Try again!', 'info');
        return;
    }

    const { data: rewards } = await api.fetchSlotRewards();
    if (!rewards || rewards.length === 0) {
        showToast('System Error: Rewards list empty.', 'error');
        return;
    }

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
    
    const profileUpdate = {};
    let message = `JACKPOT! You won ${selectedReward.value} ${selectedReward.prize_name}!`;
    const currentProfile = state.playerProfile;

    switch (selectedReward.prize_type) {
        case 'ANKH':
            profileUpdate.score = (currentProfile.score || 0) + selectedReward.value;
            break;
        case 'PRESTIGE':
            profileUpdate.prestige = (currentProfile.prestige || 0) + selectedReward.value;
            break;
        case 'BLESSING':
            profileUpdate.blessing = (currentProfile.blessing || 0) + selectedReward.value;
            break;
        case 'TICKET':
            profileUpdate.spin_tickets = (currentProfile.spin_tickets || 0) + selectedReward.value;
            break;
        case 'CARD_PACK':
            const { data: masterCards } = await api.fetchAllMasterCards();
            if (masterCards && masterCards.length > 0) {
                const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];
                await api.addCardToPlayerCollection(state.currentUser.id, randomCard.id);
            }
            message = `JACKPOT! You won a Card Pack!`;
            break;
    }

    if (Object.keys(profileUpdate).length > 0) {
        await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    }
    
    showToast(message, 'success');
    await refreshSlotGameScreen();
}

/**
 * Runs the slot machine spin animation and logic.
 */
async function runSlotMachine() {
    if (isSpinning) return;
    if ((state.playerProfile.spin_tickets || 0) < 1) {
        showToast('Not enough Spin Tickets (🗡️)!', 'error');
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

    // 3. Determine random results and spin
    const finalResults = [
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
    ];
    
    const reelElements = Array.from(reelsContainer);
    
    finalResults.map((result, i) => {
        return spinReel(reelElements[i], result);
    });
    
    // 4. Wait for animation to finish
    setTimeout(async () => {
        reelElements.forEach(el => {
            el.querySelector('.reel-inner').style.transition = 'none';
        });
        
        await determinePrize(finalResults.map(i => SYMBOLS[i]));
        
        spinButton.disabled = false;
        isSpinning = false;
        await refreshSlotGameScreen();
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
            last_daily_spin: new Date().toISOString()
        });
        
        showToast('Daily reward: 5 Spin Tickets received!', 'success');
    }
}


/**
 * Refreshes game-specific UI elements (called after a spin or prize).
 */
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
    if (reelsContainer.length > 0 && !reelsContainer[0].querySelector('.reel-inner')) {
        reelsContainer.forEach(createReelSymbols);
    }
    
    // 4. Set event listener
    if (spinButton) {
        spinButton.onclick = runSlotMachine;
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < 1);
    }
}

