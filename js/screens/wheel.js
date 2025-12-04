/*
 * Filename: js/screens/wheel.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (OVERHAUL: Thematic Dice Logic)
 * Description: Implements the Wheel of Fortune as a simple 1-10 random dice roll.
 * NEW: Replaced numeric roll with Thematic Egyptian Symbols for better UX.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js';

const wheelContainer = document.getElementById('wheel-screen');

// --- Simple 1-10 Thematic Dice Roll Prizes (IDs correspond to the 1-10 roll result) ---
const WHEEL_PRIZES = [
    { id: 1, type: 'noub', value: 100, label: 'Small NOUB Find', icon: '🐍' }, // Snake
    { id: 2, type: 'noub', value: 300, label: '300 NOUB', icon: '🏺' }, // Jar
    { id: 3, type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '📜' }, // Papyrus Scroll
    { id: 4, type: 'noub', value: 50, label: 'Minor NOUB Find', icon: '𓋹' }, // Djed Pillar (Stability)
    { id: 5, type: 'prestige', value: 3, label: '3 Prestige', icon: '🐞' }, // Scarab
    { id: 6, type: 'noub', value: 500, label: '500 NOUB', icon: '🪙' }, // NOUB Coin
    { id: 7, type: 'ankh_premium', value: 5, label: '5 Ankh', icon: '☥' }, // Ankh
    { id: 8, type: 'card_pack', value: 1, label: '1x Papyrus Pack', icon: '🏛️' }, // Temple/Collection
    { id: 9, type: 'noub', value: 750, label: 'Major NOUB Find', icon: '👑' }, // Crown
    { id: 10, type: 'jackpot', value: 50, label: '50 Prestige JACKPOT!', icon: '🌟' } // Star/Jackpot
];

const SPIN_COST = 1; 

let isSpinning = false;


/**
 * Selects a prize based on a simple 1-10 dice roll.
 */
function getSimpleRandomPrize() {
    const rollResult = Math.floor(Math.random() * 10) + 1;
    return WHEEL_PRIZES.find(p => p.id === rollResult);
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
    
    // Inject core structure if it doesn't exist
    if (!wheelContainer.querySelector('.wheel-container')) {
        wheelContainer.innerHTML = `
            <div class="wheel-container game-container" style="text-align: center;">
                <h2>Dice of Destiny</h2>
                <!-- NEW: Dice Result Display uses Icon and Number -->
                <div id="dice-result-container" class="dice-result-container">
                    <span id="dice-icon-display" class="icon-lg">🎲</span>
                </div>
                
                <div id="prize-description" style="min-height: 20px; color: var(--text-secondary); margin-bottom: 15px;">Roll the dice to win a prize!</div>
                
                <button id="wheel-spin-button" class="action-button spin-button">ROLL DICE (${SPIN_COST} TICKET)</button>
                <p id="wheel-spins-left" class="balance-info">Spin Tickets: 0</p>
                
                <!-- NEW: Info Button to open prize list -->
                <button id="prize-info-btn" class="text-button" onclick="window.openPrizeModal()">View Prize Table</button>
            </div>
        `;
        
        // Inject the Prize Modal structure (since this is simpler than a separate file)
        if (!document.getElementById('wheel-prize-modal')) {
             const modal = document.createElement('div');
             modal.id = 'wheel-prize-modal';
             modal.className = 'modal-overlay hidden';
             modal.innerHTML = `
                 <div class="modal-content">
                     <button class="modal-close-btn" onclick="window.closeModal('wheel-prize-modal')">&times;</button>
                     <h2>Prize Table (1-10)</h2>
                     <ul id="prize-table-list" style="list-style: none; padding: 0;"></ul>
                 </div>
             `;
             document.body.appendChild(modal);
        }
    }
    
    const spinBtn = document.getElementById('wheel-spin-button');
    const prizeListEl = document.getElementById('prize-table-list');
    
    if (!spinBtn || !prizeListEl) return;
    
    // 1. Render Prize Table in Modal
    prizeListEl.innerHTML = WHEEL_PRIZES.map(p => `
        <li style="display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px dashed #3a3a3c;">
            <span style="font-weight: bold; color: var(--kv-gate-color);">[${p.id}] ${p.icon}</span>
            <span>${p.label}</span>
        </li>
    `).join('');
    
    window.openPrizeModal = () => window.openModal('wheel-prize-modal');

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
    const diceResultEl = document.getElementById('dice-icon-display');
    const prizeDescEl = document.getElementById('prize-description');

    // 1. Consume ticket
    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Rolling the dice...", 'info');
    trackDailyActivity('games', 1, 'wheel');

    // 2. Simple Random Roll
    const prize = getSimpleRandomPrize();
    const rollResult = prize.id;
    
    // 3. Simple Visual Animation (Fast counting for effect)
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        const tempPrize = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        diceResultEl.textContent = tempPrize.icon;
        diceResultEl.style.color = `hsl(${Math.random() * 360}, 70%, 70%)`; // Flash colors
        animationCount++;
        if (animationCount > 30) { 
            clearInterval(animationInterval);
            diceResultEl.textContent = prize.icon;
            diceResultEl.style.color = 'var(--primary-accent)'; // Stop on final color
            
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
    const prizeDescEl = document.getElementById('prize-description');

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
    showToast(`WIN: ${prize.label}`, 'success');
}
