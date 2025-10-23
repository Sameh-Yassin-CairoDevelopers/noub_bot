/*
 * Filename: js/screens/collection.js
 * Version: 20.2 (Card Display Update - Complete)
 * Description: View Logic Module for My Collection screen.
 * Updated to display card level and stack count, and support the new upgrade flow.
*/

import { state } from '../state.js';
import * as api from '../api.js';

const collectionContainer = document.getElementById('collection-container');

export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading...';

    // Fetch cards with level and master details
    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error) {
        collectionContainer.innerHTML = 'Error fetching cards.';
        console.error(error);
        return;
    }

    if (!playerCards || playerCards.length === 0) {
        collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
        return;
    }

    // Group cards to display stack count (by card ID and level for unique visual stacks)
    const cardMap = new Map();
    playerCards.forEach(pc => {
        const key = `${pc.cards.id}-${pc.level}`; // Group by card type AND level
        if (!cardMap.has(key)) {
            cardMap.set(key, {
                master: pc.cards,
                level: pc.level,
                count: 0,
                instance_id: pc.instance_id // Keep one instance ID for reference
            });
        }
        cardMap.get(key).count++;
    });

    collectionContainer.innerHTML = '';

    for (const [key, data] of cardMap.entries()) {
        const card = data.master;
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', card.rarity_level || 0);
        
        cardElement.innerHTML = `
            <img src="${card.image_url || 'images/default_card.png'}" alt="${card.name}" class="card-image">
            <h4>${card.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${data.level}</span>
                <span class="card-count">x${data.count}</span>
            </div>
        `;
        
        // Add onclick handler to view details (simple alert for now)
        cardElement.onclick = () => {
             alert(`Card: ${card.name}, Level: ${data.level}, Power: ${card.power_score}. Instances: ${data.count}`);
        };
        
        collectionContainer.appendChild(cardElement);
    }
}
