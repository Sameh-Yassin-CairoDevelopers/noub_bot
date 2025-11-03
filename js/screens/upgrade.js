/*
 * Filename: js/screens/upgrade.js
 * Version: NOUB 0.0.6 (UPGRADE MODULE - FINAL FIX)
 * Description: View Logic Module for the Card Upgrade screen.
 * FIXED: card_levels 400 Bad Request by using correct column names from DB for costs.
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

// --- Factory Upgrade Logic ---
async function executeFactoryUpgrade(playerFactory) { 
    if (!playerFactory) return;

    showToast('Processing factory upgrade...', 'info');
    
    const playerNoub = state.playerProfile.noub_score || 0;
    
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => item.details.name === FACTORY_UPGRADE_ITEM_NAME);
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;


    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        showToast('Error: Missing resources for upgrade.', 'error');
        return;
    }

    // 1. Consume Currencies and Materials
    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    const profileUpdate = { noub_score: newNoub };
    await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    
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
    
    navigateTo('production-screen');
}


// --- Card Upgrade Logic ---

export async function renderUpgrade() { 
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
        
        cardElement.onclick = () => renderUpgradeDetails(pc);
        upgradeSelectionContainer.appendChild(cardElement);
    }
}


async function executeUpgrade(requirements) { 
    if (!selectedInstance) return;
    
    showToast('Processing upgrade...', 'info');
    
    const btn = document.getElementById('execute-upgrade-btn');
    btn.disabled = true;

    // --- 1. Consume Currencies ---
    // Using cost_ankh for NOUB, cost_blessing for Ankh Premium as per DB schema
    const newNoub = (state.playerProfile.noub_score || 0) - (requirements.cost_ankh || 0); 
    const newPrestige = (state.playerProfile.prestige || 0) - (requirements.cost_prestige || 0);
    const newAnkhPremium = (state.playerProfile.ankh_premium || 0) - (requirements.cost_blessing || 0); 

    const profileUpdate = {
        noub_score: newNoub,
        prestige: newPrestige,
        ankh_premium: newAnkhPremium
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
    
    navigateTo('card-upgrade-screen');
}


/**
 * Renders the detailed upgrade costs and logic for the selected card.
 */
export async function renderUpgradeDetails(playerCardInstance) {
    selectedInstance = playerCardInstance;
    const currentLevel = playerCardInstance.level;
    const nextLevel = currentLevel + 1;
    const cardId = playerCardInstance.card_id;
    const masterCard = playerCardInstance.cards;

    upgradeDetailArea.innerHTML = 'Loading upgrade costs...';
    upgradeDetailArea.classList.remove('hidden');

    // Fetch card upgrade requirements assuming correct column names from DB
    const { data: requirements, error } = await api.fetchCardUpgradeRequirements(cardId, nextLevel);
    
    if (error || !requirements) {
        upgradeDetailArea.innerHTML = `<p style="color: ${error ? 'red' : 'white'};">
            ${error ? 'Error loading requirements. Please check your "card_levels" table columns (cost_ankh, cost_prestige, cost_blessing).' : 'Max Level Reached!'}
        </p>`;
        return;
    }

    let allRequirementsMet = true;
    
    // --- Currency Cost Check ---
    // Use cost_ankh from DB for NOUB, cost_prestige for Prestige, cost_blessing for Ankh Premium
    const noubCost = requirements.cost_ankh || 0; 
    const prestigeCost = requirements.cost_prestige || 0;
    const ankhPremiumCost = requirements.cost_blessing || 0; 

    const playerNoub = state.playerProfile.noub_score || 0;
    const playerPrestige = state.playerProfile.prestige || 0;
    const playerAnkhPremium = state.playerProfile.ankh_premium || 0;
    
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
    if (playerNoub < noubCost || playerPrestige < prestigeCost || playerAnkhPremium < ankhPremiumCost) {
        allRequirementsMet = false;
    }


    // --- Build Cost Grid HTML ---
    const costGridHTML = `
        <div class="cost-item">
            <span class="icon">🪙</span>
            <span>NOUB</span>
            <span class="value" style="color: ${playerNoub >= noubCost ? 'white' : 'var(--danger-color)'}">
                ${playerNoub} / ${noubCost}
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
            <span class="icon">☥</span>
            <span>Ankh Premium</span>
            <span class="value" style="color: ${playerAnkhPremium >= ankhPremiumCost ? 'white' : 'var(--danger-color)'}">
                ${playerAnkhPremium} / ${ankhPremiumCost}
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
        
    if (allRequirementsMet) {
        document.getElementById('execute-upgrade-btn').addEventListener('click', () => executeUpgrade(requirements));
    }
}
