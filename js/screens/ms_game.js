/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v5.0.0 (Unified Rewards Hub: Vault + Wheel Vertical Stack)
 * Author: Sameh Yassin & Engineering Partner
 * 
 * -----------------------------------------------------------------------------
 * MODULE DESCRIPTION
 * -----------------------------------------------------------------------------
 * This module consolidates the passive income generation (Idle Vault) and the 
 * probability-based mini-game (Wheel/Dice) into a single view (Tab 1), 
 * while keeping the Royal Calendar in a separate view (Tab 2).
 * 
 * STRUCTURAL COMPOSITION:
 * 1. Constants & Config: Aggregates configs for both systems.
 * 2. State Management: Handles local intervals for timers and animations.
 * 3. Logic Layer: Contains business logic for claiming, upgrading, and spinning.
 * 4. Presentation Layer: 
 *    - renderMsGame: Main tab controller.
 *    - renderDropAndWheel: Renders the combined Vault + Dice UI.
 *    - renderCalendarContent: Renders the daily rewards list.
 * -----------------------------------------------------------------------------
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, playSound, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Container Reference
const msGameContainer = document.getElementById('ms-game-screen');

// =============================================================================
// SECTION 1: CONFIGURATION & CONSTANTS
// =============================================================================

const ONE_SECOND = 1000;

// --- A. Idle Generator Configuration ---
const IDLE_GENERATOR_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// --- B. Wheel (Dice) Configuration ---
// Copied verbatim from original wheel.js
const SPIN_COST = 1; 
const WHEEL_PRIZES = [
    { id: 1, type: 'noub', value: 100, label: 'Small NOUB Find', icon: '🐍' }, 
    { id: 2, type: 'noub', value: 300, label: '300 NOUB', icon: '🏺' }, 
    { id: 3, type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '📜' }, 
    { id: 4, type: 'noub', value: 50, label: 'Minor NOUB Find', icon: '𓋹' }, 
    { id: 5, type: 'prestige', value: 3, label: '3 Prestige', icon: '🐞' }, 
    { id: 6, type: 'noub', value: 500, label: '500 NOUB', icon: '🪙' }, 
    { id: 7, type: 'ankh_premium', value: 5, label: '5 Ankh', icon: '☥' }, 
    { id: 8, type: 'card_pack', value: 1, label: '1x Papyrus Pack', icon: '🏛️' }, 
    { id: 9, type: 'noub', value: 750, label: 'Major NOUB Find', icon: '👑' }, 
    { id: 10, type: 'jackpot', value: 50, label: '50 Prestige JACKPOT!', icon: '🌟' } 
];

// =============================================================================
// SECTION 2: STATE VARIABLES
// =============================================================================

// Tracks the Interval ID for the Idle Generator countdown
let idleGeneratorInterval = null;

// Tracks the status of the Wheel animation to prevent double-clicking
let isSpinning = false;

// =============================================================================
// SECTION 3: HELPER FUNCTIONS
// =============================================================================

function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / ONE_SECOND);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Calculates the current production stats based on level.
 * Returns { capacityMs, ratePerMinute, ratePerMs, maxNoub, upgradeCost }
 */
function calculateIdleDrop(level) {
    const config = IDLE_GENERATOR_CONFIG;
    const capacityMinutes = (config.BASE_CAPACITY_HOURS * 60) + ((level - 1) * config.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMinute = config.BASE_RATE_PER_MINUTE + ((level - 1) * config.RATE_INCREASE_PER_LEVEL);
    const ratePerMs = ratePerMinute / (60 * 1000); 
    const maxNoub = Math.floor(ratePerMinute * capacityMinutes);

    return {
        capacityMs: capacityMinutes * 60 * 1000,
        ratePerMinute: ratePerMinute,
        ratePerMs: ratePerMs,
        maxNoub: maxNoub,
        upgradeCost: Math.floor(config.UPGRADE_COST_BASE * Math.pow(config.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

/**
 * Selects a prize based on a simple 1-10 random roll (Deterministic RNG).
 */
function getSimpleRandomPrize() {
    const rollResult = Math.floor(Math.random() * 10) + 1;
    return WHEEL_PRIZES.find(p => p.id === rollResult);
}

// =============================================================================
// SECTION 4: BUSINESS LOGIC (IDLE VAULT)
// =============================================================================

async function handleClaimIdleDrop() {
    if (!state.currentUser) return;
    const playerId = state.currentUser.id;
    const profile = state.playerProfile; 
    
    const generatorLevel = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(generatorLevel);
    const lastClaimTime = new Date(profile.last_claim_time).getTime();
    const elapsedTime = Date.now() - lastClaimTime;
    
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);

    if (noubGenerated < 1) return showToast("Vault is not ready yet.", 'info');

    const updateObject = {
        noub_score: (profile.noub_score || 0) + noubGenerated,
        last_claim_time: new Date().toISOString() // Reset timer
    };

    const { error } = await api.updatePlayerProfile(playerId, updateObject);
    
    if (!error) {
        // Feedback
        playSound('claim_reward');
        triggerHaptic('medium');
        showToast(`Collected ${noubGenerated} NOUB from Vault!`, 'success');
        
        await api.addXp(state.currentUser.id, 1);
        await refreshPlayerState();
        // Re-render to update UI states immediately
        renderDropAndWheel(); 
    } else {
        showToast("Connection error while claiming.", 'error');
    }
}

async function handleUpgradeIdleDrop(currentLevel, upgradeCost) {
    if ((state.playerProfile.noub_score || 0) < upgradeCost) return showToast("Insufficient NOUB for upgrade.", 'error');
    
    const newLevel = currentLevel + 1;
    const { error } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: newLevel
    });

    if (!error) {
        playSound('construction'); // Reused standard sound
        showToast(`Vault upgraded to Level ${newLevel}!`, 'success');
        await api.addXp(state.currentUser.id, 50);
        await refreshPlayerState();
        renderDropAndWheel();
    } else {
        showToast("Upgrade transaction failed.", 'error');
    }
}

// =============================================================================
// SECTION 5: BUSINESS LOGIC (WHEEL/DICE)
// =============================================================================

async function runWheelSpin() {
    if (!state.currentUser) return;
    const spins = state.playerProfile.spin_tickets || 0;
    const spinBtn = document.getElementById('wheel-spin-button');

    if (isSpinning || spins < SPIN_COST) {
        return showToast('Not enough Spin Tickets!', 'error');
    }
    
    isSpinning = true;
    if (spinBtn) spinBtn.disabled = true;
    const diceResultEl = document.getElementById('dice-icon-display');
    const prizeDescEl = document.getElementById('prize-description');

    // 1. Transaction: Deduct Ticket
    const newTickets = spins - SPIN_COST;
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: newTickets });
    
    showToast("Rolling the dice...", 'info');

    // 2. Logic: Determine Winner
    const prize = getSimpleRandomPrize();
    const rollResult = prize.id;
    
    // 3. Animation Loop
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        const tempPrize = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        if (diceResultEl) {
            diceResultEl.textContent = tempPrize.icon;
            diceResultEl.style.color = `hsl(${Math.random() * 360}, 70%, 70%)`; // Visual flash
        }
        animationCount++;
        
        // End Animation
        if (animationCount > 30) { 
            clearInterval(animationInterval);
            if (diceResultEl) {
                diceResultEl.textContent = prize.icon;
                diceResultEl.style.color = 'var(--primary-accent)';
            }
            if (prizeDescEl) {
                prizeDescEl.textContent = `Result: ${prize.label}`;
            }
            
            // 4. Grant Reward & Refresh
            handleWheelPrize(prize).then(() => {
                isSpinning = false;
                // Button re-enabled by render refresh inside handleWheelPrize
            });
        }
    }, 50);
}

async function handleWheelPrize(prize) {
    let profileUpdates = {};
    
    // Mapping prize types to DB columns
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
        await api.updatePlayerProfile(state.currentUser.id, profileUpdates);
    }
    
    await api.logActivity(state.currentUser.id, 'WHEEL_ROLL', `Rolled a ${prize.id} and won ${prize.label}.`);
    
    playSound('reward_grand'); // Use grand sound for any win to feel good
    showToast(`WIN: ${prize.label}`, 'success');
    
    await refreshPlayerState();
    // Refresh the UI to update ticket count
    renderDropAndWheel();
}

// =============================================================================
// SECTION 6: BUSINESS LOGIC (CALENDAR)
// =============================================================================

async function handleClaimEvent(event) {
    if (!state.currentUser) return;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // 1. Grant Reward
    const profileUpdate = {};
    if (event.reward_type === 'NOUB') {
        profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + Number(event.reward_amount);
    } else if (event.reward_type === 'PRESTIGE') {
        profileUpdate.prestige = (state.playerProfile.prestige || 0) + Number(event.reward_amount);
    }
    
    // 2. Update Profile & Log Claim
    await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    await api.supabaseClient.from('player_event_claims').insert({
        player_id: state.currentUser.id,
        event_id: event.id,
        claimed_year: currentYear
    });

    playSound('claim_reward');
    showToast(`Event Claimed: +${event.reward_amount} ${event.reward_type}`, 'success');
    
    await refreshPlayerState();
    renderCalendarContent();
}

// =============================================================================
// SECTION 7: UI RENDERERS (COMBINED)
// =============================================================================

/**
 * Renders Tab 1: The Idle Vault + The Fortune Dice (Stacked Vertically)
 */
function renderDropAndWheel() {
    const content = document.getElementById('ms-content-drop');
    if (!content) return;
    
    // --- A. Prepare Idle Vault Data ---
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(level);
    const lastClaimTime = new Date(profile.last_claim_time).getTime();
    const now = Date.now();
    
    const elapsedTime = now - lastClaimTime;
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);
    const remainingTimeMs = generatorState.capacityMs - timeToCount;
    const capacityPercent = (timeToCount / generatorState.capacityMs) * 100;
    const isFull = remainingTimeMs <= 0;
    const timeDisplay = isFull ? 'FULL' : formatTime(remainingTimeMs);

    // --- B. Prepare Wheel Data ---
    const spins = profile.spin_tickets || 0;

    // --- C. Render Combined HTML ---
    content.innerHTML = `
        <!-- SECTION: ROYAL VAULT -->
        <div class="idle-generator-card game-container" style="margin-bottom: 20px;">
            <div class="generator-header" style="border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 10px; text-align: center;">
                <h3 style="margin:0; color: var(--primary-accent);">Royal Vault (Lvl ${level})</h3>
                <div style="font-size: 2.5em; margin-top: 5px;">🏺</div>
            </div>
            
            <div class="generator-timer" style="text-align: center; margin-bottom: 10px;">
                <div style="font-size: 1.5em; font-weight: bold; color: ${isFull ? 'var(--danger-color)' : '#fff'};">
                    ${noubGenerated} / ${generatorState.maxNoub} 🪙
                </div>
                <div style="font-size: 0.8em; color: #aaa;">
                    ${isFull ? 'STORAGE FULL' : `Fills in: ${timeDisplay}`}
                </div>
            </div>
            
            <div class="progress-bar" style="height: 12px; background: #333; border-radius: 6px; overflow: hidden; margin-bottom: 15px;">
                <div class="progress-bar-inner" style="width: ${capacityPercent}%; height: 100%; background: linear-gradient(90deg, #4caf50, var(--primary-accent)); transition: width 0.5s;"></div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="claim-idle-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''} style="flex: 2;">
                    Claim Gold
                </button>
                <button id="upgrade-idle-btn" class="action-button small" style="flex: 1; background-color: #444; border: 1px solid #666; font-size: 0.8em;">
                    Upgrade (${generatorState.upgradeCost}🪙)
                </button>
            </div>
        </div>

        <!-- SEPARATOR -->
        <hr style="border-color: #333; opacity: 0.5; margin-bottom: 20px;">

        <!-- SECTION: FORTUNE DICE -->
        <div class="wheel-container game-container" style="text-align: center;">
            <h3 style="color: var(--primary-accent); margin-bottom: 15px;">Fortune Dice</h3>
            
            <div id="dice-result-container" class="dice-result-container" style="margin: 0 auto 15px auto;">
                <span id="dice-icon-display" class="icon-lg" style="display: block;">🎲</span>
            </div>
            
            <p id="prize-description" style="min-height: 20px; color: var(--text-secondary); margin-bottom: 15px;">
                Roll for glory!
            </p>
            
            <button id="wheel-spin-button" class="action-button spin-button" ${isSpinning || spins < SPIN_COST ? 'disabled' : ''}>
                ROLL DICE (${SPIN_COST} 🎟️)
            </button>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 0 10px;">
                <p id="wheel-spins-left" class="balance-info" style="margin: 0;">Tickets: ${spins}</p>
                <button id="prize-info-btn" class="text-button" onclick="window.openPrizeModal()">Prizes?</button>
            </div>
        </div>
    `;

    // --- D. Bind Events ---
    document.getElementById('claim-idle-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-btn').onclick = () => handleUpgradeIdleDrop(level, generatorState.upgradeCost);
    document.getElementById('wheel-spin-button').onclick = runWheelSpin;
    
    // Bind Modal for Prizes (using global scope as per original wheel.js logic)
    window.openPrizeModal = () => {
        // Simple alert or reuse modal logic from wheel.js if UI exists
        let modal = document.getElementById('wheel-prize-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wheel-prize-modal';
            modal.className = 'modal-overlay hidden';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close-btn" onclick="document.getElementById('wheel-prize-modal').classList.add('hidden')">&times;</button>
                <h2>Prize List</h2>
                <ul style="list-style:none; padding:0; text-align:left;">
                    ${WHEEL_PRIZES.map(p => `<li style="padding:5px; border-bottom:1px solid #333;">${p.icon} ${p.label}</li>`).join('')}
                </ul>
            </div>
        `;
        modal.classList.remove('hidden');
    };

    // --- E. Timer Loop (Only for Idle) ---
    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
    if (!isFull) {
        idleGeneratorInterval = setInterval(() => {
            // Smart Update: Only re-render the specific bar/text to save performance, 
            // OR just re-call renderDropAndWheel if the UI is simple enough.
            // For strict adherence to original logic: Re-rendering is safer.
            renderDropAndWheel(); 
        }, 1000);
    }
}

/**
 * Renders Tab 2: The Royal Calendar
 */
async function renderCalendarContent() {
    const content = document.getElementById('ms-content-events');
    if (!content) return;
    
    content.innerHTML = '<p style="text-align:center; padding:20px;">Checking dates...</p>';

    const [{ data: events }, { data: claims }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month').order('event_day'),
        api.supabaseClient.from('player_event_claims').select('*').eq('player_id', state.currentUser.id)
    ]);

    if (!events) return content.innerHTML = '<p>No events found.</p>';

    const claimSet = new Set(claims ? claims.map(c => c.event_id + '-' + c.claimed_year) : []);
    const today = new Date();
    const currentYear = today.getFullYear();
    const tDay = today.getDate();
    const tMonth = today.getMonth() + 1;

    content.innerHTML = `<div style="display: flex; flex-direction: column; gap: 10px;"></div>`;
    const listContainer = content.querySelector('div');

    events.forEach(ev => {
        const isToday = ev.event_day === tDay && ev.event_month === tMonth;
        const claimKey = ev.id + '-' + currentYear;
        const isClaimed = claimSet.has(claimKey);
        
        const item = document.createElement('div');
        item.className = `event-card ${isClaimed ? 'claimed' : (isToday ? 'claimable' : 'default')}`;
        item.style.opacity = isClaimed ? '0.6' : '1';
        
        let actionBtn = '';
        if (isToday && !isClaimed) {
            actionBtn = `<button class="action-button small" id="claim-ev-${ev.id}">Claim</button>`;
        } else if (isClaimed) {
            actionBtn = `<span style="color: #aaa; font-size: 0.8em;">CLAIMED</span>`;
        } else {
            actionBtn = `<span style="color: #666; font-size: 0.8em;">LOCKED</span>`;
        }

        item.innerHTML = `
            <div class="event-date">${ev.event_day}/${ev.event_month}</div>
            <div class="event-details">
                <h4>${ev.title}</h4>
                <p style="font-size:0.8em; color:#aaa; margin:0;">${ev.description_lore || ''}</p>
            </div>
            <div class="event-actions" style="text-align:right;">
                <div class="reward-info" style="margin-bottom:5px;">+${ev.reward_amount}</div>
                ${actionBtn}
            </div>
        `;
        
        if (isToday && !isClaimed) {
            // Defer listener attachment
            setTimeout(() => {
                document.getElementById(`claim-ev-${ev.id}`).onclick = () => handleClaimEvent(ev);
            }, 0);
        }

        listContainer.appendChild(item);
    });
}

// =============================================================================
// SECTION 8: MAIN ENTRY POINT (TABS CONTROLLER)
// =============================================================================

export function renderMsGame() {
    if (!state.currentUser) return;
    
    // Ensure container exists in index.html
    if (!msGameContainer) return;

    // One-time Tab Setup
    if (!document.getElementById('ms-tab-buttons')) {
        msGameContainer.innerHTML = `
            <h2 class="screen-title" style="text-align: center;">Royal Vault & Calendar</h2>
            
            <div id="ms-tab-buttons" style="display: flex; justify-content: space-around; margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 10px;">
                <button class="ms-tab-btn active" data-target="drop" style="background:none; border:none; color:gold; font-weight:bold; cursor:pointer;">Vault & Dice</button>
                <button class="ms-tab-btn" data-target="events" style="background:none; border:none; color:#888; cursor:pointer;">Calendar</button>
            </div>

            <div id="ms-content-drop" class="ms-tab-content"></div>
            <div id="ms-content-events" class="ms-tab-content hidden"></div>
        `;
        
        // Bind Tab Switching
        msGameContainer.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // UI Updates
                msGameContainer.querySelectorAll('.ms-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#888';
                });
                e.target.classList.add('active');
                e.target.style.color = 'gold';

                // Content Toggle
                msGameContainer.querySelectorAll('.ms-tab-content').forEach(c => c.classList.add('hidden'));
                const target = e.target.dataset.target;
                document.getElementById(`ms-content-${target}`).classList.remove('hidden');

                // Logic Switch
                if (target === 'drop') {
                    renderDropAndWheel();
                } else {
                    // Stop Vault Interval when viewing calendar to save resources
                    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
                    renderCalendarContent();
                }
            });
        });
    }

    // Initial View
    renderDropAndWheel();
}
