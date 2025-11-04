/*
 * Filename: js/screens/upgrade.js
 * Version: NOUB 0.0.7 (UPGRADE MODULE - UI Rework)
 * Description: View Logic Module for the Card & Factory Upgrade screen.
 * NOTE: The primary card upgrade UI has been moved to a modal in collection.js.
 * This file is kept for Factory Upgrade logic and as a potential future hub for all upgrades.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

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
    
    // Check costs against player state
    const playerNoub = state.playerProfile.noub_score || 0;
    
    // Find the item ID for the required material
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
    
    // Update profile
    const profileUpdate = { noub_score: newNoub };
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
    
    // Redirect back to the economy screen to show new level
    navigateTo('economy-screen');
}


/**
 * Renders the main upgrade screen. 
 * For now, it focuses on displaying cards as a secondary way to access upgrade info,
 * though the primary upgrade action is now in the collection modal.
 */
export async function renderUpgrade() { 
    if (!state.currentUser) return;

    // Clear previous details
    upgradeDetailArea.classList.add('hidden'); 
    upgradeSelectionContainer.innerHTML = 'Loading cards...';

    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error || !playerCards) {
        upgradeSelectionContainer.innerHTML = '<p class="error-message">Error fetching cards.</p>';
        return;
    }

    if (playerCards.length === 0) {
        upgradeSelectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards to upgrade. Visit the Shop!</p>';
        return;
    }
    
    // Group by Card ID to show one of each card type
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
        
        // This onclick handler can be used to show a simple info toast or navigate back to the collection
        cardElement.onclick = () => {
            showToast('Upgrade cards from the "My Cards" screen.', 'info');
            navigateTo('collection-screen');
        };
        
        upgradeSelectionContainer.appendChild(cardElement);
    }
}
