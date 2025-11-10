/*
 * Filename: js/screens/profile.js
 * Version: Pharaoh's Legacy 'NOUB' v0.4 (Critical Fix: DOM Element Selection)
 * Description: View Logic Module for the Profile screen.
 * FIX: The 'profileContainer' element is now selected inside the render function
 *      to prevent it from being null on initial script load. This fixes the blank screen bug.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// Default avatar fallback
const DEFAULT_AVATAR = 'images/user_avatar.png';


/**
 * Calculates the total Power Score by summing the power_score of all owned card instances.
 * @param {Array} playerCards - The array of player card objects.
 * @returns {number} - The calculated total power score.
 */
async function calculateTotalPower(playerCards) {
    if (!playerCards || playerCards.length === 0) return 0;
    
    return playerCards.reduce((sum, card) => sum + (card.power_score || 0), 0);
}

/**
 * Renders the player's comprehensive profile dashboard.
 */
export async function renderProfile() {
    // --- CRITICAL FIX START ---
    // The profileContainer is now selected here, inside the function.
    // This ensures that the DOM element is found at the moment of rendering,
    // solving the "blank screen" issue.
    const profileContainer = document.querySelector('#profile-screen .profile-container');
    // --- CRITICAL FIX END ---

    if (!state.currentUser || !state.playerProfile) {
        if (profileContainer) {
            profileContainer.innerHTML = '<p class="error-message">Could not load profile data. Please try again.</p>';
        }
        return;
    }

    // Ensure we have the latest state before proceeding
    await refreshPlayerState();

    // 1. Fetch auxiliary data (Cards and Specializations)
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const { data: playerSpecs } = await api.fetchPlayerSpecializations(state.currentUser.id);
    
    // 2. Calculate Stats
    const totalPower = await calculateTotalPower(playerCards);
    const totalCardsCount = playerCards ? playerCards.length : 0;
    const totalContractsCompleted = state.playerProfile.completed_contracts_count || 0;
    const playerLevel = state.playerProfile.level || 1;
    
    // Determine specialization name
    const specializationName = playerSpecs && playerSpecs.length > 0 
        ? playerSpecs[0].specialization_paths.name 
        : 'None Selected';
        
    // 3. Build the Profile UI HTML
    // (This HTML structure is from your original file and remains unchanged)
    const profileHTML = `
        <div class="profile-header">
            <img src="${state.playerProfile.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="avatar" id="player-avatar-img">
            <h2 id="player-name">${state.playerProfile.username || 'Explorer'}</h2>
            <p class="player-level">Level ${playerLevel}</p>
        </div>

        <div class="profile-section">
            <h3>Core Stats</h3>
            <div class="profile-stats-grid main-stats">
                <div class="stat-box">
                    <div id="player-power-score" class="value">${totalPower}</div>
                    <div class="label">Power Score</div>
                </div>
                <div class="stat-box">
                    <div id="stat-total-cards" class="value">${totalCardsCount}</div>
                    <div class="label">Total Cards</div>
                </div>
                <div class="stat-box">
                    <div id="stat-contracts" class="value">${totalContractsCompleted}</div>
                    <div class="label">Completed Contracts</div>
                </div>
            </div>
        </div>

        <div class="profile-section">
            <h3>Currencies & Items</h3>
            <div class="profile-stats-grid currency-stats">
                <div class="stat-box">
                    <div class="value">${state.playerProfile.ankh_premium || 0} ☥</div>
                    <div class="label">Ankh Premium</div>
                </div>
                <div class="stat-box">
                    <div class="value">${state.playerProfile.prestige || 0} 🐞</div>
                    <div class="label">Prestige</div>
                </div>
                <div class="stat-box">
                    <div class="value">${state.playerProfile.spin_tickets || 0} 🎟️</div>
                    <div class="label">Spin Tickets</div>
                </div>
            </div>
        </div>
        
        <div class="profile-section">
            <h3>Specialization</h3>
            <div class="stat-box specialization-box">
                <div class="value">${specializationName}</div>
                <div class="label">Current Path</div>
            </div>
        </div>

        <button id="logout-btn" class="action-button danger">Logout</button>
    `;

    // 4. Inject the HTML into the container and attach event listeners
    if (profileContainer) {
        profileContainer.innerHTML = profileHTML;
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = logout;
        }
    } else {
        console.error("Profile container not found in the DOM during render.");
    }
}
