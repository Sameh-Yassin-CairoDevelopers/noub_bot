
import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { renderCollection } from './collection.js';

const shopModal = document.getElementById('shop-modal');

async function buyCardPack() {
    const packCost = 100;
    const buyButton = document.getElementById('buy-pack-btn');
    buyButton.disabled = true;
    buyButton.textContent = "Processing...";

    if (state.playerProfile.score < packCost) {
        showToast("Not enough Ankh!", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }
    
    const { data: masterCards } = await api.fetchAllMasterCards();
    if (!masterCards || masterCards.length === 0) {
        showToast("Error: Card list is empty.", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];
    const newScore = state.playerProfile.score - packCost;
    
    const { error: updateError } = await api.updatePlayerScore(state.currentUser.id, newScore);
    if (updateError) {
        showToast("Error updating your balance.", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    const { error: insertError } = await api.addCardToPlayerCollection(state.currentUser.id, randomCard.id);
    if (insertError) {
        showToast("Error adding card. Refunding.", 'error');
        await api.updatePlayerScore(state.currentUser.id, state.playerProfile.score);
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    state.playerProfile.score = newScore;
    updateHeaderUI();
    showToast("You got a new card!", 'success');
    shopModal.classList.add('hidden');
    if (!document.getElementById('collection-screen').classList.contains('hidden')) {
        renderCollection();
    }
}

export function openShopModal() {
    shopModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('shop-modal')">&times;</button>
            <h2>Shop</h2>
            <div id="shop-items-container">
                <div class="shop-item">
                    <div class="icon">📜</div>
                    <div class="details">
                        <h4>Papyrus Pack</h4>
                        <p>Contains one random card.</p>
                    </div>
                    <button class="buy-btn" id="buy-pack-btn">100 ☥</button>
                </div>
            </div>
        </div>
    `;
    shopModal.classList.remove('hidden');
    document.getElementById('buy-pack-btn').addEventListener('click', buyCardPack);
}