/*
 * Filename: js/screens/profile.js
 * Version: NOUB v1.5 (Player Leveling & XP Display)
 * Description: View Logic Module for the Profile screen. This version overhauls
 * the profile header to display the new XP-based leveling system, replacing the
 * deprecated Power Score metric.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// DOM Element References
const profileContainer = document.querySelector('#profile-screen .profile-container');

// Default avatar fallback
const DEFAULT_AVATAR = 'images/user_avatar.png';

/**
 * Renders the player's comprehensive profile dashboard, now with the XP leveling system.
 */
export async function renderProfile() {
    if (!state.currentUser || !state.playerProfile) {
        profileContainer.innerHTML = '<p class="error-message">Could not load profile data.</p>';
        return;
    }

    // Ensure we have the latest state before proceeding
    await refreshPlayerState();

    // 1. Fetch auxiliary data (Cards and Specializations)
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const { data: playerSpecs } = await api.fetchPlayerSpecializations(state.currentUser.id);
    
    // 2. Prepare all data for rendering
    const profile = state.playerProfile;
    const totalCardsCount = playerCards ? playerCards.length : 0;
    const totalContractsCompleted = profile.completed_contracts_count || 0;
    const playerLevel = profile.level || 1;
    const currentXp = profile.xp || 0;
    const xpToNextLevel = profile.xp_to_next_level || 100;
    const xpPercentage = Math.min(100, (currentXp / xpToNextLevel) * 100);

    const specializationName = playerSpecs && playerSpecs.length > 0 
        ? playerSpecs[0].specialization_paths.name 
        : 'None Selected';
        
    // 3. Build the new Profile UI with XP bar
    profileContainer.innerHTML = `
        <div class="profile-header">
            <img src="${profile.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="avatar" id="player-avatar-img">
            <h2 id="player-name">${profile.username || 'Explorer'}</h2>
        </div>

        <!-- NEW: XP and Leveling System Display -->
        <div class="profile-section">
            <h3>Level Progress</h3>
            <div class="level-display" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span class="player-level" style="font-weight: bold;">Level ${playerLevel}</span>
                <span class="xp-text" style="font-size: 0.9em; color: #ccc;">${currentXp} / ${xpToNextLevel} XP</span>
            </div>
            <div class="progress-bar" style="background: #333; border-radius: 5px; height: 10px; overflow: hidden;">
                <div class="progress-bar-inner" style="width: ${xpPercentage}%; height: 100%;"></div>
            </div>
        </div>

        <div class="profile-section">
            <h3>Core Stats</h3>
            <div class="profile-stats-grid main-stats">
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
                    <div class="value">${profile.ankh_premium || 0} ☥</div>
                    <div class="label">Ankh Premium</div>
                </div>
                <div class="stat-box">
                    <div class="value">${profile.prestige || 0} 🐞</div>
                    <div class="label">Prestige</div>
                </div>
                <div class="stat-box">
                    <div class="value">${profile.spin_tickets || 0} 🎟️</div>
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

    // Re-attach logout event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
}
