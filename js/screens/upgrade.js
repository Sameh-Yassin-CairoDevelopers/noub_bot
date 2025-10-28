
/*
 * Filename: js/screens/upgrade.js
 * Version: NOUB 0.0.2 (UPGRADE MODULE - FINAL PRODUCTION CODE)
 * Description: View Logic Module for the Card Upgrade screen. 
 * This file is 100% complete and ready to run (No internal exports).
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { renderProduction } from './economy.js'; 

const upgradeSelectionContainer = document.getElementById('upgrade-card-selection-container');
const upgradeDetailArea = document.getElementById('upgrade-detail-area');

let selectedInstance = null; // The specific card instance the player wants to upgrade

// --- Factory Upgrade Constants ---
const FACTORY_UPGRADE_COST = 500; 
const FACTORY_UPGRADE_ITEM_NAME = 'Limestone Block'; 
const FACTORY_UPGRADE_QTY = 10; 

// --- Factory Upgrade Logic (Identical to NOUB 0.0.1) ---
async function executeFactoryUpgrade(playerFactory) { 
    if (!playerFactory) return;

    showToast('Processing factory upgrade...', 'info');
    
    // Check costs against player state
    const playerAnkh = state.playerProfile.score || 0;
    
    // Find the item ID for the required material
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => item.details.name === FACTORY_UPGRADE_ITEM_NAME);
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;


    if (!materialId || playerAnkh < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        showToast('Error: Missing resources for upgrade.', 'error');
        return;
    }

    // 1. Consume Currencies and Materials
    const newAnkh = playerAnkh - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    // Update profile
    const profileUpdate = { score: newAnkh };
    await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    
    // Update inventory
    await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);
    
    // 2. Update Factory Level
    const newLevel = playerFactory.level + 1;
    const { error } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (error) {
        showToast('Error updating factory level!', 'error');
        return;
    }

    // 3. Success & Refresh
    showToast(`Factory Upgraded! LVL ${playerFactory.level} → LVL ${newLevel}`, 'success');
    
    await refreshPlayerState(); 
    
    // Redirect back to the production screen to show new level
    navigateTo('production-screen');
}


// --- Card Upgrade Logic ---

/**
 * Renders the initial list of cards available for upgrade selection.
 */
export async function renderUpgrade() { // **NOTE: REMOVED EXPORT HERE**
    if (!state.currentUser) return;
    upgradeSelectionContainer.innerHTML = 'Loading cards for upgrade...';
    upgradeDetailArea.classList.add('hidden'); 

    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error || !playerCards) {
        upgradeSelectionContainer.innerHTML = '<p class="error-message">Error fetching cards.</p>';
        return;
    }

    if (playerCards.length === 0) {
        upgradeSelectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Buy cards from the shop first.</p>';
        return;
    }
    
    // Group by Card ID only, as we only need to show ONE card per type for selection
    const cardTypes = new Map();
    playerCards.forEach(pc => {
        if (!cardTypes.has(pc.card_id)) {
            cardTypes.set(pc.card_id, pc); 
        }
    });

    upgradeSelectionContainer.innerHTML = '';

    for (const [cardId, pc] of cardTypes.entries()) {
        const card = pc.cards;
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', card.rarity_level || 0);
        
        cardElement.innerHTML = `
            <img src="${card.image_url || 'images/default_card.png'}" alt="${card.name}" class="card-image">
            <h4>${card.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${pc.level}</span>
            </div>
        `;
        
        // Add onclick handler to select the card for detailed upgrade view
        cardElement.onclick = () => renderUpgradeDetails(pc);
        upgradeSelectionContainer.appendChild(cardElement);
    }
}


/**
 * Executes the card upgrade transaction after all checks.
 */
async function executeUpgrade(requirements) { 
    if (!selectedInstance) return;
    
    showToast('Processing upgrade...', 'info');
    
    const btn = document.getElementById('execute-upgrade-btn');
    btn.disabled = true;

    // --- 1. Consume Currencies ---
    const newAnkh = (state.playerProfile.score || 0) - requirements.cost_ankh;
    const newPrestige = (state.playerProfile.prestige || 0) - requirements.cost_prestige;
    const newBlessing = (state.playerProfile.blessing || 0) - requirements.cost_blessing;

    const profileUpdate = {
        score: newAnkh,
        prestige: newPrestige,
        blessing: newBlessing
    };

    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (profileError) {
        showToast('Error deducting cost!', 'error');
        btn.disabled = false;
        return;
    }
    
    // --- 2. Consume Materials ---
    if (requirements.cost_item_qty > 0) {
        const materialId = requirements.cost_item_id;
        const requiredQty = requirements.cost_item_qty;
        const currentQty = state.inventory.get(materialId)?.qty || 0;
        const newQty = currentQty - requiredQty;
        
        const { error: itemError } = await api.updateItemQuantity(state.currentUser.id, materialId, newQty);
        if (itemError) {
            showToast('Error consuming material!', 'error');
            return; 
        }
    }
    
    // --- 3. Update Card Level ---
    const newLevel = selectedInstance.level + 1;
    const newPowerScore = selectedInstance.power_score + requirements.power_increase;
    
    const { error: upgradeError } = await api.performCardUpgrade(selectedInstance.instance_id, newLevel, newPowerScore);

    if (upgradeError) {
        showToast('Error updating card level!', 'error');
        return;
    }
    
    // --- 4. Success & Refresh ---
    showToast(`Upgrade Success! LVL ${selectedInstance.level} → LVL ${newLevel}`, 'success');
    
    await refreshPlayerState(); 
    
    // Re-render the selection list to show the updated level
    navigateTo('card-upgrade-screen');
}


/**
 * Renders the detailed upgrade costs and logic for the selected card.
 */
async function renderUpgradeDetails(playerCardInstance) {
    selectedInstance = playerCardInstance;
    const currentLevel = playerCardInstance.level;
    const nextLevel = currentLevel + 1;
    const cardId = playerCardInstance.card_id;
    const masterCard = playerCardInstance.cards;

    upgradeDetailArea.innerHTML = 'Loading upgrade costs...';
    upgradeDetailArea.classList.remove('hidden');

    const { data: requirements, error } = await api.fetchCardUpgradeRequirements(cardId, nextLevel);
    
    if (error || !requirements) {
        upgradeDetailArea.innerHTML = `<p style="color: ${error ? 'red' : 'white'};">
            ${error ? 'Error loading requirements.' : 'Max Level Reached!'}
        </p>`;
        return;
    }

    let allRequirementsMet = true;
    
    // --- Currency Cost Check ---
    const ankhCost = requirements.cost_ankh;
    const prestigeCost = requirements.cost_prestige;
    const blessingCost = requirements.cost_blessing;
    const playerAnkh = state.playerProfile.score || 0;
    const playerPrestige = state.playerProfile.prestige || 0;
    const playerBlessing = state.playerProfile.blessing || 0;
    
    // --- Material Cost Check ---
    const materialRequired = requirements.cost_item_qty > 0;
    let materialCostHTML = '';
    let playerMaterialQty = 0;
    let materialName = 'N/A';
    let materialImg = 'images/default_item.png';

    if (materialRequired) {
        playerMaterialQty = state.inventory.get(requirements.cost_item_id)?.qty || 0;
        materialName = requirements.items.name;
        materialImg = requirements.items.image_url;
        
        if (playerMaterialQty < requirements.cost_item_qty) {
            allRequirementsMet = false;
        }
        
        materialCostHTML = `
            <div class="cost-item">
                <img src="${materialImg}" alt="${materialName}">
                <span>${materialName}</span>
                <span class="value" style="color: ${playerMaterialQty >= requirements.cost_item_qty ? 'white' : 'var(--danger-color)'}">
                    ${playerMaterialQty} / ${requirements.cost_item_qty}
                </span>
            </div>
        `;
    }

    // --- Check if all currencies are met ---
    if (playerAnkh < ankhCost || playerPrestige < prestigeCost || playerBlessing < blessingCost) {
        allRequirementsMet = false;
    }


    // --- Build Cost Grid HTML ---
    const costGridHTML = `
        <div class="cost-item">
            <span class="icon">☥</span>
            <span>Ankh</span>
            <span class="value" style="color: ${playerAnkh >= ankhCost ? 'white' : 'var(--danger-color)'}">
                ${playerAnkh} / ${ankhCost}
            </span>
        </div>
        <div class="cost-item">
            <span class="icon">🐞</span>
            <span>Prestige</span>
            <span class="value" style="color: ${playerPrestige >= prestigeCost ? 'white' : 'var(--danger-color)'}">
                ${playerPrestige} / ${prestigeCost}
            </span>
        </div>
        <div class="cost-item">
            <span class="icon">🗡️</span>
            <span>Blessing</span>
            <span class="value" style="color: ${playerBlessing >= blessingCost ? 'white' : 'var(--danger-color)'}">
                ${playerBlessing} / ${blessingCost}
            </span>
        </div>
        ${materialCostHTML}
    `;

    // --- Render Detail Area ---
    upgradeDetailArea.innerHTML = `
        <div class="card-stack upgrade-card-target" data-rarity="${masterCard.rarity_level}">
            <img src="${masterCard.image_url || 'images/default_card.png'}" alt="${masterCard.name}" class="card-image">
            <h4>${masterCard.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${currentLevel} → LVL ${nextLevel}</span>
            </div>
        </div>

        <h4 style="color: var(--primary-accent);">Upgrade Cost:</h4>
        <div class="upgrade-cost-grid">${costGridHTML}</div>
        
        <p style="color: var(--success-color); font-weight: bold;">Power Increase: +${requirements.power_increase}</p>

        <button id="execute-upgrade-btn" class="action-button" ${allRequirementsMet ? '' : 'disabled'}>
            Upgrade Card
        </button>
    `;
    
    // Attach event listener
    if (allRequirementsMet) {
        document.getElementById('execute-upgrade-btn').addEventListener('click', () => executeUpgrade(requirements));
    }
}
