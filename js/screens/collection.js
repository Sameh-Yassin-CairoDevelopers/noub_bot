/*
 * Filename: js/screens/collection.js
 * Version: NOUB 0.0.1 Eve Edition (Collection Module - Complete)
 * Description: View Logic Module for My Collection screen. Displays card level, stack count,
 * and sets up the placeholder for the Card Burning functionality.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const collectionContainer = document.getElementById('collection-container');

// --- Card Burning Logic (Placeholder Integration) ---
const BURN_REWARD_PRESTIGE = 1; // Reward 1 Prestige per burned card
const BURN_CARD_RARITY_THRESHOLD = 2; // Only allow burning of cards Rare (2) or higher

async function handleBurnCard(instanceId, cardName, currentLevel) {
    if (currentLevel > 1) {
        showToast("Cannot burn leveled cards!", 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to burn one instance of ${cardName} for 1 Prestige (🐞)?`)) {
        return;
    }

    // 1. Delete the card instance
    const { error: deleteError } = await api.deleteCardInstance(instanceId); // Assumes api.deleteCardInstance exists
    
    if (deleteError) {
        showToast('Error deleting card instance!', 'error');
        return;
    }

    // 2. Grant Prestige reward
    const newPrestige = (state.playerProfile.prestige || 0) + BURN_REWARD_PRESTIGE;
    await api.updatePlayerProfile(state.currentUser.id, { prestige: newPrestige });

    showToast(`Burn successful! +1 Prestige (🐞) received.`, 'success');
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
        cardMap.get(key).instances.push(pc.instance_id);
    });

    collectionContainer.innerHTML = '';

    for (const [key, data] of cardMap.entries()) {
        const card = data.master;
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', card.rarity_level || 0);
        
        // Use the instance ID of the first card in the stack for the burn button context
        const instanceToBurn = data.instances[0]; 
        
        const canBurn = data.count > 1; // Only allow burning if player has duplicates
        
        const burnButtonHTML = canBurn ? 
            `<button class="action-button small danger" style="padding: 5px; margin-top: 5px; font-size: 0.8em; width: 100%;" 
                data-instance-id="${instanceToBurn}" data-card-name="${card.name}" data-card-level="${data.level}">
                Burn (1 🐞)
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
        if (canBurn) {
             cardElement.querySelector('.danger').addEventListener('click', (e) => {
                 // Stop click event from propagating to the main card click handler (alert)
                 e.stopPropagation(); 
                 handleBurnCard(instanceToBurn, card.name, data.level);
             });
        }
        
        // Add onclick handler to view details
        cardElement.onclick = () => {
             alert(`Card: ${card.name}, Level: ${data.level}, Power: ${data.instances[0].power_score}. Duplicates: ${data.count - 1}`);
        };
        
        collectionContainer.appendChild(cardElement);
    }
}
