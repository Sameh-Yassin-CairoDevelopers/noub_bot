/*
 * Filename: js/screens/economy.js
 * Version: 16.0 (Refined UI & Complete)
 * Description: View Logic Module for economy screens.
 * Refactored to handle the unified production screen and improved state management.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

let productionInterval;

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function handleClaimProduction(playerFactory, masterFactoryData) {
    const outputItem = masterFactoryData.items;
    if (!outputItem) {
        showToast('Error: Missing item data!', 'error');
        return;
    }
    
    showToast('Claiming...');

    const currentQuantity = state.inventory.get(outputItem.id)?.qty || 0;
    const newQuantity = currentQuantity + 1;

    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, newQuantity);

    if (error) {
        showToast('Error claiming production!', 'error');
        console.error(error);
    } else {
        state.inventory.set(outputItem.id, { qty: newQuantity, details: outputItem });
        showToast(`Claimed 1 ${outputItem.name}!`, 'success');
        window.closeModal('production-modal');
        renderProduction();
    }
}

function updateProductionModal(playerFactory, masterFactoryData) {
    const timeLeftEl = document.getElementById('time-left');
    const progressBar = document.getElementById('progress-bar-inner');
    const claimBtn = document.getElementById('prod-action-btn');

    if (!timeLeftEl || !progressBar || !claimBtn) return;

    const totalTime = masterFactoryData.base_production_time;
    const startTime = new Date(playerFactory.production_start_time).getTime();
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const timeLeft = totalTime - elapsed;

    if (timeLeft > 0) {
        timeLeftEl.textContent = formatTime(timeLeft);
        const progress = (elapsed / totalTime) * 100;
        progressBar.style.width = `${Math.min(100, progress)}%`;
        claimBtn.disabled = true;
    } else {
        timeLeftEl.textContent = 'Ready to Claim!';
        progressBar.style.width = '100%';
        claimBtn.disabled = false;
        claimBtn.textContent = 'Claim';
        clearInterval(productionInterval);
    }
}

async function handleStartProduction(playerFactory, recipe) {
    showToast('Starting production...');

    if (recipe) {
        const inputItem = recipe.items;
        const requiredQty = recipe.input_quantity;
        const currentQty = state.inventory.get(inputItem.id)?.qty || 0;
        const newQuantity = currentQty - requiredQty;

        const { error: consumeError } = await api.updateItemQuantity(state.currentUser.id, inputItem.id, newQuantity);
        if (consumeError) {
            showToast('Error consuming resources!', 'error');
            console.error(consumeError);
            return;
        }
        state.inventory.set(inputItem.id, { ...state.inventory.get(inputItem.id), qty: newQuantity });
    }

    const { error: startError } = await api.startProduction(playerFactory.id, new Date().toISOString());
    if (startError) {
        showToast('Error starting production!', 'error');
        console.error(startError);
    } else {
        showToast('Production started!', 'success');
        window.closeModal('production-modal');
        renderProduction();
    }
}

async function openProductionModal(playerFactory) {
    const productionModal = document.getElementById('production-modal');
    clearInterval(productionInterval);
    
    const factoryInfo = playerFactory.factories;
    const outputItem = factoryInfo.items;
    const isProducing = playerFactory.production_start_time !== null;

    const recipe = factoryInfo.factory_recipes[0];
    let inputHTML = '<p>None</p>';
    let canAfford = true;

    if (recipe) {
        const inputItem = recipe.items;
        const requiredQty = recipe.input_quantity;
        const playerQty = state.inventory.get(inputItem.id)?.qty || 0;

        canAfford = playerQty >= requiredQty;
        
        inputHTML = `
            <img src="${inputItem.image_url || 'images/default_item.png'}" alt="${inputItem.name}">
            <p style="color: ${canAfford ? 'white' : 'red'};">${playerQty} / ${requiredQty}</p>
        `;
    }

    let modalHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header">
                <img src="${factoryInfo.image_url || 'images/default_building.png'}" alt="${factoryInfo.name}">
                <h3>${factoryInfo.name}</h3>
                <span class="level">Level ${playerFactory.level}</span>
            </div>
            <div class="prod-modal-body">
                <div class="prod-io">
                    <div class="prod-item"> <span class="label">Input</span> ${inputHTML} </div>
                    <div class="arrow">→</div>
                    <div class="prod-item"> <span class="label">Output</span> <img src="${outputItem.image_url || 'images/default_item.png'}" alt="${outputItem.name}"> <p>1 x ${outputItem.name}</p> </div>
                </div>
                <div class="prod-timer">
                    <div id="time-left" class="time-left">${formatTime(factoryInfo.base_production_time)}</div>
                    <div class="progress-bar"><div id="progress-bar-inner" class="progress-bar-inner"></div></div>
                </div>
            </div>
            <button id="prod-action-btn" class="action-button">${isProducing ? 'Claim' : 'Start Production'}</button>
        </div>
    `;
    productionModal.innerHTML = modalHTML;
    productionModal.classList.remove('hidden');
    
    const actionBtn = document.getElementById('prod-action-btn');

    if (isProducing) {
        updateProductionModal(playerFactory, factoryInfo);
        productionInterval = setInterval(() => updateProductionModal(playerFactory, factoryInfo), 1000);
        actionBtn.onclick = () => handleClaimProduction(playerFactory, factoryInfo);
    } else {
        actionBtn.onclick = () => handleStartProduction(playerFactory, recipe);
        if (!canAfford) {
            actionBtn.disabled = true;
        }
    }
}

async function renderFactories(container, type) {
    if (!state.currentUser || !container) return;
    container.innerHTML = 'Loading buildings...';

    const { data: playerFactories, error } = await api.fetchPlayerFactories(state.currentUser.id);

    if (error) {
        container.innerHTML = `<p class="error-message">Error loading your buildings: ${error.message}</p>`;
        return;
    }

    if (!playerFactories || playerFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any ${type.toLowerCase()} buildings yet.</p>`;
        return;
    }
    
    const filteredFactories = playerFactories.filter(pf => pf.factories && pf.factories.type === type);
    
    if (filteredFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any ${type.toLowerCase()} buildings yet.</p>`;
        return;
    }

    container.innerHTML = '';
    filteredFactories.forEach(pf => {
        const card = document.createElement('div');
        card.className = 'building-card';
        card.innerHTML = `
            <img src="${pf.factories.image_url || 'images/default_building.png'}" alt="${pf.factories.name}">
            <h4>${pf.factories.name}</h4>
            <span class="level">Level ${pf.level}</span>
            <div class="status">${pf.production_start_time ? 'Producing...' : 'Idle'}</div>
        `;
        card.onclick = () => openProductionModal(pf);
        container.appendChild(card);
    });
}

/**
 * Renders both resource and workshop sections on the unified production screen.
 */
export function renderProduction() {
    const resourcesContainer = document.getElementById('resources-container');
    const workshopsContainer = document.getElementById('workshops-container');
    if (resourcesContainer) renderFactories(resourcesContainer, 'RESOURCE');
    if (workshopsContainer) renderFactories(workshopsContainer, 'FACTORY');
}

/**
 * Renders the player's inventory, now distributing items into correct tabs.
 */
export async function renderStock() {
    const stockResourcesContainer = document.getElementById('stock-resources');
    const stockMaterialsContainer = document.getElementById('stock-materials');
    const stockGoodsContainer = document.getElementById('stock-goods');

    if (!stockResourcesContainer) return;

    stockResourcesContainer.innerHTML = 'Loading stock...';
    stockMaterialsContainer.innerHTML = '';
    stockGoodsContainer.innerHTML = '';
    
    const { data: inventoryData, error } = await api.fetchPlayerInventory(state.currentUser.id);
    if (error) {
        stockResourcesContainer.innerHTML = '<p class="error-message">Error loading stock.</p>';
        return;
    }

    state.inventory.clear();
    inventoryData.forEach(item => {
        state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
    });

    if (state.inventory.size === 0) {
        stockResourcesContainer.innerHTML = '<p>Your stockpile is empty.</p>';
        stockMaterialsContainer.innerHTML = '<p>Your stockpile is empty.</p>';
        stockGoodsContainer.innerHTML = '<p>Your stockpile is empty.</p>';
        return;
    }

    stockResourcesContainer.innerHTML = '';
    stockMaterialsContainer.innerHTML = '';
    stockGoodsContainer.innerHTML = '';
    
    let resourceCount = 0, materialCount = 0, goodCount = 0;
    for (const [itemId, itemData] of state.inventory.entries()) {
        const itemDetails = itemData.details;
        if (itemDetails) {
            const itemEl = document.createElement('div');
            itemEl.className = 'stock-item';
            itemEl.innerHTML = `
                <img src="${itemDetails.image_url || 'images/default_item.png'}" alt="${itemDetails.name}">
                <div class="details">
                    <h4>${itemDetails.name}</h4>
                </div>
                <span class="quantity">${itemData.qty}</span>
            `;

            switch (itemDetails.type) {
                case 'RESOURCE':
                    stockResourcesContainer.appendChild(itemEl);
                    resourceCount++;
                    break;
                case 'MATERIAL':
                    stockMaterialsContainer.appendChild(itemEl);
                    materialCount++;
                    break;
                case 'GOOD':
                    stockGoodsContainer.appendChild(itemEl);
                    goodCount++;
                    break;
            }
        }
    }

    if (resourceCount === 0) stockResourcesContainer.innerHTML = '<p>No raw resources in stockpile.</p>';
    if (materialCount === 0) stockMaterialsContainer.innerHTML = '<p>No materials in stockpile.</p>';
    if (goodCount === 0) stockGoodsContainer.innerHTML = '<p>No goods in stockpile.</p>';
}

// These are legacy and no longer directly called by navigation, but are kept for potential future use.
export function renderResources() {}
export function renderWorkshops() {}
