/*
 * Filename: js/screens/shop.js
 * Version: 20.4 (CRITICAL FIX: API Call Mismatch)
 * Description: View Logic Module for the shop screen.
 * FIXED: Replaced obsolete api.updatePlayerScore with the correct api.updatePlayerProfile.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { renderCollection } from './collection.js';

const shopModal = document.getElementById('shop-modal');

async function buyCardPack() {
    if (!state.currentUser || !state.playerProfile) return;

    const packCost = 100;
    const buyButton = document.getElementById('buy-pack-btn');
    buyButton.disabled = true;
    buyButton.textContent = "Processing...";

    if ((state.playerProfile.score || 0) < packCost) {
        showToast("Not enough Ankh!", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    // 1. Fetch all possible card IDs from master list
    const { data: masterCards, error: masterError } = await api.fetchAllMasterCards();
    if (masterError || !masterCards || masterCards.length === 0) {
        showToast("Error fetching card list.", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    // 2. Choose a random card
    const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];

    // 3. Deduct cost from player's profile (CRITICAL FIX APPLIED)
    const newScore = state.playerProfile.score - packCost;
    
    // Use updatePlayerProfile to update the score column
    const { error: updateError } = await api.updatePlayerProfile(state.currentUser.id, { score: newScore });
    
    if (updateError) {
        showToast("Error updating your balance.", 'error');
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    // 4. Add the new card to the player's collection
    const { error: insertError } = await api.addCardToPlayerCollection(state.currentUser.id, randomCard.id);
    if (insertError) {
        showToast("Error adding card. Refunding.", 'error');
        // Attempt to refund
        await api.updatePlayerProfile(state.currentUser.id, { score: state.playerProfile.score });
        buyButton.disabled = false;
        buyButton.textContent = `${packCost} ☥`;
        return;
    }

    // 5. Success! Update state and UI
    state.playerProfile.score = newScore;
    updateHeaderUI(state.playerProfile);
    showToast("You got a new card!", 'success');
    window.closeModal('shop-modal');

    // If the user is on the collection screen, refresh it
    if (!document.getElementById('collection-screen').classList.contains('hidden')) {
        renderCollection();
    }
}

export function openShopModal() {
    const shopModal = document.getElementById('shop-modal');
    shopModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('shop-modal')">&times;</button>
            <h2>Shop</h2>
            <div id="shop-items-container">
                <div class="shop-item">
                    <div class="icon">📜</div>
                    <div class="details">
                        <h4>Papyrus Pack</h4>
                        <p>Contains one random card. Cost: 100 Ankh</p>
                    </div>
                    <button class="buy-btn" id="buy-pack-btn">100 ☥</button>
                </div>
            </div>
        </div>
    `;
    openModal('shop-modal');
    document.getElementById('buy-pack-btn').addEventListener('click', buyCardPack);
}
