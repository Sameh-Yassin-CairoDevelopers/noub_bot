/*
 * Filename: js/screens/profile.js
 * Version: NOUB 0.0.8 (Profile Module - FIX: Avatar Display)
 * Description: View Logic Module for the Profile screen. Calculates total player power
 * based on owned cards and displays stats, now correctly showing the selected avatar.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// DOM Element References
const playerNameEl = document.getElementById('player-name');
const playerPowerScoreEl = document.getElementById('player-power-score');
const statTotalCardsEl = document.getElementById('stat-total-cards');
const statContractsEl = document.getElementById('stat-contracts');
const logoutBtn = document.getElementById('logout-btn');
const playerAvatarImg = document.getElementById('player-avatar-img'); 

// Default avatar fallback
const DEFAULT_AVATAR = 'images/user_avatar.png';


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
    await refreshPlayerState();

    // 1. Fetch auxiliary data (Cards)
    const [{ data: playerCards }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
    ]);
    
    // 2. Calculate Stats
    const totalPower = await calculateTotalPower(playerCards);
    const totalCardsCount = playerCards ? playerCards.length : 0;
    const totalContractsCompleted = state.playerProfile.completed_contracts_count || 0; 

    // 3. Update UI
    playerNameEl.textContent = state.playerProfile.username || 'Explorer';
    playerPowerScoreEl.textContent = totalPower;
    statTotalCardsEl.textContent = totalCardsCount;
    statContractsEl.textContent = totalContractsCompleted; 

    // FIX: Use the avatar_url from the state, or fall back to default
    if (playerAvatarImg) {
        // Use optional chaining for safety, and fall back to default
        const avatarUrl = state.playerProfile.avatar_url || DEFAULT_AVATAR; 
        playerAvatarImg.src = avatarUrl; 
        playerAvatarImg.alt = state.playerProfile.username || 'Player Avatar';
    }

    // Ensure logout listener is active
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
}
