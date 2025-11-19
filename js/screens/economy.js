/*
 * Filename: js/screens/economy.js
 * Version: NOUB v1.8.2 (Final Factory Progression & UI Fix)
 * Description: This definitive version provides the final UI fix for the production
 * modal, ensuring correct layout and styling, and solidifies the factory progression system
 * by implementing build logic for unlockable factories.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 
import { trackTaskProgress } from './tasks.js';

// --- Expert Card Effects Dictionary (with Level Scaling) ---
const EXPERT_EFFECTS = {
    'Imhotep': {
        type: 'TIME_REDUCTION_PERCENT',
        values: [10, 12, 15, 18, 22] 
    },
    'Osiris (Underworld)': {
        type: 'TIME_REDUCTION_PERCENT',
        values: [20, 24, 28, 33, 40]
    },
    'Ptah (Creator)': {
        type: 'EXTRA_RESOURCE_CHANCE',
        values: [15, 17, 20, 24, 30]
    }
};

// --- Constants ---
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

// --- DOM Element References ---
const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');
const stockResourcesContainer = document.getElementById('stock-resources-container');
const stockMaterialsContainer = document.getElementById('stock-materials-container');
const stockGoodsContainer = document.getElementById('stock-goods-container');

// --- Specialization Logic ---

async function handleSelectSpecialization(pathId) {
    if (!state.currentUser) return;
    showToast('Unlocking specialization path...', 'info');
    const { error: unlockError } = await api.unlockSpecialization(state.currentUser.id, pathId);
    if (unlockError) {
        showToast('Error unlocking specialization!', 'error');
        console.error("Unlock Specialization Error:", unlockError);
        return;
    }
    const factoryIdsToSeed = SPECIALIZATION_FACTORY_MAP[pathId];
    if (factoryIdsToSeed && factoryIdsToSeed.length > 0) {
        const factoryPromises = factoryIdsToSeed.map(factoryId => {
            return api.supabaseClient.from('player_factories').insert({
                player_id: state.currentUser.id,
                factory_id: factoryId,
                level: 1
            });
        });
        await Promise.all(factoryPromises);
        showToast(`New factories seeded for path ${pathId}!`, 'success');
    }
    showToast('Specialization path unlocked! Refreshing data...', 'success');
    await refreshPlayerState(); 
    window.closeModal('specialization-choice-modal');
    renderProduction();
}

async function renderSpecializationChoice() {
    const modal = document.getElementById('specialization-choice-modal');
    if (!modal) return;
    const { data: paths, error } = await api.fetchSpecializationPaths();
    if (error || !paths) {
        showToast('Could not load specialization paths.', 'error');
        return;
    }
    const selectedPaths = state.specializations || new Map();
    const pathsToDisplay = paths.filter(p => !selectedPaths.has(p.id));
    if (pathsToDisplay.length === 0) {
        showToast("No new specialization paths available.", 'info');
        return;
    }
    const modalHTML = `
        <div class="modal-content specialization-choice-container">
            <h2>Choose Your Path</h2>
            <p>You have reached Level ${SPECIALIZATION_UNLOCK_LEVEL}! It's time to choose your first crafting specialization. This choice will unlock new buildings and recipes.</p>
            <div id="specialization-options">
                ${pathsToDisplay.map(path => `
                    <div class="specialization-card" data-path-id="${path.id}">
                        <h3>${path.name}</h3>
                        <p>${path.description}</p>
                        <div class="costs">
                            <span>Cost: ${path.cost_noub_initial_unlock > 0 ? `${path.cost_noub_initial_unlock} 🪙` : 'Free'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    modal.innerHTML = modalHTML;
    document.querySelectorAll('.specialization-card').forEach(card => {
        card.onclick = () => handleSelectSpecialization(card.dataset.pathId);
    });
    openModal('specialization-choice-modal');
}

// --- Utility Functions ---

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

// --- Core Production Logic ---

async function handleBuildFactory(masterFactory) {
    const buildCostNoub = masterFactory.build_cost_noub || 1000; 

    if (state.playerProfile.noub_score < buildCostNoub) {
        return showToast(`Not enough NOUB to build. Requires ${buildCostNoub} 🪙.`, 'error');
    }

    const confirmation = confirm(`Build ${masterFactory.name} for ${buildCostNoub} NOUB?`);
    if (!confirmation) return;

    showToast(`Constructing ${masterFactory.name}...`, 'info');

    const { error: costError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - buildCostNoub
    });
    if (costError) return showToast('Failed to deduct construction cost.', 'error');

    const { error: buildError } = await api.buildFactory(state.currentUser.id, masterFactory.id);
    if (buildError) {
        console.error("Build Factory Error:", buildError);
        return showToast('An error occurred during construction. Check console for details.', 'error');
    }

    showToast(`${masterFactory.name} has been built!`, 'success');
    await refreshPlayerState();
    renderProduction();
}

async function handleStartProduction(factoryId, recipes) {
    if (!state.currentUser) return;
    showToast('Checking resources...');
    let missingResources = false;
    const itemsToConsume = [];
    for (const req of recipes.map(r => ({ id: r.items.id, name: r.items.name, qty: r.input_quantity }))) {
        const playerQty = state.inventory.get(req.id)?.qty || 0;
        if (playerQty < req.qty) {
            missingResources = true;
            showToast(`Missing: ${req.qty - playerQty} x ${req.name}`, 'error');
            break;
        }
        itemsToConsume.push(req);
    }
    if (missingResources) return;
    const consumePromises = itemsToConsume.map(req => {
        const currentQty = state.inventory.get(req.id)?.qty || 0; 
        const newQty = currentQty - req.qty;
        return api.updateItemQuantity(state.currentUser.id, req.id, newQty);
    });
    await Promise.all(consumePromises);
    const startTime = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, startTime);
    if (error) {
        showToast('Error starting production!', 'error');
        return;
    }
    showToast('Production started!', 'success');
    await refreshPlayerState();
    renderProduction();
}

async function handleClaimProduction(playerFactory, outputItem) {
    if (!state.currentUser || !outputItem) return;
    const factory = playerFactory.factories;
    const assignedCard = playerFactory.player_cards;

    let productionTimeMs = factory.base_production_time * ONE_MINUTE;
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        const cardLevel = assignedCard.level;
        if (cardLevel > 0 && effect.values && effect.values.length >= cardLevel) {
            const effectValue = effect.values[cardLevel - 1];
            if (effect.type === 'TIME_REDUCTION_PERCENT') {
                productionTimeMs -= productionTimeMs * (effectValue / 100);
            }
        }
    }
    
    const timeElapsed = new Date().getTime() - new Date(playerFactory.production_start_time).getTime();
    if (timeElapsed < productionTimeMs) {
        showToast('Production is not finished yet.', 'info');
        return;
    }

    showToast('Claiming resources...', 'info');

    let quantityProduced = 1;
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        const cardLevel = assignedCard.level;
        if (cardLevel > 0 && effect.values && effect.values.length >= cardLevel) {
            const effectValue = effect.values[cardLevel - 1];
            if (effect.type === 'EXTRA_RESOURCE_CHANCE') {
                if (Math.random() * 100 < effectValue) {
                    quantityProduced += 1;
                    showToast(`Expert's Blessing! You received an extra ${outputItem.name}!`, 'success');
                }
            }
        }
    }
    
    const currentQty = state.inventory.get(outputItem.id)?.qty || 0;
    const newQuantity = currentQty + quantityProduced;
    
    const [claimResult] = await Promise.all([
        api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, newQuantity),
        outputItem.type === 'RESOURCE' ? trackDailyActivity('resources', quantityProduced, outputItem.name) : null
    ]);

    if (claimResult.error) {
        showToast('Error claiming production!', 'error');
        return;
    }

    const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 2);
    if (leveledUp) {
        showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
    }
    
    await trackTaskProgress('production_claim', quantityProduced);

    showToast(`Claimed ${quantityProduced} x ${outputItem.name}!`, 'success');
    await refreshPlayerState();
    renderProduction();
    window.closeModal('production-modal');
}

async function executeFactoryUpgrade(playerFactory) { 
    if (!state.currentUser || !playerFactory) return;

    if (playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP) {
        showToast('Factory has reached its maximum level.', 'error');
        return;
    }

    showToast('Processing factory upgrade...', 'info');
    
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => 
        item.details.name === FACTORY_UPGRADE_ITEM_NAME
    );
    
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const playerNoub = state.playerProfile.noub_score || 0;

    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        showToast(`Error: Missing ${FACTORY_UPGRADE_QTY} ${FACTORY_UPGRADE_ITEM_NAME} or ${FACTORY_UPGRADE_COST} NOUB for upgrade.`, 'error');
        return;
    }

    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoub });
    const { error: inventoryError } = await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);

    if (profileError || inventoryError) {
        showToast('Error consuming resources for upgrade!', 'error');
        return;
    }
    
    const newLevel = playerFactory.level + 1;
    const { error: factoryError } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (factoryError) {
        showToast('Error updating factory level!', 'error');
        return;
    }
    
    const { leveledUp, newLevel: playerNewLevel } = await api.addXp(state.currentUser.id, 20);
    if (leveledUp) {
        showToast(`LEVEL UP! You have reached Level ${playerNewLevel}!`, 'success');
    }

    showToast(`Factory Upgraded! ${playerFactory.factories.name} LVL ${playerFactory.level} → LVL ${newLevel}`, 'success');
    
    await refreshPlayerState(); 
    
    if (document.getElementById('economy-screen').classList.contains('hidden')) {
        navigateTo('economy-screen');
    } else {
        renderProduction();
    }
}

async function openExpertSelectionModal(playerFactoryId) {
    const [{ data: playerCards, error: cardsError }, { data: playerFactories, error: factoriesError }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);
    if (cardsError || factoriesError || !playerCards) {
        showToast("Could not load required data.", 'error');
        return;
    }
    const assignedCardIds = new Set(playerFactories.map(f => f.assigned_card_instance_id).filter(id => id !== null));
    const availableCards = playerCards.filter(card => !assignedCardIds.has(card.instance_id));
    let cardsHTML = availableCards.map(card => `
        <div class="card-stack" data-instance-id="${card.instance_id}" style="cursor: pointer;">
            <img src="${card.cards.image_url || 'images/default_card.png'}" class="card-image">
            <h4>${card.cards.name}</h4>
            <div class="card-details"><span class="card-level">LVL ${card.level}</span></div>
        </div>
    `).join('');
    let selectionModal = document.getElementById('expert-selection-modal');
    if (!selectionModal) {
        selectionModal = document.createElement('div');
        selectionModal.id = 'expert-selection-modal';
        selectionModal.className = 'modal-overlay hidden';
        document.body.appendChild(selectionModal);
    }
    selectionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('expert-selection-modal')">&times;</button>
            <h2>Select an Expert</h2>
            <div class="card-grid">${cardsHTML || '<p>No available experts to assign.</p>'}</div>
        </div>
    `;
    selectionModal.querySelectorAll('.card-stack').forEach(cardElement => {
        cardElement.onclick = async () => {
            const cardInstanceId = cardElement.dataset.instanceId;
            await assignExpert(playerFactoryId, cardInstanceId);
            closeModal('expert-selection-modal');
            closeModal('production-modal');
        };
    });
    openModal('expert-selection-modal');
}

async function assignExpert(playerFactoryId, cardInstanceId) {
    showToast("Assigning expert...", 'info');
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: cardInstanceId })
        .eq('id', playerFactoryId);

    if (error) {
        showToast("Failed to assign expert!", 'error');
        console.error("Assign Expert Error:", error);
    } else {
        await trackTaskProgress('assign_expert'); 
        showToast("Expert assigned successfully!", 'success');
        await refreshPlayerState();
        renderProduction();
    }
}

async function unassignExpert(playerFactoryId) {
    showToast("Unassigning expert...", 'info');
    const { error } = await api.supabaseClient
        .from('player_factories')
        .update({ assigned_card_instance_id: null })
        .eq('id', playerFactoryId);
    
    if (error) {
        showToast("Failed to unassign expert!", 'error');
        console.error(error);
    } else {
        showToast("Expert unassigned.", 'success');
        await refreshPlayerState();
        renderProduction();
        closeModal('production-modal');
    }
}

function updateProductionCard(factory, outputItem) {
    const cardId = `factory-card-${factory.factories.id}`;
    const card = document.getElementById(cardId);
    if (!card) return;

    const assignedCard = factory.player_cards;
    const startTime = factory.production_start_time;
    
    let masterTime = factory.factories.base_production_time * ONE_MINUTE;
    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        const cardLevel = assignedCard.level;
        if (cardLevel > 0 && effect.values && effect.values.length >= cardLevel) {
            const effectValue = effect.values[cardLevel - 1];
            if (effect.type === 'TIME_REDUCTION_PERCENT') {
                masterTime -= masterTime * (effectValue / 100);
            }
        }
    }
    
    if (startTime) {
        const timeElapsed = new Date().getTime() - new Date(startTime).getTime();
        const timeLeft = masterTime - timeElapsed;
        const statusEl = card.querySelector('.status');
        const progressEl = card.querySelector('.progress-bar-inner');

        if (timeLeft <= 0) {
            statusEl.textContent = `Ready: ${outputItem.name}`;
            progressEl.style.width = '100%';
        } else {
            statusEl.textContent = `Time: ${formatTime(timeLeft)}`;
            progressEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            if (!card.dataset.timerRunning) {
                card.dataset.timerRunning = 'true';
                setTimeout(() => {
                    updateProductionCard(factory, outputItem);
                    card.dataset.timerRunning = '';
                }, ONE_SECOND);
            }
        }
    } else {
        card.querySelector('.status').textContent = 'Ready to Start';
        card.querySelector('.progress-bar-inner').style.width = '0%';
    }
}

function openProductionModal(playerFactory, outputItem) {
    const factory = playerFactory.factories;
    let masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    const assignedCard = playerFactory.player_cards;

    if (assignedCard && EXPERT_EFFECTS[assignedCard.cards.name]) {
        const effect = EXPERT_EFFECTS[assignedCard.cards.name];
        const cardLevel = assignedCard.level;
        if (cardLevel > 0 && effect.values && effect.values.length >= cardLevel) {
            const effectValue = effect.values[cardLevel - 1];
            if (effect.type === 'TIME_REDUCTION_PERCENT') {
                masterTime -= masterTime * (effectValue / 100);
            }
        }
    }
    
    let canStart = true;
    const requirementsHTML = factory.factory_recipes.map(recipe => {
        const materialId = recipe.items.id; 
        const playerQty = state.inventory.get(materialId)?.qty || 0;
        const hasEnough = playerQty >= recipe.input_quantity;
        if (!hasEnough) canStart = false;
        
        return `<div class="prod-item"><img src="${recipe.items.image_url || 'images/default_item.png'}"><p>${recipe.input_quantity} x <span style="color:${hasEnough ? 'var(--success-color)' : 'var(--danger-color)'}">${recipe.items.name}</span></p><div class="label">(Owned: ${playerQty})</div></div>`;
    }).join('');
    
    const isRunning = startTime !== null;
    let buttonHTML = '';
    let timeElapsed = 0;

    if (isRunning) {
        timeElapsed = new Date().getTime() - new Date(startTime).getTime();
        const timeLeft = masterTime - timeElapsed;
        buttonHTML = (timeLeft <= 0) ? `<button id="claim-prod-btn" class="action-button">Claim ${outputItem.name}</button>` : `<button class="action-button" disabled>Production Running...</button>`;
    } else {
        buttonHTML = `<button id="start-prod-btn" class="action-button" ${canStart ? '' : 'disabled'}>Start Production</button>`;
    }

    let expertSectionHTML = `<div id="expert-assignment-section" style="margin-top: 15px; border-top: 1px solid #3a3a3c; padding-top: 10px; text-align: center;"><h4>Assigned Expert</h4>`;
    if (assignedCard) {
        expertSectionHTML += `<div class="expert-card" style="display: flex; align-items: center; background: #2a2a2e; padding: 8px; border-radius: 6px; justify-content: center;"><img src="${assignedCard.cards.image_url || 'images/default_card.png'}" style="width: 40px; height: 40px; border-radius: 4px; margin-right: 10px;"><div><h5 style="margin: 0;">${assignedCard.cards.name}</h5><p style="font-size: 0.8em; margin: 0; color: #aaa;">LVL ${assignedCard.level}</p></div></div><button id="unassign-expert-btn" class="action-button small danger" style="margin-top: 10px;">Unassign</button>`;
    } else {
        expertSectionHTML += `<div class="expert-placeholder" style="border: 2px dashed #3a3a3c; padding: 20px; border-radius: 6px;"><p>No Expert Assigned</p><button id="assign-expert-btn" class="action-button small">Assign Expert</button></div>`;
    }
    expertSectionHTML += `</div>`;

    const playerNoub = state.playerProfile.noub_score || 0;
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => item.details.name === FACTORY_UPGRADE_ITEM_NAME);
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const canUpgrade = playerFactory.level < FACTORY_UPGRADE_LEVEL_CAP && playerNoub >= FACTORY_UPGRADE_COST && playerMaterialQty >= FACTORY_UPGRADE_QTY;
    const upgradeDisabledText = playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP ? 'MAX LEVEL' : (canUpgrade ? 'Upgrade' : 'Missing Resources');
    const upgradeCostHTML = `<div style="margin-top: 15px; border-top: 1px solid #3a3a3c; padding-top: 10px; text-align: center;"><h4>Upgrade to Level ${playerFactory.level + 1}</h4><div class="cost-item"><span style="color: ${playerNoub >= FACTORY_UPGRADE_COST ? 'var(--success-color)' : 'var(--danger-color)'};">${FACTORY_UPGRADE_COST} 🪙</span></div><div class="cost-item"><span style="color: ${playerMaterialQty >= FACTORY_UPGRADE_QTY ? 'var(--success-color)' : 'var(--danger-color)'};">${FACTORY_UPGRADE_QTY} x ${FACTORY_UPGRADE_ITEM_NAME}</span></div><button id="upgrade-factory-btn" class="action-button small" style="background-color: ${canUpgrade ? '#5dade2' : '#7f8c8d'}; width: 150px;" ${!canUpgrade ? 'disabled' : ''}>${upgradeDisabledText}</button></div>`;

    productionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header">
                <img src="${factory.image_url || 'images/default_building.png'}" alt="${factory.name}">
                <h3>${factory.name}</h3>
                <p class="level">Current Level: ${playerFactory.level}</p>
            </div>
            <div class="prod-modal-body">
                <h4 style="color:var(--text-secondary); text-align:center;">Input ➡️ Output (Time: ${formatTime(masterTime)})</h4>
                <div class="prod-io">
                    ${requirementsHTML.length > 0 ? requirementsHTML : '<div class="prod-item"><p>None</p><div class="label">Input</div></div>'}
                    <span class="arrow">➡️</span>
                    <div class="prod-item">
                        <img src="${outputItem.image_url || 'images/default_item.png'}" alt="${outputItem.name}">
                        <p>1 x ${outputItem.name}</p>
                        <div class="label">Output</div>
                    </div>
                </div>
                <div class="prod-timer">
                    ${isRunning ? `<div class="time-left">Time Left: ${formatTime(masterTime - timeElapsed)}</div><div class="progress-bar"><div class="progress-bar-inner" style="width: ${((timeElapsed || 0) / masterTime) * 100}%"></div></div>` : ''}
                </div>
            </div>
            ${buttonHTML}
            ${expertSectionHTML}
            ${upgradeCostHTML}
        </div>`;
    openModal('production-modal');

    if (document.getElementById('start-prod-btn')) document.getElementById('start-prod-btn').onclick = () => handleStartProduction(playerFactory.id, factory.factory_recipes);
    if (document.getElementById('claim-prod-btn')) document.getElementById('claim-prod-btn').onclick = () => handleClaimProduction(playerFactory, outputItem);
    if (document.getElementById('assign-expert-btn')) document.getElementById('assign-expert-btn').onclick = () => openExpertSelectionModal(playerFactory.id);
    if (document.getElementById('unassign-expert-btn')) document.getElementById('unassign-expert-btn').onclick = () => unassignExpert(playerFactory.id);
    const upgradeFactoryBtn = document.getElementById('upgrade-factory-btn');
    if(upgradeFactoryBtn && canUpgrade) upgradeFactoryBtn.onclick = () => { window.closeModal('production-modal'); executeFactoryUpgrade(playerFactory); };
}

export async function renderProduction() {
    if (!state.currentUser || !state.playerProfile) return;
    if (state.playerProfile.level === undefined) await refreshPlayerState();
    
    const hasSpecialization = state.specializations && state.specializations.size > 0;
    if (state.playerProfile.level >= SPECIALIZATION_UNLOCK_LEVEL && !hasSpecialization) {
        renderSpecializationChoice();
        return;
    }
    
    resourcesContainer.innerHTML = 'Loading...';
    workshopsContainer.innerHTML = 'Loading...';
    
    const [{ data: playerFactories, error: pError }, { data: masterFactories, error: mError }] = await Promise.all([
        api.fetchPlayerFactories(state.currentUser.id),
        api.fetchAllMasterFactories()
    ]);

    if (pError || mError) {
        resourcesContainer.innerHTML = '<p class="error-message">Error loading factory data.</p>';
        workshopsContainer.innerHTML = '<p class="error-message"></p>';
        console.error("Factory Fetch Error:", pError || mError);
        return;
    }

    resourcesContainer.innerHTML = '';
    workshopsContainer.innerHTML = '';
    
    const playerFactoriesMap = new Map(playerFactories.map(pf => [pf.factories.id, pf]));
    const playerLevel = state.playerProfile.level;

    masterFactories.sort((a,b) => a.id - b.id).forEach(masterFactory => {
        const isOwned = playerFactoriesMap.has(masterFactory.id);
        const playerFactoryInstance = isOwned ? playerFactoriesMap.get(masterFactory.id) : null;
        
        let factoryState = 'locked';
        let action = () => showToast(`Requires Level ${masterFactory.required_level} to unlock.`, 'info');
        let cardStyle = 'opacity: 0.5; border: 2px dashed #444;';
        
        if (isOwned) {
            factoryState = 'owned';
            const outputItem = playerFactoryInstance.factories.items;
            action = () => openProductionModal(playerFactoryInstance, outputItem);
            cardStyle = '';
        } else if (playerLevel >= masterFactory.required_level) {
            factoryState = 'unlockable';
            action = () => handleBuildFactory(masterFactory);
            cardStyle = 'opacity: 1; border: 2px dashed var(--primary-accent); cursor: pointer;';
        }

        const card = document.createElement('div');
        card.className = 'building-card';
        card.id = `factory-card-${masterFactory.id}`;
        card.style.cssText = cardStyle;

        let levelText = '';
        let statusText = `Lvl ${masterFactory.required_level} Req.`;
        let expertIndicator = '';
        
        if (factoryState === 'owned') {
            levelText = `Level: ${playerFactoryInstance.level}`;
            statusText = 'Loading...';
            const hasExpert = !!playerFactoryInstance.player_cards;
            expertIndicator = hasExpert ? '<span class="expert-indicator" style="position: absolute; top: 5px; right: 5px; font-size: 1.2em; filter: drop-shadow(0 0 3px gold);">✨</span>' : '';
        } else if (factoryState === 'unlockable') {
            statusText = 'Build Now';
            levelText = `Cost: ${masterFactory.build_cost_noub || 1000} 🪙`;
        }

        card.innerHTML = `
            ${expertIndicator}
            <img src="${masterFactory.image_url || 'images/default_building.png'}" alt="${masterFactory.name}">
            <h4>${masterFactory.name}</h4>
            <div class="level">${levelText}</div>
            <div class="status">${statusText}</div>
            <div class="progress-bar"><div class="progress-bar-inner"></div></div>
        `;
        
        card.onclick = action;
        
        const targetContainer = masterFactory.type === 'RESOURCE' ? resourcesContainer : workshopsContainer;
        targetContainer.appendChild(card);
        
        if (isOwned) {
            updateProductionCard(playerFactoryInstance, playerFactoryInstance.factories.items);
        }
    });
    
    await renderStock();
}

export async function renderStock() {
    if (!state.currentUser) return;
    await refreshPlayerState(); 
    stockResourcesContainer.innerHTML = '';
    stockMaterialsContainer.innerHTML = '';
    stockGoodsContainer.innerHTML = '';
    let hasStock = false;
    state.inventory.forEach(item => {
        if (item.qty > 0) {
            hasStock = true;
            const itemElement = document.createElement('div');
            itemElement.className = 'stock-item';
            const itemName = item.details.name;
            const itemQty = item.qty;
            itemElement.innerHTML = `
                <img src="${item.details.image_url || 'images/default_item.png'}" alt="${itemName}">
                <div class="details">
                    <h4>${itemName}</h4>
                    <span class="quantity">x ${itemQty}</span>
                </div>
            `;
            switch (item.details.type) {
                case 'RESOURCE': stockResourcesContainer.appendChild(itemElement); break;
                case 'MATERIAL': stockMaterialsContainer.appendChild(itemElement); break;
                case 'GOOD': stockGoodsContainer.appendChild(itemElement); break;
            }
        }
    });
    if (!hasStock) {
        stockResourcesContainer.innerHTML = '<p style="text-align:center;">No resources found.</p>';
        stockMaterialsContainer.innerHTML = '<p style="text-align:center;">No materials found.</p>';
        stockGoodsContainer.innerHTML = '<p style="text-align:center;">No goods found.</p>';
    }
}
