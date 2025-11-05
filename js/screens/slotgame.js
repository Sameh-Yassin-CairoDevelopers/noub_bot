/*
 * Filename: js/screens/slotgame.js
 * Version: NOUB 0.0.7 (SLOT GAME - FIX: Video Poker Payout Logic)
 * Description: Implements all logic for the Slot Machine game (Tomb of Treasures) 
 * using 5 reels and video poker win conditions.
 * FIXED: Payout logic now correctly reflects Video Poker rules (One Pair, Two Pair, Full House, etc.).
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
// Restored original symbols from 'noub original game.html'
const SYMBOLS = ['☥', '𓂀', '𓋹', '🐍', '🐞', '👑', '💎', '🏺']; // 8 symbols
const REEL_ITEM_HEIGHT = 45; // Adjusted height to match style.css for 30% reduction
const REEL_COUNT = 5; 
let isSpinning = false;


// --- Utility and Setup Functions (Unchanged) ---

function createReelSymbols(reelEl) {
    const inner = document.createElement('div');
    inner.className = 'reel-inner';
    
    // Loop multiple times to create enough symbols for smooth scrolling
    for (let i = 0; i < 10; i++) { // Increase loop count for longer, smoother spin effect
        // Shuffle symbols for each cycle to make it feel more random
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
    
    // Calculate target position: multiple full cycles + final symbol
    // Ensure it lands precisely on the symbol.
    // We want it to land on the `finalIndex` symbol of the LAST cycle (or a specific cycle).
    // Let's aim for the 7th cycle's finalIndex symbol for a good long spin.
    const targetOffset = (7 * symbolCountPerCycle + finalIndex) * REEL_ITEM_HEIGHT;

    reelInner.style.transition = 'none'; // Reset transition instantly
    reelInner.style.transform = `translateY(0)`; // Start from top
    
    // Force reflow to apply instant reset before starting new transition
    void reelInner.offsetWidth; 

    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex];
}


// --- Video Poker Winning Logic (CRITICALLY MODIFIED) ---

function checkWinCondition(results) {
    const freq = {};
    results.forEach(s => freq[s] = (freq[s] || 0) + 1);

    const counts = Object.values(freq);
    
    // 5 of a Kind
    if (counts.includes(5)) return { type: 'FiveX', multiplier: 50 };
    
    // 4 of a Kind
    if (counts.includes(4)) return { type: 'FourX', multiplier: 10 };
    
    // Full House (3 of one kind, 2 of another)
    if (counts.includes(3) && counts.includes(2)) return { type: 'FullHouse', multiplier: 5 };
    
    // 3 of a Kind
    if (counts.includes(3)) return { type: 'ThreeX', multiplier: 3 };
    
    // Two Pair (two instances of '2')
    if (counts.filter(c => c === 2).length === 2) return { type: 'TwoPair', multiplier: 2 };
    
    // One Pair
    if (counts.includes(2)) return { type: 'OnePair', multiplier: 1.5 };
    
    // Loss
    return { type: 'Loss', multiplier: 0 };
}


async function determinePrize(results) {
    const win = checkWinCondition(results);
    const basePayout = 50; 
    
    const { data: rewards, error: rewardsError } = await api.fetchSlotRewards();
    if (rewardsError) {
        console.error("Error fetching slot rewards:", rewardsError);
        displaySlotResultMessage("Error fetching rewards.", 'error');
        return;
    }

    if (win.multiplier > 0) {
        const rewardAmount = Math.floor(basePayout * win.multiplier);
        
        // 1. Grant reward in NOUB
        const newNoubScore = (state.playerProfile.noub_score || 0) + rewardAmount;
        const { error: profileUpdateError } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });
        
        if(profileUpdateError) {
             console.error("Error updating profile after slot win:", profileUpdateError);
             displaySlotResultMessage("Win detected, but error updating balance!", 'error');
             return;
        }

        // 2. Display message
        const message = `${win.type} Payout! +${rewardAmount} NOUB`;
        displaySlotResultMessage(message, 'win');

    } else {
        displaySlotResultMessage("No Match. Try Again!", 'lose');
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
    if (isSpinning) return;
    if ((state.playerProfile.spin_tickets || 0) < 1) {
        displaySlotResultMessage('Not enough Spin Tickets (🎟️)!', 'error');
        return;
    }
    
    isSpinning = true;
    spinButton.disabled = true;

    // 1. Consume ticket
    const newTickets = state.playerProfile.spin_tickets - 1;
    // We do not wait for DB here to feel faster, relying on refresh later
    api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets }); 
    updateHeaderUI(state.playerProfile); // Update header immediately for tickets

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
        // Reset transitions to prepare for next spin
        reelElements.forEach(el => {
            el.querySelector('.reel-inner').style.transition = 'none';
        });
        
        // Determine prize and update DB
        await determinePrize(resultsSymbols);
        
        spinButton.disabled = false;
        isSpinning = false;
        await refreshSlotGameScreen(); // Full refresh
    }, 3500); // Animation duration is 3s, give it a bit more
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


async function refreshSlotGameScreen() {
    await refreshPlayerState();
    
    const displayElement = document.getElementById('spin-ticket-display');
    if (displayElement) {
        // Update both the header display and the in-game balance info (if they use the same ID/class)
        const allDisplays = document.querySelectorAll('#spin-ticket-display');
        allDisplays.forEach(el => {
            el.textContent = state.playerProfile.spin_tickets || 0;
        });
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
    
    await checkDailyTicket();
    await refreshPlayerState();
    
    // Initialize Slot Machine visuals (if it's the first time)
    if (reelsContainer.length === REEL_COUNT && (!reelsContainer[0].querySelector('.reel-inner') || reelsContainer[0].querySelector('.reel-inner').children.length === 0)) {
        reelsContainer.forEach(createReelSymbols);
    }
    
    // Set event listener and initial status
    if (spinButton) {
        spinButton.onclick = runSlotMachine;
        spinButton.disabled = isSpinning || ((state.playerProfile.spin_tickets || 0) < 1);
    }
    
    // Ensure message area is ready and displays status
    let resultEl = document.getElementById('slot-result-message');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'slot-result-message';
        slotGameContainer.prepend(resultEl);
    }
    displaySlotResultMessage("Ready to Spin!", 'info');
    
    await refreshSlotGameScreen();
}
