/*
 * Filename: js/screens/economy.js
 * Version: NOUB v4.1.0 (Original UI Restoration)
 * Description: 
 * Restores the EXACT UI layout for Factory Modal and Expert Cards.
 * Fixes Audio 404s and removes custom icons.
 * Integrates Pure JS API logic seamlessly.
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo, playSound } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 
import { trackTaskProgress } from './tasks.js';

// ========================================================
// --- 1. CONFIGURATION & CONSTANTS ---
// ========================================================

const EXPERT_EFFECTS = {
    'Imhotep': { type: 'TIME_REDUCTION_PERCENT', values: [10, 12, 15, 18, 22] },
    'Osiris (Underworld)': { type: 'TIME_REDUCTION_PERCENT', values: [20, 24, 28, 33, 40] },
    'Ptah (Creator)': { type: 'EXTRA_RESOURCE_CHANCE', values: [15, 17, 20, 24, 30] }
};

const ONE_MINUTE = 60000;
const ONE_SECOND = 1000;
const SPECIALIZATION_UNLOCK_LEVEL = 15;

const FACTORY_UPGRADE_COST = 500; 
const FACTORY_UPGRADE_ITEM_NAME = 'Limestone Block'; 
const FACTORY_UPGRADE_QTY = 10; 
const FACTORY_UPGRADE_LEVEL_CAP = 10; 

const SPECIALIZATION_FACTORY_MAP = {
    1: [7, 8, 9],
    2: [10, 11, 12],
    3: [13, 14, 15]
};

// DOM References
const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');
const stockResourcesContainer = document.getElementById('stock-resources-container');
const stockMaterialsContainer = document.getElementById('stock-materials-container');
const stockGoodsContainer = document.getElementById('stock-goods-container');

// ========================================================
// --- 2. UTILITY FUNCTIONS ---
// ========================================================

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

// ========================================================
// --- 3. SPECIALIZATION LOGIC ---
// ========================================================

async function handleSelectSpecialization(pathId) {
    if (!state.currentUser) return;
    
    showToast('Unlocking specialization path...', 'info');
    
    const { error: unlockError } = await api.unlockSpecialization(state.currentUser.id, pathId);
    if (unlockError) {
        return showToast('Error unlocking path.', 'error');
    }

    // Seed factories
    const factoryIdsToSeed = SPECIALIZATION_FACTORY_MAP[pathId];
    if (factoryIdsToSeed && factoryIdsToSeed.length > 0) {
        for (const factoryId of factoryIdsToSeed) {
             await api.buildFactory(state.currentUser.id, factoryId);
        }
    }
    
    await refreshPlayerState(); 
    window.closeModal('specialization-choice-modal');
    renderProduction();
}

function renderSpecializationChoice() {
    let modal = document.getElementById('specialization-choice-modal');
    if (!modal) return;

    api.fetchSpecializationPaths().then(({ data: paths, error }) => {
        if (error || !paths) return;

        const selectedPaths = state.specializations || new Map();
        const pathsToDisplay = paths.filter(p => !selectedPaths.has(p.id));

        if (pathsToDisplay.length === 0) return;

        const modalHTML = `
            <div class="modal-content specialization-choice-container">
                <h2>Choose Your Path</h2>
                <div id="specialization-options">
                    ${pathsToDisplay.map(path => `
                        <div class="specialization-card" data-path-id="${path.id}">
                            <h3>${path.name}</h3>
                            <p>${path.description}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        modal.innerHTML = modalHTML;
        
        modal.querySelectorAll('.specialization-card').forEach(card => {
            card.onclick = () => handleSelectSpecialization(card.dataset.pathId);
        });
        openModal('specialization-choice-modal');
    });
}

// ========================================================
// --- 4. FACTORY ACTIONS (Build, Upgrade) ---
// ========================================================

async function handleBuildFactory(masterFactory) {
    const buildCostNoub = masterFactory.build_cost_noub || 1000; 

    if ((state.playerProfile.noub_score || 0) < buildCostNoub) {
        return showToast(`Not enough NOUB. Requires ${buildCostNoub} 🪙.`, 'error');
    }

    if (!confirm(`Build ${masterFactory.name} for ${buildCostNoub} NOUB?`)) return;

    const { error: costError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (state.playerProfile.noub_score || 0) - buildCostNoub
    });
    
    if (costError) return showToast('Payment Failed.', 'error');

    const { error: buildError } = await api.buildFactory(state.currentUser.id, masterFactory.id);
    if (buildError) return showToast('Construction Error.', 'error');

    playSound('click'); // Standard UI Sound
    showToast(`${masterFactory.name} Ready!`, 'success');
    await refreshPlayerState();
    renderProduction();
}

async function executeFactoryUpgrade(playerFactory) { 
    if (!state.currentUser || !playerFactory) return;

    if (playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP) {
        return showToast('Max Level Reached.', 'info');
    }

    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => 
        item.details.name === FACTORY_UPGRADE_ITEM_NAME
    );
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const playerNoub = state.playerProfile.noub_score || 0;

    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        return showToast(`Upgrade requires: ${FACTORY_UPGRADE_COST}🪙 and ${FACTORY_UPGRADE_QTY} Blocks`, 'error');
    }

    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoub });
    await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);

    const newLevel = playerFactory.level + 1;
    const { error } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (error) return showToast('Upgrade Failed.', 'error');
    
    await api.addXp(state.currentUser.id, 20);
    
    showToast(`Upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState(); 
    renderProduction();
}

// ========================================================
// --- 5. PRODUCTION LOGIC ---
// ========================================================

async function handleStartProduction(factoryId, recipes) {
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        if (current < r.input_quantity) {
            return showToast(`Missing: ${r.items.name}`, 'error');
        }
    }
    
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        await api.updateItemQuantity(state.currentUser.id, r.items.id, current - r.input_quantity);
    }
    
    const startTime = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, startTime);
    
    if (error) return showToast('Start Failed.', 'error');
    
    showToast('Production Started.', 'success');
    await refreshPlayerState();
    renderProduction(); 
    window.closeModal('production-modal');
    renderProduction();
}

async function handleClaimProduction(playerFactory, outputItem) {
    const currentQty = state.inventory.get(outputItem.id)?.qty || 0;
    let quantityProduced = 1;
    
    const assignedCard = playerFactory.player_cards;
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        if (effect.type === 'EXTRA_RESOURCE_CHANCE') {
            const chance = effect.values[Math.min(assignedCard.level-1, 4)];
            if (Math.random() * 100 < chance) {
                quantityProduced = 2;
                showToast("Expert Bonus! Double Production!", 'success');
            }
        }
    }

    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, currentQty + quantityProduced);
    
    if (error) return showToast('Claim Error.', 'error');

    playSound('claim_reward'); // Known sound
    trackDailyActivity('resources', quantityProduced, outputItem.name);
    await trackTaskProgress('production_claim', 1);
    await api.addXp(state.currentUser.id, 5);
    
    showToast(`Received: ${quantityProduced} ${outputItem.name}`, 'success');
    await refreshPlayerState();
    window.closeModal('production-modal');
    renderProduction();
}

// ========================================================
// --- 6. UI RENDERING (RESTORED ORIGINAL LOOK) ---
// ========================================================

function updateProductionCard(factory, outputItem) {
    const cardId = `factory-card-${factory.factories.id}`;
    const card = document.getElementById(cardId);
    const modalTimer = document.querySelector('#production-modal .prod-timer');
    
    if (!card && !modalTimer) return;

    const itemName = outputItem ? outputItem.name : "Item";
    const assignedCard = factory.player_cards;
    const startTime = factory.production_start_time;
    
    let masterTime = factory.factories.base_production_time * ONE_MINUTE;
    
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        if (effect.type === 'TIME_REDUCTION_PERCENT') {
            const red = effect.values[Math.min(assignedCard.level-1, 4)];
            masterTime -= masterTime * (red / 100);
        }
    }
    
    if (startTime) {
        const timeElapsed = new Date().getTime() - new Date(startTime).getTime();
        const timeLeft = masterTime - timeElapsed;

        if (card) {
            const statusEl = card.querySelector('.status');
            const progressEl = card.querySelector('.progress-bar-inner');
            if (timeLeft <= 0) {
                statusEl.textContent = `Ready: ${itemName}`;
                statusEl.style.color = 'var(--success-color)';
                progressEl.style.width = '100%';
            } else {
                statusEl.textContent = `${formatTime(timeLeft)}`;
                statusEl.style.color = '#aaa';
                progressEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            }
        }

        if (modalTimer && !modalTimer.closest('.hidden')) {
            const modalTimeEl = modalTimer.querySelector('.time-left');
            const modalProgEl = modalTimer.querySelector('.progress-bar-inner');
            if (timeLeft <= 0) {
                if(modalTimeEl) modalTimeEl.textContent = "COMPLETED";
                if(modalProgEl) modalProgEl.style.width = '100%';
            } else {
                if(modalTimeEl) modalTimeEl.textContent = `Time Left: ${formatTime(timeLeft)}`;
                if(modalProgEl) modalProgEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            }
        }

        if (timeLeft > 0) {
            requestAnimationFrame(() => updateProductionCard(factory, outputItem));
        }
    } else {
        if (card) {
            card.querySelector('.status').textContent = 'Idle';
            card.querySelector('.progress-bar-inner').style.width = '0%';
        }
    }
}

function openProductionModal(playerFactory, outputItem) {
    if (!outputItem) {
        outputItem = { id:0, name:"Unknown", image_url:"images/default_item.png" };
    }

    const factory = playerFactory.factories;
    let masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    const assignedCard = playerFactory.player_cards;

    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        if (effect.type === 'TIME_REDUCTION_PERCENT') {
            const red = effect.values[Math.min(assignedCard.level-1, 4)];
            masterTime -= masterTime * (red / 100);
        }
    }
    
    const recipes = factory.factory_recipes || [];
    let canStart = true;
    const requirementsHTML = recipes.map(r => {
        const myQty = state.inventory.get(r.items.id)?.qty || 0;
        if (myQty < r.input_quantity) canStart = false;
        return `<div class="prod-item"><img src="${r.items.image_url}"><p>${r.input_quantity} x <span style="color:${myQty >= r.input_quantity ? 'var(--success-color)' : 'var(--danger-color)'}">${r.items.name}</span></p><div class="label">(Has: ${myQty})</div></div>`;
    }).join('');
    
    const isRunning = startTime !== null;
    let buttonHTML = '';
    let timeElapsed = isRunning ? (new Date().getTime() - new Date(startTime).getTime()) : 0;
    const timeLeft = masterTime - timeElapsed;

    if (isRunning) {
        buttonHTML = (timeLeft <= 0) 
            ? `<button id="claim-prod-btn" class="action-button">Claim ${outputItem.name}</button>` 
            : `<button class="action-button" disabled>Working...</button>`;
    } else {
        buttonHTML = `<button id="start-prod-btn" class="action-button" ${canStart ? '' : 'disabled'}>Start Production</button>`;
    }

    // --- EXPERT CARD UI RESTORATION ---
    let expertSectionHTML = `<div id="expert-assignment-section" style="margin-top: 15px; border-top: 1px solid #3a3a3c; padding-top: 10px; text-align: center;"><h4>Assigned Expert</h4>`;
    if (assignedCard) {
        // Render it EXACTLY like a 'card-stack' to match the user's preference
        expertSectionHTML += `
            <div class="card-stack" style="margin: 0 auto; display:inline-block;">
                <img src="${assignedCard.cards.image_url}" class="card-image">
                <h4>${assignedCard.cards.name}</h4>
                <div class="card-details"><span class="card-level">LVL ${assignedCard.level}</span></div>
            </div>
            <br>
            <button id="unassign-expert-btn" class="action-button small danger" style="margin-top: 10px;">Dismiss</button>
        `;
    } else {
        expertSectionHTML += `
            <div class="expert-placeholder">
                <p>No Expert Assigned</p>
                <button id="assign-expert-btn" class="action-button small">Assign Expert</button>
            </div>
        `;
    }
    expertSectionHTML += `</div>`;

    // Upgrade UI
    const playerNoub = state.playerProfile.noub_score || 0;
    const canUpgrade = playerFactory.level < FACTORY_UPGRADE_LEVEL_CAP;
    const upgradeHTML = `
        <div style="margin-top: 15px; border-top: 1px solid #3a3a3c; padding-top: 10px; text-align: center;">
            <h4>Upgrade (Lvl ${playerFactory.level + 1})</h4>
            <div class="cost-item">${FACTORY_UPGRADE_COST} 🪙</div>
            <button id="upgrade-factory-btn" class="action-button small" ${canUpgrade ? '' : 'disabled'}>Upgrade</button>
        </div>
    `;

    productionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header">
                <img src="${factory.image_url}" alt="${factory.name}">
                <h3>${factory.name}</h3>
                <p class="level">Level: ${playerFactory.level}</p>
            </div>
            <div class="prod-modal-body">
                <div class="prod-io">
                    ${requirementsHTML || '<div class="prod-item"><p>None</p></div>'}
                    <span class="arrow">➡️</span>
                    <div class="prod-item">
                        <img src="${outputItem.image_url}">
                        <p>1 x ${outputItem.name}</p>
                    </div>
                </div>
                <div class="prod-timer">
                    ${isRunning ? `<div class="time-left">${formatTime(timeLeft)}</div>` : ''}
                    <div class="progress-bar"><div class="progress-bar-inner" style="width:${isRunning ? ((timeElapsed / masterTime) * 100) : 0}%"></div></div>
                </div>
            </div>
            ${buttonHTML}
            ${expertSectionHTML}
            ${upgradeHTML}
        </div>`;
        
    openModal('production-modal');

    document.getElementById('start-prod-btn')?.addEventListener('click', () => handleStartProduction(playerFactory.id, recipes));
    document.getElementById('claim-prod-btn')?.addEventListener('click', () => handleClaimProduction(playerFactory, outputItem));
    document.getElementById('assign-expert-btn')?.addEventListener('click', () => openExpertSelectionModal(playerFactory.id));
    document.getElementById('unassign-expert-btn')?.addEventListener('click', () => unassignExpert(playerFactory.id));
    document.getElementById('upgrade-factory-btn')?.addEventListener('click', () => {
        window.closeModal('production-modal');
        executeFactoryUpgrade(playerFactory);
    });
}

// --- EXPERT SELECTION ---

async function openExpertSelectionModal(factoryId) {
    const [{ data: playerCards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    const busyIds = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));
    const available = playerCards.filter(c => !busyIds.has(c.instance_id) && c.card_id !== 9999 && !c.is_locked);

    const modalId = 'expert-select-modal';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    // Render as nice card stack list
    const listHTML = available.map(c => `
        <div class="card-stack" onclick="window.executeAssign('${factoryId}', '${c.instance_id}')" style="cursor:pointer; margin:5px;">
            <img src="${c.cards.image_url}" class="card-image">
            <h4>${c.cards.name}</h4>
            <div class="card-details">Lvl ${c.level}</div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <h3>Select Expert</h3>
            <div class="card-grid" style="max-height:50vh; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(80px, 1fr)); gap:10px;">
                ${available.length ? listHTML : '<p>No experts available.</p>'}
            </div>
        </div>
    `;
    openModal(modalId);
}

window.executeAssign = async (factoryId, cardId) => {
    window.closeModal('expert-select-modal');
    window.closeModal('production-modal');
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: cardId })
        .eq('id', factoryId);
        
    if (!error) {
        showToast("Expert Assigned", 'success');
        await refreshPlayerState();
        renderProduction();
    }
};

async function unassignExpert(factoryId) {
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: null })
        .eq('id', factoryId);

    if (!error) {
        showToast("Expert Dismissed.", 'success');
        await refreshPlayerState();
        window.closeModal('production-modal');
        renderProduction();
    }
}

// ========================================================
// --- 7. MAIN RENDER ---
// ========================================================

export async function renderProduction() {
    if (!state.currentUser) return;
    
    // Specialization Check
    if ((state.playerProfile.level || 1) >= SPECIALIZATION_UNLOCK_LEVEL) {
        if (!state.specializations || state.specializations.size === 0) {
            renderSpecializationChoice();
            return; 
        }
    }

    resourcesContainer.innerHTML = '<div class="loading-spinner"></div>';
    workshopsContainer.innerHTML = '';

    const [{ data: playerFactories }, { data: masterFactories }] = await Promise.all([
        api.fetchPlayerFactories(state.currentUser.id),
        api.fetchAllMasterFactories()
    ]);

    if (!playerFactories || !masterFactories) return;
    resourcesContainer.innerHTML = '';

    const pfMap = new Map(playerFactories.map(pf => [pf.factories.id, pf]));
    const playerLevel = state.playerProfile.level || 1;

    masterFactories.sort((a,b) => a.required_level - b.required_level).forEach(master => {
        const isOwned = pfMap.has(master.id);
        const pf = pfMap.get(master.id);
        const container = master.type === 'RESOURCE' ? resourcesContainer : workshopsContainer;
        const card = document.createElement('div');
        card.className = 'building-card';
        card.id = `factory-card-${master.id}`;

        if (isOwned) {
            const outputItem = pf.factories.items || pf.factories.output_item || null;
            // Original Badge style (Gold star indicator is fine, but ensure consistency if requested)
            const expertBadge = pf.assigned_card_instance_id 
                ? '<div style="position:absolute; top:5px; right:5px; color:gold; font-size:1.2em;">★</div>' 
                : '';

            card.innerHTML = `
                ${expertBadge}
                <img src="${master.image_url}" style="width:100%;">
                <h4>${master.name}</h4>
                <div class="level">Lvl ${pf.level}</div>
                <div class="status" style="color: ${pf.production_start_time ? 'var(--accent-blue)' : 'var(--success-color)'}">
                    ${pf.production_start_time ? 'Working...' : 'Idle'}
                </div>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:0%"></div></div>
            `;
            card.onclick = () => openProductionModal(pf, outputItem);

            if (pf.production_start_time) {
                requestAnimationFrame(() => updateProductionCard(pf, outputItem));
            }

        } else {
            const unlockable = playerLevel >= master.required_level;
            card.classList.add(unlockable ? 'unlockable' : 'locked');
            card.innerHTML = `
                <img src="${master.image_url}" style="width:100%; filter:grayscale(1);">
                <h4>${master.name}</h4>
                <div class="status">
                    ${unlockable ? `Build: ${master.build_cost_noub} 🪙` : `Locked (Lvl ${master.required_level})`}
                </div>
            `;
            if (unlockable) {
                card.onclick = () => handleBuildFactory(master);
            }
        }
        container.appendChild(card);
    });

    renderStock();
}

function renderStock() {
    const fill = (cont, type) => {
        cont.innerHTML = '';
        state.inventory.forEach(item => {
            if (item.qty > 0 && item.details && item.details.type === type) {
                cont.innerHTML += `
                    <div class="stock-item">
                        <img src="${item.details.image_url}" style="width:35px;">
                        <div style="font-size:0.8em;">${item.details.name}</div>
                        <strong>x${item.qty}</strong>
                    </div>
                `;
            }
        });
    };
    fill(stockResourcesContainer, 'RESOURCE');
    fill(stockMaterialsContainer, 'MATERIAL');
    fill(stockGoodsContainer, 'GOOD');
}
