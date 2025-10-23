/*
 * Filename: js/screens/collection.js
 * Version: 20.1 (Card Display Update)
 * Description: View Logic Module for My Collection screen.
 * Updated to display card level and stack count, and support the new upgrade flow.
*/

import { state } from '../state.js';
import { fetchPlayerCards } from '../api.js';

const collectionContainer = document.getElementById('collection-container');

export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading...';

    // Fetch cards with level and master details
    const { data: playerCards, error } = await fetchPlayerCards(state.currentUser.id);

    if (error) {
        collectionContainer.innerHTML = 'Error fetching cards.';
        console.error(error);
        return;
    }

    if (!playerCards || playerCards.length === 0) {
        collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
        return;
    }

    // Group cards to display stack count
    const cardMap = new Map();
    playerCards.forEach(pc => {
        const cardId = pc.cards.id;
        if (!cardMap.has(cardId)) {
            cardMap.set(cardId, {
                master: pc.cards,
                instances: [],
                count: 0
            });
        }
        cardMap.get(cardId).instances.push(pc);
        cardMap.get(cardId).count++;
    });

    collectionContainer.innerHTML = '';

    for (const [cardId, data] of cardMap.entries()) {
        const card = data.master;
        const firstInstance = data.instances[0]; // Use the first instance for level/instance_id
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', card.rarity_level || 0);
        
        cardElement.innerHTML = `
            <img src="${card.image_url || 'images/default_card.png'}" alt="${card.name}" class="card-image">
            <h4>${card.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${firstInstance.level}</span>
                <span class="card-count">x${data.count}</span>
            </div>
        `;
        
        // Example: Add onclick handler to select for viewing details or upgrade
        // This links the collection viewing to the upgrade flow
        cardElement.onclick = () => {
             alert(`Card: ${card.name}, Level: ${firstInstance.level}, Power: ${card.power_score}`);
             // Later: navigateTo('card-upgrade-screen', { cardId: card.id, instanceId: firstInstance.instance_id });
        };
        
        collectionContainer.appendChild(cardElement);
    }
}
