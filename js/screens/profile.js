/*
 * Filename: js/screens/profile.js
 * Version: Pharaoh's Legacy 'NOUB' v1.5.1 (XP System UI Overhaul)
 * Description: View Logic Module for the Profile screen.
 * OVERHAUL: Replaces the deprecated 'Power Score' with the new XP-based player
 * leveling system, including a progress bar and detailed XP stats.
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
 * Renders the player's comprehensive profile dashboard, now featuring the XP system.
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
    
    // 2. Calculate and gather stats
    const totalCardsCount = playerCards ? playerCards.length : 0;
    const totalContractsCompleted = state.playerProfile.completed_contracts_count || 0;
    
    // XP System Variables
    const playerLevel = state.playerProfile.level || 1;
    const currentXp = state.playerProfile.xp || 0;
    const xpToNextLevel = state.playerProfile.xp_to_next_level || 100;
    const xpProgressPercent = Math.min(100, (currentXp / xpToNextLevel) * 100);
    
    // Determine specialization name
    const specializationName = playerSpecs && playerSpecs.length > 0 
        ? playerSpecs[0].specialization_paths.name 
        : 'None Selected';
        
    // 3. Build the new Profile UI with the XP system
    profileContainer.innerHTML = `
        <div class="profile-header">
            <img src="${state.playerProfile.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="avatar" id="player-avatar-img">
            <h2 id="player-name">${state.playerProfile.username || 'Explorer'}</h2>
            <p class="player-level">Level ${playerLevel}</p>
        </div>

        <!-- NEW: XP Progression Section -->
        <div class="profile-section">
            <h3>Progress to Next Level</h3>
            <div class="xp-progress-container" style="margin-bottom: 10px;">
                <div class="progress-bar" style="background: #333; border-radius: 5px; height: 10px; overflow: hidden;">
                    <div class="progress-bar-inner" style="width: ${xpProgressPercent}%; height: 100%;"></div>
                </div>
                <p style="text-align: center; font-size: 0.9em; margin-top: 5px; color: var(--primary-accent);">
                    ${currentXp} / ${xpToNextLevel} XP
                </p>
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
                <div class="stat-box specialization-box">
                     <div class="value">${specializationName}</div>
                     <div class="label">Current Path</div>
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
        
        <button id="logout-btn" class="action-button danger">Logout</button>
    `;

    // Re-attach logout event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
}
