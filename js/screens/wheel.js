/*
 * Filename: js/screens/wheel.js
 * Version: NOUB 0.0.2 (WHEEL MODULE - COMPLETE)
 * Description: View Logic Module for the Wheel of Fortune screen.
 * Implements full spin logic, prize calculation, and integration with tickets/currency.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const wheelContainer = document.getElementById('wheel-screen');
const wheelElement = document.getElementById('wheel');
const spinButton = document.getElementById('wheel-spin-button'); // Assuming ID is changed from generic 'spin-button'
const spinsLeftDisplay = document.getElementById('wheel-spins-left');

// --- WHEEL CONFIGURATION ---
const WHEEL_PRIZES = [
    { type: 'ankh', value: 100, label: '100 ☥', color: '#ffb3ba' },
    { type: 'card_pack', value: 1, label: '1x Pack', color: '#ffdfba' },
    { type: 'ankh', value: 500, label: '500 ☥', color: '#ffffba' },
    { type: 'blessing', value: 1, label: '1x Dagger 🗡️', color: '#baffc9' },
    { type: 'ankh', value: 200, label: '200 ☥', color: '#bae1ff' },
    { type: 'scarab', value: 1, label: '1x Scarab 🐞', color: '#ffc6e5' },
    { type: 'ankh', value: 1000, label: '1K ☥', color: '#ff8c94' },
    { type: 'spin_ticket', value: 1, label: '+1 Spin', color: '#e0c2ff' }
];
const SPIN_COST = 1; // Cost in Spin Tickets

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
    
    // --- Initial Screen Setup (Need to ensure the base HTML exists first) ---
    // Since we assume index.html contains a placeholder for this screen, 
    // we'll inject the core wheel structure if the container is empty.
    if (!wheelContainer.innerHTML.trim()) {
        wheelContainer.innerHTML = `
            <div class="wheel-container">
                <h2>Wheel of Fortune</h2>
                <p style="color: var(--text-secondary);">Spin to win valuable resources and packs!</p>
                <div style="position: relative; margin: 20px 0;">
                    <div id="wheel" style="position: relative; width: 300px; height: 300px; border-radius: 50%; border: 10px solid var(--primary-accent); transition: transform 6s cubic-bezier(0.25, 1, 0.5, 1);"></div>
                    <div class="wheel-pointer" style="width: 0; height: 0; border-left: 20px solid transparent; border-right: 20px solid transparent; border-top: 30px solid var(--danger-color); position: absolute; top: -15px; left: 50%; transform: translateX(-50%); z-index: 10;"></div>
                </div>
                <button id="wheel-spin-button" class="action-button spin-button">SPIN (${SPIN_COST} TICKET)</button>
                <p id="wheel-spins-left" style="margin-top: 10px;">Spin Tickets: 0</p>
            </div>
        `;
    }
    
    // Re-fetch DOM elements after potential injection
    const wheelEl = document.getElementById('wheel');
    const spinBtn = document.getElementById('wheel-spin-button');
    
    if (!wheelEl || !spinBtn) return;
    
    // 1. Initialize Wheel Segments (Color and Text)
    const numPrizes = WHEEL_PRIZES.length;
    const angle = 360 / numPrizes;
    let gradient = 'conic-gradient(';
    wheelEl.innerHTML = '';

    WHEEL_PRIZES.forEach((prize, i) => {
        const segment = document.createElement('div');
        segment.className = 'wheel-segment';
        segment.style.cssText = `
            position: absolute; width: 50%; height: 50%; left: 50%; top: 50%; 
            transform-origin: 0% 100%; transform: rotate(${i * angle}deg);
            background-color: ${prize.color};
            clip-path: polygon(0 0, 100% 0, 50% 100%); 
            overflow: hidden;
        `;
        
        // Label Element
        const label = document.createElement('span');
        label.textContent = prize.label;
        label.style.cssText = `
            position: absolute; bottom: 15px; left: 50%; 
            transform: translateX(-50%) rotate(90deg) rotate(${angle/2}deg); 
            font-size: 14px; font-weight: bold; color: #121212;
            white-space: nowrap;
        `;
        
        segment.appendChild(label);
        wheelEl.appendChild(segment);

        gradient += `${prize.color} ${i * angle}deg, ${prize.color} ${(i + 1) * angle}deg,`;
    });
    // wheelEl.style.background = gradient.slice(0, -1) + ')'; // Use CSS colors instead of gradient fill

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

    // 1. Consume ticket (Assumes spin_tickets is handled like a currency in playerProfile)
    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Spinning the wheel...", 'info');

    // 2. Determine random result
    const prizeIndex = Math.floor(Math.random() * WHEEL_PRIZES.length);
    const prize = WHEEL_PRIZES[prizeIndex];
    
    // 3. Calculate rotation (Spin 5 full times + target segment)
    const anglePerSegment = 360 / WHEEL_PRIZES.length;
    const randomOffset = (Math.random() - 0.5) * (anglePerSegment * 0.8);
    const targetRotation = (360 * 5) - (prizeIndex * anglePerSegment) - (anglePerSegment / 2) + randomOffset;
    
    const wheelEl = document.getElementById('wheel');
    if (!wheelEl) return;
    
    wheelEl.style.transition = 'transform 6s cubic-bezier(0.25, 1, 0.5, 1)';
    wheelEl.style.transform = `rotate(${targetRotation}deg)`;

    // 4. Wait for animation to finish and award prize
    setTimeout(async () => {
        // Reset transition
        wheelEl.style.transition = 'none';
        const actualRotation = targetRotation % 360; 
        wheelEl.style.transform = `rotate(${actualRotation}deg)`;
        
        await handleWheelPrize(prize);

        isSpinning = false;
        spinBtn.disabled = false;
        await refreshPlayerState(); // Fetch new ticket count/currency
        updateWheelUIState();
    }, 6200); // Wait slightly longer than the transition duration
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
        // NOTE: Actual pack opening logic will be in shop.js/api.js, so we only award the item here.
        // For simplicity, we award a single common card directly as a bonus.
        const { data: allCards } = await api.fetchAllMasterCards();
        if (allCards && allCards.length > 0) {
            const commonCard = allCards[0]; // Assuming first card is common
            await api.addCardToPlayerCollection(state.currentUser.id, commonCard.id);
            message += ` (+1 Common Card)`;
        }
    }
    
    // Update profile in Supabase
    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdates);
    
    if (!error) {
        showToast(message, 'success');
    } else {
        showToast('Error awarding prize!', 'error');
    }
}

// Export the function for use by ui.js
export { renderWheel };
