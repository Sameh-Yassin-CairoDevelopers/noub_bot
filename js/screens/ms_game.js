/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v4.0.0 (The Unified Reward Center)
 * Author: Sameh Yassin & Engineering Partner
 * 
 * -----------------------------------------------------------------------------
 * MODULE ARCHITECTURE & RESPONSIBILITY
 * -----------------------------------------------------------------------------
 * This module acts as the central "Passive & RNG Economy" controller. 
 * It aggregates three distinct game loops into a single UI container:
 * 
 * 1. The Royal Vault (Idle Game): 
 *    - Linear progression logic based on time deltas.
 *    - Deterministic resource generation (Math.min cap).
 * 
 * 2. Fortune Dice (RNG Game):
 *    - Probability-based reward system (Client-side visualization, Server-side secure).
 *    - Consumes 'spin_tickets' asset.
 * 
 * 3. Royal Calendar (Time-based Events):
 *    - Date-checking logic to unlock specific daily rewards.
 *    - State persistence via 'player_event_claims' table.
 * 
 * -----------------------------------------------------------------------------
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, playSound, triggerHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// ========================================================
// --- 1. CONFIGURATION & CONSTANTS ---
// ========================================================

const DOM_ELEMENTS = {
    container: document.getElementById('ms-game-screen'),
};

const TIME_CONSTANTS = {
    ONE_SECOND: 1000,
    ONE_HOUR: 3600000
};

// --- IDLE GENERATOR MATH ---
// Logic: Level 1 = 0.25 coins/min. Level 10 = Much higher.
// Formula: Rate + (Level * Increment)
const IDLE_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// --- WHEEL PROBABILITY MATRIX ---
const WHEEL_PRIZES = [
    { id: 1, type: 'noub', value: 100, label: 'Small Gold', icon: '🐍' }, 
    { id: 2, type: 'noub', value: 300, label: 'Medium Gold', icon: '🏺' }, 
    { id: 3, type: 'spin_ticket', value: 2, label: '2 Tickets', icon: '📜' }, 
    { id: 4, type: 'noub', value: 50, label: 'Minor Find', icon: '𓋹' }, 
    { id: 5, type: 'prestige', value: 3, label: '3 Prestige', icon: '🐞' }, 
    { id: 6, type: 'noub', value: 500, label: 'Large Gold', icon: '🪙' }, 
    { id: 7, type: 'ankh_premium', value: 5, label: '5 Ankh', icon: '☥' }, 
    { id: 8, type: 'noub', value: 150, label: 'Gold Stash', icon: '🏛️' }, 
    { id: 9, type: 'noub', value: 750, label: 'Jackpot', icon: '👑' }, 
    { id: 10, type: 'prestige', value: 10, label: 'Fame Boost', icon: '🌟' } 
];

const SPIN_COST = 1; 

// State Tracking
let idleTimerInterval = null; // Controls the UI countdown
let isSpinning = false;       // Locks the button during animation

// ========================================================
// --- 2. HELPER FUNCTIONS ---
// ========================================================

/**
 * Converts milliseconds to HH:MM:SS format.
 */
function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / TIME_CONSTANTS.ONE_SECOND);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Calculates current generator stats based on player level.
 * Returns object with capacity, rate, and upgrade cost.
 */
function calculateIdleStats(level) {
    const cfg = IDLE_CONFIG;
    const capacityMins = (cfg.BASE_CAPACITY_HOURS * 60) + ((level - 1) * cfg.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMin = cfg.BASE_RATE_PER_MINUTE + ((level - 1) * cfg.RATE_INCREASE_PER_LEVEL);
    
    return {
        capacityMs: capacityMins * 60 * 1000,
        ratePerMinute: ratePerMin,
        ratePerMs: ratePerMin / 60000,
        maxStorage: Math.floor(ratePerMin * capacityMins),
        upgradeCost: Math.floor(cfg.UPGRADE_COST_BASE * Math.pow(cfg.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

// ========================================================
// --- 3. IDLE VAULT LOGIC ---
// ========================================================

async function handleClaimVault() {
    if (!state.currentUser) return;
    
    // 1. Calculate Amount
    const profile = state.playerProfile;
    const stats = calculateIdleStats(profile.idle_generator_level || 1);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeCapped = Math.min(elapsed, stats.capacityMs);
    const amount = Math.floor(timeCapped * stats.ratePerMs);

    if (amount < 1) return showToast("Vault is empty.", 'info');

    // 2. Database Update
    const { error } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (profile.noub_score || 0) + amount,
        last_claim_time: new Date().toISOString() // Reset timer
    });

    if (error) return showToast("Claim Error.", 'error');

    // 3. Feedback
    playSound('claim_reward');
    triggerHaptic('medium');
    showToast(`Collected: ${amount} 🪙`, 'success');
    
    await refreshPlayerState();
    renderVaultTab(); // Refresh UI
}

async function handleUpgradeVault(currentLevel, cost) {
    if ((state.playerProfile.noub_score || 0) < cost) {
        return showToast("Insufficient Gold.", 'error');
    }

    const { error } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - cost,
        idle_generator_level: currentLevel + 1
    });

    if (error) return showToast("Upgrade Failed.", 'error');

    playSound('construction'); // or standard click
    showToast(`Vault Upgraded to Level ${currentLevel + 1}!`, 'success');
    
    await refreshPlayerState();
    renderVaultTab();
}

// ========================================================
// --- 4. WHEEL OF FORTUNE LOGIC (Complete Port) ---
// ========================================================

async function handleSpinWheel() {
    const tickets = state.playerProfile.spin_tickets || 0;
    
    // Validation
    if (isSpinning) return;
    if (tickets < SPIN_COST) return showToast("No Tickets!", 'error');

    isSpinning = true;
    const btn = document.getElementById('wheel-spin-btn');
    if (btn) btn.disabled = true;

    // 1. Deduct Ticket (Optimistic UI update happens on refresh)
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: tickets - SPIN_COST });

    // 2. Visual Animation Loop
    const iconEl = document.getElementById('dice-icon');
    let frames = 0;
    const maxFrames = 25; // approx 2 seconds at 80ms

    const animInterval = setInterval(() => {
        // Pick random icon for effect
        const randomPrize = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        if (iconEl) {
            iconEl.textContent = randomPrize.icon;
            iconEl.style.transform = `rotate(${Math.random() * 360}deg) scale(1.2)`;
        }
        frames++;

        if (frames >= maxFrames) {
            clearInterval(animInterval);
            finalizeSpin();
        }
    }, 80);
}

async function finalizeSpin() {
    // 1. Determine Winner (RNG)
    const winner = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
    
    // 2. Update DB with Rewards
    const profile = state.playerProfile;
    const updates = {};

    if (winner.type === 'noub') updates.noub_score = (profile.noub_score || 0) + winner.value;
    else if (winner.type === 'prestige') updates.prestige = (profile.prestige || 0) + winner.value;
    else if (winner.type === 'ankh_premium') updates.ankh_premium = (profile.ankh_premium || 0) + winner.value;
    else if (winner.type === 'spin_ticket') updates.spin_tickets = (profile.spin_tickets || 0) + winner.value;

    await api.updatePlayerProfile(state.currentUser.id, updates);

    // 3. UI Feedback
    const iconEl = document.getElementById('dice-icon');
    if (iconEl) {
        iconEl.textContent = winner.icon;
        iconEl.style.transform = "scale(1.5) rotate(0deg)";
        iconEl.style.textShadow = "0 0 10px gold";
    }

    playSound('reward_grand');
    triggerHaptic('heavy');
    showToast(`WIN: ${winner.label}`, 'success');

    // 4. Reset State
    isSpinning = false;
    await refreshPlayerState();
    renderWheelTab(); // Re-render to update ticket count
}

// ========================================================
// --- 5. CALENDAR LOGIC (Complete Port) ---
// ========================================================

/**
 * Checks if an event is claimable today.
 */
async function handleClaimEvent(eventId, rewardType, rewardAmount) {
    showToast("Verifying...", 'info');

    // 1. Double check DB to prevent hacks
    const { data: claims } = await api.supabaseClient.from('player_event_claims')
        .select('*')
        .eq('player_id', state.currentUser.id)
        .eq('event_id', eventId)
        .eq('claimed_year', new Date().getFullYear());
    
    if (claims && claims.length > 0) {
        return showToast("Already claimed.", 'error');
    }

    // 2. Grant Reward
    const profile = state.playerProfile;
    const updates = {};
    // Map DB Types to Profile Columns
    if (rewardType.toUpperCase() === 'NOUB') updates.noub_score = (profile.noub_score || 0) + Number(rewardAmount);
    if (rewardType.toUpperCase() === 'PRESTIGE') updates.prestige = (profile.prestige || 0) + Number(rewardAmount);
    // Add more types as needed

    const { error: updateError } = await api.updatePlayerProfile(state.currentUser.id, updates);
    if (updateError) return showToast("Error updating profile.", 'error');

    // 3. Log Claim
    await api.supabaseClient.from('player_event_claims').insert({
        player_id: state.currentUser.id,
        event_id: eventId,
        claimed_year: new Date().getFullYear()
    });

    playSound('claim_reward');
    showToast(`Daily Reward: ${rewardAmount} ${rewardType}`, 'success');
    
    await refreshPlayerState();
    renderCalendarTab();
}

// ========================================================
// --- 6. UI RENDERERS ---
// ========================================================

// --- A. VAULT RENDERER ---
function renderVaultTab() {
    const content = document.getElementById('ms-content-vault');
    if (!content) return;

    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const stats = calculateIdleStats(level);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeCapped = Math.min(elapsed, stats.capacityMs);
    const amount = Math.floor(timeCapped * stats.ratePerMs);
    const remainingMs = Math.max(0, stats.capacityMs - elapsed);
    const percent = (timeCapped / stats.capacityMs) * 100;
    const isFull = remainingMs <= 0;

    content.innerHTML = `
        <div class="game-container" style="text-align:center; padding:20px;">
            <h3 style="color:var(--primary-accent);">Royal Vault (Lvl ${level})</h3>
            <div style="font-size:3em; margin:15px 0; animation: float 3s infinite;">🏺</div>
            
            <!-- Progress Bar -->
            <div style="background:#333; height:15px; border-radius:8px; overflow:hidden; margin-bottom:10px;">
                <div style="width:${percent}%; height:100%; background:linear-gradient(90deg, var(--accent-blue), var(--success-color)); transition:width 1s linear;"></div>
            </div>
            
            <div style="display:flex; justify-content:space-between; font-size:0.8em; color:#aaa; margin-bottom:20px;">
                <span>Gen: ${stats.ratePerMinute.toFixed(2)}/min</span>
                <span>Max: ${stats.maxStorage}</span>
            </div>

            <h2 style="color:#fff; margin:0 0 10px 0;">${amount} 🪙</h2>
            <div style="font-size:0.8em; color:${isFull ? 'var(--danger-color)' : '#ccc'}; margin-bottom:20px;">
                ${isFull ? 'STORAGE FULL' : `Full in: ${formatTime(remainingMs)}`}
            </div>

            <button id="vault-claim-btn" class="action-button" ${amount < 1 ? 'disabled' : ''}>
                Collect Loot
            </button>

            <div style="margin-top:20px; border-top:1px solid #444; padding-top:10px;">
                <button id="vault-upgrade-btn" class="text-button" style="color:var(--primary-accent);">
                    ⬆ Upgrade Capacity (${stats.upgradeCost} 🪙)
                </button>
            </div>
        </div>
    `;

    document.getElementById('vault-claim-btn').onclick = handleClaimVault;
    document.getElementById('vault-upgrade-btn').onclick = () => handleUpgradeVault(level, stats.upgradeCost);

    // Loop
    if (idleTimerInterval) clearInterval(idleTimerInterval);
    if (!isFull) idleTimerInterval = setInterval(renderVaultTab, 1000);
}

// --- B. WHEEL RENDERER ---
function renderWheelTab() {
    const content = document.getElementById('ms-content-dice');
    if (!content) return;

    const tickets = state.playerProfile.spin_tickets || 0;

    content.innerHTML = `
        <div class="game-container" style="text-align:center; padding:20px;">
            <h3 style="color:var(--primary-accent);">Destiny Dice</h3>
            
            <!-- Dice Box -->
            <div style="margin:30px auto; width:120px; height:120px; background:#222; border:2px solid var(--primary-accent); border-radius:20px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 20px rgba(212,175,55,0.2);">
                <span id="dice-icon" style="font-size:4em;">🎲</span>
            </div>

            <p style="color:#aaa; margin-bottom:20px; font-size:0.9em;">
                Tickets Remaining: <strong style="color:#fff; font-size:1.2em;">${tickets}</strong>
            </p>

            <button id="wheel-spin-btn" class="action-button" ${tickets < 1 ? 'disabled' : ''}>
                ROLL (Cost: ${SPIN_COST} 🎟️)
            </button>

            <div style="margin-top:20px; font-size:0.7em; color:#666;">
                *Prizes include Gold, Prestige, and Ankh.
            </div>
        </div>
    `;

    const btn = document.getElementById('wheel-spin-btn');
    if(btn) btn.onclick = handleSpinWheel;
}

// --- C. CALENDAR RENDERER ---
async function renderCalendarTab() {
    const content = document.getElementById('ms-content-calendar');
    if (!content) return;
    
    content.innerHTML = '<p style="text-align:center; padding:20px;">Reading stars...</p>';

    // Parallel Fetch
    const [{ data: events }, { data: claims }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month').order('event_day'),
        api.supabaseClient.from('player_event_claims').select('event_id').eq('player_id', state.currentUser.id).eq('claimed_year', new Date().getFullYear())
    ]);

    if (!events) return content.innerHTML = '<p class="error-text">Calendar Unavailable</p>';

    const claimedIds = new Set(claims ? claims.map(c => c.event_id) : []);
    const today = new Date();
    const tDay = today.getDate();
    const tMonth = today.getMonth() + 1;

    content.innerHTML = `<div style="display:flex; flex-direction:column; gap:10px;"></div>`;
    const list = content.querySelector('div');

    events.forEach(ev => {
        const isToday = ev.event_day === tDay && ev.event_month === tMonth;
        const isClaimed = claimedIds.has(ev.id);
        
        // Card Style Logic
        let opacity = '0.5'; // Locked/Past
        let border = '1px solid #444';
        
        if (isToday) { opacity = '1'; border = '2px solid gold'; }
        if (isClaimed) { opacity = '0.7'; border = '1px solid var(--success-color)'; }

        const item = document.createElement('div');
        item.style.cssText = `background:#1a1a1a; padding:15px; border-radius:8px; border:${border}; opacity:${opacity}; display:flex; justify-content:space-between; align-items:center;`;
        
        item.innerHTML = `
            <div>
                <div style="color:${isToday ? 'gold' : '#fff'}; font-weight:bold;">${ev.title}</div>
                <div style="font-size:0.8em; color:#888;">${ev.event_day}/${ev.event_month} - ${ev.description_lore || ''}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.9em; color:var(--success-color); margin-bottom:5px;">+${ev.reward_amount} ${ev.reward_type}</div>
            </div>
        `;

        // Action Button
        if (isToday && !isClaimed) {
            const btn = document.createElement('button');
            btn.className = 'action-button small';
            btn.innerText = "Claim";
            btn.style.fontSize = "0.7em";
            btn.onclick = () => handleClaimEvent(ev.id, ev.reward_type, ev.reward_amount);
            item.lastElementChild.appendChild(btn);
        } else if (isClaimed) {
            item.lastElementChild.innerHTML += `<span style="font-size:0.7em; color:#aaa;">✓ CLAIMED</span>`;
        } else {
            item.lastElementChild.innerHTML += `<span style="font-size:0.7em; color:#444;">LOCKED</span>`;
        }

        list.appendChild(item);
    });
}


// ========================================================
// --- 7. MAIN ENTRY POINT (Tabs) ---
// ========================================================

export function renderMsGame() {
    if (!DOM_ELEMENTS.container) return;
    
    // One-time HTML Build
    if (!document.getElementById('ms-tabs')) {
        DOM_ELEMENTS.container.innerHTML = `
            <h2 class="screen-title" style="text-align:center; color:var(--primary-accent); margin-bottom:15px;">Rewards Hub</h2>
            
            <div id="ms-tabs" style="display:flex; justify-content:space-between; margin-bottom:20px; background:#222; border-radius:25px; padding:5px;">
                <button class="ms-tab-btn active" data-tab="vault" style="flex:1; padding:8px; background:transparent; border:none; border-radius:20px; color:#fff; cursor:pointer;">Vault</button>
                <button class="ms-tab-btn" data-tab="dice" style="flex:1; padding:8px; background:transparent; border:none; border-radius:20px; color:#888; cursor:pointer;">Dice</button>
                <button class="ms-tab-btn" data-tab="calendar" style="flex:1; padding:8px; background:transparent; border:none; border-radius:20px; color:#888; cursor:pointer;">Calendar</button>
            </div>

            <div id="ms-content-vault" class="ms-content"></div>
            <div id="ms-content-dice" class="ms-content hidden"></div>
            <div id="ms-content-calendar" class="ms-content hidden"></div>
        `;

        // Bind Tab Switching
        DOM_ELEMENTS.container.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Reset Styles
                document.querySelectorAll('.ms-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = '#888';
                });
                // Set Active
                e.target.classList.add('active');
                e.target.style.background = 'var(--primary-accent)';
                e.target.style.color = '#000';
                e.target.style.fontWeight = 'bold';

                // Show Content
                document.querySelectorAll('.ms-content').forEach(div => div.classList.add('hidden'));
                const tabName = e.target.dataset.tab;
                
                if (tabName === 'vault') {
                    document.getElementById('ms-content-vault').classList.remove('hidden');
                    renderVaultTab();
                } else if (tabName === 'dice') {
                    document.getElementById('ms-content-dice').classList.remove('hidden');
                    renderWheelTab();
                } else {
                    document.getElementById('ms-content-calendar').classList.remove('hidden');
                    renderCalendarTab();
                }
            });
        });
    }

    // Default Load
    renderVaultTab();
}
