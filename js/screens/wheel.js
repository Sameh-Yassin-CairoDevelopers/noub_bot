/*
 * Filename: js/screens/wheel.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (Polished)
 * Description: Implements a redesigned Wheel of Fortune game.
 * POLISHED: Removed jitter for a precise stop and specified activity tracking.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js';

const wheelContainer = document.getElementById('wheel-screen');

// --- NEW: Weighted Wheel Configuration ---
const WHEEL_PRIZES = [
    { type: 'noub', value: 100, label: '100 NOUB', icon: '🪙', weight: 40 },
    { type: 'noub', value: 250, label: '250 NOUB', icon: '🪙', weight: 25 },
    { type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '🎟️', weight: 15 },
    { type: 'noub', value: 1000, label: '1K NOUB', icon: '🪙', weight: 10 },
    { type: 'prestige', value: 5, label: '5 Prestige', icon: '🐞', weight: 5 },
    { type: 'card_pack', value: 1, label: '1x Papyrus Pack', icon: '📜', weight: 3 },
    { type: 'ankh_premium', value: 10, label: '10 Ankh', icon: '☥', weight: 2 },
];
const SPIN_COST = 1; 

let isSpinning = false;


/**
 * Selects a prize based on weighted probability.
 */
function getWeightedRandomPrize() {
    const totalWeight = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let randomNum = Math.random() * totalWeight;

    for (const prize of WHEEL_PRIZES) {
        randomNum -= prize.weight;
        if (randomNum <= 0) {
            return prize;
        }
    }
    return WHEEL_PRIZES[0]; 
}

/**
 * Renders the base wheel structure and view elements.
 */
export async function renderWheel() {
    if (!state.currentUser) return;

    if (!wheelContainer) {
        console.error("Wheel container not found in DOM.");
        return;
    }
    
    if (!wheelContainer.querySelector('.wheel-container')) {
        wheelContainer.innerHTML = `
            <div class="wheel-container game-container">
                <h2>Wheel of Fortune</h2>
                <p style="color: var(--text-secondary);">Test your luck for valuable prizes!</p>
                <div class="wheel-reel-area">
                    <div id="wheel-reel"></div>
                    <div class="wheel-pointer"></div>
                </div>
                <button id="wheel-spin-button" class="action-button spin-button">SPIN (${SPIN_COST} TICKET)</button>
                <p id="wheel-spins-left" class="balance-info">Spin Tickets: 0</p>
            </div>
        `;
    }
    
    const wheelReel = document.getElementById('wheel-reel');
    const spinBtn = document.getElementById('wheel-spin-button');
    
    if (!wheelReel || !spinBtn) return;
    
    wheelReel.innerHTML = '';
    for(let j = 0; j < 10; j++) {
        WHEEL_PRIZES.forEach((prize) => {
            const item = document.createElement('div');
            item.className = 'wheel-prize-item';
            item.innerHTML = `<span class="icon"></span><span></span>`;
            item.querySelector('.icon').textContent = prize.icon;
            item.querySelector('span:last-child').textContent = prize.label;
            wheelReel.appendChild(item);
        });
    }
    
    wheelReel.style.width = `${WHEEL_PRIZES.length * 100 * 10}px`;

    spinBtn.onclick = runWheelSpin;
    updateWheelUIState();
}

function updateWheelUIState() {
    const spins = state.playerProfile.spin_tickets || 0;
    const spinBtn = document.getElementById('wheel-spin-button');
    const spinsDisplay = document.getElementById('wheel-spins-left');

    if (spinsDisplay) spinsDisplay.textContent = `Spin Tickets: ${spins}`;
    if (spinBtn) {
        spinBtn.disabled = isSpinning || spins < SPIN_COST;
    }
}

/**
 * Executes the full wheel spin sequence.
 */
async function runWheelSpin() {
    if (!state.currentUser) return;
    const spins = state.playerProfile.spin_tickets || 0;
    const spinBtn = document.getElementById('wheel-spin-button');

    if (isSpinning || spins < SPIN_COST) {
        showToast('Not enough Spin Tickets!', 'error');
        return;
    }
    
    isSpinning = true;
    spinBtn.disabled = true;

    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Spinning the wheel...", 'info');
    // POLISH: Specify a more accurate activity type if available
    trackDailyActivity('games', 1, 'wheel');

    const prize = getWeightedRandomPrize();
    const prizeIndex = WHEEL_PRIZES.findIndex(p => p.label === prize.label);
    
    const itemWidth = 100;
    const cycles = 5;
    const fullCycleDistance = WHEEL_PRIZES.length * itemWidth;
    
    const targetOffset = prizeIndex * itemWidth;
    // POLISH: Removed jitter for a precise stop in the center of the item
    const finalDestination = (cycles * fullCycleDistance) + targetOffset;
    
    const wheelReel = document.getElementById('wheel-reel');
    if (!wheelReel) return;
    
    wheelReel.style.transition = 'transform 6s cubic-bezier(0.25, 1, 0.5, 1)';
    wheelReel.style.transform = `translateX(-${finalDestination}px)`;

    setTimeout(async () => {
        await handleWheelPrize(prize);
        isSpinning = false;
        await refreshPlayerState(); 
        updateWheelUIState();
    }, 6200); 
}

/**
 * Awards the prize based on the spin result.
 */
async function handleWheelPrize(prize) {
    if (!state.currentUser) return;
    
    let profileUpdates = {};
    let message = `You won: ${prize.label}!`;

    switch (prize.type) {
        case 'noub':
            profileUpdates.noub_score = (state.playerProfile.noub_score || 0) + prize.value;
            break;
        case 'prestige':
            profileUpdates.prestige = (state.playerProfile.prestige || 0) + prize.value;
            break;
        case 'ankh_premium':
            profileUpdates.ankh_premium = (state.playerProfile.ankh_premium || 0) + prize.value;
            break;
        case 'spin_ticket':
            profileUpdates.spin_tickets = (state.playerProfile.spin_tickets || 0) + prize.value;
            break;
        case 'card_pack':
            const { data: masterCards } = await api.fetchAllMasterCards();
            if (masterCards && masterCards.length > 0) {
                const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];
                await api.addCardToPlayerCollection(state.currentUser.id, randomCard.id);
            }
            break;
    }
    
    if (Object.keys(profileUpdates).length > 0) {
        const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdates);
        
        if (error) {
            showToast('Error awarding prize!', 'error');
            return;
        }
    }
    
    await api.logActivity(state.currentUser.id, 'WHEEL_SPIN', `Won ${prize.label} from Wheel of Fortune.`);
    showToast(message, 'success');
}
