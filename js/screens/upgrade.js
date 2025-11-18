/*
 * Filename: js/screens/upgrade.js
 * Version: NOUB 0.0.8 (UPGRADE MODULE - FIX: Export Factory Upgrade Logic)
 * Description: View Logic Module for the Card & Factory Upgrade screen.
 * NEW: The core factory upgrade logic is now exported for direct call from economy.js modal.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const upgradeSelectionContainer = document.getElementById('upgrade-card-selection-container');
const upgradeDetailArea = document.getElementById('upgrade-detail-area');

// --- Factory Upgrade Constants (Can be moved to config.js later if needed) ---
const FACTORY_UPGRADE_COST = 500; 
const FACTORY_UPGRADE_ITEM_NAME = 'Limestone Block'; 
const FACTORY_UPGRADE_QTY = 10; 
const FACTORY_UPGRADE_LEVEL_CAP = 10; // Max level for factories

// --- Factory Upgrade Logic ---

/**
 * Executes the factory upgrade transaction.
 * NOTE: playerFactory argument must be the object from the factory fetch (playerFactory.factories for details).
 * @param {object} playerFactory - The player_factories object (id, level, factory_id, etc.).
 */
export async function executeFactoryUpgrade(playerFactory) { 
    if (!state.currentUser || !playerFactory) return;

    if (playerFactory.level >= FACTORY_UPGRADE_LEVEL_CAP) {
        showToast('Factory has reached its maximum level.', 'error');
        return;
    }

    showToast('Processing factory upgrade...', 'info');
    
    // 1. Find the required material in player's inventory
    const requiredMaterialEntry = Array.from(state.inventory.values()).find(item => 
        item.details.name === FACTORY_UPGRADE_ITEM_NAME
    );
    
    const materialId = requiredMaterialEntry?.details.id;
    const playerMaterialQty = requiredMaterialEntry?.qty || 0;
    const playerNoub = state.playerProfile.noub_score || 0;

    // Check costs against player state
    if (!materialId || playerNoub < FACTORY_UPGRADE_COST || playerMaterialQty < FACTORY_UPGRADE_QTY) {
        showToast(`Error: Missing ${FACTORY_UPGRADE_ITEM_NAME} or ${FACTORY_UPGRADE_COST} NOUB for upgrade.`, 'error');
        return;
    }

    // 2. Consume Currencies and Materials
    const newNoub = playerNoub - FACTORY_UPGRADE_COST;
    const newMaterialQty = playerMaterialQty - FACTORY_UPGRADE_QTY;
    
    // Update profile (NOUB)
    const profileUpdate = { noub_score: newNoub };
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    
    // Update inventory (Material)
    const { error: inventoryError } = await api.updateItemQuantity(state.currentUser.id, materialId, newMaterialQty);

    if (profileError || inventoryError) {
        showToast('Error consuming resources for upgrade!', 'error');
        return;
    }
    
    // 3. Update Factory Level
    const newLevel = playerFactory.level + 1;
    const { error: factoryError } = await api.updatePlayerFactoryLevel(playerFactory.id, newLevel); 
    
    if (factoryError) {
        showToast('Error updating factory level!', 'error');
        return;
    }
    // --- ADD XP FOR UPGRADE ---
    await api.addXp(state.currentUser.id, 20); // Grant 20 XP for a factory upgrade (example value)

    showToast(`Factory Upgraded! ${playerFactory.factories.name} LVL ${playerFactory.level} → LVL ${newLevel}`, 'success');
    
    await refreshPlayerState(); 
    
    if (document.getElementById('economy-screen').classList.contains('hidden')) {
        navigateTo('economy-screen');
    } else {
        // If already on the economy screen, just re-render it
        import('./economy.js').then(({ renderProduction }) => renderProduction());
    }
}


/**
 * Renders the main upgrade screen (mostly for Card Upgrade Selection).
 * This screen is now a hub, not the primary factory upgrade executor.
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
        
        cardElement.onclick = () => {
            showToast('Upgrade cards is done from the "My Cards" screen.', 'info');
            navigateTo('collection-screen'); 
        };
        
        upgradeSelectionContainer.appendChild(cardElement);
    }
}

