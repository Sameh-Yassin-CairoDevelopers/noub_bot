/*
 * Filename: js/screens/economy.js
 * Version: NOUB v3.2.0 (Final Complete Edition)
 * Description: 
 * Manages the entire Economy Hub:
 * 1. Factory Construction & Rendering.
 * 2. Production Logic (Start, Timer, Claim).
 * 3. Expert Management (Assign/Unassign).
 * 4. Factory Upgrades.
 * 5. Specialization Unlocking.
 * 6. Inventory Visualization.
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

// Upgrade Config
const FACTORY_UPGRADE_COST = 500; 
const FACTORY_UPGRADE_ITEM_NAME = 'Limestone Block'; 
const FACTORY_UPGRADE_QTY = 10; 
const FACTORY_UPGRADE_LEVEL_CAP = 10; 

// Specialization Mapping (Which factories belong to which path)
const SPECIALIZATION_FACTORY_MAP = {
    1: [7, 8, 9],   // Path A Factories
    2: [10, 11, 12], // Path B Factories
    3: [13, 14, 15]  // Path C Factories
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
        console.error("Unlock Specialization Error:", unlockError);
        return showToast('Error unlocking specialization!', 'error');
    }

    // Seed new factories for this path
    const factoryIdsToSeed = SPECIALIZATION_FACTORY_MAP[pathId];
    if (factoryIdsToSeed && factoryIdsToSeed.length > 0) {
        const factoryPromises = factoryIdsToSeed.map(factoryId => {
            return api.buildFactory(state.currentUser.id, factoryId);
        });
        await Promise.all(factoryPromises);
        showToast(`New workshops unlocked!`, 'success');
    }
    
    await refreshPlayerState(); 
    window.closeModal('specialization-choice-modal');
    renderProduction();
}

function renderSpecializationChoice() {
    let modal = document.getElementById('specialization-choice-modal');
    if (!modal) return; // Should exist in HTML

    api.fetchSpecializationPaths().then(({ data: paths, error }) => {
        if (error || !paths) return showToast('Could not load paths.', 'error');

        const selectedPaths = state.specializations || new Map();
        const pathsToDisplay = paths.filter(p => !selectedPaths.has(p.id));

        if (pathsToDisplay.length === 0) {
            // Usually shouldn't happen if check logic is correct in renderProduction
            return; 
        }

        const modalHTML = `
            <div class="modal-content specialization-choice-container">
                <h2 style="color:var(--primary-accent);">Choose Your Path</h2>
                <p style="color:#ccc; margin-bottom:20px;">You have reached Level ${SPECIALIZATION_UNLOCK_LEVEL}. Select a crafting specialization to unlock advanced workshops.</p>
                <div id="specialization-options" style="display:grid; gap:10px;">
                    ${pathsToDisplay.map(path => `
                        <div class="specialization-card" data-path-id="${path.id}" style="background:#222; border:1px solid #444; padding:15px; border-radius:10px; cursor:pointer;">
                            <h3 style="margin:0; color:var(--accent-blue);">${path.name}</h3>
                            <p style="font-size:0.8em; color:#aaa;">${path.description}</p>
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

    showToast(`Constructing ${masterFactory.name}...`, 'info');

    // Transaction: Deduct Cost
    const { error: costError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: (state.playerProfile.noub_score || 0) - buildCostNoub
    });
    if (costError) return showToast('Failed to deduct cost.', 'error');

    // Transaction: Create Factory
    const { error: buildError } = await api.buildFactory(state.currentUser.id, masterFactory.id);
    if (buildError) return showToast('Construction failed.', 'error');

    playSound('construction'); // Assuming sound exists
    showToast(`${masterFactory.name} constructed!`, 'success');
    await refreshPlayerState();
    renderProduction();
}

async function executeFactoryUpgrade(playerFactory) { 
    if (!state.currentUser || !playerFactory) return;

    if (playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP) {
        return showToast('Max level reached.', 'info');
    }

    // 1. Resource Check
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => 
        item.details.name === FACTORY_UPGRADE_ITEM_NAME
    );
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const playerNoub = state.playerProfile.noub_score || 0;

    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        return showToast(`Missing Resources: ${FACTORY_UPGRADE_COST}🪙 or ${FACTORY_UPGRADE_QTY} Blocks`, 'error');
    }

    showToast('Upgrading...', 'info');

    // 2. Deduct Resources
    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoub });
    await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);

    // 3. Update Factory
    const newLevel = playerFactory.level + 1;
    const { error } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (error) return showToast('Upgrade failed.', 'error');
    
    // 4. Grant XP
    await api.addXp(state.currentUser.id, 20);
    
    showToast(`Factory upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState(); 
    renderProduction();
}

// ========================================================
// --- 5. PRODUCTION LOGIC (Start, Claim) ---
// ========================================================

async function handleStartProduction(factoryId, recipes) {
    // Validate Inventory First
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        if (current < r.input_quantity) {
            return showToast(`Missing: ${r.items.name}`, 'error');
        }
    }
    
    showToast('Starting production...', 'info');

    // Consume Resources
    for (const r of recipes) {
        const current = state.inventory.get(r.items.id)?.qty || 0;
        await api.updateItemQuantity(state.currentUser.id, r.items.id, current - r.input_quantity);
    }
    
    const startTime = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, startTime);
    
    if (error) return showToast('System Error', 'error');
    
    showToast('Production started!', 'success');
    await refreshPlayerState();
    renderProduction();
}

async function handleClaimProduction(playerFactory, outputItem) {
    showToast('Claiming...', 'info');
    
    const currentQty = state.inventory.get(outputItem.id)?.qty || 0;
    
    // Check for Expert Bonus (Ptah)
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

    // DB Update
    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, currentQty + quantityProduced);
    
    if (error) return showToast('Claim failed.', 'error');

    playSound('claim_reward');
    trackDailyActivity('resources', quantityProduced, outputItem.name);
    await trackTaskProgress('production_claim', 1);
    await api.addXp(state.currentUser.id, 5);
    
    showToast(`Collected: ${quantityProduced} x ${outputItem.name}`, 'success');
    await refreshPlayerState();
    window.closeModal('production-modal');
    renderProduction();
}

// ========================================================
// --- 6. UI RENDERING (The Core) ---
// ========================================================

function updateProductionCard(factory, outputItem) {
    const cardId = `factory-card-${factory.factories.id}`;
    const card = document.getElementById(cardId);
    if (!card) return;

    // Safe Check for Output Item
    const itemName = outputItem ? outputItem.name : "Unknown";

    const assignedCard = factory.player_cards;
    const startTime = factory.production_start_time;
    
    let masterTime = factory.factories.base_production_time * ONE_MINUTE;
    
    // Apply Time Reduction Expert
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
            
            // Self-Loop for Live Timer
            requestAnimationFrame(() => updateProductionCard(factory, outputItem));
        }
    } else {
        card.querySelector('.status').textContent = 'Idle';
        card.querySelector('.status').style.color = '#888';
        card.querySelector('.progress-bar-inner').style.width = '0%';
    }
}

function openProductionModal(playerFactory, outputItem) {
    // --- SAFETY FALLBACK ---
    if (!outputItem) {
        outputItem = { id:0, name:"Unknown Resource", image_url:"images/default_item.png" };
    }
    
    const factory = playerFactory.factories;
    let masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    const assignedCard = playerFactory.player_cards;

    // Apply Expert Time Effect locally for display
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
        return `
            <div class="prod-item">
                <img src="${r.items.image_url}" style="width:30px;">
                <p style="font-size:0.8em; margin:0;">${r.input_quantity} x ${r.items.name}</p>
                <div style="font-size:0.7em; color:${myQty >= r.input_quantity ? '#0f0':'#f00'};">Have: ${myQty}</div>
            </div>
        `;
    }).join('');

    const isRunning = startTime !== null;
    let timeElapsed = isRunning ? (new Date().getTime() - new Date(startTime).getTime()) : 0;
    const timeLeft = masterTime - timeElapsed;

    // Determine Main Action Button
    let mainBtn = '';
    if (isRunning) {
        if (timeLeft <= 0) {
            mainBtn = `<button id="claim-prod-btn" class="action-button" style="background:var(--success-color);">Collect ${outputItem.name}</button>`;
        } else {
            mainBtn = `<button class="action-button" disabled style="opacity:0.5;">Working... (${formatTime(timeLeft)})</button>`;
        }
    } else {
        mainBtn = `<button id="start-prod-btn" class="action-button" ${canStart?'':'disabled style="opacity:0.5;"'}>Start Production</button>`;
    }

    // Expert UI
    let expertHTML = `<div style="border-top:1px solid #333; padding-top:10px; margin-top:15px;">`;
    if (assignedCard) {
        expertHTML += `
            <div style="display:flex; align-items:center; justify-content:center; background:#222; padding:10px; border-radius:8px;">
                <img src="${assignedCard.cards.image_url}" style="width:40px; border-radius:4px; margin-right:10px;">
                <div>
                    <div style="color:#fff; font-weight:bold;">${assignedCard.cards.name}</div>
                    <div style="font-size:0.8em; color:#aaa;">Active Expert</div>
                </div>
            </div>
            <button id="unassign-expert-btn" class="text-button" style="color:red; width:100%; margin-top:5px;">Dismiss Expert</button>
        `;
    } else {
        expertHTML += `<button id="assign-expert-btn" class="action-button small" style="background:#444;">+ Assign Expert</button>`;
    }
    expertHTML += `</div>`;

    // Upgrade UI
    const playerNoub = state.playerProfile.noub_score || 0;
    const canUpgrade = playerFactory.level < FACTORY_UPGRADE_LEVEL_CAP; // Basic check
    const upgradeHTML = `
        <div style="text-align:center; margin-top:10px; font-size:0.8em; color:#666;">
            Level ${playerFactory.level}
            ${canUpgrade ? `<button id="upgrade-modal-btn" class="text-button">Upgrade</button>` : '(Max)'}
        </div>
    `;

    productionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header" style="text-align:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:10px;">
                <img src="${factory.image_url}" style="width:60px; border-radius:10px;">
                <h3 style="color:var(--primary-accent); margin:5px 0;">${factory.name}</h3>
            </div>
            <div class="prod-io" style="display:flex; justify-content:center; gap:10px; align-items:center; margin-bottom:15px;">
                ${requirementsHTML || '<div>Free</div>'}
                <span style="font-size:1.5em;">➝</span>
                <div style="text-align:center;">
                    <img src="${outputItem.image_url}" style="width:40px;">
                    <p style="font-size:0.8em; margin:0;">${outputItem.name}</p>
                </div>
            </div>
            ${mainBtn}
            ${expertHTML}
            ${upgradeHTML}
        </div>
    `;
    
    openModal('production-modal');

    // Bind Events
    document.getElementById('start-prod-btn')?.addEventListener('click', () => handleStartProduction(playerFactory.id, recipes));
    document.getElementById('claim-prod-btn')?.addEventListener('click', () => handleClaimProduction(playerFactory, outputItem));
    document.getElementById('assign-expert-btn')?.addEventListener('click', () => openExpertSelectionModal(playerFactory.id));
    document.getElementById('unassign-expert-btn')?.addEventListener('click', () => unassignExpert(playerFactory.id));
    document.getElementById('upgrade-modal-btn')?.addEventListener('click', () => {
        window.closeModal('production-modal');
        executeFactoryUpgrade(playerFactory);
    });
}

// --- EXPERT SELECTION ---

async function openExpertSelectionModal(factoryId) {
    // Fetch relevant data
    const [{ data: playerCards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    const busyIds = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));
    
    // Filter available cards (Not busy, Not Soul Card)
    const available = playerCards.filter(c => !busyIds.has(c.instance_id) && c.card_id !== 9999 && !c.is_locked);

    const modalId = 'expert-selector-modal';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    const listHTML = available.map(c => `
        <div onclick="window.assignExpert('${factoryId}', '${c.instance_id}')" 
             style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:10px;">
            <img src="${c.cards.image_url}" style="width:40px;">
            <div>
                <div style="color:#fff;">${c.cards.name}</div>
                <div style="font-size:0.7em; color:#888;">Level ${c.level}</div>
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <h3>Select Expert</h3>
            <div style="max-height:300px; overflow-y:auto;">
                ${available.length ? listHTML : '<p style="text-align:center; color:#666;">No available experts.</p>'}
            </div>
        </div>
    `;
    openModal(modalId);
}

// Expose Assign logic
window.assignExpert = async (factoryId, cardInstanceId) => {
    window.closeModal('expert-selector-modal');
    showToast("Assigning...", "info");
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: cardInstanceId })
        .eq('id', factoryId);
        
    if (!error) {
        showToast("Expert Assigned!", "success");
        await refreshPlayerState();
        renderProduction();
    } else {
        showToast("Failed.", "error");
    }
};

async function unassignExpert(factoryId) {
    if (!confirm("Dismiss expert?")) return;
    
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: null })
        .eq('id', factoryId);

    if (!error) {
        showToast("Expert Dismissed.", "success");
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
    
    // 1. Check Specialization
    if ((state.playerProfile.level || 1) >= SPECIALIZATION_UNLOCK_LEVEL) {
        if (!state.specializations || state.specializations.size === 0) {
            renderSpecializationChoice();
            return; // Stop rendering standard view until spec is chosen
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
        card.id = `factory-card-${master.id}`; // For timer updates

        if (isOwned) {
            // Get output item safely
            // Note: api.fetchPlayerFactories uses inner join on factories->items!factories_output...
            // The key might be nested differently depending on Supabase return. 
            // Usually it's factories.items if configured correctly in API select.
            const outputItem = pf.factories.items || pf.factories.output_item || null;
            
            const expertBadge = pf.assigned_card_instance_id ? '<div style="position:absolute; top:5px; right:5px; color:gold; font-size:1.2em;">★</div>' : '';

            card.innerHTML = `
                ${expertBadge}
                <img src="${master.image_url}" style="width:100%; border-radius:6px;">
                <h4>${master.name}</h4>
                <div class="level">Lvl ${pf.level}</div>
                <div class="status" style="color: ${pf.production_start_time ? 'var(--accent-blue)' : 'var(--success-color)'}">
                    ${pf.production_start_time ? 'Working...' : 'Idle'}
                </div>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:0%"></div></div>
            `;
            
            card.onclick = () => openProductionModal(pf, outputItem);
            
            // Start timer loop if active
            if (pf.production_start_time) {
                requestAnimationFrame(() => updateProductionCard(pf, outputItem));
            }
            
        } else {
            const unlockable = playerLevel >= master.required_level;
            card.classList.add(unlockable ? 'unlockable' : 'locked');
            
            card.innerHTML = `
                <img src="${master.image_url}" style="width:100%; border-radius:6px; filter:grayscale(1);">
                <h4>${master.name}</h4>
                <div class="status" style="font-size:0.8em; color:#aaa; margin-top:5px;">
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
    // Helper to populate inventory tabs
    const fillContainer = (container, typeFilter) => {
        container.innerHTML = '';
        state.inventory.forEach(item => {
            // Safety check for item details
            if (item.qty > 0 && item.details && item.details.type === typeFilter) {
                container.innerHTML += `
                    <div class="stock-item">
                        <img src="${item.details.image_url}" style="width:35px;">
                        <div style="font-size:0.75em; margin-top:2px;">${item.details.name}</div>
                        <strong style="color:var(--primary-accent);">${item.qty}</strong>
                    </div>
                `;
            }
        });
        if (container.innerHTML === '') container.innerHTML = '<p style="font-size:0.8em; color:#666; padding:10px;">Empty</p>';
    };

    fillContainer(stockResourcesContainer, 'RESOURCE');
    fillContainer(stockMaterialsContainer, 'MATERIAL');
    fillContainer(stockGoodsContainer, 'GOOD');
}
