/*
 * Filename: js/screens/slotgame.js
 * Version: NOUB 0.0.8 (SLOT GAME - CRITICAL FIX: Payout Logic & Multiplier Betting)
 * Description: Implements all logic for the Slot Machine game (Tomb of Treasures) 
 * FIXED: Core checkWinCondition logic is entirely rewritten to correctly handle all Video Poker cases (One Pair, Two Pair, Full House, ThreeX, FourX, FiveX).
 * NEW: Implements Multiplier Betting (1x, 5x, 10x) for spin tickets.
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
const multiplierButtonsContainer = document.getElementById('multiplier-buttons-container'); // NEW Container ID
const spinsAvailableDisplay = document.getElementById('spins-available-display'); // NEW ID for in-game count

// --- UPDATED SYMBOLS (More Thematic) ---
// Note: Reel count is 5
const SYMBOLS = ['👑', '☥', '💎', '🏺', '📜', '🔥', '🐞', '𓂀']; // 8 symbols
const REEL_ITEM_HEIGHT = 45; 
const REEL_COUNT = 5; 

// --- BETTING CONSTANTS ---
const MULTIPLIERS = [1, 5, 10];
let currentMultiplier = 1; // Default bet is 1 ticket
let isSpinning = false;


// --- Utility and Setup Functions ---

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
    
    // Target position for a long, clean spin
    const targetOffset = (7 * symbolCountPerCycle + finalIndex) * REEL_ITEM_HEIGHT;

    reelInner.style.transition = 'none'; 
    reelInner.style.transform = `translateY(0)`; 
    
    void reelInner.offsetWidth; 

    reelInner.style.transition = 'transform 3s cubic-bezier(0.2, 0.9, 0.5, 1)';
    reelInner.style.transform = `translateY(-${targetOffset}px)`;
    
    return SYMBOLS[finalIndex];
}


// --- Video Poker Winning Logic (CRITICALLY REWRITTEN) ---

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


async function determinePrize(results, multiplier) {
    const win = checkWinCondition(results);
    const basePayout = 50 * multiplier; // Multiply base by bet multiplier
    
    if (win.multiplier > 0) {
        const rewardAmount = Math.floor(basePayout * win.multiplier);
        
        // 1. Grant reward in NOUB
        const newNoubScore = (state.playerProfile.noub_score || 0) + rewardAmount;
        await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });
        
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
        await determinePrize(resultsSymbols, betAmount); // Pass the bet amount as multiplier
        
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
        spinButton.textContent = `SPIN (${currentMultiplier} TICKETS)`;
    }
    
    refreshSlotGameScreen();
}

/**
 * NEW: Renders the multiplier buttons
 */
function renderMultiplierButtons() {
    if (!multiplierButtonsContainer) return;
    
    multiplierButtonsContainer.innerHTML = MULTIPLIERS.map(m => `
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
        spinButton.textContent = `SPIN (${currentMultiplier} TICKET)`;
    }
}


async function refreshSlotGameScreen() {
    await refreshPlayerState();
    
    const allDisplays = document.querySelectorAll('#spin-ticket-display');
    allDisplays.forEach(el => {
        el.textContent = state.playerProfile.spin_tickets || 0;
    });
    
    if (spinsAvailableDisplay) {
        spinsAvailableDisplay.textContent = state.playerProfile.spin_tickets || 0;
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
         gameContainer.querySelector('.balance-info').id = 'spins-available-info';
         gameContainer.querySelector('#spins-available-info').innerHTML = 
            `Spins Available: <span id="spins-available-display">${state.playerProfile.spin_tickets || 0}</span> 🎟️`;
            
         const reelsArea = gameContainer.querySelector('.reels-container').parentNode;
         
         const multiplierDiv = document.createElement('div');
         multiplierDiv.id = 'multiplier-buttons-container';
         multiplierDiv.style.cssText = 'margin-bottom: 10px; display: flex; justify-content: center; gap: 10px;';
         
         reelsArea.insertBefore(multiplierDiv, gameContainer.querySelector('.reels-container'));
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
