/*
 * Filename: js/screens/collection.js
 * Version: NOUB 0.0.2 (CARD BURNING - FINAL FIX)
 * Description: View Logic Module for My Collection screen. Displays card level, stack count,
 * and handles the Card Burning functionality to earn Prestige.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const collectionContainer = document.getElementById('collection-container');

// --- Card Burning Logic ---
const BURN_REWARD_PRESTIGE = 1; 

/**
 * Handles the burning of a single card instance.
 * @param {string} instanceId - The unique instance ID of the card to burn.
 * @param {string} cardName - Name for confirmation/toast message.
 * @param {number} currentLevel - Level of the card.
 */
async function handleBurnCard(instanceId, cardName, currentLevel) {
    if (currentLevel > 1) {
        showToast("Cannot burn leveled cards!", 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to burn one instance of ${cardName} for ${BURN_REWARD_PRESTIGE} Prestige (🐞)?`)) {
        return;
    }

    // 1. Delete the card instance (Requires api.deleteCardInstance)
    const { error: deleteError } = await api.deleteCardInstance(instanceId); 
    
    if (deleteError) {
        showToast('Error deleting card instance!', 'error');
        return;
    }

    // 2. Grant Prestige reward
    const newPrestige = (state.playerProfile.prestige || 0) + BURN_REWARD_PRESTIGE;
    await api.updatePlayerProfile(state.currentUser.id, { prestige: newPrestige });

    showToast(`Burn successful! +${BURN_REWARD_PRESTIGE} Prestige (🐞) received.`, 'success');
    await refreshPlayerState();
    renderCollection(); // Re-render the collection view
}


/**
 * Renders the collection of cards owned by the player.
 */
export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading...';

    // Fetch cards with level and master details
    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error || !playerCards) {
        collectionContainer.innerHTML = '<p class="error-message">Error fetching cards.</p>';
        return;
    }

    if (playerCards.length === 0) {
        collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
        return;
    }

    // Group cards to display stack count (by card ID and level for unique visual stacks)
    const cardMap = new Map();
    playerCards.forEach(pc => {
        // Grouping key: Card ID - Level - Rarity (for consistent stacking visuals)
        const key = `${pc.card_id}-${pc.level}-${pc.cards.rarity_level}`; 
        if (!cardMap.has(key)) {
            cardMap.set(key, {
                master: pc.cards,
                level: pc.level,
                count: 0,
                // Store array of instances to handle burning of specific cards
                instances: [] 
            });
        }
        cardMap.get(key).count++;
        cardMap.get(key).instances.push({
            instance_id: pc.instance_id,
            power_score: pc.power_score,
            level: pc.level // Pass level for burn check
        });
    });

    collectionContainer.innerHTML = '';

    for (const [key, data] of cardMap.entries()) {
        const card = data.master;
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', card.rarity_level || 0);
        
        // We can burn if count > 1 AND the card is Level 1 (to prevent accidental burning of last card)
        const canBurn = data.count > 1 && data.level === 1; 
        
        // Use the instance ID of the first card in the stack for the burn button context
        const instanceToBurnId = data.instances[0].instance_id; 
        
        const burnButtonHTML = canBurn ? 
            `<button class="action-button small danger burn-btn" style="padding: 5px; margin-top: 5px; font-size: 0.8em; width: 100%;" 
                data-instance-id="${instanceToBurnId}" data-card-name="${card.name}" data-card-level="${data.level}">
                BURN (1 🐞)
             </button>` : '';

        cardElement.innerHTML = `
            <img src="${card.image_url || 'images/default_card.png'}" alt="${card.name}" class="card-image">
            <h4>${card.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${data.level}</span>
                <span class="card-count">x${data.count}</span>
            </div>
            ${burnButtonHTML}
        `;
        
        // Add event listener for burning if duplicates exist
        const burnBtnElement = cardElement.querySelector('.burn-btn');
        if (burnBtnElement) {
             burnBtnElement.addEventListener('click', (e) => {
                 e.stopPropagation(); 
                 handleBurnCard(instanceToBurnId, card.name, data.level);
             });
        }
        
        // Add onclick handler to view details (simplified alert for now)
        cardElement.onclick = () => {
             showToast(`Card: ${card.name}, Level: ${data.level}, Power: ${data.instances[0].power_score}. Instances: ${data.count}`, 'info');
        };
        
        collectionContainer.appendChild(cardElement);
    }
}
// Export renderCollection for use by ui.js (ONLY ONE EXPORT HERE)
export { renderCollection };
