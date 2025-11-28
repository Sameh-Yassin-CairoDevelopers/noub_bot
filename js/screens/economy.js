/*
 * Filename: js/screens/economy.js
 * Version: NOUB v4.0.0 (The Definitive Restoration)
 * Description: 
 * Central Economy Controller.
 * RESTORED: Full UI Layout for Production Modal, Expert Cards, and Progress Bars.
 * INTEGRATED: Pure JS API logic for all transactions.
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
        console.error("Unlock Error:", unlockError);
        return showToast('Error unlocking path.', 'error');
    }

    // Seed factories
    const factoryIdsToSeed = SPECIALIZATION_FACTORY_MAP[pathId];
    if (factoryIdsToSeed && factoryIdsToSeed.length > 0) {
        for (const factoryId of factoryIdsToSeed) {
             await api.buildFactory(state.currentUser.id, factoryId);
        }
        showToast(`New workshops constructed!`, 'success');
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
            <div class="modal-content specialization-choice-container" style="text-align:center;">
                <h2 style="color:var(--primary-accent); margin-bottom:10px;">Choose Your Path</h2>
                <p style="color:#aaa; font-size:0.9em; margin-bottom:20px;">
                    Level ${SPECIALIZATION_UNLOCK_LEVEL} Reached. Select a guild to unlock advanced technology.
                </p>
                <div id="specialization-options" style="display:grid; gap:12px;">
                    ${pathsToDisplay.map(path => `
                        <div class="specialization-card" data-path-id="${path.id}" 
                             style="background:#222; border:1px solid var(--primary-accent); padding:15px; border-radius:10px; cursor:pointer; transition:0.2s;">
                            <h3 style="margin:0; color:#fff;">${path.name}</h3>
                            <p style="font-size:0.8em; color:#888; margin-top:5px;">${path.description}</p>
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
        return showToast(`Insufficient Funds. Need ${buildCostNoub} 🪙`, 'error');
    }

    if (!confirm(`Construct ${masterFactory.name} for ${buildCostNoub} NOUB?`)) return;

    showToast(`Building...`, 'info');

    const { error: costError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (state.playerProfile.noub_score || 0) - buildCostNoub
    });
    
    if (costError) return showToast('Payment Failed.', 'error');

    const { error: buildError } = await api.buildFactory(state.currentUser.id, masterFactory.id);
    if (buildError) return showToast('Construction Error.', 'error');

    playSound('construction');
    showToast(`${masterFactory.name} Ready!`, 'success');
    await refreshPlayerState();
    renderProduction();
}

async function executeFactoryUpgrade(playerFactory) { 
    if (!state.currentUser || !playerFactory) return;

    if (playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP) {
        return showToast('Factory is at Max Level.', 'info');
    }

    // Resource Check
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => 
        item.details.name === FACTORY_UPGRADE_ITEM_NAME
    );
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const playerNoub = state.playerProfile.noub_score || 0;

    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        return showToast(`Upgrade requires: ${FACTORY_UPGRADE_COST}🪙 and ${FACTORY_UPGRADE_QTY} Blocks`, 'error');
    }

    showToast('Upgrading...', 'info');

    // Deduct
    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoub });
    await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);

    // Update Factory
    const newLevel = playerFactory.level + 1;
    const { error } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (error) return showToast('Upgrade Failed.', 'error');
    
    await api.addXp(state.currentUser.id, 20);
    
    showToast(`Upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState(); 
    
    // Re-open modal to show new stats if needed, or just refresh grid
    renderProduction();
}

// ========================================================
// --- 5. PRODUCTION LOGIC ---
// ========================================================

async function handleStartProduction(factoryId, recipes) {
    // Validate
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        if (current < r.input_quantity) {
            return showToast(`Missing: ${r.items.name}`, 'error');
        }
    }
    
    showToast('Starting...', 'info');

    // Consume
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        await api.updateItemQuantity(state.currentUser.id, r.items.id, current - r.input_quantity);
    }
    
    const startTime = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, startTime);
    
    if (error) return showToast('Start Failed.', 'error');
    
    showToast('Production Started.', 'success');
    await refreshPlayerState();
    renderProduction(); // Will auto-refresh modal via updateProductionCard logic if open? 
    // Better to just close modal to force refresh visual
    window.closeModal('production-modal');
    renderProduction();
}

async function handleClaimProduction(playerFactory, outputItem) {
    showToast('Claiming...', 'info');
    
    const currentQty = state.inventory.get(outputItem.id)?.qty || 0;
    let quantityProduced = 1;
    
    // Expert Bonus Logic
    const assignedCard = playerFactory.player_cards;
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        if (effect.type === 'EXTRA_RESOURCE_CHANCE') {
            const chance = effect.values[Math.min(assignedCard.level-1, 4)];
            if (Math.random() * 100 < chance) {
                quantityProduced = 2;
                showToast("Expert Bonus! x2 Output", 'success');
            }
        }
    }

    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, currentQty + quantityProduced);
    
    if (error) return showToast('Claim Error.', 'error');

    playSound('claim_reward');
    trackDailyActivity('resources', quantityProduced, outputItem.name);
    await trackTaskProgress('production_claim', 1);
    await api.addXp(state.currentUser.id, 5);
    
    showToast(`Received: ${quantityProduced} ${outputItem.name}`, 'success');
    await refreshPlayerState();
    window.closeModal('production-modal');
    renderProduction();
}

// ========================================================
// --- 6. UI RENDERING (Restored to Original Specs) ---
// ========================================================

/**
 * Handles the live update of the production timer and progress bar inside the card/modal.
 */
function updateProductionCard(factory, outputItem) {
    const cardId = `factory-card-${factory.factories.id}`;
    const card = document.getElementById(cardId);
    // If modal is open, update modal timer too
    const modalTimer = document.querySelector('#production-modal .prod-timer');
    
    if (!card && !modalTimer) return;

    const itemName = outputItem ? outputItem.name : "Resource";
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

        // Update Grid Card
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

        // Update Modal
        if (modalTimer && !modalTimer.closest('.hidden')) {
            const modalTimeEl = modalTimer.querySelector('.time-left');
            const modalProgEl = modalTimer.querySelector('.progress-bar-inner');
            
            if (timeLeft <= 0) {
                if(modalTimeEl) modalTimeEl.innerHTML = `<span style="color:var(--success-color)">COMPLETE</span>`;
                if(modalProgEl) modalProgEl.style.width = '100%';
                // Reload modal content to show Claim button? 
                // Complex in animation frame. Better to let user click Claim button (which is enabled).
            } else {
                if(modalTimeEl) modalTimeEl.textContent = `Time Left: ${formatTime(timeLeft)}`;
                if(modalProgEl) modalProgEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            }
        }

        if (timeLeft > 0) {
            requestAnimationFrame(() => updateProductionCard(factory, outputItem));
        }
    } else {
        // Reset
        if (card) {
            card.querySelector('.status').textContent = 'Idle';
            card.querySelector('.progress-bar-inner').style.width = '0%';
        }
    }
}

function openProductionModal(playerFactory, outputItem) {
    // SAFETY: Prevent crash if DB join failed
    if (!outputItem) {
        outputItem = { id:0, name:"Unknown", image_url:"images/default_item.png" };
    }

    const factory = playerFactory.factories;
    let masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    const assignedCard = playerFactory.player_cards;

    // Recalculate time with expert
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        if (effect.type === 'TIME_REDUCTION_PERCENT') {
            const red = effect.values[Math.min(assignedCard.level-1, 4)];
            masterTime -= masterTime * (red / 100);
        }
    }
    
    // Recipe Check
    const recipes = factory.factory_recipes || [];
    let canStart = true;
    const requirementsHTML = recipes.map(r => {
        const myQty = state.inventory.get(r.items.id)?.qty || 0;
        if (myQty < r.input_quantity) canStart = false;
        
        return `
            <div class="prod-item" style="text-align:center;">
                <img src="${r.items.image_url}" style="width:35px; margin-bottom:3px;">
                <p style="font-size:0.8em; margin:0;">${r.input_quantity} x ${r.items.name}</p>
                <div class="label" style="font-size:0.7em; color:${myQty >= r.input_quantity ? '#0f0' : '#f55'}">
                    (Has: ${myQty})
                </div>
            </div>
        `;
    }).join('');
    
    const isRunning = startTime !== null;
    let timeElapsed = isRunning ? (new Date().getTime() - new Date(startTime).getTime()) : 0;
    let timeLeft = masterTime - timeElapsed;
    if (timeLeft < 0) timeLeft = 0;

    // --- 1. ACTION BUTTON ---
    let buttonHTML = '';
    if (isRunning) {
        if (timeLeft <= 0) {
            buttonHTML = `<button id="claim-prod-btn" class="action-button" style="width:100%; background:var(--success-color);">✨ Claim ${outputItem.name}</button>`;
        } else {
            buttonHTML = `<button class="action-button" disabled style="width:100%; opacity:0.6;">Production in Progress...</button>`;
        }
    } else {
        buttonHTML = `<button id="start-prod-btn" class="action-button" style="width:100%;" ${canStart ? '' : 'disabled'}>Start Production</button>`;
    }

    // --- 2. EXPERT SECTION (Restored Layout) ---
    let expertSectionHTML = `<div id="expert-assignment-section" style="margin-top: 15px; border-top: 1px solid #444; padding-top: 10px;">`;
    
    if (assignedCard) {
        // The "Good" Layout: Card Stack style
        expertSectionHTML += `
            <h4 style="text-align:center; margin-bottom:8px; color:#aaa; font-size:0.9em;">Assigned Expert</h4>
            <div class="expert-card" style="display: flex; align-items: center; justify-content:space-between; background: linear-gradient(to right, #2a2a2e, #1a1a1a); padding: 10px; border-radius: 8px; border:1px solid var(--primary-accent);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${assignedCard.cards.image_url}" style="width: 45px; height: 45px; border-radius: 5px; object-fit:cover;">
                    <div style="text-align:left;">
                        <h5 style="margin: 0; color:#fff; font-size:0.95em;">${assignedCard.cards.name}</h5>
                        <p style="font-size: 0.75em; margin: 2px 0 0 0; color: var(--success-color);">Level ${assignedCard.level}</p>
                    </div>
                </div>
                <button id="unassign-expert-btn" class="action-button danger small" style="width:auto; padding:5px 10px; font-size:0.7em;">Dismiss</button>
            </div>
        `;
    } else {
        expertSectionHTML += `
            <div class="expert-placeholder" style="border: 2px dashed #444; padding: 15px; border-radius: 8px; text-align:center; background:rgba(0,0,0,0.2);">
                <p style="color:#888; font-size:0.8em; margin-bottom:10px;">No Expert Assigned</p>
                <button id="assign-expert-btn" class="action-button small" style="background:#333; border:1px solid #555;">+ Assign Expert</button>
            </div>
        `;
    }
    expertSectionHTML += `</div>`;

    // --- 3. UPGRADE SECTION ---
    const playerNoub = state.playerProfile.noub_score || 0;
    const canUpgrade = playerFactory.level < FACTORY_UPGRADE_LEVEL_CAP;
    
    const upgradeHTML = `
        <div style="margin-top: 15px; border-top: 1px solid #444; padding-top: 10px; text-align: center;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8em; color:#ccc; margin-bottom:8px;">
                <span>Level ${playerFactory.level} / ${FACTORY_UPGRADE_LEVEL_CAP}</span>
                <span>Next: <b>${FACTORY_UPGRADE_COST}</b> 🪙</span>
            </div>
            ${canUpgrade 
                ? `<button id="upgrade-factory-btn" class="text-button" style="color:var(--accent-blue); width:100%;">⬆ Upgrade Factory</button>` 
                : `<span style="color:var(--success-color); font-size:0.8em;">MAX LEVEL REACHED</span>`
            }
        </div>
    `;

    // --- ASSEMBLE MODAL ---
    productionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('production-modal')">&times;</button>
            
            <!-- HEADER -->
            <div class="prod-modal-header" style="text-align:center; border-bottom:1px solid #444; padding-bottom:15px; margin-bottom:15px;">
                <img src="${factory.image_url}" alt="${factory.name}" style="width:70px; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.5);">
                <h3 style="color:var(--primary-accent); margin:10px 0 0 0;">${factory.name}</h3>
            </div>
            
            <!-- INPUT / OUTPUT -->
            <div class="prod-modal-body">
                <div class="prod-io" style="display:flex; justify-content:center; align-items:center; gap:15px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-bottom:15px;">
                    ${requirementsHTML || '<div style="font-size:0.8em;">None</div>'}
                    <span class="arrow" style="color:#666;">➜</span>
                    <div class="prod-item" style="text-align:center;">
                        <img src="${outputItem.image_url}" style="width:40px; margin-bottom:3px;">
                        <p style="font-size:0.8em; margin:0;">${outputItem.name}</p>
                    </div>
                </div>
                
                <!-- TIMER -->
                <div class="prod-timer" style="margin-bottom:20px;">
                    ${isRunning ? `<div class="time-left" style="text-align:center; font-size:1.2em; font-weight:bold; margin-bottom:5px;">${formatTime(timeLeft)}</div>` : ''}
                    <div class="progress-bar" style="height:8px; background:#333; border-radius:4px; overflow:hidden;">
                        <div class="progress-bar-inner" style="height:100%; width:${isRunning ? ((timeElapsed / masterTime) * 100) : 0}%; background:var(--success-color); transition: width 1s linear;"></div>
                    </div>
                </div>
            </div>
            
            ${buttonHTML}
            ${expertSectionHTML}
            ${upgradeHTML}
        </div>`;
        
    openModal('production-modal');

    // --- EVENT LISTENERS (Local Scope Binding) ---
    document.getElementById('start-prod-btn')?.addEventListener('click', () => handleStartProduction(playerFactory.id, recipes));
    document.getElementById('claim-prod-btn')?.addEventListener('click', () => handleClaimProduction(playerFactory, outputItem));
    document.getElementById('assign-expert-btn')?.addEventListener('click', () => openExpertSelectionModal(playerFactory.id));
    document.getElementById('unassign-expert-btn')?.addEventListener('click', () => unassignExpert(playerFactory.id));
    document.getElementById('upgrade-factory-btn')?.addEventListener('click', () => {
        window.closeModal('production-modal');
        executeFactoryUpgrade(playerFactory);
    });
}

// --- EXPERT SELECTION MODAL ---

async function openExpertSelectionModal(factoryId) {
    const [{ data: playerCards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    // Logic: Card is "busy" if assigned to ANY factory
    const busyIds = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));
    
    // Filter: Not Busy AND Not Soul Card AND Not Locked (Trade)
    const available = playerCards.filter(c => !busyIds.has(c.instance_id) && c.card_id !== 9999 && !c.is_locked);

    const modalId = 'expert-select-modal';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('${modalId}')">&times;</button>
            <h3 style="text-align:center;">Select Expert</h3>
            <div class="card-grid" style="max-height:50vh; overflow-y:auto; margin-top:15px;">
                ${available.map(c => `
                    <div class="card-stack" onclick="window.executeAssign('${factoryId}', '${c.instance_id}')" 
                         style="cursor:pointer; border:1px solid #444;">
                        <img src="${c.cards.image_url}" class="card-image">
                        <h4>${c.cards.name}</h4>
                        <div class="card-details">Level ${c.level}</div>
                    </div>
                `).join('')}
            </div>
            ${available.length === 0 ? '<p style="text-align:center; padding:20px; color:#888;">No experts available.</p>' : ''}
        </div>
    `;
    openModal(modalId);
}

// Exposed to window for HTML onclick binding within the generated modal string
window.executeAssign = async (factoryId, cardId) => {
    window.closeModal('expert-select-modal');
    // Note: No need to close parent modal, it updates live or on re-open. 
    // But closing it provides better feedback loop.
    window.closeModal('production-modal'); 
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: cardId })
        .eq('id', factoryId);
        
    if (error) showToast("Assignment Failed", 'error');
    else {
        showToast("Expert Assigned!", 'success');
        await refreshPlayerState();
        renderProduction();
    }
};

async function unassignExpert(factoryId) {
    if (!confirm("Dismiss this expert? They will return to your deck.")) return;
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: null })
        .eq('id', factoryId);

    if (!error) {
        showToast("Expert Dismissed.", "success");
        await refreshPlayerState();
        window.closeModal('production-modal');
        renderProduction();
    } else {
        showToast("Failed to dismiss.", 'error');
    }
}

// ========================================================
// --- 7. MAIN RENDER (Grid & Stock) ---
// ========================================================

export async function renderProduction() {
    if (!state.currentUser) return;
    
    // 1. Pre-check Specialization
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
            // Safe Access to Output Item (Nested due to API join)
            const outputItem = pf.factories.items || pf.factories.output_item || null;
            
            // Visual Badge for Expert
            const expertBadge = pf.assigned_card_instance_id 
                ? '<div style="position:absolute; top:5px; right:5px; font-size:1.2em; text-shadow:0 0 5px gold;">⭐</div>' 
                : '';

            card.innerHTML = `
                ${expertBadge}
                <img src="${master.image_url}" style="width:100%; border-radius:6px;">
                <h4>${master.name}</h4>
                <div class="level">Lvl ${pf.level}</div>
                <div class="status" style="font-weight:bold;">${pf.production_start_time ? 'Running...' : 'Ready'}</div>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:0%"></div></div>
            `;
            card.onclick = () => openProductionModal(pf, outputItem);

            // Init Timer Loop
            if (pf.production_start_time) {
                requestAnimationFrame(() => updateProductionCard(pf, outputItem));
            }

        } else {
            // Logic for Locked Factories
            const unlockable = playerLevel >= master.required_level;
            card.classList.add(unlockable ? 'unlockable' : 'locked');
            
            card.innerHTML = `
                <img src="${master.image_url}" style="width:100%; border-radius:6px; filter:grayscale(${unlockable ? 0 : 1});">
                <h4>${master.name}</h4>
                <div class="status" style="margin-top:5px; font-size:0.8em; color:${unlockable?'#0f0':'#888'};">
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
        let hasItems = false;
        state.inventory.forEach(item => {
            if (item.qty > 0 && item.details && item.details.type === type) {
                hasItems = true;
                cont.innerHTML += `
                    <div class="stock-item">
                        <img src="${item.details.image_url}" style="width:35px;">
                        <div style="font-size:0.7em; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.details.name}</div>
                        <strong style="color:var(--primary-accent);">${item.qty}</strong>
                    </div>
                `;
            }
        });
        if (!hasItems) cont.innerHTML = '<p style="font-size:0.8em; color:#444; padding:10px;">Empty</p>';
    };

    fill(stockResourcesContainer, 'RESOURCE');
    fill(stockMaterialsContainer, 'MATERIAL');
    fill(stockGoodsContainer, 'GOOD');
}
