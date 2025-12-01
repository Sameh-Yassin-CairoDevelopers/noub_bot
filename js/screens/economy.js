/*
 * Filename: js/screens/economy.js
 * Version: NOUB v5.0.0 (Stable Core)
 * Author: Sameh Yassin & Engineering Partner
 * 
 * -----------------------------------------------------------------------------
 * ACADEMIC DOCUMENTATION & ARCHITECTURE OVERVIEW
 * -----------------------------------------------------------------------------
 * 
 * 1. Module Responsibility:
 *    This module acts as the "Economic Controller" for the application. It manages
 *    the state lifecycle of production facilities (Factories), resource generation,
 *    and inventory management.
 * 
 * 2. Data Flow Architecture:
 *    [Supabase DB] -> [API Layer] -> [Local State Aggregation] -> [DOM Rendering]
 *    - We use a "Master-Slave" data merging technique: MasterFactories (Static Data)
 *      are merged with PlayerFactories (Dynamic Data) using a Hash Map (O(1) lookup)
 *      to ensure performance and prevent data duplication.
 * 
 * 3. Defensive Programming Strategy:
 *    - Null-Safety: All external data inputs (images, nested objects) are validated
 *      before rendering to prevent 'undefined' errors in the UI.
 *    - Fallbacks: Default assets are provided for missing resources.
 * 
 * 4. Time Management:
 *    - Uses `requestAnimationFrame` for high-performance, non-blocking UI updates
 *      of production timers, ensuring synchronization with the device clock.
 * 
 * -----------------------------------------------------------------------------
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo, playSound } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 
import { trackTaskProgress } from './tasks.js';

// ========================================================
// --- 1. SYSTEM CONSTANTS & CONFIGURATION ---
// ========================================================

// Multipliers for Expert Cards based on Level (Index 0 = Lvl 1)
// ========================================================
// --- 1. CONFIGURATION & CONSTANTS (CALIBRATED) ---
// ========================================================

// Expert Curves: Level 1 (20%) -> Level 5 (50%) -> Level 10 (95%)
const EXPERT_EFFECTS = {
    'Imhotep': { 
        type: 'TIME_REDUCTION_PERCENT', 
        // Levels: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
        values: [20, 25, 30, 40, 50, 60, 70, 80, 90, 95] 
    },
    'Osiris (Underworld)': { 
        type: 'TIME_REDUCTION_PERCENT', 
        values: [20, 25, 30, 40, 50, 60, 70, 80, 90, 95] 
    },
    'Ptah (Creator)': { 
        type: 'EXTRA_RESOURCE_CHANCE', 
        // Chance to double output: 15% start -> 60% max
        values: [15, 20, 25, 30, 35, 40, 45, 50, 55, 60] 
    }
};

const TIME_CONSTANTS = {
    ONE_MINUTE_MS: 60000,
    ONE_SECOND_MS: 1000
};

const UPGRADE_CONFIG = {
    UNLOCK_LEVEL_SPECIALIZATION: 15,
    COST: 500,
    MATERIAL_NAME: 'Limestone Block',
    MATERIAL_QTY: 10,
    MAX_LEVEL: 10
};

const SPECIALIZATION_MAP = {
    1: [7, 8, 9],   // Guild A
    2: [10, 11, 12], // Guild B
    3: [13, 14, 15]  // Guild C
};

// Cached DOM Elements for Performance
const UI = {
    resources: document.getElementById('resources-container'),
    workshops: document.getElementById('workshops-container'),
    modal: document.getElementById('production-modal'),
    stock: {
        resources: document.getElementById('stock-resources-container'),
        materials: document.getElementById('stock-materials-container'),
        goods: document.getElementById('stock-goods-container')
    }
};

// Global Timer Reference (to cancel animation frames on close)
let timerAnimationFrameId = null;

// ========================================================
// --- 2. HELPER UTILITIES ---
// ========================================================

/**
 * Formats milliseconds into HH:MM:SS string.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} Formatted time.
 */
function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / TIME_CONSTANTS.ONE_SECOND_MS);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// ========================================================
// --- 3. SPECIALIZATION LOGIC (Guilds) ---
// ========================================================

async function handleSelectSpecialization(pathId) {
    if (!state.currentUser) return;
    showToast('Initiating Guild Protocol...', 'info');
    
    const { error } = await api.unlockSpecialization(state.currentUser.id, pathId);
    if (error) return showToast('Protocol Error: Failed to unlock.', 'error');

    const factoryIds = SPECIALIZATION_MAP[pathId];
    if (factoryIds) {
        for (const fid of factoryIds) await api.buildFactory(state.currentUser.id, fid);
    }
    
    await refreshPlayerState(); 
    window.closeModal('specialization-choice-modal');
    renderProduction();
}

function renderSpecializationChoice() {
    const modalId = 'specialization-choice-modal';
    let modal = document.getElementById(modalId);
    // Defensive check: If modal HTML is missing, inject it or return
    if (!modal) return;

    api.fetchSpecializationPaths().then(({ data: paths }) => {
        if (!paths) return;
        
        // Filter paths user already has
        const owned = state.specializations || new Map();
        const available = paths.filter(p => !owned.has(p.id));
        if (available.length === 0) return;

        modal.innerHTML = `
            <div class="modal-content" style="text-align:center;">
                <h2 style="color:var(--primary-accent);">Guild Selection</h2>
                <p style="color:#ccc; font-size:0.9em; margin-bottom:15px;">Select your specialized crafting path.</p>
                <div style="display:grid; gap:10px;">
                    ${available.map(p => `
                        <div class="specialization-card" onclick="window.selectSpec('${p.id}')" 
                             style="background:#222; border:1px solid #444; padding:15px; border-radius:8px; cursor:pointer;">
                            <h3 style="margin:0; color:var(--accent-blue);">${p.name}</h3>
                            <p style="font-size:0.8em; color:#888;">${p.description}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        // Attach global handler for HTML onclick
        window.selectSpec = handleSelectSpecialization;
        openModal(modalId);
    });
}

// ========================================================
// --- 4. TRANSACTION LOGIC (Build, Upgrade) ---
// ========================================================

async function handleBuildFactory(masterFactory) {
    const cost = masterFactory.build_cost_noub || 1000;
    if ((state.playerProfile.noub_score || 0) < cost) {
        return showToast(`Insufficient Funds. Need ${cost} 🪙`, 'error');
    }

    if (!confirm(`Construct ${masterFactory.name} for ${cost} NOUB?`)) return;

    const { error } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - cost
    });
    if (error) return showToast('Transaction Failed.', 'error');

    await api.buildFactory(state.currentUser.id, masterFactory.id);
    
    playSound('click'); // Reverting to standard sound to avoid 404
    showToast('Construction Complete.', 'success');
    await refreshPlayerState();
    renderProduction();
}

async function executeFactoryUpgrade(playerFactory) {
    if (playerFactory.level >= UPGRADE_CONFIG.MAX_LEVEL) return showToast('Max Level.', 'info');

    // Check Materials
    const mat = Array.from(state.inventory.values()).find(i => i.details.name === UPGRADE_CONFIG.MATERIAL_NAME);
    const matQty = mat?.qty || 0;
    const money = state.playerProfile.noub_score || 0;

    if (!mat || matQty < UPGRADE_CONFIG.MATERIAL_QTY || money < UPGRADE_CONFIG.COST) {
        return showToast(`Need ${UPGRADE_CONFIG.COST}🪙 + ${UPGRADE_CONFIG.MATERIAL_QTY} Blocks`, 'error');
    }

    showToast('Upgrading...', 'info');
    
    await api.updatePlayerProfile(state.currentUser.id, { noub_score: money - UPGRADE_CONFIG.COST });
    await api.updateItemQuantity(state.currentUser.id, mat.details.id, matQty - UPGRADE_CONFIG.MATERIAL_QTY);
    await api.updatePlayerFactoryLevel(playerFactory.id, playerFactory.level + 1);
    await api.addXp(state.currentUser.id, 20);

    showToast(`Upgraded to Level ${playerFactory.level + 1}!`, 'success');
    await refreshPlayerState();
    renderProduction();
}

// ========================================================
// --- 5. PRODUCTION CORE (Start, Timer, Claim) ---
// ========================================================

async function handleStartProduction(factoryId, recipes) {
    // 1. Validate Resources
    for (const r of recipes) {
        const stock = state.inventory.get(r.items.id)?.qty || 0;
        if (stock < r.input_quantity) return showToast(`Missing Resource: ${r.items.name}`, 'error');
    }

    // 2. Deduct Resources
    for (const r of recipes) {
        const stock = state.inventory.get(r.items.id)?.qty || 0;
        await api.updateItemQuantity(state.currentUser.id, r.items.id, stock - r.input_quantity);
    }

    // 3. Start Logic
    const now = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, now);
    
    if (error) return showToast('Server Error.', 'error');
    
    showToast('Production Started.', 'success');
    await refreshPlayerState();
    window.closeModal('production-modal'); // Close to refresh state correctly
    renderProduction();
}

async function handleClaimProduction(playerFactory, outputItem) {
    showToast('Collecting...', 'info');
    
    let qty = 1;
    // Expert Bonus Logic
    const expert = playerFactory.player_cards;
    if (expert && EXPERT_EFFECTS[expert.cards.name]?.type === 'EXTRA_RESOURCE_CHANCE') {
        const chance = EXPERT_EFFECTS[expert.cards.name].values[Math.min(expert.level-1, 4)];
        if (Math.random() * 100 < chance) {
            qty = 2;
            showToast('Expert Bonus: Double Output!', 'success');
        }
    }

    const currentStock = state.inventory.get(outputItem.id)?.qty || 0;
    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, currentStock + qty);
    
    if (error) return showToast('Claim Error.', 'error');

    playSound('claim_reward');
    await trackDailyActivity('resources', qty, outputItem.name);
    await trackTaskProgress('production_claim', 1);
    await api.addXp(state.currentUser.id, 5);

    showToast(`Received ${qty}x ${outputItem.name}`, 'success');
    await refreshPlayerState();
    window.closeModal('production-modal');
    renderProduction();
}

// ========================================================
// --- 6. UI RENDERERS (Atomic & Modular) ---
// ========================================================

/**
 * Updates the live timer on both the Dashboard Card and the Modal.
 */
function updateLiveTimer(factory, totalTimeMs) {
    const cardEl = document.getElementById(`factory-card-${factory.factories.id}`);
    const modalTimerEl = document.querySelector('#production-modal .prod-timer');

    if (!cardEl && !modalTimerEl) return; // Stop if elements don't exist

    const startTime = new Date(factory.production_start_time).getTime();
    const now = Date.now();
    const elapsed = now - startTime;
    const remaining = Math.max(0, totalTimeMs - elapsed);
    const percent = Math.min(100, (elapsed / totalTimeMs) * 100);
    const isDone = remaining <= 0;

    // Update Card on Grid
    if (cardEl) {
        const status = cardEl.querySelector('.status');
        const bar = cardEl.querySelector('.progress-bar-inner');
        if (isDone) {
            status.textContent = "READY";
            status.style.color = "var(--success-color)";
        } else {
            status.textContent = formatTime(remaining);
            status.style.color = "#aaa";
        }
        if (bar) bar.style.width = `${percent}%`;
    }

    // Update Modal (if open)
    if (modalTimerEl) {
        const mTime = modalTimerEl.querySelector('.time-left');
        const mBar = modalTimerEl.querySelector('.progress-bar-inner');
        if (isDone) {
            if (mTime) mTime.innerHTML = "<span style='color:#0f0'>COMPLETED</span>";
        } else {
            if (mTime) mTime.textContent = formatTime(remaining);
        }
        if (mBar) mBar.style.width = `${percent}%`;
    }

    if (!isDone) {
        timerAnimationFrameId = requestAnimationFrame(() => updateLiveTimer(factory, totalTimeMs));
    }
}

function openProductionModal(playerFactory, outputItem) {
    // 1. Data Validation (Prevent Crash)
    if (!outputItem) outputItem = { id: 0, name: 'Unknown', image_url: 'images/default_item.png' };
    
    const factory = playerFactory.factories;
    const expert = playerFactory.player_cards;
    
    // 2. Calculate Duration (with Expert Buffs)
    let duration = factory.base_production_time * TIME_CONSTANTS.ONE_MINUTE_MS;
    if (expert && EXPERT_EFFECTS[expert.cards.name]?.type === 'TIME_REDUCTION_PERCENT') {
        const reduction = EXPERT_EFFECTS[expert.cards.name].values[Math.min(expert.level-1, 4)];
        duration -= duration * (reduction / 100);
    }

    // 3. Recipes UI
    const recipes = factory.factory_recipes || [];
    let canProduce = true;
    const ingredientsHTML = recipes.map(r => {
        const stock = state.inventory.get(r.items.id)?.qty || 0;
        if (stock < r.input_quantity) canProduce = false;
        return `
            <div class="prod-item" style="text-align:center;">
                <img src="${r.items.image_url || 'images/default_item.png'}" style="width:35px;">
                <div style="font-size:0.7em;">${r.input_quantity}x ${r.items.name}</div>
                <div style="font-size:0.6em; color:${stock >= r.input_quantity ? '#0f0':'#f00'}">Own: ${stock}</div>
            </div>
        `;
    }).join('') || '<div style="font-size:0.8em; color:#888;">No Inputs Required</div>';

    // 4. Action Buttons
    const isRunning = !!playerFactory.production_start_time;
    let timeLeft = 0;
    if (isRunning) {
        const elapsed = Date.now() - new Date(playerFactory.production_start_time).getTime();
        timeLeft = Math.max(0, duration - elapsed);
    }

    let actionBtn = '';
    if (isRunning) {
        if (timeLeft <= 0) {
            actionBtn = `<button id="claim-btn" class="action-button" style="background:var(--success-color);">Collect Output</button>`;
        } else {
            actionBtn = `<button class="action-button" disabled style="opacity:0.5;">Working...</button>`;
        }
    } else {
        actionBtn = `<button id="start-btn" class="action-button" ${canProduce ? '' : 'disabled style="opacity:0.5;"'}>Start Production</button>`;
    }

    // 5. Expert Slot UI
    let expertHTML = '';
    if (expert) {
        expertHTML = `
            <div class="expert-slot" style="margin-top:15px; border-top:1px solid #444; padding-top:10px;">
                <div style="font-size:0.8em; color:#aaa; margin-bottom:5px;">Assigned Expert</div>
                <div style="display:flex; align-items:center; justify-content:space-between; background:#222; padding:8px; border-radius:6px; border:1px solid var(--primary-accent);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${expert.cards.image_url}" style="width:40px; border-radius:4px;">
                        <div>
                            <div style="color:#fff; font-size:0.9em;">${expert.cards.name}</div>
                            <div style="color:#0f0; font-size:0.7em;">Lvl ${expert.level}</div>
                        </div>
                    </div>
                    <button id="dismiss-btn" class="action-button small danger" style="padding:4px 8px; width:auto;">Dismiss</button>
                </div>
            </div>
        `;
    } else {
        expertHTML = `
            <div style="margin-top:15px; border-top:1px solid #444; padding-top:10px;">
                <div style="border:1px dashed #666; border-radius:6px; padding:15px; text-align:center; color:#888; font-size:0.8em;">
                    No Expert Assigned<br>
                    <span style="color:var(--primary-accent); cursor:pointer; text-decoration:underline;" id="assign-btn">Assign from Deck</span>
                </div>
            </div>
        `;
    }

    // 6. Upgrade UI
    const canUpgrade = playerFactory.level < UPGRADE_CONFIG.MAX_LEVEL;
    const upgradeHTML = `
        <div style="margin-top:15px; text-align:center; font-size:0.8em;">
            <hr style="border:0; border-top:1px solid #333; margin:10px 0;">
            <div style="display:flex; justify-content:space-between; color:#aaa;">
                <span>Lvl ${playerFactory.level} / ${UPGRADE_CONFIG.MAX_LEVEL}</span>
                <span>Cost: ${UPGRADE_CONFIG.COST} 🪙</span>
            </div>
            <button id="upgrade-btn" class="text-button" ${canUpgrade ? '' : 'disabled'} style="width:100%; margin-top:5px; color:var(--accent-blue);">
                ${canUpgrade ? '⬆ Upgrade Factory' : 'Max Level Reached'}
            </button>
        </div>
    `;

    // 7. Assemble Modal
    UI.modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('production-modal')">&times;</button>
            
            <div style="text-align:center; margin-bottom:15px;">
                <img src="${factory.image_url || 'images/default_building.png'}" style="width:60px; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.5);">
                <h3 style="color:var(--primary-accent); margin:5px 0;">${factory.name}</h3>
            </div>
            
            <div class="prod-modal-body">
                <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    ${ingredientsHTML}
                    <span style="font-size:1.5em; color:#666;">➜</span>
                    <div style="text-align:center;">
                        <img src="${outputItem.image_url || 'images/default_item.png'}" style="width:40px;">
                        <div style="font-size:0.7em;">${outputItem.name}</div>
                    </div>
                </div>
                
                <div class="prod-timer" style="margin-bottom:15px;">
                    ${isRunning ? `<div class="time-left" style="text-align:center; font-weight:bold; margin-bottom:5px;">${formatTime(timeLeft)}</div>` : ''}
                    <div class="progress-bar" style="background:#333; height:8px; border-radius:4px; overflow:hidden;">
                        <div class="progress-bar-inner" style="height:100%; width:${isRunning ? ((duration - timeLeft)/duration)*100 : 0}%; background:var(--success-color);"></div>
                    </div>
                </div>
                
                ${actionBtn}
                ${expertHTML}
                ${upgradeHTML}
            </div>
        </div>
    `;
    openModal('production-modal');

    // 8. Bind Handlers
    document.getElementById('start-btn')?.addEventListener('click', () => handleStartProduction(playerFactory.id, recipes));
    document.getElementById('claim-btn')?.addEventListener('click', () => handleClaimProduction(playerFactory, outputItem));
    document.getElementById('assign-btn')?.addEventListener('click', () => openExpertSelector(playerFactory.id));
    document.getElementById('dismiss-btn')?.addEventListener('click', () => unassignExpert(playerFactory.id));
    document.getElementById('upgrade-btn')?.addEventListener('click', () => {
        window.closeModal('production-modal');
        executeFactoryUpgrade(playerFactory);
    });
}

// ========================================================
// --- 7. EXPERT MANAGEMENT UI ---
// ========================================================

async function openExpertSelector(factoryId) {
    const [{ data: cards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    const busyCards = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));
    
    // Filter: Unlocked, Not Busy, Not Soul Card
    const candidates = cards.filter(c => !busyCards.has(c.instance_id) && c.card_id !== 9999 && !c.is_locked);

    // Create Temp Modal
    const modalId = 'expert-selector';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    const listHTML = candidates.map(c => `
        <div onclick="window.selectExpert('${factoryId}', '${c.instance_id}')" 
             style="background:#222; padding:10px; border-radius:6px; margin-bottom:5px; cursor:pointer; display:flex; align-items:center; gap:10px; border:1px solid #444;">
            <img src="${c.cards.image_url || 'images/default_card.png'}" style="width:40px;">
            <div>
                <div style="color:#fff;">${c.cards.name}</div>
                <div style="font-size:0.7em; color:#aaa;">Lvl ${c.level} • Power ${c.power_score}</div>
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <h3>Assign Expert</h3>
            <div style="max-height:50vh; overflow-y:auto; margin-top:15px;">
                ${candidates.length ? listHTML : '<p style="text-align:center; color:#666;">No available experts.</p>'}
            </div>
        </div>
    `;
    openModal(modalId);
}

// Exposed Handler
window.selectExpert = async (fid, cid) => {
    window.closeModal('expert-selector');
    window.closeModal('production-modal');
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: cid })
        .eq('id', fid);

    if (!error) {
        showToast('Expert Assigned', 'success');
        await refreshPlayerState();
        renderProduction();
    } else {
        showToast('Assignment Error', 'error');
    }
};

async function unassignExpert(fid) {
    if (!confirm("Remove expert?")) return;
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: null })
        .eq('id', fid);
        
    if (!error) {
        showToast('Expert Removed', 'success');
        await refreshPlayerState();
        window.closeModal('production-modal');
        renderProduction();
    }
}

// ========================================================
// --- 8. MAIN RENDER LOOP ---
// ========================================================

export async function renderProduction() {
    if (!state.currentUser) return;
    
    // Specialization Gate
    if ((state.playerProfile.level || 1) >= UPGRADE_CONFIG.UNLOCK_LEVEL_SPECIALIZATION) {
        if (!state.specializations || state.specializations.size === 0) {
            renderSpecializationChoice();
            return; 
        }
    }

    UI.resources.innerHTML = '<div class="loading-spinner"></div>';
    UI.workshops.innerHTML = '';

    const [{ data: pFacts }, { data: mFacts }] = await Promise.all([
        api.fetchPlayerFactories(state.currentUser.id),
        api.fetchAllMasterFactories()
    ]);

    if (!pFacts || !mFacts) return;

    UI.resources.innerHTML = '';
    const pFactMap = new Map(pFacts.map(pf => [pf.factories.id, pf]));
    const pLevel = state.playerProfile.level || 1;

    // Clear any running timers
    if (timerAnimationFrameId) cancelAnimationFrame(timerAnimationFrameId);

    mFacts.sort((a,b) => a.required_level - b.required_level).forEach(master => {
        const isOwned = pFactMap.has(master.id);
        const pf = pFactMap.get(master.id);
        const container = master.type === 'RESOURCE' ? UI.resources : UI.workshops;
        const card = document.createElement('div');
        card.className = 'building-card';
        card.id = `factory-card-${master.id}`;

        if (isOwned) {
            // Robust access to output item via Join or fallback
            const output = pf.factories.items || { name: 'Product', image_url: 'images/default_item.png', id: pf.factories.output_item_id };
            
            const expertBadge = pf.assigned_card_instance_id 
                ? `<div class="expert-badge" style="position:absolute; top:5px; right:5px; font-size:1.2em; text-shadow:0 0 5px gold;">⭐</div>` 
                : '';

            card.innerHTML = `
                ${expertBadge}
                <img src="${master.image_url || 'images/default_building.png'}" style="width:100%; border-radius:6px;">
                <h4>${master.name}</h4>
                <div class="level">Lvl ${pf.level}</div>
                <div class="status" style="font-weight:bold; color:${pf.production_start_time ? 'var(--accent-blue)' : 'var(--success-color)'}">
                    ${pf.production_start_time ? 'Working' : 'Ready'}
                </div>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:0%"></div></div>
            `;
            card.onclick = () => openProductionModal(pf, output);

            // Init Timer
            if (pf.production_start_time) {
                // Calculate duration with potential expert buffs
                let duration = master.base_production_time * TIME_CONSTANTS.ONE_MINUTE_MS;
                const expert = pf.player_cards;
                if (expert && EXPERT_EFFECTS[expert.cards.name]?.type === 'TIME_REDUCTION_PERCENT') {
                    const red = EXPERT_EFFECTS[expert.cards.name].values[Math.min(expert.level-1, 4)];
                    duration -= duration * (red/100);
                }
                updateLiveTimer(pf, duration);
            }

        } else {
            const unlockable = pLevel >= master.required_level;
            card.classList.add(unlockable ? 'unlockable' : 'locked');
            card.innerHTML = `
                <img src="${master.image_url || 'images/default_building.png'}" style="width:100%; filter:grayscale(${unlockable?0:1}); border-radius:6px;">
                <h4>${master.name}</h4>
                <div class="status" style="margin-top:5px; color:${unlockable?'#fff':'#888'}; font-size:0.8em;">
                    ${unlockable ? `Build: ${master.build_cost_noub} 🪙` : `Lvl ${master.required_level}`}
                </div>
            `;
            if (unlockable) card.onclick = () => handleBuildFactory(master);
        }
        container.appendChild(card);
    });

    renderStock();
}

function renderStock() {
    const fill = (container, type) => {
        container.innerHTML = '';
        let has = false;
        state.inventory.forEach(i => {
            if (i.qty > 0 && i.details && i.details.type === type) {
                has = true;
                container.innerHTML += `
                    <div class="stock-item">
                        <img src="${i.details.image_url || 'images/default_item.png'}" style="width:35px;">
                        <div style="font-size:0.7em; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${i.details.name}
                        </div>
                        <strong style="color:var(--primary-accent);">x${i.qty}</strong>
                    </div>
                `;
            }
        });
        if (!has) container.innerHTML = '<p style="color:#666; font-size:0.8em; padding:10px;">Empty</p>';
    };

    fill(UI.stock.resources, 'RESOURCE');
    fill(UI.stock.materials, 'MATERIAL');
    fill(UI.stock.goods, 'GOOD');
}

