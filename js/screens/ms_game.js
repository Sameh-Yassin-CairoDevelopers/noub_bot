/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v4.1.0 (Fixed & Polished)
 * Description: 
 * Unified Rewards Hub (Vault + Wheel + Calendar).
 * FIXES:
 * - Added missing 'triggerHaptic' import.
 * - Replaced missing audio with standard 'click' sound.
 * - Implemented 4-State Calendar (Claim, Claimed, Wait, Missed).
 * - Optimized Button Sizing (Compact UI).
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, playSound, triggerHaptic } from '../ui.js'; // Fix: Added triggerHaptic
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

// --- B. Wheel Configuration ---
const SPIN_COST = 1; 
const WHEEL_PRIZES = [
    { id: 1, type: 'noub', value: 100, label: 'Small Gold', icon: '🐍' }, 
    { id: 2, type: 'noub', value: 300, label: 'Medium Gold', icon: '🏺' }, 
    { id: 3, type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '📜' }, 
    { id: 4, type: 'noub', value: 50, label: 'Minor Find', icon: '𓋹' }, 
    { id: 5, type: 'prestige', value: 3, label: '3 Prestige', icon: '🐞' }, 
    { id: 6, type: 'noub', value: 500, label: 'Large Gold', icon: '🪙' }, 
    { id: 7, type: 'ankh_premium', value: 5, label: '5 Ankh', icon: '☥' }, 
    { id: 8, type: 'card_pack', value: 1, label: 'Card Pack', icon: '🏛️' }, 
    { id: 9, type: 'noub', value: 750, label: 'Jackpot', icon: '👑' }, 
    { id: 10, type: 'jackpot', value: 50, label: '50 Prestige!', icon: '🌟' } 
];

// =============================================================================
// SECTION 2: STATE VARIABLES
// =============================================================================

let idleGeneratorInterval = null;
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
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function calculateIdleDrop(level) {
    const config = IDLE_GENERATOR_CONFIG;
    const capacityMinutes = (config.BASE_CAPACITY_HOURS * 60) + ((level - 1) * config.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMinute = config.BASE_RATE_PER_MINUTE + ((level - 1) * config.RATE_INCREASE_PER_LEVEL);
    const ratePerMs = ratePerMinute / 60000; 
    const maxNoub = Math.floor(ratePerMinute * capacityMinutes);

    return {
        capacityMs: capacityMinutes * 60 * 1000,
        ratePerMs: ratePerMs,
        ratePerMinute: ratePerMinute,
        maxNoub: maxNoub,
        upgradeCost: Math.floor(config.UPGRADE_COST_BASE * Math.pow(config.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

function getSimpleRandomPrize() {
    const rollResult = Math.floor(Math.random() * 10) + 1;
    return WHEEL_PRIZES.find(p => p.id === rollResult);
}

// =============================================================================
// SECTION 4: BUSINESS LOGIC (VAULT & WHEEL)
// =============================================================================

async function handleClaimIdleDrop() {
    if (!state.currentUser) return;
    
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const stats = calculateIdleDrop(level);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeToCount = Math.min(elapsed, stats.capacityMs);
    const amount = Math.floor(timeToCount * stats.ratePerMs);

    if (amount < 1) return showToast("Vault is not ready.", 'info');

    await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (profile.noub_score || 0) + amount,
        last_claim_time: new Date().toISOString()
    });

    playSound('claim_reward');
    triggerHaptic('medium'); // Works now (imported)
    showToast(`Collected ${amount} 🪙`, 'success');
    
    await api.addXp(state.currentUser.id, 1);
    await refreshPlayerState();
    renderDropAndWheel(); 
}

async function handleUpgradeIdleDrop(currentLevel, upgradeCost) {
    if ((state.playerProfile.noub_score || 0) < upgradeCost) return showToast("Insufficient Gold.", 'error');
    
    await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: currentLevel + 1
    });

    playSound('click'); // Fix: Changed from 'construction' to 'click' to avoid 404
    showToast(`Upgraded to Level ${currentLevel + 1}!`, 'success');
    await api.addXp(state.currentUser.id, 50);
    await refreshPlayerState();
    renderDropAndWheel();
}

async function runWheelSpin() {
    const spins = state.playerProfile.spin_tickets || 0;
    if (isSpinning || spins < SPIN_COST) return showToast('Need Tickets!', 'error');
    
    isSpinning = true;
    const btn = document.getElementById('wheel-spin-button');
    if (btn) btn.disabled = true;

    // Deduct
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: spins - SPIN_COST });
    
    // Animation
    const diceEl = document.getElementById('dice-icon-display');
    let frames = 0;
    const anim = setInterval(() => {
        const r = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        if (diceEl) diceEl.textContent = r.icon;
        frames++;
        if (frames > 20) {
            clearInterval(anim);
            finalizeSpin();
        }
    }, 80);
}

async function finalizeSpin() {
    const prize = getSimpleRandomPrize();
    let updates = {};

    // Map Rewards
    if (prize.type === 'noub') updates.noub_score = (state.playerProfile.noub_score || 0) + prize.value;
    else if (prize.type === 'prestige') updates.prestige = (state.playerProfile.prestige || 0) + prize.value;
    else if (prize.type === 'ankh_premium') updates.ankh_premium = (state.playerProfile.ankh_premium || 0) + prize.value;
    else if (prize.type === 'spin_ticket') updates.spin_tickets = (state.playerProfile.spin_tickets || 0) + prize.value;
    else if (prize.type === 'card_pack') {
        const { data } = await api.fetchAllMasterCards();
        if (data) await api.addCardToPlayerCollection(state.currentUser.id, data[0].id); 
    }

    if (Object.keys(updates).length > 0) await api.updatePlayerProfile(state.currentUser.id, updates);
    
    playSound('reward_grand');
    triggerHaptic('heavy');
    showToast(`Won: ${prize.label}`, 'success');
    
    isSpinning = false;
    await refreshPlayerState();
    renderDropAndWheel(); // Refresh UI
}

// =============================================================================
// SECTION 5: CALENDAR LOGIC (4 States Logic)
// =============================================================================

async function handleClaimEvent(event) {
    if (!state.currentUser) return;
    const today = new Date();
    const year = today.getFullYear();

    const profileUpdate = {};
    if (event.reward_type === 'NOUB') profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + Number(event.reward_amount);
    if (event.reward_type === 'PRESTIGE') profileUpdate.prestige = (state.playerProfile.prestige || 0) + Number(event.reward_amount);
    
    await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    await api.supabaseClient.from('player_event_claims').insert({
        player_id: state.currentUser.id,
        event_id: event.id,
        claimed_year: year
    });

    playSound('claim_reward');
    triggerHaptic('medium');
    showToast('Reward Claimed!', 'success');
    
    await refreshPlayerState();
    renderCalendarContent();
}

// =============================================================================
// SECTION 6: UI RENDERERS
// =============================================================================

function renderDropAndWheel() {
    const content = document.getElementById('ms-content-drop');
    if (!content) return;
    
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(level);
    const elapsedTime = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);
    const remainingMs = generatorState.capacityMs - timeToCount;
    const percent = (timeToCount / generatorState.capacityMs) * 100;
    const isFull = remainingMs <= 0;

    const spins = profile.spin_tickets || 0;

    // CSS Fix for compact buttons
    const btnStyle = `width: 140px; padding: 8px 0; font-size: 0.9em; margin: 0 auto; display: block;`;

    content.innerHTML = `
        <!-- VAULT SECTION -->
        <div class="idle-generator-card game-container" style="margin-bottom: 15px; padding: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:10px;">
                <h3 style="margin:0; color:var(--primary-accent); font-size:1.1em;">Royal Vault (Lvl ${level})</h3>
                <div style="font-size:1.5em;">🏺</div>
            </div>
            
            <div style="text-align:center; margin-bottom:10px;">
                <div style="font-size:1.4em; font-weight:bold; color:#fff;">${noubGenerated} / ${generatorState.maxNoub} 🪙</div>
                <div style="font-size:0.7em; color:#aaa;">${isFull ? 'FULL' : formatTime(remainingMs)}</div>
            </div>
            
            <div class="progress-bar" style="height:10px; background:#333; border-radius:5px; margin-bottom:15px;">
                <div class="progress-bar-inner" style="width:${percent}%; height:100%; background:linear-gradient(90deg, #4caf50, var(--primary-accent));"></div>
            </div>

            <div style="display:flex; justify-content:center; gap:10px;">
                <button id="claim-idle-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''} style="${btnStyle}">Claim</button>
                <button id="upgrade-idle-btn" class="action-button small" style="background:#444; border:1px solid #666; ${btnStyle}">Upgrade (${generatorState.upgradeCost}🪙)</button>
            </div>
        </div>

        <!-- DICE SECTION -->
        <div class="wheel-container game-container" style="padding: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:var(--primary-accent); font-size:1.1em;">Fortune Dice</h3>
                <div style="font-size:0.9em; color:#aaa;">Tickets: <strong style="color:#fff;">${spins}</strong></div>
            </div>
            
            <div style="text-align:center;">
                <div id="dice-result-container" style="display:inline-block; padding:15px; background:#222; border-radius:12px; border:2px solid gold; margin-bottom:10px;">
                    <span id="dice-icon-display" style="font-size:2.5em;">🎲</span>
                </div>
                <p id="prize-description" style="font-size:0.8em; color:#888; margin-bottom:10px;">Roll to win!</p>
                
                <button id="wheel-spin-button" class="action-button" ${isSpinning || spins < 1 ? 'disabled' : ''} style="${btnStyle}">
                    ROLL (1 🎟️)
                </button>
            </div>
        </div>
    `;

    // Bind Events
    document.getElementById('claim-idle-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-btn').onclick = () => handleUpgradeIdleDrop(level, generatorState.upgradeCost);
    document.getElementById('wheel-spin-button').onclick = runWheelSpin;

    // Loop
    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
    if (!isFull) idleGeneratorInterval = setInterval(renderDropAndWheel, 1000);
}

async function renderCalendarContent() {
    const content = document.getElementById('ms-content-events');
    if (!content) return;
    content.innerHTML = '<div class="loading-spinner"></div>';

    const [{ data: events }, { data: claims }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month').order('event_day'),
        api.supabaseClient.from('player_event_claims').select('*').eq('player_id', state.currentUser.id)
    ]);

    if (!events) return content.innerHTML = '<p>No events.</p>';

    // Logic for 4 States
    const claimSet = new Set(claims ? claims.map(c => c.event_id + '-' + c.claimed_year) : []);
    const todayDate = new Date();
    const currentYear = todayDate.getFullYear();
    // Normalize Today to compare only dates (ignore time)
    todayDate.setHours(0,0,0,0);

    content.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;"></div>`;
    const list = content.querySelector('div');

    events.forEach(ev => {
        // Create Date object for the event in current year
        const evDate = new Date(currentYear, ev.event_month - 1, ev.event_day);
        evDate.setHours(0,0,0,0);

        const isClaimed = claimSet.has(ev.id + '-' + currentYear);
        let stateClass = '';
        let statusText = '';
        let actionHTML = '';

        // 1. STATE LOGIC
        if (isClaimed) {
            stateClass = 'claimed'; // Opacity 0.5
            statusText = 'CLAIMED';
            actionHTML = `<span style="color:#aaa; font-size:0.7em;">✓ DONE</span>`;
        } else if (evDate.getTime() === todayDate.getTime()) {
            stateClass = 'claimable'; // Highlight
            statusText = 'ACTIVE';
            actionHTML = `<button id="claim-ev-${ev.id}" class="action-button small" style="padding:4px 10px;">Claim</button>`;
        } else if (evDate < todayDate) {
            stateClass = 'missed'; // Red tint
            statusText = 'MISSED';
            actionHTML = `<span style="color:var(--danger-color); font-size:0.7em;">✕ MISSED</span>`;
        } else {
            stateClass = 'locked'; // Gray
            statusText = 'WAIT';
            actionHTML = `<span style="color:#666; font-size:0.7em;">WAIT (${ev.event_day}/${ev.event_month})</span>`;
        }

        // CSS for states
        const borderStyle = 
            stateClass === 'claimable' ? '2px solid gold' : 
            stateClass === 'missed' ? '1px solid #500' : 
            stateClass === 'claimed' ? '1px solid var(--success-color)' : 
            '1px solid #333';

        const item = document.createElement('div');
        item.style.cssText = `background:#1a1a1a; padding:12px; border-radius:8px; border:${borderStyle}; opacity:${stateClass==='claimed'?0.6:1}; display:flex; justify-content:space-between; align-items:center;`;

        item.innerHTML = `
            <div>
                <div style="font-weight:bold; color:${stateClass==='missed'?'#f88':'#fff'};">${ev.title}</div>
                <div style="font-size:0.75em; color:#888;">${ev.description_lore || ''}</div>
            </div>
            <div style="text-align:right; min-width:80px;">
                <div style="font-size:0.8em; color:var(--success-color); margin-bottom:5px;">+${ev.reward_amount}</div>
                ${actionHTML}
            </div>
        `;

        if (stateClass === 'claimable') {
            setTimeout(() => {
                document.getElementById(`claim-ev-${ev.id}`).onclick = () => handleClaimEvent(ev);
            }, 0);
        }

        list.appendChild(item);
    });
}

// =============================================================================
// SECTION 7: MAIN TAB CONTROLLER
// =============================================================================

export function renderMsGame() {
    if (!state.currentUser || !msGameContainer) return;
    
    if (!document.getElementById('ms-tabs-ctrl')) {
        msGameContainer.innerHTML = `
            <h2 class="screen-title" style="text-align: center;">Royal Vault & Calendar</h2>
            
            <div id="ms-tabs-ctrl" style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px;">
                <button class="ms-tab-btn active" data-tab="drop" style="padding:8px 25px; background:#333; border:1px solid gold; color:gold; border-radius:20px; cursor:pointer;">Vault</button>
                <button class="ms-tab-btn" data-tab="events" style="padding:8px 25px; background:transparent; border:1px solid #444; color:#888; border-radius:20px; cursor:pointer;">Calendar</button>
            </div>

            <div id="ms-content-drop" class="ms-view"></div>
            <div id="ms-content-events" class="ms-view hidden"></div>
        `;

        msGameContainer.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                msGameContainer.querySelectorAll('.ms-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.border = '1px solid #444';
                    b.style.color = '#888';
                });
                e.target.classList.add('active');
                e.target.style.background = '#333';
                e.target.style.border = '1px solid gold';
                e.target.style.color = 'gold';

                msGameContainer.querySelectorAll('.ms-view').forEach(div => div.classList.add('hidden'));
                const tab = e.target.dataset.tab;
                
                if (tab === 'drop') {
                    document.getElementById('ms-content-drop').classList.remove('hidden');
                    renderDropAndWheel();
                } else {
                    document.getElementById('ms-content-events').classList.remove('hidden');
                    if(idleGeneratorInterval) clearInterval(idleGeneratorInterval);
                    renderCalendarContent();
                }
            });
        });
    }

    // Default Render
    renderDropAndWheel();
}
