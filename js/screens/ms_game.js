/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v6.0.0 (3-Tabs Architecture: Vault | Dice | Calendar)
 * Description: 
 * - Tab 1: Passive Income (Idle Logic).
 * - Tab 2: Fortune Dice (Original Logic restored: HSL, Fixed Container, Log).
 * - Tab 3: Royal Calendar (4-State Logic: Wait/Missed/Claim/Claimed).
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, playSound, openModal } from '../ui.js'; // Removed triggerHaptic to match original requests if preferred, or keep if standard.
import { refreshPlayerState } from '../auth.js';

const msGameContainer = document.getElementById('ms-game-screen');
const ONE_SECOND = 1000;

// =============================================================================
// 1. CONFIGURATION
// =============================================================================

// --- Vault Config ---
const IDLE_GENERATOR_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// --- Wheel Config (Original Emojis) ---
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

// State
let idleGeneratorInterval = null;
let isSpinning = false;

// =============================================================================
// 2. HELPER FUNCTIONS
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
// 3. TAB 1 LOGIC: ROYAL VAULT
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

    await api.logActivity(state.currentUser.id, 'VAULT_CLAIM', `Collected ${amount} NOUB.`);
    
    playSound('claim_reward');
    showToast(`Collected ${amount} 🪙`, 'success');
    
    await api.addXp(state.currentUser.id, 1);
    await refreshPlayerState();
    renderVaultTab(); 
}

async function handleUpgradeIdleDrop(currentLevel, upgradeCost) {
    if ((state.playerProfile.noub_score || 0) < upgradeCost) return showToast("Insufficient Gold.", 'error');
    
    await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: currentLevel + 1
    });

    playSound('construction'); // Using available sound logic
    showToast(`Upgraded to Level ${currentLevel + 1}!`, 'success');
    await api.addXp(state.currentUser.id, 50);
    await refreshPlayerState();
    renderVaultTab();
}

function renderVaultTab() {
    const content = document.getElementById('ms-content-drop');
    if (!content) return;
    
    const profile = state.playerProfile;
    const level = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(level);
    const elapsed = Date.now() - new Date(profile.last_claim_time).getTime();
    const timeToCount = Math.min(elapsed, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);
    const remainingMs = generatorState.capacityMs - timeToCount;
    const percent = (timeToCount / generatorState.capacityMs) * 100;
    const isFull = remainingMs <= 0;

    // Using textContent update logic where possible would be better, 
    // but for tab switching we re-render HTML to ensure clean state.
    content.innerHTML = `
        <div class="idle-generator-card game-container" style="margin-bottom: 20px; padding: 15px;">
            <div class="generator-header" style="border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 10px; text-align: center;">
                <h3 style="margin:0; color: var(--primary-accent); font-size:1.1em;">Royal Vault (Lvl ${level})</h3>
                <div style="font-size: 2em; margin-top: 5px;">🏺</div>
            </div>
            
            <div class="generator-timer" style="text-align: center; margin-bottom: 10px;">
                <div style="font-size: 1.5em; font-weight: bold; color: ${isFull ? 'var(--danger-color)' : '#fff'};">
                    ${noubGenerated} / ${generatorState.maxNoub} 🪙
                </div>
                <div style="font-size: 0.7em; color: #aaa;">
                    ${isFull ? 'STORAGE FULL' : `Fills in: ${formatTime(remainingMs)}`}
                </div>
            </div>
            
            <div class="progress-bar" style="height:10px; background: #333; border-radius:5px; margin-bottom: 15px;">
                <div class="progress-bar-inner" style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #4caf50, var(--primary-accent)); transition: width 1s linear;"></div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="claim-idle-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''} style="flex:2;">Claim Gold</button>
                <button id="upgrade-idle-btn" class="action-button small" style="background:#444; border:1px solid #666; flex:1; font-size:0.8em;">Upgrade (${generatorState.upgradeCost}🪙)</button>
            </div>
        </div>
    `;

    document.getElementById('claim-idle-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-btn').onclick = () => handleUpgradeIdleDrop(level, generatorState.upgradeCost);

    // Timer Loop (Only runs if this function is called repeatedly)
    // The main renderMsGame handles the interval logic to avoid dupes
}

// =============================================================================
// 4. TAB 2 LOGIC: FORTUNE DICE (Restored Original Logic)
// =============================================================================

async function runWheelSpin() {
    const spins = state.playerProfile.spin_tickets || 0;
    if (isSpinning || spins < SPIN_COST) return showToast('Need Tickets!', 'error');
    
    isSpinning = true;
    const btn = document.getElementById('wheel-spin-button');
    if (btn) btn.disabled = true;

    // 1. Deduct Ticket
    await api.updatePlayerProfile(state.currentUser.id, { spin_tickets: spins - SPIN_COST });
    
    // 2. Animation (Original HSL Flash)
    const diceEl = document.getElementById('dice-icon-display');
    const prizeDesc = document.getElementById('prize-description');
    
    if(prizeDesc) prizeDesc.textContent = "Rolling...";
    
    let frames = 0;
    const anim = setInterval(() => {
        const r = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
        if (diceEl) {
            diceEl.textContent = r.icon;
            // RESTORED: HSL Flash
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
    
    // RESTORED: Activity Log
    await api.logActivity(state.currentUser.id, 'WHEEL_ROLL', `Rolled and won ${prize.label}.`);

    const diceEl = document.getElementById('dice-icon-display');
    const prizeDesc = document.getElementById('prize-description');
    
    if (diceEl) {
        diceEl.textContent = prize.icon;
        diceEl.style.color = 'var(--primary-accent)'; // Reset color
        diceEl.style.transform = 'scale(1.5)';
    }
    if (prizeDesc) prizeDesc.textContent = `WIN: ${prize.label}`;

    playSound('reward_grand'); // Winning Sound
    showToast(`Won: ${prize.label}`, 'success');
    
    isSpinning = false;
    if (document.getElementById('wheel-spin-button')) document.getElementById('wheel-spin-button').disabled = false;

    await refreshPlayerState();
    renderWheelContent();
}

function renderWheelContent() {
    const content = document.getElementById('ms-content-dice');
    if (!content) return;

    const spins = state.playerProfile.spin_tickets || 0;

    // RESTORED: Using 'dice-result-container' ID for strict CSS adherence
    content.innerHTML = `
        <div class="wheel-container game-container" style="text-align: center; padding: 20px;">
            <h3 style="color: var(--primary-accent); margin-bottom: 15px;">Fortune Dice</h3>
            
            <div id="dice-result-container" class="dice-result-container" style="margin: 0 auto 15px auto;">
                <span id="dice-icon-display" class="icon-lg">🎲</span>
            </div>
            
            <p id="prize-description" style="color: #aaa; margin-bottom: 15px; min-height: 20px;">Roll to win rewards!</p>
            
            <p id="wheel-spins-left" class="balance-info">Tickets: ${spins}</p>

            <button id="wheel-spin-button" class="action-button spin-button" ${isSpinning || spins < SPIN_COST ? 'disabled' : ''}>
                ROLL DICE (${SPIN_COST} 🎟️)
            </button>
            
            <button id="prize-info-btn" class="text-button" style="margin-top: 10px;">View Prizes</button>
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
                    ${WHEEL_PRIZES.map(p => `<li style="padding:8px; border-bottom:1px solid #444; font-size:0.9em;">${p.icon} ${p.label}</li>`).join('')}
                </ul>
            </div>
        `;
        modal.classList.remove('hidden');
    };
}

// =============================================================================
// 5. TAB 3 LOGIC: CALENDAR (4-State Logic)
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

async function renderCalendarContent() {
    const content = document.getElementById('ms-content-events');
    if (!content) return;
    content.innerHTML = '<div class="loading-spinner"></div>';

    const [{ data: events }, { data: claims }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month').order('event_day'),
        api.supabaseClient.from('player_event_claims').select('*').eq('player_id', state.currentUser.id)
    ]);

    if (!events) return content.innerHTML = '<p>Offline.</p>';

    const claimSet = new Set(claims ? claims.map(c => c.event_id + '-' + c.claimed_year) : []);
    const todayDate = new Date();
    const currentYear = todayDate.getFullYear();
    todayDate.setHours(0,0,0,0);

    content.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;"></div>`;
    const list = content.querySelector('div');

    events.forEach(ev => {
        const evDate = new Date(currentYear, ev.event_month - 1, ev.event_day);
        evDate.setHours(0,0,0,0);

        const isClaimed = claimSet.has(ev.id + '-' + currentYear);
        let stateClass = '';
        let actionHTML = '';
        let borderColor = '#333';

        // --- 4 STATES LOGIC ---
        if (isClaimed) {
            stateClass = 'claimed';
            borderColor = 'var(--success-color)';
            actionHTML = `<span style="color:#aaa; font-size:0.7em;">✓ RECEIVED</span>`;
        } else if (evDate.getTime() === todayDate.getTime()) {
            stateClass = 'claimable';
            borderColor = 'gold';
            actionHTML = `<button id="claim-ev-${ev.id}" class="action-button small" style="padding:4px 10px;">Claim</button>`;
        } else if (evDate < todayDate) {
            // RESTORED: Missed Logic
            stateClass = 'missed';
            borderColor = 'var(--danger-color)';
            actionHTML = `<span style="color:var(--danger-color); font-size:0.7em;">✕ MISSED</span>`;
        } else {
            // RESTORED: Wait Logic
            stateClass = 'locked';
            borderColor = '#555';
            actionHTML = `<span style="color:#666; font-size:0.7em;">⏳ WAIT</span>`;
        }

        const item = document.createElement('div');
        item.style.cssText = `background:#1a1a1a; padding:12px; border-radius:8px; border-left:4px solid ${borderColor}; opacity:${stateClass==='claimed'||stateClass==='missed'?0.6:1}; display:flex; justify-content:space-between; align-items:center;`;

        item.innerHTML = `
            <div>
                <div style="font-weight:bold; color:${stateClass==='missed'?'#f88':'#fff'};">${ev.title}</div>
                <div style="font-size:0.75em; color:#888;">${ev.event_day}/${ev.event_month} - ${ev.description_lore || ''}</div>
            </div>
            <div style="text-align:right; min-width:70px;">
                <div style="font-size:0.8em; color:var(--success-color); margin-bottom:5px;">+${ev.reward_amount}</div>
                ${actionHTML}
            </div>
        `;
        
        if (stateClass === 'claimable') {
            setTimeout(() => {
                const btn = document.getElementById(`claim-ev-${ev.id}`);
                if(btn) btn.onclick = () => handleClaimEvent(ev);
            }, 0);
        }

        list.appendChild(item);
    });
}

// =============================================================================
// 6. MAIN ENTRY POINT & TAB SWITCHER
// =============================================================================

export function renderMsGame() {
    if (!state.currentUser || !msGameContainer) return;
    
    // Setup 3-Tabs Structure
    if (!document.getElementById('ms-tabs-ctrl')) {
        msGameContainer.innerHTML = `
            <h2 class="screen-title" style="text-align: center;">Royal Rewards</h2>
            
            <div id="ms-tabs-ctrl" style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 20px; border-bottom:1px solid #333; padding-bottom:15px;">
                <button class="ms-tab-btn active" data-target="drop" style="flex:1; padding:8px 0; background:#333; border:1px solid gold; color:gold; border-radius:10px; cursor:pointer; font-size:0.9em;">Vault</button>
                <button class="ms-tab-btn" data-target="dice" style="flex:1; padding:8px 0; background:transparent; border:1px solid #444; color:#888; border-radius:10px; cursor:pointer; font-size:0.9em;">Dice</button>
                <button class="ms-tab-btn" data-target="events" style="flex:1; padding:8px 0; background:transparent; border:1px solid #444; color:#888; border-radius:10px; cursor:pointer; font-size:0.9em;">Calendar</button>
            </div>

            <div id="ms-content-drop" class="ms-view"></div>
            <div id="ms-content-dice" class="ms-view hidden"></div>
            <div id="ms-content-events" class="ms-view hidden"></div>
        `;

        // Bind Switcher
        msGameContainer.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Styles
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

                // Views
                msGameContainer.querySelectorAll('.ms-view').forEach(div => div.classList.add('hidden'));
                const target = e.target.dataset.target;
                
                // Logic Switch & Interval Cleanup
                if (target === 'drop') {
                    document.getElementById('ms-content-drop').classList.remove('hidden');
                    renderVaultTab();
                    if (!idleGeneratorInterval) idleGeneratorInterval = setInterval(renderVaultTab, 1000);
                } else if (target === 'dice') {
                    document.getElementById('ms-content-dice').classList.remove('hidden');
                    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval); // Save CPU
                    renderWheelContent();
                } else {
                    document.getElementById('ms-content-events').classList.remove('hidden');
                    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval); // Save CPU
                    renderCalendarContent();
                }
            });
        });
    }

    // Default Open
    renderVaultTab();
    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
    idleGeneratorInterval = setInterval(renderVaultTab, 1000);
}
