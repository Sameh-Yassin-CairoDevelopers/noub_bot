/*
 * Filename: js/screens/profile.js
 * Version: NOUB 0.0.7 (Profile Module - FIX: Contracts Count Display)
 * Description: View Logic Module for the Profile screen. Calculates total player power
 * based on owned cards and displays stats, now correctly showing the completed contracts count from state.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// DOM Element References
const playerNameEl = document.getElementById('player-name');
const playerPowerScoreEl = document.getElementById('player-power-score');
const statTotalCardsEl = document.getElementById('stat-total-cards');
const statContractsEl = document.getElementById('stat-contracts'); // This is the element for completed contracts
const logoutBtn = document.getElementById('logout-btn');
const playerAvatarImg = document.getElementById('player-avatar-img'); 

/**
 * Calculates the total Power Score by summing the power_score of all owned card instances.
 */
async function calculateTotalPower(playerCards) {
    if (!playerCards || playerCards.length === 0) return 0;
    
    const totalPower = playerCards.reduce((sum, card) => {
        return sum + (card.power_score || 0); 
    }, 0);

    return totalPower;
}

/**
 * Renders the player's profile information and statistics.
 */
export async function renderProfile() {
    if (!state.currentUser || !state.playerProfile) return;

    // Ensure we have the latest state before proceeding
    // NOTE: This call is necessary because profile updates (like completed_contracts_count) happen asynchronously
    await refreshPlayerState();

    // 1. Fetch auxiliary data (Cards)
    const [{ data: playerCards }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        // NOTE: We no longer fetch player contracts here, we use the count from state
    ]);
    
    // 2. Calculate Stats
    const totalPower = await calculateTotalPower(playerCards);
    const totalCardsCount = playerCards ? playerCards.length : 0;
    
    // CRITICAL: Get count directly from the refreshed state
    const totalContractsCompleted = state.playerProfile.completed_contracts_count || 0; 

    // 3. Update UI
    playerNameEl.textContent = state.playerProfile.username || 'Explorer';
    playerPowerScoreEl.textContent = totalPower;
    statTotalCardsEl.textContent = totalCardsCount;
    // FIX: Update the display with the count from the profile
    statContractsEl.textContent = totalContractsCompleted; 

    // Fixed: Set default avatar
    if (playerAvatarImg) {
        playerAvatarImg.src = 'images/user_avatar.png'; 
        playerAvatarImg.alt = state.playerProfile.username || 'Player Avatar';
    }

    // Ensure logout listener is active
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
}
