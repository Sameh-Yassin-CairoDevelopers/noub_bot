
import { state } from '../state.js';
import { fetchPlayerCards } from '../api.js';

const collectionContainer = document.getElementById('collection-container');

export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading...';

    const { data: playerCards, error } = await fetchPlayerCards(state.currentUser.id);

    if (error) {
        collectionContainer.innerHTML = 'Error fetching cards.';
        console.error(error);
        return;
    }

    if (playerCards.length === 0) {
        collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
        return;
    }

    collectionContainer.innerHTML = '';
    playerCards.forEach(pc => {
        const card = pc.cards;
        if (!card) return;
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack rarity-${card.rarity_level || 0}`;
        cardElement.innerHTML = `
            <img src="${card.image_url || 'images/default_card.png'}" alt="${card.name}" class="card-image">
            <h4>${card.name}</h4>
        `;
        collectionContainer.appendChild(cardElement);
    });
}