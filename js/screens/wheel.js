/*
 * Filename: js/screens/wheel.js
 * Version: NOUB 0.0.3 (WHEEL MODULE - FINAL FIX: Simplified Slot Style)
 * Description: Implements a simplified Slot/Reel-style selection mechanism to replace the complex spinning wheel.
 * This guarantees proper rendering on all mobile browsers/TWA.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const wheelContainer = document.getElementById('wheel-screen');

// --- WHEEL CONFIGURATION (Now acts as a single-reel slot machine prize list) ---
const WHEEL_PRIZES = [
    { type: 'ankh', value: 100, label: '100 ☥', icon: '☥' },
    { type: 'card_pack', value: 1, label: '1x Pack', icon: '📜' },
    { type: 'ankh', value: 500, label: '500 ☥', icon: '☥' },
    { type: 'blessing', value: 1, label: '1x Dagger 🗡️', icon: '🗡️' },
    { type: 'ankh', value: 200, label: '200 ☥', icon: '☥' },
    { type: 'scarab', value: 1, label: '1x Scarab 🐞', icon: '🐞' },
    { type: 'ankh', value: 1000, label: '1K ☥', icon: '☥' },
    { type: 'spin_ticket', value: 1, label: '+1 Spin', icon: '🎟️' }
];
const SPIN_COST = 1; 

let isSpinning = false;


/**
 * Renders the base wheel structure and view elements.
 */
export async function renderWheel() {
    if (!state.currentUser) return;

    if (!wheelContainer) {
        console.error("Wheel container not found in DOM.");
        return;
    }
    
    // --- Initial Screen Setup (Inject core structure) ---
    if (!wheelContainer.querySelector('.wheel-container')) {
        wheelContainer.innerHTML = `
            <div class="wheel-container game-container">
                <h2>Wheel of Fortune (Reel Style)</h2>
                <p style="color: var(--text-secondary);">Match the pointer to a prize!</p>
                <div class="wheel-reel-area" style="position: relative; margin: 30px auto; width: 80%; max-width: 250px; height: 100px; border: 4px solid var(--primary-accent); border-radius: 10px; overflow: hidden;">
                    <div id="wheel-reel" style="transition: transform 6s cubic-bezier(0.25, 1, 0.5, 1);"></div>
                    <!-- Pointer/Selector -->
                    <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 2px; height: 100%; background: var(--danger-color); z-index: 5;"></div>
                </div>
                <button id="wheel-spin-button" class="action-button spin-button">SPIN (${SPIN_COST} TICKET)</button>
                <p id="wheel-spins-left" style="margin-top: 10px;">Spin Tickets: 0</p>
            </div>
        `;
    }
    
    // Re-fetch DOM elements after potential injection
    const wheelReel = document.getElementById('wheel-reel');
    const spinBtn = document.getElementById('wheel-spin-button');
    
    if (!wheelReel || !spinBtn) return;
    
    // 1. Initialize Reel Items (Multiple times for a long spin)
    wheelReel.innerHTML = '';
    for(let j = 0; j < 10; j++) { // Repeat 10 times
        WHEEL_PRIZES.forEach((prize, i) => {
            const item = document.createElement('div');
            item.className = 'wheel-prize-item';
            item.style.cssText = `
                width: 100px; height: 100px; display: inline-flex; flex-direction: column; 
                align-items: center; justify-content: center; background-color: ${prize.color}; 
                border-right: 1px solid #000; box-sizing: border-box; font-size: 14px;
                color: #121212; font-weight: bold;
            `;
            item.innerHTML = `<span style="font-size: 24px;">${prize.icon}</span><span>${prize.label}</span>`;
            wheelReel.appendChild(item);
        });
    }
    
    // CRITICAL: Set initial reel width and display flex
    wheelReel.style.display = 'flex';
    wheelReel.style.width = `${WHEEL_PRIZES.length * 100 * 10}px`; // 100px width * prizes * 10 cycles

    // 2. Attach Listener
    spinBtn.onclick = runWheelSpin;

    // 3. Update UI
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
 * Executes the full wheel spin sequence (Slot Style).
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

    // 1. Consume ticket
    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Spinning the reel...", 'info');

    // 2. Determine random result
    const prizeIndex = Math.floor(Math.random() * WHEEL_PRIZES.length);
    const prize = WHEEL_PRIZES[prizeIndex];
    
    // 3. Calculate final position (5 cycles + target prize)
    const itemWidth = 100;
    const cycles = 5;
    const fullCycleDistance = WHEEL_PRIZES.length * itemWidth;
    
    // Target position (needs to land near the center line/pointer)
    const targetOffset = (WHEEL_PRIZES.length - prizeIndex) * itemWidth;
    
    // The final destination: full cycles + target item (plus half an item width to center it under the pointer)
    const finalDestination = (cycles * fullCycleDistance) + targetOffset - (itemWidth / 2);
    
    const wheelReel = document.getElementById('wheel-reel');
    if (!wheelReel) return;
    
    wheelReel.style.transition = 'transform 6s cubic-bezier(0.25, 1, 0.5, 1)';
    wheelReel.style.transform = `translateX(-${finalDestination}px)`;

    // 4. Wait for animation to finish and award prize
    setTimeout(async () => {
        // Reset transition and position for next spin
        wheelReel.style.transition = 'none';
        wheelReel.style.transform = `translateX(-${targetOffset - (itemWidth / 2)}px)`;
        
        await handleWheelPrize(prize);

        isSpinning = false;
        spinBtn.disabled = false;
        await refreshPlayerState(); 
        updateWheelUIState();
    }, 6200); 
}

/**
 * Awards the prize based on the spin result.
 */
async function handleWheelPrize(prize) {
    if (!state.currentUser) return;
    
    const profileUpdates = {};
    let message = `You won: ${prize.label}!`;

    if (prize.type === 'ankh') {
        profileUpdates.score = (state.playerProfile.score || 0) + prize.value;
    } else if (prize.type === 'blessing') {
        profileUpdates.blessing = (state.playerProfile.blessing || 0) + prize.value;
    } else if (prize.type === 'scarab') {
        profileUpdates.prestige = (state.playerProfile.prestige || 0) + prize.value;
    } else if (prize.type === 'spin_ticket') {
        profileUpdates.spin_tickets = (state.playerProfile.spin_tickets || 0) + prize.value;
    } else if (prize.type === 'card_pack') {
        // Award a single common card directly as a bonus.
        const { data: allCards } = await api.fetchAllMasterCards();
        if (allCards && allCards.length > 0) {
            const commonCard = allCards[0]; 
            await api.addCardToPlayerCollection(state.currentUser.id, commonCard.id);
            message += ` (+1 Common Card)`;
        }
    }
    
    // Update profile in Supabase
    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdates);
    
    if (!error) {
        // CRITICAL: Log the activity
        await api.logActivity(state.currentUser.id, 'WHEEL_SPIN', `Won ${prize.label} from Wheel of Fortune.`);
        
        showToast(message, 'success');
    } else {
        showToast('Error awarding prize!', 'error');
    }
}
