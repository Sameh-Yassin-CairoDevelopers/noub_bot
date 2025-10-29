/*
 * Filename: js/screens/albums.js
 * Version: NOUB 0.0.4 (ALBUMS MODULE - ALBUM-CENTRIC VIEW)
 * Description: View Logic Module for the Album Catalog screen.
 * Implements the Album Detail Modal to show owned/unowned cards (like the Burble Boinker example).
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, closeModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { supabaseClient } from '../config.js'; // Import Supabase client for generic card fetch

const albumsContainer = document.getElementById('albums-screen');

// --- MASTER ALBUM CONFIGURATION (Used as reference) ---
const MASTER_ALBUMS = [
    { id: 1, name: "The Sacred Ennead", icon: "☀️", description: "Collect the nine foundational deities of creation.", card_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9], reward_ankh: 2500, reward_prestige: 50 },
    { id: 2, name: "Pharaonic Rulers", icon: "👑", description: "Collect the nine greatest Pharaohs and Queens of Egypt.", card_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18], reward_ankh: 4000, reward_prestige: 100 },
    { id: 3, name: "Mythological Creatures", icon: "🐉", description: "Collect the nine powerful and ancient mythical beings.", card_ids: [19, 20, 21, 22, 23, 24, 25, 26, 27], reward_ankh: 1500, reward_prestige: 30 }
];


/**
 * Renders the initial Album Catalog (List View).
 */
export async function renderAlbums() {
    if (!state.currentUser) return;
    
    if (!albumsContainer) return;
    
    // 1. Fetch Player's Album Status (Mocked for now)
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const playerCardIds = new Set(playerCards.map(pc => pc.card_id));
    
    const { data: playerAlbumsStatus, error: statusError } = await api.fetchPlayerAlbums(state.currentUser.id);
    const statusMap = new Map();
    playerAlbumsStatus.forEach(pa => statusMap.set(pa.album_id, pa));

    // 2. Render List View
    albumsContainer.innerHTML = '<h2>Album Catalog</h2><div id="albums-list-container"></div>';
    const listContainer = document.getElementById('albums-list-container');
    
    // Ensure Album Detail Modal exists in DOM
    if (!document.getElementById('album-detail-modal-container')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'album-detail-modal-container';
        modalContainer.className = 'modal-overlay hidden';
        modalContainer.innerHTML = `
            <div id="album-detail-modal-content" class="modal-content" style="max-width: 450px; padding: 0;">
                <!-- Content will be dynamically injected here -->
            </div>
        `;
        document.body.appendChild(modalContainer);
    }
    
    const albumListHTML = MASTER_ALBUMS.map(album => {
        const uniqueCollectedCount = album.card_ids.filter(cardId => playerCardIds.has(cardId)).length;
        const totalRequired = album.card_ids.length;
        const isCompleted = uniqueCollectedCount === totalRequired;
        const progressPercent = (uniqueCollectedCount / totalRequired) * 100;
        
        let buttonHTML = '';
        if (isCompleted && !statusMap.get(album.id)?.reward_claimed) {
            buttonHTML = `<button class="claim-btn ready" onclick="window.handleClaimAlbumReward(${album.id}, ${album.reward_ankh}, ${album.reward_prestige})">Claim</button>`;
        } else {
            buttonHTML = `<button class="claim-btn claimed" disabled>${isCompleted ? 'Claimed' : 'Progress'}</button>`;
        }

        return `
            <li class="album-list-item ${isCompleted ? 'completed' : ''}" onclick="window.openAlbumDetail(${album.id}, '${album.name}')" style="cursor: pointer; border-left: 5px solid ${isCompleted ? 'var(--success-color)' : 'var(--primary-accent)'}; margin-bottom: 10px; padding: 15px; background: var(--surface-dark); border-radius: 12px;">
                <div class="icon" style="font-size: 30px; margin-right: 15px;">${album.icon}</div>
                <div class="details" style="flex-grow: 1;">
                    <h4 style="margin: 0 0 5px 0;">${album.name}</h4>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%; background-color: ${isCompleted ? 'var(--success-color)' : 'var(--primary-accent)'}; height: 8px; border-radius: 4px;"></div>
                    </div>
                    <div class="count" style="font-size: 0.8em; margin-top: 5px;">${uniqueCollectedCount}/${totalRequired} Cards Collected</div>
                </div>
                ${buttonHTML}
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul id="album-ul" style="list-style: none; padding: 0;">${albumListHTML}</ul>`;
}

/**
 * Opens the detail modal for a specific album, showing the 9 card slots.
 * Implements the Burble Boinker Set #2 visual style.
 */
window.openAlbumDetail = async function(albumId, albumName) {
    const modalContent = document.getElementById('album-detail-modal-content');

    const albumData = MASTER_ALBUMS.find(a => a.id === albumId);
    if (!albumData) { showToast("Album data not found.", 'error'); return; }
    
    // 1. Fetch ALL data needed
    const [allPlayerCardsResult, masterCardDataResult] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        supabaseClient.from('cards').select('*')
    ]);

    const allPlayerCards = allPlayerCardsResult.data || [];
    const masterCardData = masterCardDataResult.data || [];

    // Group player cards by card_id: { card_id: [{instance_id, level, ...}, {..}], ... }
    const ownedCardMap = allPlayerCards.reduce((acc, pc) => {
        if (!acc[pc.card_id]) acc[pc.card_id] = [];
        acc[pc.card_id].push(pc);
        return acc;
    }, {});
    
    // 2. Generate Card Slots HTML
    const cardSlotsHTML = albumData.card_ids.map(cardId => {
        const ownedInstances = ownedCardMap[cardId] || [];
        const isOwned = ownedInstances.length > 0;
        const masterCard = masterCardData.find(c => c.id === cardId);
        const cardName = masterCard?.name || `Unknown Card #${cardId}`;
        
        // Find the highest level card for display power/level
        const displayCard = isOwned ? ownedInstances.reduce((max, current) => (current.power_score > max.power_score ? current : max), ownedInstances[0]) : null;
        
        const displayImage = masterCard?.image_url || 'images/default_card.png';
        
        // Final look (Mimicking the Burble Boinker Set #2 image)
        return `
            <div class="album-slot-card ${isOwned ? 'owned' : 'unowned'}" 
                 data-card-id="${cardId}" 
                 onclick="${isOwned ? `window.showCardDetailModal(${cardId}, '${displayCard.instance_id}')` : `showToast('Find this card to unlock details!', 'info')`}" 
                 style="cursor: pointer; text-align: center; background: var(--surface-dark); padding: 5px; border-radius: 8px; border: 2px solid ${isOwned ? 'var(--success-color)' : '#444'};">
                <img src="${isOwned ? displayImage : 'images/default_card.png'}" 
                     alt="${cardName}" 
                     style="width: 100%; aspect-ratio: 1/1; border-radius: 6px; opacity: ${isOwned ? 1 : 0.4};">
                <h4 style="font-size: 0.8em; margin: 5px 0;">${cardName}</h4>
                <div style="font-size: 0.9em; font-weight: bold; color: ${isOwned ? 'var(--primary-accent)' : 'var(--danger-color)'};">
                    ${isOwned ? `x${ownedInstances.length}` : 'MISSING'}
                </div>
                ${isOwned ? `<div style="position: absolute; top: 0; right: 0; background: var(--success-color); color: white; padding: 2px 5px; border-radius: 0 6px 0 6px; font-size: 0.7em;">LVL ${displayCard?.level || 1}</div>` : ''}
            </div>
        `;
    }).join('');

    // 3. Inject Modal Content
    modalContent.innerHTML = `
        <div style="padding: 15px; background: var(--background-dark); border-radius: 20px 20px 0 0;">
            <button class="action-button small" style="position: absolute; top: 15px; left: 15px; background: #555; color: white; padding: 5px 10px;" onclick="closeModal('album-detail-modal-container')">← Back</button>
            <h2 style="text-align: center; margin-top: 0; color: var(--primary-accent);">${albumName}</h2>
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 1.1em; font-weight: bold; color: var(--success-color);">
                    SET ${albumId}/${MASTER_ALBUMS.length}
                </span>
            </div>
        </div>
        
        <div style="padding: 15px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                ${cardSlotsHTML}
            </div>
        </div>
    `;

    openModal('album-detail-modal-container');
}

/**
 * MOCK: Function to open a specific card detail modal (needs full implementation in collection.js/upgrade.js)
 */
window.showCardDetailModal = function(cardId, instanceId) {
    if (instanceId === 'null') {
         showToast(`You do not own this card yet. Find ${cardId}!`, 'info');
    } else {
        // CRITICAL: Navigate to the UPGRADE screen and render the specific card instance
         showToast(`Opening details for Card ID ${cardId} (Instance: ${instanceId}). This will trigger upgrade.js.`, 'success');
         navigateTo('card-upgrade-screen'); 
    }
}


window.handleClaimAlbumReward = async function(albumId, ankhReward, prestigeReward) {
    if (!state.currentUser) return;
    
    showToast('Processing album reward...', 'info');

    const newScore = (state.playerProfile.score || 0) + ankhReward;
    const newPrestige = (state.playerProfile.prestige || 0) + prestigeReward;

    const { error } = await api.updatePlayerProfile(state.currentUser.id, { score: newScore, prestige: newPrestige });
    
    if (!error) {
        await api.logActivity(state.currentUser.id, 'ALBUM_CLAIM', `Claimed Album ${albumId} for ${ankhReward} Ankh.`);
        await refreshPlayerState();
        showToast(`Album Reward Claimed! +${ankhReward} ☥, +${prestigeReward} 🐞`, 'success');
        renderAlbums(); 
    } else {
        showToast('Error claiming reward!', 'error');
    }
}
// Export renderAlbums for ui.js
export { renderAlbums };
