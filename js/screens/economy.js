/*
 * Filename: js/screens/economy.js
 * Version: NOUB 0.0.4 (ECONOMY MODULE - FINAL FIX)
 * Description: View Logic Module for Production and Stockpile screens.
 * FIX: Added missing navigateTo import and fixed timeElapsed scope.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo } from '../ui.js'; // NOTE: Added navigateTo import
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 

const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');

// Stockpile Containers
const stockResourcesContainer = document.getElementById('stock-content-resources');
const stockMaterialsContainer = document.getElementById('stock-content-materials');
const stockGoodsContainer = document.getElementById('stock-content-goods');

// Production Time Constants
const ONE_HOUR = 3600000;
const ONE_MINUTE = 60000;
const ONE_SECOND = 1000;

// --- UTILITY FUNCTIONS ---

/**
 * Formats milliseconds into H:MM:SS format.
 */
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


// --- PRODUCTION LOGIC ---

/**
 * Handles the click to start production in a factory.
 */
async function handleStartProduction(factoryId, recipes) {
    if (!state.currentUser) return;

    showToast('Checking resources...');

    // 1. Check Recipe Requirements (Requires checking against state.inventory)
    const requiredItems = recipes.map(r => ({
        id: r.items.id,
        name: r.items.name,
        qty: r.input_quantity
    }));

    let missingResources = false;
    const itemsToConsume = [];

    for (const req of requiredItems) {
        // NOTE: The previous code was missing the item_id lookup in the raw factory data fetch.
        // We assume the inventory map key is the item_id (which is correct for the general structure).
        const playerQty = state.inventory.get(req.id)?.qty || 0;
        if (playerQty < req.qty) {
            missingResources = true;
            showToast(`Missing: ${req.qty - playerQty} x ${req.name}`, 'error');
            break;
        }
        itemsToConsume.push(req);
    }

    if (missingResources) return;

    // 2. Consume Resources
    const consumePromises = itemsToConsume.map(req => {
        // Safely check if item exists in state before trying to get its qty
        const currentQty = state.inventory.get(req.id)?.qty || 0; 
        const newQty = currentQty - req.qty;
        return api.updateItemQuantity(state.currentUser.id, req.id, newQty);
    });

    await Promise.all(consumePromises);

    // 3. Start Production
    const startTime = new Date().toISOString();
    const { error } = await api.startProduction(factoryId, startTime);

    if (error) {
        showToast('Error starting production!', 'error');
        return;
    }

    // 4. Success and Refresh
    showToast('Production started!', 'success');
    await refreshPlayerState();
    renderProduction();
}

/**
 * Handles the click to claim finished production.
 */
async function handleClaimProduction(playerFactory, outputItem) {
    if (!state.currentUser || !outputItem) return;

    const factory = playerFactory.factories;
    const masterTime = factory.base_production_time * ONE_MINUTE; 
    const productionTimeMs = masterTime; 
    
    const timeElapsed = new Date().getTime() - new Date(playerFactory.production_start_time).getTime();
    
    if (timeElapsed < productionTimeMs) {
        showToast('Production is not finished yet.', 'info');
        return;
    }

    showToast('Claiming resources...', 'info');

    const quantityProduced = 1;

    // 1. Update Inventory Quantity
    const currentQty = state.inventory.get(outputItem.id)?.qty || 0;
    const newQuantity = currentQty + quantityProduced;
    
    // We update inventory and clear the production start time in parallel
    const [claimResult, ] = await Promise.all([
        api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, newQuantity),
        // Track resource gathering for quests
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


// --- PRODUCTION UI RENDER ---

/**
 * Updates the timer display in the production card.
 */
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
            statusEl.textContent = `Time Left: ${formatTime(timeLeft)}`;
            progressEl.style.width = `${(timeElapsed / masterTime) * 100}%`;
            card.onclick = () => openProductionModal(factory, outputItem);
            
            // Set up recurring update if not already running (simplified approach)
            if (!card.dataset.timerRunning) {
                card.dataset.timerRunning = 'true';
                setTimeout(() => {
                    updateProductionCard(factory, outputItem); // Re-run update after 1 sec
                    card.dataset.timerRunning = '';
                }, ONE_SECOND);
            }
        }
    } else {
        // Not running
        card.querySelector('.status').textContent = 'Ready to Start';
        card.querySelector('.progress-bar-inner').style.width = '0%';
        card.onclick = () => openProductionModal(factory, outputItem);
    }
}

/**
 * Opens the detailed production modal.
 */
function openProductionModal(playerFactory, outputItem) {
    const factory = playerFactory.factories;
    const masterTime = factory.base_production_time * ONE_MINUTE;
    const startTime = playerFactory.production_start_time;
    
    // Check requirements vs inventory
    let canStart = true;
    const requirementsHTML = factory.factory_recipes.map(recipe => {
        // NOTE: The recipe structure in api.js is complex; we assume recipe.items.id holds the material ID
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
    
    // CRITICAL FIX: Define timeElapsed here to be used in the template string later
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

    productionModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header">
                <img src="${factory.image_url || 'images/default_building.png'}" alt="${factory.name}">
                <h3>${factory.name}</h3>
                <p class="level">Level: ${playerFactory.level}</p>
            </div>
            
            <div class="prod-modal-body">
                <h4 style="color:var(--text-secondary); text-align:center;">Input ➡️ Output</h4>
                <div class="prod-io">
                    <!-- Input -->
                    ${requirementsHTML.length > 0 ? requirementsHTML : '<div class="prod-item"><p>None</p><div class="label">Input</div></div>'}
                    
                    <span class="arrow">➡️</span>
                    
                    <!-- Output -->
                    <div class="prod-item">
                        <img src="${outputItem.image_url || 'images/default_item.png'}" alt="${outputItem.name}">
                        <p>1 x ${outputItem.name}</p>
                        <div class="label">Output</div>
                    </div>
                </div>

                <!-- Timer / Status -->
                <div class="prod-timer">
                    <p class="label">Production Time</p>
                    <div class="time-left">${formatTime(masterTime)}</div>
                    ${isRunning ? `<div class="progress-bar-modal"><div class="progress-bar-inner-modal" style="width: ${((timeElapsed || 0) / masterTime) * 100}%"></div></div>` : ''}
                </div>
            </div>
            
            ${buttonHTML}
            
            <!-- Upgrade Button (NEW) -->
             <button id="upgrade-factory-btn" class="action-button danger" style="background-color:#555; margin-top: 10px;">Upgrade Factory</button>
        </div>
    `;

    openModal('production-modal');

    // Attach event listeners for actions
    if (document.getElementById('start-prod-btn')) {
        document.getElementById('start-prod-btn').onclick = () => handleStartProduction(playerFactory.id, factory.factory_recipes);
    } else if (document.getElementById('claim-prod-btn')) {
        document.getElementById('claim-prod-btn').onclick = () => handleClaimProduction(playerFactory, outputItem);
    }
    
    // Attach UPGRADE listener (CRITICAL FIX: Use imported navigateTo)
    const upgradeFactoryBtn = document.getElementById('upgrade-factory-btn');
    if(upgradeFactoryBtn) {
        upgradeFactoryBtn.onclick = () => {
            window.closeModal('production-modal');
            navigateTo('card-upgrade-screen'); // Use the imported navigateTo function
        };
    }
}


export async function renderProduction() {
    if (!state.currentUser) return;

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
    
    // Separate by type
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

        // Card is not clickable until updateProductionCard is called to determine status
        card.onclick = () => openProductionModal(playerFactory, outputItem); 
        
        if (factory.type === 'RESOURCE') {
            resourcesContainer.appendChild(card);
        } else {
            workshopsContainer.appendChild(card);
        }
        
        // Initial status update
        updateProductionCard(playerFactory, outputItem);
    });
    
    // Call renderStock after production buildings are loaded
    await renderStock();
}


// --- STOCKPILE LOGIC ---

export async function renderStock() {
    if (!state.currentUser) return;
    
    // CRITICAL FIX: Ensure the latest state is loaded before rendering
    await refreshPlayerState(); 
    
    // Clear containers before rendering
    stockResourcesContainer.innerHTML = '';
    stockMaterialsContainer.innerHTML = '';
    stockGoodsContainer.innerHTML = '';

    let hasStock = false;
    
    // NOTE: state.inventory is a Map with item_id as key, and value { qty: N, details: {...} }

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
            
            // Sort into correct containers based on item.details.type
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
        // Add placeholders if no stock is found
        if (stockResourcesContainer.innerHTML === '') stockResourcesContainer.innerHTML = '<p style="text-align:center;">No resources found.</p>';
        if (stockMaterialsContainer.innerHTML === '') stockMaterialsContainer.innerHTML = '<p style="text-align:center;">No materials found.</p>';
        if (stockGoodsContainer.innerHTML === '') stockGoodsContainer.innerHTML = '<p style="text-align:center;">No goods found.</p>';
    }
}
// NO EXPORT HERE
