/*
 * Filename: js/screens/albums.js
 * Version: NOUB v0.4 (Card Experience Overhaul)
 * Description: View Logic Module for the Album Catalog screen.
 * OVERHAUL: This module is now the central hub for all card interactions.
 *           It opens a universal modal for viewing, upgrading, and burning cards,
 *           making the separate 'collection' and 'upgrade' screens obsolete.
 *           This file now contains the logic previously found in collection.js and upgrade.js.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { supabaseClient } from '../config.js';

const albumsContainer = document.getElementById('albums-screen');

// --- CONSTANTS ---
const BURN_REWARD_PRESTIGE = 1;

// --- MASTER ALBUM CONFIGURATION (Used as reference) ---
const MASTER_ALBUMS = [
    { id: 1, name: "The Sacred Ennead", icon: "☀️", description: "Collect the nine foundational deities of creation.", card_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9], reward_noub_score: 2500, reward_prestige: 50, reward_ankh_premium: 0 },
    { id: 2, name: "Pharaonic Rulers", icon: "👑", description: "Collect the nine greatest Pharaohs and Queens of Egypt.", card_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18], reward_noub_score: 4000, reward_prestige: 100, reward_ankh_premium: 0 },
    { id: 3, name: "Mythological Creatures", icon: "🐉", description: "Collect the nine powerful and ancient mythical beings.", card_ids: [19, 20, 21, 22, 23, 24, 25, 26, 27], reward_noub_score: 1500, reward_prestige: 30, reward_ankh_premium: 0 }
];


/**
 * Handles the burning of a single card instance. This logic was moved from collection.js.
 * @param {string} instanceId - The unique instance ID of the card to burn.
 * @param {string} cardName - Name for the confirmation/toast message.
 */
async function handleBurnCard(instanceId, cardName) {
    if (!confirm(`Are you sure you want to burn one instance of ${cardName} for ${BURN_REWARD_PRESTIGE} Prestige (🐞)?`)) {
        return;
    }

    showToast('Burning card...', 'info');

    const { error: deleteError } = await api.deleteCardInstance(instanceId);
    if (deleteError) {
        showToast('Error burning card instance!', 'error');
        console.error("Burn Error:", deleteError);
        return;
    }

    const newPrestige = (state.playerProfile.prestige || 0) + BURN_REWARD_PRESTIGE;
    await api.updatePlayerProfile(state.currentUser.id, { prestige: newPrestige });
    await api.logActivity(state.currentUser.id, 'BURN', `Burned 1x ${cardName} for ${BURN_REWARD_PRESTIGE} Prestige.`);

    showToast(`Burn successful! +${BURN_REWARD_PRESTIGE} Prestige (🐞) received.`, 'success');
    
    // Close the modal and refresh the UI to reflect the changes.
    window.closeModal('card-detail-modal');
    await refreshPlayerState();
    await renderAlbums();
}


/**
 * Handles the card upgrade process. This logic was moved and adapted from collection.js/upgrade.js.
 * @param {object} highestLevelInstance - The specific instance of the card to be upgraded.
 * @param {object} upgradeReqs - The requirements object for the next level from the 'card_levels' table.
 */
async function handleCardUpgrade(highestLevelInstance, upgradeReqs) {
    showToast('Processing upgrade...', 'info');

    // Fetch latest player currency and inventory state for final validation
    const playerNoub = state.playerProfile.noub_score || 0;
    const playerPrestige = state.playerProfile.prestige || 0;
    const playerAnkh = state.playerProfile.ankh_premium || 0;
    const requiredItem = upgradeReqs.items;
    const playerItemQty = requiredItem ? (state.inventory.get(requiredItem.id)?.qty || 0) : 0;

    // 1. Final server-side style check before proceeding
    if (playerNoub < upgradeReqs.cost_ankh || playerPrestige < upgradeReqs.cost_prestige || playerAnkh < upgradeReqs.cost_blessing || (requiredItem && playerItemQty < upgradeReqs.cost_item_qty)) {
        showToast('Cannot upgrade: Missing resources.', 'error');
        return;
    }

    // 2. Consume all resources in parallel for efficiency
    const resourceConsumptionPromises = [];
    const profileUpdate = {
        noub_score: playerNoub - upgradeReqs.cost_ankh, // cost_ankh is used for NOUB in the DB schema
        prestige: playerPrestige - upgradeReqs.cost_prestige,
        ankh_premium: playerAnkh - upgradeReqs.cost_blessing // cost_blessing is used for Ankh in the DB schema
    };
    resourceConsumptionPromises.push(api.updatePlayerProfile(state.currentUser.id, profileUpdate));

    if (requiredItem) {
        const newItemQty = playerItemQty - upgradeReqs.cost_item_qty;
        resourceConsumptionPromises.push(api.updateItemQuantity(state.currentUser.id, requiredItem.id, newItemQty));
    }
    
    await Promise.all(resourceConsumptionPromises);

    // 3. If resources were consumed successfully, perform the actual card upgrade
    const newLevel = highestLevelInstance.level + 1;
    const newPowerScore = highestLevelInstance.power_score + upgradeReqs.power_increase;
    const { error: upgradeError } = await api.performCardUpgrade(highestLevelInstance.instance_id, newLevel, newPowerScore);

    if (upgradeError) {
        showToast('Critical error during card upgrade!', 'error');
        console.error("Card Upgrade Error:", upgradeError);
        // NOTE: In a production scenario, a robust system would refund the consumed resources here.
        return;
    }

    await api.logActivity(state.currentUser.id, 'UPGRADE', `Upgraded ${masterCard.name} to LVL ${newLevel}.`);
    showToast(`Upgrade successful! ${highestLevelInstance.cards.name} is now LVL ${newLevel}!`, 'success');

    // 4. Close modal and refresh the entire UI
    window.closeModal('card-detail-modal');
    await refreshPlayerState();
    await renderAlbums();
}


/**
 * NEW: The Universal Card Modal. Opens a detailed view for a specific card.
 * This function fetches all necessary data and builds the comprehensive modal,
 * serving as the replacement for the old collection and upgrade screens.
 * @param {number} cardId - The master ID of the card to display (e.g., 1 for 'Ra').
 */
window.openCardDetailModal = async function(cardId) {
    const modalContent = document.getElementById('card-detail-modal-content');
    modalContent.innerHTML = '<p style="text-align:center;">Loading card details...</p>';
    openModal('card-detail-modal');

    // 1. Fetch ALL instances of this card that the player owns from the local state.
    const allPlayerCards = Array.from(state.inventory.values()).filter(item => item.details.type === 'CARD_INSTANCE'); // Assuming cards are managed in state
    // This part is complex, let's simplify by fetching fresh from API for accuracy
    const { data: freshPlayerCards, error: fetchError } = await api.fetchPlayerCards(state.currentUser.id);
    if (fetchError) {
        showToast('Error fetching card data.', 'error');
        return;
    }

    const ownedInstances = freshPlayerCards.filter(c => c.card_id === cardId);
    if (ownedInstances.length === 0) {
        showToast('Error: Card not found in your collection.', 'error');
        window.closeModal('card-detail-modal');
        return;
    }

    // 2. Determine the highest level instance for display and upgrade purposes.
    const highestLevelInstance = ownedInstances.reduce((max, current) => (current.level > max.level ? current : max));
    const masterCard = highestLevelInstance.cards;
    const nextLevel = highestLevelInstance.level + 1;

    // 3. Fetch upgrade requirements for the next level.
    const { data: upgradeReqs, error: reqsError } = await api.fetchCardUpgradeRequirements(cardId, nextLevel);

    // 4. Dynamically build the HTML for the modal's content.
    
    // --- PART A: Details Section ---
    const detailsHTML = `
        <div class="card-modal-header" data-rarity="${masterCard.rarity_level || 0}">
            <img src="${masterCard.image_url || 'images/default_card.png'}" alt="${masterCard.name}" class="card-image-large">
            <div class="header-info">
                <h3>${masterCard.name}</h3>
                <p>LVL: ${highestLevelInstance.level} | Power: ${highestLevelInstance.power_score}</p>
            </div>
        </div>
        <div class="card-modal-description">
            <p><strong>Description:</strong> ${masterCard.description || 'No description available.'}</p>
            <p><em><strong>Lore:</strong> ${masterCard.lore || 'No lore available.'}</em></p>
        </div>
    `;

    // --- PART B: Burn Section ---
    // A card is burnable if it's level 1 and is NOT the highest-level instance.
    const burnableInstances = ownedInstances.filter(c => c.level === 1 && c.instance_id !== highestLevelInstance.instance_id);
    let burnHTML = `<div class="card-modal-section"><h4>Copies & Burning</h4>`;
    if (ownedInstances.length > 1 && burnableInstances.length > 0) {
        burnHTML += `
            <p>You have ${burnableInstances.length} extra LVL 1 copy/copies available to burn.</p>
            <button class="action-button small danger" id="burn-card-btn">Burn 1 Copy for ${BURN_REWARD_PRESTIGE} 🐞</button>
        `;
    } else {
        burnHTML += `<p>You need an extra Level 1 copy of this card to burn it.</p>`;
    }
    burnHTML += `</div>`;


    // --- PART C: Upgrade Section ---
    let upgradeHTML = `<div class="card-modal-section"><h4>Upgrade to Level ${nextLevel}</h4>`;
    if (reqsError || !upgradeReqs) {
        upgradeHTML += `<p>This card has reached its maximum level.</p>`;
    } else {
        // Fetch current player resources for UI display
        const playerNoub = state.playerProfile.noub_score || 0;
        const playerPrestige = state.playerProfile.prestige || 0;
        const playerAnkh = state.playerProfile.ankh_premium || 0;
        const requiredItem = upgradeReqs.items;
        const playerItemQty = requiredItem ? (state.inventory.get(requiredItem.id)?.qty || 0) : 0;

        // Check if player can afford each requirement
        const canAffordNoub = playerNoub >= upgradeReqs.cost_ankh;
        const canAffordPrestige = playerPrestige >= upgradeReqs.cost_prestige;
        const canAffordAnkh = playerAnkh >= upgradeReqs.cost_blessing;
        const canAffordItem = !requiredItem || playerItemQty >= upgradeReqs.cost_item_qty;
        const canUpgrade = canAffordNoub && canAffordPrestige && canAffordAnkh && canAffordItem;
        
        upgradeHTML += `<div class="upgrade-reqs-list">`;
        if (upgradeReqs.cost_ankh > 0) upgradeHTML += `<p class="${canAffordNoub ? 'met' : 'unmet'}">🪙 NOUB: ${upgradeReqs.cost_ankh} (You have ${playerNoub})</p>`;
        if (upgradeReqs.cost_prestige > 0) upgradeHTML += `<p class="${canAffordPrestige ? 'met' : 'unmet'}">🐞 Prestige: ${upgradeReqs.cost_prestige} (You have ${playerPrestige})</p>`;
        if (upgradeReqs.cost_blessing > 0) upgradeHTML += `<p class="${canAffordAnkh ? 'met' : 'unmet'}">☥ Ankh: ${upgradeReqs.cost_blessing} (You have ${playerAnkh})</p>`;
        if (requiredItem) {
            upgradeHTML += `<p class="${canAffordItem ? 'met' : 'unmet'}">📦 ${requiredItem.name}: ${upgradeReqs.cost_item_qty} (You have ${playerItemQty})</p>`;
        }
        upgradeHTML += `</div>`;
        upgradeHTML += `<p class="power-increase-info">Power Increase: +${upgradeReqs.power_increase}</p>`;
        upgradeHTML += `<button class="action-button" id="upgrade-card-btn" ${canUpgrade ? '' : 'disabled'}>Upgrade</button>`;
    }
    upgradeHTML += `</div>`;

    // 5. Combine all parts and inject into the modal.
    modalContent.innerHTML = `
        <button class="modal-close-btn" onclick="window.closeModal('card-detail-modal')">&times;</button>
        ${detailsHTML}
        ${burnHTML}
        ${upgradeHTML}
    `;

    // 6. Attach event listeners to the dynamically created buttons.
    const upgradeBtn = document.getElementById('upgrade-card-btn');
    if (upgradeBtn && !upgradeBtn.disabled) {
        upgradeBtn.onclick = () => handleCardUpgrade(highestLevelInstance, upgradeReqs);
    }

    const burnBtn = document.getElementById('burn-card-btn');
    if (burnBtn) {
        const instanceToBurn = burnableInstances[0];
        burnBtn.onclick = () => handleBurnCard(instanceToBurn.instance_id, masterCard.name);
    }
}


/**
 * Renders the initial Album Catalog (List View).
 */
export async function renderAlbums() { 
    if (!state.currentUser || !albumsContainer) return;
    
    albumsContainer.innerHTML = '<h2 style="margin-bottom: 10px;">Album Catalog</h2><div id="albums-list-container">Loading...</div>';
    
    // Fetch all necessary data in parallel
    const [playerCardsResult, playerAlbumsResult] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerAlbums(state.currentUser.id)
    ]);

    const playerCards = playerCardsResult.data || [];
    const playerCardIds = new Set(playerCards.map(pc => pc.card_id));
    
    const playerAlbumsStatus = playerAlbumsResult.data || [];
    const statusMap = new Map();
    playerAlbumsStatus.forEach(pa => statusMap.set(pa.album_id, pa));
    
    const listContainer = document.getElementById('albums-list-container');
    const albumListHTML = MASTER_ALBUMS.map(album => {
        const uniqueCollectedCount = album.card_ids.filter(cardId => playerCardIds.has(cardId)).length;
        const totalRequired = album.card_ids.length;
        const isCompleted = uniqueCollectedCount === totalRequired;
        const progressPercent = (uniqueCollectedCount / totalRequired) * 100;
        
        let buttonHTML = '';
        const albumStatus = statusMap.get(album.id);
        if (isCompleted && (!albumStatus || !albumStatus.reward_claimed)) {
            buttonHTML = `<button class="action-button small claim-btn" onclick="window.handleClaimAlbumReward(${album.id}, ${album.reward_noub_score}, ${album.reward_prestige}, ${album.reward_ankh_premium})">Claim</button>`;
        } else {
            buttonHTML = `<button class="action-button small claim-btn" disabled>${isCompleted ? 'Claimed' : 'In Progress'}</button>`;
        }

        return `
            <li class="album-list-item ${isCompleted ? 'completed' : ''}" onclick="window.openAlbumDetail(${album.id}, '${album.name}')">
                <div class="icon">${album.icon}</div>
                <div class="details">
                    <h4>${album.name}</h4>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${progressPercent}%;"></div></div>
                    <div class="count">${uniqueCollectedCount}/${totalRequired} Cards Collected</div>
                </div>
                ${buttonHTML}
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul style="list-style: none; padding: 0;">${albumListHTML}</ul>`;
}

/**
 * Opens the detail modal for a specific album, showing the card slots.
 * This is the entry point that leads to the universal card modal.
 */
window.openAlbumDetail = async function(albumId, albumName) {
    const modalContent = document.getElementById('album-detail-modal-content');
    modalContent.innerHTML = '<p style="text-align:center;">Loading album details...</p>';
    openModal('album-detail-modal');

    const albumData = MASTER_ALBUMS.find(a => a.id === albumId);
    if (!albumData) { 
        showToast("Album data not found.", 'error'); 
        window.closeModal('album-detail-modal');
        return; 
    }
    
    // Fetch all card data needed to render the album slots
    const [allPlayerCardsResult, masterCardDataResult] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        supabaseClient.from('cards').select('id, name, image_url').in('id', albumData.card_ids)
    ]);

    const allPlayerCards = allPlayerCardsResult.data || [];
    const masterCards = masterCardDataResult.data || [];
    
    const ownedCardIds = new Set(allPlayerCards.map(c => c.card_id));
    
    const cardSlotsHTML = albumData.card_ids.map(cardId => {
        const isOwned = ownedCardIds.has(cardId);
        const masterCard = masterCards.find(c => c.id === cardId);
        
        // The onclick handler is now universal: it either opens the detail modal or shows a toast.
        const clickAction = isOwned 
            ? `window.openCardDetailModal(${cardId})` 
            : `showToast('Find this card in the Shop or through gameplay!', 'info')`;
        
        return `
            <div class="album-slot-card ${isOwned ? 'owned' : 'unowned'}" onclick="${clickAction}">
                <img src="${isOwned ? masterCard?.image_url : 'images/default_card.png'}" 
                     alt="${masterCard?.name || 'Unknown Card'}" 
                     style="opacity: ${isOwned ? 1 : 0.4};">
                <h4 style="font-size: 0.8em;">${masterCard?.name || '???'}</h4>
            </div>
        `;
    }).join('');

    modalContent.innerHTML = `
        <button class="modal-close-btn" onclick="window.closeModal('album-detail-modal')">&times;</button>
        <h2 style="text-align: center; color: var(--primary-accent);">${albumName}</h2>
        <div class="album-grid">
            ${cardSlotsHTML}
        </div>
    `;
}

/**
 * Handles the claiming of a completed album's reward.
 * This function remains unchanged.
 */
window.handleClaimAlbumReward = async function(albumId, noubReward, prestigeReward, ankhPremiumReward) {
    showToast('Processing album reward...', 'info');

    const newNoubScore = (state.playerProfile.noub_score || 0) + noubReward;
    const newPrestige = (state.playerProfile.prestige || 0) + prestigeReward;
    const newAnkhPremium = (state.playerProfile.ankh_premium || 0) + ankhPremiumReward;

    const { error } = await api.updatePlayerProfile(state.currentUser.id, { 
        noub_score: newNoubScore, 
        prestige: newPrestige, 
        ankh_premium: newAnkhPremium
    });
    
    if (!error) {
        await api.logActivity(state.currentUser.id, 'ALBUM_CLAIM', `Claimed Album ${albumId}.`);
        await refreshPlayerState();
        showToast(`Album Reward Claimed!`, 'success');
        renderAlbums(); 
    } else {
        showToast('Error claiming reward!', 'error');
    }
}
