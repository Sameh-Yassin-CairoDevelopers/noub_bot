/*
 * Filename: js/screens/economy.js
 * Version: NOUB 0.0.8 (ECONOMY MODULE - FIX: Factory Upgrade UI Implementation)
 * Description: View Logic Module for Production and Stockpile screens.
 * NEW: Implements the factory upgrade detail and button within the production modal.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 
import { executeFactoryUpgrade } from './upgrade.js'; // NEW: Import the upgrade logic

const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');

// Stockpile Containers
const stockResourcesContainer = document.getElementById('stock-resources-container');
const stockMaterialsContainer = document.getElementById('stock-materials-container');
const stockGoodsContainer = document.getElementById('stock-goods-container');

// Production Time Constants
const ONE_MINUTE = 60000;
const ONE_SECOND = 1000;

// NEW: Specialization Unlock Level
const SPECIALIZATION_UNLOCK_LEVEL = 15;

// --- Factory Upgrade Constants (Should match upgrade.js) ---
const FACTORY_UPGRADE_COST = 500; 
const FACTORY_UPGRADE_ITEM_NAME = 'Limestone Block'; 
const FACTORY_UPGRADE_QTY = 10; 
const FACTORY_UPGRADE_LEVEL_CAP = 10; 

// --- NEW: Specialization Logic (Remains unchanged) ---

/**
 * Handles the player's selection of a new specialization path.
 */
async function handleSelectSpecialization(pathId) {
    showToast('Unlocking specialization path...', 'info');
    
    const { error } = await api.unlockSpecialization(state.currentUser.id, pathId);

    if (error) {
        showToast('Error unlocking specialization!', 'error');
        console.error("Unlock Specialization Error:", error);
    } else {
        showToast('New specialization path unlocked!', 'success');
        await refreshPlayerState(); // Refresh state to get the new specialization
        window.closeModal('specialization-choice-modal');
        renderProduction(); // Re-render the economy hub
    }
}

/**
 * Renders the specialization choice modal for players who have reached the unlock level.
 */
async function renderSpecializationChoice() {
    const modal = document.getElementById('specialization-choice-modal');
    if (!modal) return;

    const { data: paths, error } = await api.fetchSpecializationPaths();
    if (error || !paths) {
        showToast('Could not load specialization paths.', 'error');
        return;
    }

    const modalHTML = `
        <div class="modal-content specialization-choice-container">
            <h2>Choose Your Path</h2>
            <p>You have reached Level ${SPECIALIZATION_UNLOCK_LEVEL}! It's time to choose your first crafting specialization. This choice will unlock new buildings and recipes.</p>
            <div id="specialization-options">
                ${paths.map(path => `
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
    
    // Add event listeners to each card
    document.querySelectorAll('.specialization-card').forEach(card => {
        card.onclick = () => handleSelectSpecialization(card.dataset.pathId);
    });

    openModal('specialization-choice-modal');
}


// --- Utility Functions (Remains unchanged) ---

function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / ONE_SECOND);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}


// --- Production Logic (Remains unchanged) ---

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
    const productionTimeMs = factory.base_production_time * ONE_MINUTE; 
    
    const timeElapsed = new Date().getTime() - new Date(playerFactory.production_start_time).getTime();
    
    if (timeElapsed < productionTimeMs) {
        showToast('Production is not finished yet.', 'info');
        return;
    }

    showToast('Claiming resources...', 'info');

    const quantityProduced = 1;
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

    showToast(`Claimed ${quantityProduced} x ${outputItem.name}!`, 'success');
    await refreshPlayerState();
    renderProduction();
    window.closeModal('production-modal');
}


// --- Production UI Render (CRITICAL: openProductionModal is heavily modified) ---

function updateProductionCard(factory, outputItem) {
    const cardId = `factory-card-${factory.id}`;
    const card = document.getElementById(cardId);
    if (!card) return;

    const startTime = factory.production_start_time;
    const masterTime = factory.factories.base_production_time * ONE_MINUTE;
    
    if (startTime) {
        const timeElapsed = new Date().getTime() - new Date(startTime).getTime();
        const timeLeft = masterTime - timeElapsed;
        const statusEl = card.querySelector('.status');
        const progressEl = card.querySelector('.progress-bar-inner');

        if (timeLeft <= 0) {
            statusEl.textContent = `Ready: ${outputItem.name}`;
            progressEl.style.width = '100%';
            card.onclick = () => handleClaimProduction(factory, outputItem);
        } else {
            statusEl.textContent = `Time: ${formatTime(timeLeft)}`;
            progressEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            card.onclick = () => openProductionModal(factory, outputItem);
            
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
        card.onclick = () => openProductionModal(factory, outputItem);
    }
}

function openProductionModal(playerFactory, outputItem) {
    const factory = playerFactory.factories;
    const masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    
    let canStart = true;
    const requirementsHTML = factory.factory_recipes.map(recipe => {
        const materialId = recipe.items.id; 
        const playerQty = state.inventory.get(materialId)?.qty || 0;
        const hasEnough = playerQty >= recipe.input_quantity;
        if (!hasEnough) canStart = false;
        
        return `
            <div class="prod-item">
                <img src="${recipe.items.image_url || 'images/default_item.png'}" alt="${recipe.items.name}">
                <p>${recipe.input_quantity} x <span style="color:${hasEnough ? 'var(--success-color)' : 'var(--danger-color)'}">${recipe.items.name}</span></p>
                <div class="label">(Owned: ${playerQty})</div>
            </div>
        `;
    }).join('');
    
    const isRunning = startTime !== null;
    let buttonHTML = '';
    let timeElapsed = 0;

    if (isRunning) {
        timeElapsed = new Date().getTime() - new Date(startTime).getTime();
        const timeLeft = masterTime - timeElapsed;

        if (timeLeft <= 0) {
            buttonHTML = `<button id="claim-prod-btn" class="action-button">Claim ${outputItem.name}</button>`;
        } else {
            buttonHTML = `<button class="action-button" disabled>Production Running...</button>`;
        }
    } else {
        buttonHTML = `<button id="start-prod-btn" class="action-button" ${canStart ? '' : 'disabled'}>Start Production</button>`;
    }
    
    // --- NEW: Factory Upgrade Details ---
    const playerNoub = state.playerProfile.noub_score || 0;
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => item.details.name === FACTORY_UPGRADE_ITEM_NAME);
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    
    const canUpgrade = playerFactory.level < FACTORY_UPGRADE_LEVEL_CAP && playerNoub >= FACTORY_UPGRADE_COST && playerMaterialQty >= FACTORY_UPGRADE_QTY;
    const upgradeDisabledText = playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP ? 'MAX LEVEL' : (canUpgrade ? 'Upgrade' : 'Missing Resources');
    const upgradeButtonColor = canUpgrade ? '#5dade2' : '#7f8c8d';

    const upgradeCostHTML = `
        <div style="margin-top: 15px; border-top: 1px solid #3a3a3c; padding-top: 10px; text-align: center;">
            <h4 style="color:var(--primary-accent); margin-bottom: 5px;">Upgrade to Level ${playerFactory.level + 1}</h4>
            <div class="upgrade-cost-grid" style="grid-template-columns: 1fr 1fr; max-width: 250px; margin: 0 auto;">
                <div class="cost-item">
                    <span class="icon">🪙</span>
                    <div class="value" style="color: ${playerNoub >= FACTORY_UPGRADE_COST ? 'var(--success-color)' : 'var(--danger-color)'};">${FACTORY_UPGRADE_COST}</div>
                    <div class="label">NOUB</div>
                </div>
                <div class="cost-item">
                    <span class="icon">🧱</span>
                    <div class="value" style="color: ${playerMaterialQty >= FACTORY_UPGRADE_QTY ? 'var(--success-color)' : 'var(--danger-color)'};">${FACTORY_UPGRADE_QTY}</div>
                    <div class="label">${FACTORY_UPGRADE_ITEM_NAME}</div>
                </div>
            </div>
            <button id="upgrade-factory-btn" class="action-button small" style="background-color: ${upgradeButtonColor}; width: 150px;" ${!canUpgrade ? 'disabled' : ''}>${upgradeDisabledText}</button>
        </div>
    `;

    // Inject the modal HTML
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
            
            ${upgradeCostHTML}
        </div>
    `;

    openModal('production-modal');

    // Add event listeners
    if (document.getElementById('start-prod-btn')) {
        document.getElementById('start-prod-btn').onclick = () => handleStartProduction(playerFactory.id, factory.factory_recipes);
    } else if (document.getElementById('claim-prod-btn')) {
        document.getElementById('claim-prod-btn').onclick = () => handleClaimProduction(playerFactory, outputItem);
    }
    
    const upgradeFactoryBtn = document.getElementById('upgrade-factory-btn');
    if(upgradeFactoryBtn && canUpgrade) {
        // Pass the playerFactory object (containing the player's specific factory data)
        upgradeFactoryBtn.onclick = () => {
            window.closeModal('production-modal'); 
            executeFactoryUpgrade(playerFactory); 
        };
    }
}


export async function renderProduction() {
    if (!state.currentUser || !state.playerProfile) return;

    // Check for specialization unlock
    if (state.playerProfile.level >= SPECIALIZATION_UNLOCK_LEVEL && state.specializations.size === 0) {
        renderSpecializationChoice();
        return;
    }

    resourcesContainer.innerHTML = 'Loading resources buildings...';
    workshopsContainer.innerHTML = 'Loading crafting workshops...';

    const { data: factories, error } = await api.fetchPlayerFactories(state.currentUser.id);

    if (error) {
        resourcesContainer.innerHTML = '<p class="error-message">Error loading factories.</p>';
        workshopsContainer.innerHTML = '<p class="error-message">Error loading factories.</p>';
        return;
    }

    resourcesContainer.innerHTML = '';
    workshopsContainer.innerHTML = '';
    
    const resourceBuildings = factories.filter(f => f.factories.type === 'RESOURCE');
    const workshops = factories.filter(f => f.factories.type === 'WORKSHOP');

    [...resourceBuildings, ...workshops].forEach(playerFactory => {
        const factory = playerFactory.factories;
        const outputItem = factory.items;
        const card = document.createElement('div');
        card.className = 'building-card';
        card.id = `factory-card-${playerFactory.id}`;

        card.innerHTML = `
            <img src="${factory.image_url || 'images/default_building.png'}" alt="${factory.name}">
            <h4>${factory.name}</h4>
            <div class="level">Level: ${playerFactory.level}</div>
            <div class="status">Loading Status...</div>
            <div class="progress-bar"><div class="progress-bar-inner"></div></div>
        `;

        card.onclick = () => openProductionModal(playerFactory, outputItem); 
        
        if (factory.type === 'RESOURCE') {
            resourcesContainer.appendChild(card);
        } else {
            workshopsContainer.appendChild(card);
        }
        
        updateProductionCard(playerFactory, outputItem);
    });
    
    await renderStock();
}


// --- Stockpile Logic (Remains unchanged) ---

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
            itemElement.innerHTML = `
                <img src="${item.details.image_url || 'images/default_item.png'}" alt="${item.details.name}">
                <div class="details">
                    <h4>${item.details.name}</h4>
                    <span class="quantity">x ${item.qty}</span>
                </div>
            `;
            
            switch (item.details.type) {
                case 'RESOURCE':
                    stockResourcesContainer.appendChild(itemElement);
                    break;
                case 'MATERIAL':
                    stockMaterialsContainer.appendChild(itemElement);
                    break;
                case 'GOOD':
                    stockGoodsContainer.appendChild(itemElement);
                    break;
            }
        }
    });

    if (!hasStock) {
        if (stockResourcesContainer.innerHTML === '') stockResourcesContainer.innerHTML = '<p style="text-align:center;">No resources found.</p>';
        if (stockMaterialsContainer.innerHTML === '') stockMaterialsContainer.innerHTML = '<p style="text-align:center;">No materials found.</p>';
        if (stockGoodsContainer.innerHTML === '') stockGoodsContainer.innerHTML = '<p style="text-align:center;">No goods found.</p>';
    }
}
