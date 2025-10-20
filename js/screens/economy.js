import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

// DOM element references
const resourcesContainer = document.getElementById('resources-container');
const workshopsContainer = document.getElementById('workshops-container');
const productionModal = document.getElementById('production-modal');

// Holds the setInterval timer to be cleared later
let productionInterval;

// --- Utility Functions ---
function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// --- Event Handlers & Modal Logic ---
async function handleClaimProduction(playerFactory, outputItem) {
    // This function will be re-connected after we confirm rendering works.
    showToast('Claim functionality coming soon!');
}

function updateProductionModal(playerFactory) {
    // This function will be re-connected after we confirm rendering works.
}

async function handleStartProduction(playerFactory) {
    // This function will be re-connected after we confirm rendering works.
    showToast('Start production functionality coming soon!');
}

function openProductionModal(playerFactory, factoryInfo) {
    // This function will be re-connected after we confirm rendering works.
    console.log("Opening modal for:", factoryInfo.name);
}

// --- Core Rendering Functions ---

/**
 * REFACTORED: This function now uses two simple queries instead of one complex one.
 * This is more reliable and directly mirrors our successful test.
 * @param {HTMLElement} container - The container element to render into.
 * @param {string} type - The type of factory to filter for ('RESOURCE' or 'FACTORY').
 */
async function renderFactories(container, type) {
    if (!state.currentUser) return;
    container.innerHTML = 'Loading buildings...';

    // Step 1: Fetch the player's specific factory data (e.g., id, level)
    const { data: playerFactories, error: playerError } = await api.fetchPlayerFactories(state.currentUser.id);
    if (playerError) {
        container.innerHTML = `<p class="error-message">Error loading your buildings: ${playerError.message}</p>`;
        return;
    }

    if (playerFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any buildings yet.</p>`;
        return;
    }

    // Step 2: Fetch the master data for ALL factories (e.g., name, image)
    const { data: masterFactories, error: masterError } = await api.fetchAllMasterFactories();
    if (masterError) {
        container.innerHTML = '<p class="error-message">Error loading factory definitions.</p>';
        return;
    }

    // Now, combine the data on the client-side
    container.innerHTML = '';
    playerFactories.forEach(pf => {
        const factoryInfo = masterFactories.find(f => f.id === pf.factory_id);
        
        if (factoryInfo /* && factoryInfo.type === type */) { // Type filter can be added later
            const card = document.createElement('div');
            card.className = 'building-card';
            card.innerHTML = `
                <img src="${factoryInfo.image_url || 'images/default_building.png'}" alt="${factoryInfo.name}">
                <h4>${factoryInfo.name}</h4>
                <span class="level">Level ${pf.level}</span>
                <div class="status">${pf.production_start_time ? 'Producing...' : 'Idle'}</div>
            `;
            // Re-enable interaction later
            // card.onclick = () => openProductionModal(pf, factoryInfo);
            container.appendChild(card);
        }
    });
}

export async function renderStock() {
    const stockResourcesContainer = document.getElementById('stock-resources');
    stockResourcesContainer.innerHTML = 'Loading stock...';
    
    const { data: inventory, error } = await api.fetchPlayerInventory(state.currentUser.id);
    if (error) {
        stockResourcesContainer.innerHTML = '<p class="error-message">Error loading stock.</p>';
        return;
    }
    
    if (inventory.length === 0) {
        stockResourcesContainer.innerHTML = '<p>Your stockpile is empty.</p>';
        return;
    }

    stockResourcesContainer.innerHTML = '';
    // ... rendering logic will be added here
}

// Exported functions to be called by the UI module
export function renderResources() { renderFactories(resourcesContainer, 'RESOURCE'); }
export function renderWorkshops() { workshopsContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Workshops coming soon!</p>'; }
