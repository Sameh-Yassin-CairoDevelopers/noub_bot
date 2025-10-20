
import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

// DOM element references for the screens this module controls
const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');

// Holds the setInterval timer for the production countdown to be cleared later
let productionInterval;

/**
 * A utility function to format a number of seconds into HH:MM:SS format.
 * @param {number} seconds - The total seconds to format.
 * @returns {string} The formatted time string.
 */
function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Handles the logic for claiming a finished production.
 * @param {object} playerFactory - The player_factory object from the database.
 * @param {object} outputItem - The item object being produced.
 */
async function handleClaimProduction(playerFactory, outputItem) {
    showToast('Claiming...');

    // First, fetch the current inventory to calculate the new quantity
    const { data: inventory } = await api.fetchPlayerInventory(state.currentUser.id);
    const existingItem = inventory.find(i => i.items.id === outputItem.id);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newQuantity = currentQuantity + 1; // For now, production output is always 1

    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, newQuantity);

    if (error) {
        showToast('Error claiming production!', 'error');
        console.error(error);
    } else {
        showToast(`Claimed 1 ${outputItem.name}!`, 'success');
        closeModal('production-modal');
        renderResources(); // Refresh the screen to show the factory is now idle
    }
}

/**
 * Updates the countdown timer and progress bar in the production modal.
 * @param {object} playerFactory - The player_factory object from the database.
 */
function updateProductionModal(playerFactory) {
    const timeLeftEl = document.getElementById('time-left');
    const progressBar = document.getElementById('progress-bar-inner');
    const claimBtn = document.getElementById('prod-action-btn');

    const totalTime = playerFactory.factories.base_production_time;
    const startTime = new Date(playerFactory.production_start_time).getTime();
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const timeLeft = totalTime - elapsed;

    if (timeLeft > 0) {
        timeLeftEl.textContent = formatTime(timeLeft);
        const progress = (elapsed / totalTime) * 100;
        progressBar.style.width = `${Math.min(100, progress)}%`;
        claimBtn.disabled = true; // Cannot claim until finished
    } else {
        timeLeftEl.textContent = 'Ready to Claim!';
        progressBar.style.width = '100%';
        claimBtn.disabled = false;
        claimBtn.textContent = 'Claim';
        clearInterval(productionInterval); // Stop the timer
    }
}

/**
 * Handles the logic for starting a new production cycle.
 * @param {object} playerFactory - The player_factory object from the database.
 */
async function handleStartProduction(playerFactory) {
    showToast('Starting production...');
    const { error } = await api.startProduction(playerFactory.id, new Date().toISOString());
    if (error) {
        showToast('Error starting production!', 'error');
        console.error(error);
    } else {
        showToast('Production started!', 'success');
        closeModal('production-modal');
        renderResources(); // Refresh the screen to show the factory is now producing
    }
}

/**
 * Dynamically builds and displays the production modal based on the selected factory.
 * @param {object} playerFactory - The player_factory object from the database.
 */
function openProductionModal(playerFactory) {
    clearInterval(productionInterval); // Clear any previous timer
    const factoryInfo = playerFactory.factories;
    const outputItem = factoryInfo.items;
    const isProducing = playerFactory.production_start_time !== null;

    let modalHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('production-modal')">&times;</button>
            <div class="prod-modal-header">
                <img src="${factoryInfo.image_url}" alt="${factoryInfo.name}">
                <h3>${factoryInfo.name}</h3>
                <span class="level">Level ${playerFactory.level}</span>
            </div>
            <div class="prod-modal-body">
                <div class="prod-io">
                    <div class="prod-item">
                        <span class="label">Input</span>
                        <p>None</p> <!-- Placeholder, recipes to be implemented later -->
                    </div>
                    <div class="arrow">→</div>
                    <div class="prod-item">
                        <span class="label">Output</span>
                        <img src="${outputItem.image_url}" alt="${outputItem.name}">
                        <p>1 x ${outputItem.name}</p>
                    </div>
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
        // If already producing, start the countdown timer
        updateProductionModal(playerFactory);
        productionInterval = setInterval(() => updateProductionModal(playerFactory), 1000);
        actionBtn.onclick = () => handleClaimProduction(playerFactory, outputItem);
    } else {
        // If idle, set the button to start production
        actionBtn.onclick = () => handleStartProduction(playerFactory);
    }
}

/**
 * A generic function to render a list of player-owned buildings.
 * @param {HTMLElement} container - The container element to render into.
 * @param {string} type - The type of factory to filter for ('RESOURCE' or 'FACTORY').
 */
async function renderFactories(container, type) {
    if (!state.currentUser) return;
    container.innerHTML = 'Loading buildings...';

    const { data: playerFactories, error } = await api.fetchPlayerFactories(state.currentUser.id);
    if (error) {
        container.innerHTML = 'Error loading buildings.';
        return;
    }

    const filteredFactories = playerFactories.filter(pf => pf.factories.type === type);
    if (filteredFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any ${type.toLowerCase()} buildings yet.</p>`;
        return;
    }

    container.innerHTML = '';
    filteredFactories.forEach(pf => {
        const card = document.createElement('div');
        card.className = 'building-card';
        card.innerHTML = `
            <img src="${pf.factories.image_url}" alt="${pf.factories.name}">
            <h4>${pf.factories.name}</h4>
            <span class="level">Level ${pf.level}</span>
            <div class="status">${pf.production_start_time ? 'Producing...' : 'Idle'}</div>
        `;
        card.onclick = () => openProductionModal(pf);
        container.appendChild(card);
    });
}

/**
 * Renders the player's inventory in the Stockpile screen.
 */
export async function renderStock() {
    const stockResourcesContainer = document.getElementById('stock-resources');
    const stockMaterialsContainer = document.getElementById('stock-materials');
    const stockGoodsContainer = document.getElementById('stock-goods');
    stockResourcesContainer.innerHTML = 'Loading stock...';
    stockMaterialsContainer.innerHTML = '';
    stockGoodsContainer.innerHTML = '';

    const { data: inventory, error } = await api.fetchPlayerInventory(state.currentUser.id);
    if (error) {
        stockResourcesContainer.innerHTML = 'Error loading stock.';
        return;
    }
    
    if (inventory.length === 0) {
        stockResourcesContainer.innerHTML = '<p>Your stockpile is empty.</p>';
        return;
    }

    // Clear all containers before rendering
    stockResourcesContainer.innerHTML = '';
    
    let resourceCount = 0;
    inventory.forEach(invItem => {
        const item = invItem.items;
        const itemEl = document.createElement('div');
        itemEl.className = 'stock-item';
        itemEl.innerHTML = `
            <img src="${item.image_url}" alt="${item.name}">
            <div class="details">
                <h4>${item.name}</h4>
            </div>
            <span class="quantity">${invItem.quantity}</span>
        `;
        // Append the item to the correct tab based on its type
        if (item.type === 'RESOURCE') {
            stockResourcesContainer.appendChild(itemEl);
            resourceCount++;
        }
        // TODO: Add cases for 'MATERIAL' and 'GOOD'
    });

    if(resourceCount === 0) {
        stockResourcesContainer.innerHTML = '<p>No raw resources in stockpile.</p>';
    }
}

// Exported functions to be called by the UI module
export function renderResources() { renderFactories(resourcesContainer, 'RESOURCE'); }
export function renderWorkshops() { workshopsContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Workshops coming in the next update!</p>'; }
