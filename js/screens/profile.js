/*
 * Filename: js/screens/profile.js
 * Version: NOUB 0.0.1 Eve Edition (Profile Module - Complete)
 * Description: View Logic Module for the Profile screen. Calculates total player power
 * based on owned cards and displays stats.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; // Import logout function

// DOM Element References
const playerNameEl = document.getElementById('player-name');
const playerPowerScoreEl = document.getElementById('player-power-score');
const statTotalCardsEl = document.getElementById('stat-total-cards');
const statContractsEl = document.getElementById('stat-contracts');
const logoutBtn = document.getElementById('logout-btn');

/**
 * Calculates the total Power Score by summing the power_score of all owned card instances.
 */
async function calculateTotalPower(playerCards) {
    if (!playerCards || playerCards.length === 0) return 0;
    
    // Total Power is the sum of the power_score column for each individual card instance
    const totalPower = playerCards.reduce((sum, card) => {
        // Use the power_score stored directly on the player_cards instance
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
        api.fetchPlayerContracts(state.currentUser.id) // Using fetchPlayerContracts which usually gets ACTIVE ones, but we need COMPLETED ones too. Assuming a fetchCompletedContracts API later or counting total.
    ]);
    
    // 2. Calculate Stats
    const totalPower = await calculateTotalPower(playerCards);
    const totalCardsCount = playerCards ? playerCards.length : 0;
    
    // NOTE: For simplicity, we count all player contracts including active ones here. 
    // A proper stat should count contracts where status = 'completed'.
    const totalContractsCompleted = playerContracts ? playerContracts.length : 0;

    // 3. Update UI
    playerNameEl.textContent = state.playerProfile.username || 'Explorer';
    playerPowerScoreEl.textContent = totalPower;
    statTotalCardsEl.textContent = totalCardsCount;
    statContractsEl.textContent = totalContractsCompleted; // Will need adjustment later for 'Completed' count only

    // Ensure logout listener is active
    if (logoutBtn) {
        logoutBtn.onclick = logout; // Use the imported logout function
    }
}
