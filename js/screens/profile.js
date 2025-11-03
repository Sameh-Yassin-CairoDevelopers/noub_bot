/*
 * Filename: js/screens/profile.js
 * Version: NOUB 0.0.6 (Profile Module - FINAL FIX)
 * Description: View Logic Module for the Profile screen. Calculates total player power
 * based on owned cards and displays stats.
 * FIXED: Removed avatar_url reference as it's not in DB schema.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 

// DOM Element References
const playerNameEl = document.getElementById('player-name');
const playerPowerScoreEl = document.getElementById('player-power-score');
const statTotalCardsEl = document.getElementById('stat-total-cards');
const statContractsEl = document.getElementById('stat-contracts');
const logoutBtn = document.getElementById('logout-btn');
const playerAvatarImg = document.getElementById('player-avatar-img'); // Assuming this element still exists in HTML

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

    // 1. Fetch auxiliary data (Cards and Contracts History)
    const [
        { data: playerCards }, 
        { data: playerContracts }
    ] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerContracts(state.currentUser.id) 
    ]);
    
    // 2. Calculate Stats
    const totalPower = await calculateTotalPower(playerCards);
    const totalCardsCount = playerCards ? playerCards.length : 0;
    
    const totalContractsCompleted = playerContracts ? playerContracts.length : 0; // This still counts active, needs refinement for 'completed' only

    // 3. Update UI
    playerNameEl.textContent = state.playerProfile.username || 'Explorer';
    playerPowerScoreEl.textContent = totalPower;
    statTotalCardsEl.textContent = totalCardsCount;
    statContractsEl.textContent = totalContractsCompleted; 

    // FIXED: Do not try to access state.playerProfile.avatar_url if it's not in DB
    // Instead, assign a default image.
    if (playerAvatarImg) {
        playerAvatarImg.src = 'images/user_avatar.png'; // Set a default local avatar image
        playerAvatarImg.alt = state.playerProfile.username || 'Player Avatar';
    }


    // Ensure logout listener is active
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
}
