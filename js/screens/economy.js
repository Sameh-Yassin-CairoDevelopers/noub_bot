import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, closeModal } from '../ui.js'; // IMPORT closeModal HERE

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
async function handleClaimProduction(playerFactory, masterFactoryData) {
    // This is a placeholder for the more complex logic that will fetch the specific item
    const outputItem = { id: masterFactoryData.output_item_id, name: masterFactoryData.name.replace('Quarry', '').replace('Farm', '').trim() };
    
    showToast('Claiming...');

    const { data: inventory } = await api.fetchPlayerInventory(state.currentUser.id);
    const existingItem = inventory.find(i => i.items && i.items.id === outputItem.id);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newQuantity = currentQuantity + 1;

    const { error } = await api.claimProduction(state.currentUser.id, playerFactory.id, outputItem.id, newQuantity);

    if (error) {
        showToast('Error claiming production!', 'error');
        console.error(error);
    } else {
        showToast(`Claimed 1 ${outputItem.name}!`, 'success');
        closeModal('production-modal');
        renderResources();
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

async function handleStartProduction(playerFactory) {
    showToast('Starting production...');
    const { error } = await api.startProduction(playerFactory.id, new Date().toISOString());
    if (error) {
        showToast('Error starting production!', 'error');
        console.error(error);
    } else {
        showToast('Production started!', 'success');
        closeModal('production-modal');
        renderResources();
    }
}

function openProductionModal(playerFactory, masterFactoryData) {
    const productionModal = document.getElementById('production-modal');
    clearInterval(productionInterval);
    
    const factoryInfo = masterFactoryData;
    const isProducing = playerFactory.production_start_time !== null;
    const outputItemName = factoryInfo.name.replace('Quarry', '').replace('Farm', '').trim();

    // Dynamically create the modal's inner HTML
    let modalHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" id="production-modal-close-btn">&times;</button>
            <div class="prod-modal-header">
                <img src="${factoryInfo.image_url || 'images/default_building.png'}" alt="${factoryInfo.name}">
                <h3>${factoryInfo.name}</h3>
                <span class="level">Level ${playerFactory.level}</span>
            </div>
            <div class="prod-modal-body">
                <div class="prod-io">
                    <div class="prod-item"> <span class="label">Input</span> <p>None</p> </div>
                    <div class="arrow">→</div>
                    <div class="prod-item"> <span class="label">Output</span> <p>1 x ${outputItemName}</p> </div>
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
    
    // Programmatically add event listeners instead of using onclick in HTML
    document.getElementById('production-modal-close-btn').addEventListener('click', () => closeModal('production-modal'));
    
    const actionBtn = document.getElementById('prod-action-btn');

    if (isProducing) {
        updateProductionModal(playerFactory, factoryInfo);
        productionInterval = setInterval(() => updateProductionModal(playerFactory, factoryInfo), 1000);
        actionBtn.onclick = () => handleClaimProduction(playerFactory, factoryInfo);
    } else {
        actionBtn.onclick = () => handleStartProduction(playerFactory);
    }
}

// --- Core Rendering Functions ---
async function renderFactories(container, type) {
    if (!state.currentUser || !container) return;
    container.innerHTML = 'Loading buildings...';

    const { data: playerFactories, error: playerError } = await api.fetchPlayerFactories(state.currentUser.id);
    if (playerError) {
        container.innerHTML = `<p class="error-message">Error loading your buildings: ${playerError.message}</p>`;
        return;
    }

    if (!playerFactories || playerFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any ${type.toLowerCase()} buildings yet.</p>`;
        return;
    }

    const { data: masterFactories, error: masterError } = await api.fetchAllMasterFactories();
    if (masterError) {
        container.innerHTML = '<p class="error-message">Error loading factory definitions.</p>';
        return;
    }

    container.innerHTML = '';
    const filteredFactories = playerFactories.filter(pf => {
        const factoryInfo = masterFactories.find(f => f.id === pf.factory_id);
        return factoryInfo && factoryInfo.type === type;
    });

    if (filteredFactories.length === 0) {
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">You don't own any ${type.toLowerCase()} buildings yet.</p>`;
        return;
    }

    filteredFactories.forEach(pf => {
        const factoryInfo = masterFactories.find(f => f.id === pf.factory_id);
        const card = document.createElement('div');
        card.className = 'building-card';
        card.innerHTML = `
            <img src="${factoryInfo.image_url || 'images/default_building.png'}" alt="${factoryInfo.name}">
            <h4>${factoryInfo.name}</h4>
            <span class="level">Level ${pf.level}</span>
            <div class="status">${pf.production_start_time ? 'Producing...' : 'Idle'}</div>
        `;
        card.onclick = () => openProductionModal(pf, factoryInfo);
        container.appendChild(card);
    });
}

export async function renderStock() {
    const stockResourcesContainer = document.getElementById('stock-resources');
    // ... (rest of the function remains unchanged)
}

// Exported functions to be called by the UI module
export function renderResources() {
    const resourcesContainer = document.getElementById('resources-container');
    if (resourcesContainer) {
        renderFactories(resourcesContainer, 'RESOURCE');
    }
}

export function renderWorkshops() {
    const workshopsContainer = document.getElementById('workshops-container');
    if (workshopsContainer) {
        renderFactories(workshopsContainer, 'FACTORY');
    }
}
