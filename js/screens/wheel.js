/*
 * Filename: js/screens/wheel.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (CRITICAL FIX: Simplest Random Dice Logic)
 * Description: Implements the Wheel of Fortune as a simple 1-10 random dice roll.
 * REVERTED: All complex weighted probability logic is replaced by simple random for stability.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js';

const wheelContainer = document.getElementById('wheel-screen');

// --- Simple 1-10 Dice Roll Prizes ---
const WHEEL_PRIZES = [
    { id: 1, type: 'noub', value: 100, label: '100 NOUB', icon: '🪙' },
    { id: 2, type: 'noub', value: 300, label: '300 NOUB', icon: '🪙' },
    { id: 3, type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '🎟️' },
    { id: 4, type: 'noub', value: 50, label: '50 NOUB', icon: '🪙' },
    { id: 5, type: 'prestige', value: 3, label: '3 Prestige', icon: '🐞' },
    { id: 6, type: 'noub', value: 500, label: '500 NOUB', icon: '🪙' },
    { id: 7, type: 'ankh_premium', value: 5, label: '5 Ankh', icon: '☥' },
    { id: 8, type: 'card_pack', value: 1, label: '1x Papyrus Pack', icon: '📜' },
    { id: 9, type: 'noub', value: 750, label: '750 NOUB', icon: '🪙' },
    { id: 10, type: 'jackpot', value: 50, label: '50 Prestige JACKPOT!', icon: '🌟' }
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
    
    // Inject core structure if it doesn't exist
    if (!wheelContainer.querySelector('.wheel-container')) {
        wheelContainer.innerHTML = `
            <div class="wheel-container game-container" style="text-align: center;">
                <h2>Dice of Destiny (1-10)</h2>
                <div id="dice-result-display" style="font-size: 3em; color: var(--primary-accent); margin: 20px 0;">?</div>
                <div id="prize-description" style="min-height: 20px; color: var(--text-secondary); margin-bottom: 20px;">Roll the dice to win a prize!</div>
                <button id="wheel-spin-button" class="action-button spin-button">ROLL DICE (${SPIN_COST} TICKET)</button>
                <p id="wheel-spins-left" class="balance-info">Spin Tickets: 0</p>
                
                <h3 style="color: var(--primary-accent); margin-top: 30px;">Prize Table (1-10)</h3>
                <ul id="prize-table-list" style="list-style: none; padding: 0; max-width: 300px; margin: 0 auto; text-align: left;">
                    <!-- Prize table will be injected here -->
                </ul>
            </div>
        `;
    }
    
    const spinBtn = document.getElementById('wheel-spin-button');
    const prizeListEl = document.getElementById('prize-table-list');
    
    if (!spinBtn || !prizeListEl) return;
    
    // 1. Render Prize Table
    prizeListEl.innerHTML = WHEEL_PRIZES.map(p => `
        <li style="display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px dashed #3a3a3c;">
            <span style="font-weight: bold; color: var(--kv-gate-color);">[${p.id}]</span>
            <span>${p.label}</span>
            <span style="color: var(--success-color);">${p.icon}</span>
        </li>
    `).join('');
    

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
        spinBtn.textContent = `ROLL DICE (${SPIN_COST} TICKET)`;
    }
}

/**
 * Executes the simple dice roll.
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
    const diceResultEl = document.getElementById('dice-result-display');
    const prizeDescEl = document.getElementById('prize-description');

    // 1. Consume ticket
    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Rolling the dice...", 'info');
    trackDailyActivity('games', 1, 'wheel');

    // 2. Simple Random Roll (1 to 10)
    const rollResult = Math.floor(Math.random() * 10) + 1;
    const prize = WHEEL_PRIZES.find(p => p.id === rollResult);
    
    // 3. Simple Visual Animation (Fast counting for effect)
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        diceResultEl.textContent = Math.floor(Math.random() * 10) + 1;
        animationCount++;
        if (animationCount > 30) { // Stop animation after a short time
            clearInterval(animationInterval);
            diceResultEl.textContent = rollResult;
            
            // 4. Award prize after animation stops
            setTimeout(async () => {
                await handleWheelPrize(prize);
                isSpinning = false;
                await refreshPlayerState(); 
                updateWheelUIState();
            }, 500);
        }
    }, 50);

    prizeDescEl.textContent = `...Rolling for Prize #${rollResult}...`;
}

/**
 * Awards the prize based on the roll result.
 */
async function handleWheelPrize(prize) {
    if (!state.currentUser || !prize) return;
    
    let profileUpdates = {};
    let message = `ROLLED ${prize.id}: You won ${prize.label}!`;
    const prizeDescEl = document.getElementById('prize-description');
    if (prizeDescEl) {
        prizeDescEl.textContent = `You won: ${prize.label}!`;
    }

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
        case 'jackpot':
            // Jackpot logic
            profileUpdates.prestige = (state.playerProfile.prestige || 0) + prize.value;
            break;
    }
    
    if (Object.keys(profileUpdates).length > 0) {
        const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdates);
        
        if (error) {
            showToast('Error awarding prize!', 'error');
            return;
        }
    }
    
    await api.logActivity(state.currentUser.id, 'WHEEL_ROLL', `Rolled a ${prize.id} and won ${prize.label}.`);
    showToast(message, 'success');
}
