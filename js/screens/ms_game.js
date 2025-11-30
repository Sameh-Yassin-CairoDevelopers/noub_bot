/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v6.0.0 (The Clean Merger)
 * Description: 
 * A strict integration of the original 'wheel.js' and original 'ms_game.js' 
 * into a single tabbed interface. 
 * 
 * CONTENTS:
 * 1. Idle Vault (Original Logic & UI)
 * 2. Fortune Dice (Original Logic & UI from wheel.js)
 * 3. Royal Calendar (Enhanced 4-State Logic)
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, playSound, openModal } from '../ui.js'; // playSound maps to available audio
import { refreshPlayerState } from '../auth.js';

const container = document.getElementById('ms-game-screen');
const ONE_SECOND = 1000;

// =============================================================================
// 1. ORIGINAL CONFIGURATIONS (AS SOURCE)
// =============================================================================

// From original ms_game.js
const IDLE_GENERATOR_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// From original wheel.js
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
// 2. STATE MANAGEMENT
// =============================================================================

let idleTimerInterval = null;
let isSpinning = false;

// =============================================================================
// 3. SHARED HELPERS
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

// =============================================================================
// 4. ORIGINAL VAULT LOGIC (From ms_game.js)
// =============================================================================

function calculateIdleDrop(level) {
    const config = IDLE_GENERATOR_CONFIG;
    const capacityMinutes = (config.BASE_CAPACITY_HOURS * 60) + ((level - 1) * config.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMinute = config.BASE_RATE_PER_MINUTE + ((level - 1) * config.RATE_INCREASE_PER_LEVEL);
    const ratePerMs = ratePerMinute / 60000; 
    const maxNoub = Math.floor(ratePerMinute * capacityMinutes);

    return {
        capacityMs: capacityMinutes * 60 * 1000,
        ratePerMinute: ratePerMinute,
        ratePerMs: ratePerMs,
        maxNoub: maxNoub,
        upgradeCost: Math.floor(config.UPGRADE_COST_BASE * Math.pow(config.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

async function handleClaimIdleDrop() {
    if (!state.currentUser) return;
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const stats = calculateIdleDrop(level);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeToCount = Math.min(elapsed, stats.capacityMs);
    const amount = Math.floor(timeToCount * stats.ratePerMs);

    if (amount < 1) return showToast("Vault is empty.", 'info');

    await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (profile.noub_score || 0) + amount,
        last_claim_time: new Date().toISOString()
    });

    playSound('claim_reward');
    showToast(`Collected ${amount} 🪙`, 'success');
    await api.addXp(state.currentUser.id, 1);
    
    await refreshPlayerState();
    renderVaultUI(); 
}

async function handleUpgradeVault(currentLevel, upgradeCost) {
    if ((state.playerProfile.noub_score || 0) < upgradeCost) return showToast("Insufficient Gold.", 'error');
    
    await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: currentLevel + 1
    });

    // Original sound intent (mapped to available sound if file missing)
    playSound('construction'); // Or 'click' if construction.mp3 is missing locally
    
    showToast(`Upgraded to Level ${currentLevel + 1}!`, 'success');
    await api.addXp(state.currentUser.id, 50);
    await refreshPlayerState();
    renderVaultUI();
}

// =============================================================================
// 5. ORIGINAL WHEEL LOGIC (From wheel.js)
// =============================================================================

async function runWheelSpin() {
    const spins = state.playerProfile.spin_tickets || 0;
    if (isSpinning || spins < SPIN_COST) return showToast('Not enough Tickets!', 'error');
    
    isSpinning = true;
    const btn = document.getElementById('wheel-spin-button');
    if (btn) btn.disabled = true;

    // 1. Deduct
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: spins - SPIN_COST });
    
    // 2. Animation (Original Flash)
    const diceEl = document.getElementById('dice-icon-display');
    const prizeDesc = document.getElementById('prize-description');
    
    if (prizeDesc) prizeDesc.textContent = "Rolling...";

    let frames = 0;
    const anim = setInterval(() => {
        const r = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        if (diceEl) {
            diceEl.textContent = r.icon;
            // RESTORED: The original Color Flash Logic
            diceEl.style.color = `hsl(${Math.random() * 360}, 70%, 70%)`; 
            diceEl.style.transform = `scale(${1 + Math.random() * 0.2})`;
        }
        frames++;
        if (frames > 20) {
            clearInterval(anim);
            finalizeSpin();
        }
    }, 80);
}

async function finalizeSpin() {
    const rollResult = Math.floor(Math.random() * 10) + 1;
    const prize = WHEEL_PRIZES.find(p => p.id === rollResult);

    let updates = {};
    if (prize.type === 'noub') updates.noub_score = (state.playerProfile.noub_score || 0) + prize.value;
    else if (prize.type === 'prestige') updates.prestige = (state.playerProfile.prestige || 0) + prize.value;
    else if (prize.type === 'ankh_premium') updates.ankh_premium = (state.playerProfile.ankh_premium || 0) + prize.value;
    else if (prize.type === 'spin_ticket') updates.spin_tickets = (state.playerProfile.spin_tickets || 0) + prize.value;
    else if (prize.type === 'card_pack') {
        const { data } = await api.fetchAllMasterCards();
        if (data) await api.addCardToPlayerCollection(state.currentUser.id, data[0].id); 
    }
    if (prize.type === 'jackpot') updates.prestige = (state.playerProfile.prestige || 0) + prize.value;

    if (Object.keys(updates).length > 0) await api.updatePlayerProfile(state.currentUser.id, updates);
    
    // RESTORED: Original Activity Log Call
    await api.logActivity(state.currentUser.id, 'WHEEL_ROLL', `Rolled and won ${prize.label}.`);

    const diceEl = document.getElementById('dice-icon-display');
    const prizeDesc = document.getElementById('prize-description');
    
    if (diceEl) {
        diceEl.textContent = prize.icon;
        diceEl.style.color = 'var(--primary-accent)';
        diceEl.style.transform = 'scale(1.5)';
    }
    if (prizeDesc) prizeDesc.textContent = `WIN: ${prize.label}`;

    playSound('reward_grand'); // Original Win Sound Intent
    showToast(`Won: ${prize.label}`, 'success');
    
    isSpinning = false;
    if (document.getElementById('wheel-spin-button')) document.getElementById('wheel-spin-button').disabled = false;

    await refreshPlayerState();
    renderWheelUI(); 
}

// =============================================================================
// 6. CALENDAR LOGIC (With 4-States)
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
    showToast('Reward Claimed!', 'success');
    await refreshPlayerState();
    renderCalendarContent();
}

// =============================================================================
// 7. UI RENDERERS (ORIGINAL LAYOUTS RESTORED)
// =============================================================================

function renderVaultUI() {
    const content = document.getElementById('tab-content-vault');
    if (!content) return;
    
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const stats = calculateIdleDrop(level);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeToCount = Math.min(elapsed, stats.capacityMs);
    const noubGenerated = Math.floor(timeToCount * stats.ratePerMs);
    const remainingMs = stats.capacityMs - timeToCount;
    const percent = (timeToCount / stats.capacityMs) * 100;
    const isFull = remainingMs <= 0;

    // Original HTML Structure for Vault
    content.innerHTML = `
        <div class="idle-generator-card game-container" style="text-align:center; padding:20px;">
            <div class="generator-header" style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                <h3 style="color:var(--primary-accent); margin:0;">Royal Vault (Lvl ${level})</h3>
                <div style="font-size:2.5em; margin-top:5px;">🏺</div>
            </div>
            
            <div class="generator-timer" style="margin-bottom:15px;">
                <div style="font-size:1.5em; font-weight:bold; color:${isFull ? 'var(--danger-color)' : '#fff'};">
                    ${noubGenerated} / ${stats.maxNoub} 🪙
                </div>
                <div style="font-size:0.8em; color:#aaa;">
                    ${isFull ? 'FULL' : formatTime(remainingMs)}
                </div>
            </div>
            
            <div class="progress-bar" style="height:10px; background:#333; border-radius:5px; margin-bottom:15px;">
                <div class="progress-bar-inner" style="width:${percent}%; height:100%; background:var(--success-color);"></div>
            </div>

            <div style="display: flex; gap: 10px; justify-content:center;">
                <button id="claim-idle-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''}>Claim</button>
                <button id="upgrade-idle-btn" class="action-button small" style="background:#444;">Upgrade (${stats.upgradeCost})</button>
            </div>
        </div>
    `;

    document.getElementById('claim-idle-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-btn').onclick = () => handleUpgradeIdleDrop(level, stats.upgradeCost);

    // Smart Update: Only update text/bar in next loop if simple, but full render ensures sync
    if (idleTimerInterval) clearInterval(idleTimerInterval);
    if (!isFull) idleTimerInterval = setInterval(renderVaultUI, 1000);
}

function renderWheelUI() {
    const content = document.getElementById('tab-content-dice');
    if (!content) return;

    const spins = profile.spin_tickets || 0;
    const profile = state.playerProfile;

    // Original HTML Structure from wheel.js
    content.innerHTML = `
        <div class="wheel-container game-container" style="text-align:center; padding:20px;">
            <h3 style="color:var(--primary-accent); margin-bottom:15px;">Fortune Dice</h3>
            
            <!-- Original ID used for CSS styling -->
            <div id="dice-result-container" class="dice-result-container" style="margin:0 auto 15px auto;">
                <span id="dice-icon-display" class="icon-lg" style="display:block; font-size:4em;">🎲</span>
            </div>
            
            <p id="prize-description" style="color:#aaa; margin-bottom:15px; min-height:20px;">Roll to win!</p>
            
            <p id="wheel-spins-left" class="balance-info" style="margin-bottom:15px;">Tickets: ${state.playerProfile.spin_tickets}</p>

            <button id="wheel-spin-button" class="action-button spin-button" ${isSpinning || state.playerProfile.spin_tickets < SPIN_COST ? 'disabled' : ''}>
                ROLL DICE (${SPIN_COST} 🎟️)
            </button>
            
            <button id="prize-info-btn" class="text-button" style="margin-top:10px;">View Prizes</button>
        </div>
    `;

    document.getElementById('wheel-spin-button').onclick = runWheelSpin;
    
    document.getElementById('prize-info-btn').onclick = () => {
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
                <h3>Prizes</h3>
                <ul style="list-style:none; padding:0; text-align:left; max-height:300px; overflow-y:auto;">
                    ${WHEEL_PRIZES.map(p => `<li style="padding:8px; border-bottom:1px solid #444;">${p.icon} ${p.label}</li>`).join('')}
                </ul>
            </div>
        `;
        modal.classList.remove('hidden');
    };
}

async function renderCalendarContent() {
    const content = document.getElementById('tab-content-calendar');
    if (!content) return;
    content.innerHTML = '<div class="loading-spinner"></div>';

    const [{ data: events }, { data: claims }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month').order('event_day'),
        api.supabaseClient.from('player_event_claims').select('*').eq('player_id', state.currentUser.id)
    ]);

    if (!events) return content.innerHTML = '<p>Calendar Offline.</p>';

    const claimSet = new Set(claims ? claims.map(c => c.event_id + '-' + c.claimed_year) : []);
    const todayDate = new Date();
    const currentYear = todayDate.getFullYear();
    todayDate.setHours(0,0,0,0);

    content.innerHTML = `<div style="display:flex; flex-direction:column; gap:10px;"></div>`;
    const list = content.querySelector('div');

    events.forEach(ev => {
        const evDate = new Date(currentYear, ev.event_month - 1, ev.event_day);
        evDate.setHours(0,0,0,0);
        const isClaimed = claimSet.has(ev.id + '-' + currentYear);
        
        let stateClass = '';
        let actionHTML = '';
        let borderColor = '#444';

        // --- 4-STATE LOGIC ---
        if (isClaimed) {
            stateClass = 'claimed';
            borderColor = 'var(--success-color)';
            actionHTML = `<span style="color:#aaa; font-size:0.7em;">✓ DONE</span>`;
        } else if (evDate.getTime() === todayDate.getTime()) {
            stateClass = 'claimable';
            borderColor = 'gold';
            actionHTML = `<button id="claim-ev-${ev.id}" class="action-button small">Claim</button>`;
        } else if (evDate < todayDate) {
            stateClass = 'missed';
            borderColor = 'var(--danger-color)';
            actionHTML = `<span style="color:var(--danger-color); font-size:0.7em;">✕ MISSED</span>`;
        } else {
            stateClass = 'wait';
            borderColor = '#666';
            actionHTML = `<span style="color:#888; font-size:0.7em;">⏳ WAIT</span>`;
        }

        const item = document.createElement('div');
        item.className = `event-card ${stateClass}`;
        item.style.cssText = `background:#1a1a1a; padding:12px; border-radius:8px; border-left:4px solid ${borderColor}; opacity:${stateClass==='claimed'||stateClass==='missed'?0.6:1}; display:flex; justify-content:space-between; align-items:center;`;

        item.innerHTML = `
            <div>
                <div style="font-weight:bold; color:${stateClass==='missed'?'#f88':'#fff'};">${ev.title}</div>
                <div style="font-size:0.75em; color:#888;">${ev.event_day}/${ev.event_month} - ${ev.description_lore || ''}</div>
            </div>
            <div style="text-align:right;">
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
// 8. MAIN TAB CONTROLLER (3-TAB SYSTEM)
// =============================================================================

export function renderMsGame() {
    if (!state.currentUser || !msGameContainer) return;
    
    // One-time Layout Build (3 Tabs)
    if (!document.getElementById('ms-tabs-ctrl')) {
        msGameContainer.innerHTML = `
            <h2 class="screen-title" style="text-align: center;">Rewards & Calendar</h2>
            
            <div id="ms-tabs-ctrl" style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; border-bottom:1px solid #333; padding-bottom:15px;">
                <button class="ms-tab-btn active" data-tab="vault" style="flex:1; padding:10px; background:#333; border:1px solid gold; color:gold; border-radius:10px;">Vault</button>
                <button class="ms-tab-btn" data-tab="dice" style="flex:1; padding:10px; background:transparent; border:1px solid #444; color:#888; border-radius:10px;">Dice</button>
                <button class="ms-tab-btn" data-tab="calendar" style="flex:1; padding:10px; background:transparent; border:1px solid #444; color:#888; border-radius:10px;">Calendar</button>
            </div>

            <div id="tab-content-vault" class="ms-view"></div>
            <div id="tab-content-dice" class="ms-view hidden"></div>
            <div id="tab-content-calendar" class="ms-view hidden"></div>
        `;

        // Bind Tab Switching
        msGameContainer.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // UI Reset
                msGameContainer.querySelectorAll('.ms-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.border = '1px solid #444';
                    b.style.color = '#888';
                });
                // UI Active
                e.target.classList.add('active');
                e.target.style.background = '#333';
                e.target.style.border = '1px solid gold';
                e.target.style.color = 'gold';

                // View Toggle
                msGameContainer.querySelectorAll('.ms-view').forEach(div => div.classList.add('hidden'));
                const tab = e.target.dataset.tab;
                
                if (tab === 'vault') {
                    document.getElementById('tab-content-vault').classList.remove('hidden');
                    renderVaultUI();
                } else if (tab === 'dice') {
                    document.getElementById('tab-content-dice').classList.remove('hidden');
                    if(idleGeneratorInterval) clearInterval(idleGeneratorInterval);
                    renderWheelUI();
                } else {
                    document.getElementById('tab-content-calendar').classList.remove('hidden');
                    if(idleGeneratorInterval) clearInterval(idleGeneratorInterval);
                    renderCalendarContent();
                }
            });
        });
    }

    // Default Render
    renderVaultUI();
}
