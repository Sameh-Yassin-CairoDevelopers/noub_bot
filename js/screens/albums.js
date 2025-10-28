/*
 * Filename: js/screens/albums.js
 * Version: NOUB 0.0.2 (ALBUMS MODULE - FINAL CODE)
 * Description: View Logic Module for the Album Catalog screen.
 * Displays card set progress, completion status, and handles reward claiming via Supabase.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const albumsContainer = document.getElementById('albums-screen');

// --- MASTER ALBUM CONFIGURATION (Reference Data - Should match Supabase 'master_albums' table) ---
const MASTER_ALBUMS = [
    { id: 1, name: "The Ennead", icon: "☀️", description: "The nine creator deities.", card_ids: [1, 2, 6, 8, 9], reward_ankh: 500, reward_prestige: 5 },
    { id: 2, name: "Royal Court", icon: "👑", description: "Treasures of the Golden Age.", card_ids: [3, 10, 15], reward_ankh: 800, reward_prestige: 10 },
    { id: 3, name: "Guardians of the Duat", icon: "⚖️", description: "Gods of the underworld and judgment.", card_ids: [7, 11], reward_ankh: 300, reward_prestige: 3 }
];

/**
 * Renders the Album Catalog.
 */
export async function renderAlbums() {
    if (!state.currentUser) return;
    
    if (!albumsContainer) {
        console.error("Albums container not found in DOM.");
        return;
    }

    albumsContainer.innerHTML = '<h2>Album Catalog</h2><div id="albums-list-container">Loading Albums...</div>';
    
    const listContainer = document.getElementById('albums-list-container');
    
    // 1. Fetch Player's Album Status from Supabase
    const { data: playerAlbumsStatus, error: statusError } = await api.fetchPlayerAlbums(state.currentUser.id);

    if (statusError) {
        listContainer.innerHTML = '<p class="error-message">Error loading Album status.</p>';
        return;
    }

    // 2. Process Album Status against Player's Collection
    // Get all unique card IDs owned by the player
    const playerCardIds = new Set(Array.from(state.inventory.values()).flatMap(i => i.details.type === 'CARD' ? [i.details.id] : [])); 
    
    // Group status data for quick lookup
    const statusMap = new Map();
    playerAlbumsStatus.forEach(pa => statusMap.set(pa.album_id, pa));

    // 3. Render List
    const albumListHTML = MASTER_ALBUMS.map(album => {
        // Calculate completion status based on player's current card collection
        const uniqueCollectedCount = album.card_ids.filter(cardId => 
            playerCardIds.has(cardId)
        ).length;
        
        const totalRequired = album.card_ids.length;
        const isCompleted = uniqueCollectedCount === totalRequired;
        const status = statusMap.get(album.id);
        const isClaimed = status ? status.reward_claimed : false;

        const progressPercent = (uniqueCollectedCount / totalRequired) * 100;
        
        let buttonHTML = '';
        if (isClaimed) {
            buttonHTML = `<button class="claim-btn claimed" disabled>Claimed</button>`;
        } else if (isCompleted) {
            buttonHTML = `<button class="claim-btn ready" onclick="window.handleClaimAlbumReward(${album.id}, ${album.reward_ankh}, ${album.reward_prestige})">Claim</button>`;
        } else {
            buttonHTML = `<button class="claim-btn claimed" disabled>Progress</button>`;
        }

        return `
            <li class="album-list-item ${isCompleted ? 'completed' : ''}" style="border-left: 5px solid ${isCompleted ? 'var(--success-color)' : 'var(--primary-accent)'}; margin-bottom: 10px; padding: 15px; background: var(--surface-dark); border-radius: 12px;">
                <div class="icon" style="font-size: 30px; margin-right: 15px;">${album.icon}</div>
                <div class="details" style="flex-grow: 1;">
                    <h4 style="margin: 0 0 5px 0;">${album.name}</h4>
                    <p style="font-size: 0.9em; color: var(--text-secondary); margin-bottom: 5px;">${album.description}</p>
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
 * Handles claiming the reward for a completed album.
 */
window.handleClaimAlbumReward = async function(albumId, ankhReward, prestigeReward) {
    if (!state.currentUser) return;
    
    showToast('Processing album reward...', 'info');

    // 1. Mark as claimed and update completion status in Supabase (MOCK API CALL)
    // NOTE: This call should ideally be to a dedicated 'claimAlbumReward' API function
    
    // 2. Update player profile with rewards (Ankh, Prestige)
    const newScore = (state.playerProfile.score || 0) + ankhReward;
    const newPrestige = (state.playerProfile.prestige || 0) + prestigeReward;

    const { error } = await api.updatePlayerProfile(state.currentUser.id, { score: newScore, prestige: newPrestige });
    // Assume player_albums table is updated by a backend function or trigger after this.

    if (!error) {
        await refreshPlayerState();
        showToast(`Album Reward Claimed! +${ankhReward} ☥, +${prestigeReward} 🐞`, 'success');
        renderAlbums(); // Re-render the screen
    } else {
        showToast('Error claiming reward!', 'error');
        console.error('Album Claim Error:', error);
    }
}
