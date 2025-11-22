/*
 * Filename: js/screens/profile.js
 * Version: Pharaoh's Legacy 'NOUB' v2.0.0 (XP System & Grid UI Implemented)
 * Description: View Logic Module for the Profile screen. This version implements
 * the requested 2-column grid layout for core stats and currencies for better organization.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// DOM Element References
const profileContainer = document.querySelector('#profile-screen .profile-container');
const DEFAULT_AVATAR = 'images/user_avatar.png';


/**
 * Renders the player's comprehensive profile dashboard.
 */
export async function renderProfile() {
    if (!state.currentUser || !state.playerProfile) {
        profileContainer.innerHTML = '<p class="error-message">Could not load profile data.</p>';
        return;
    }

    await refreshPlayerState();

    // 1. Fetch auxiliary data (Cards and Specializations)
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const { data: playerSpecs } = await api.fetchPlayerSpecializations(state.currentUser.id);
    
    // 2. Calculate Stats
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
        
    // 3. Build the new Profile UI with the XP system and Grid Layout
    profileContainer.innerHTML = `
        <div class="profile-header">
            <img src="${state.playerProfile.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="avatar" id="player-avatar-img">
            <h2 id="player-name">${state.playerProfile.username || 'Explorer'}</h2>
            <p class="player-level">Level ${playerLevel}</p>
        </div>

        <!-- XP Progression Section -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--success-color);">Progress to Next Level</h3>
            <div class="xp-progress-container" style="margin-bottom: 10px;">
                <div class="progress-bar" style="background: #333; border-radius: 5px; height: 10px; overflow: hidden;">
                    <div class="progress-bar-inner" style="width: ${xpProgressPercent}%; height: 100%; background: var(--success-color);"></div>
                </div>
                <p style="text-align: center; font-size: 0.9em; margin-top: 5px; color: var(--primary-accent);">
                    ${currentXp} / ${xpToNextLevel} XP
                </p>
            </div>
        </div>

        <!-- Core Stats - 2 Column Grid -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--accent-blue);">Core Stats</h3>
            <div class="profile-stats-grid main-stats">
                <div class="stat-box">
                    <div id="stat-total-cards" class="value">${totalCardsCount}</div>
                    <div class="label">Total Cards</div>
                </div>
                <div class="stat-box">
                    <div id="stat-contracts" class="value">${totalContractsCompleted}</div>
                    <div class="label">Completed Contracts</div>
                </div>
                <div class="stat-box" style="grid-column: span 2;"> <!-- Make specialization span both columns -->
                    <div class="value">${specializationName}</div>
                    <div class="label">Current Path</div>
                </div>
            </div>
        </div>

        <!-- Currencies & Items - 2 Column Grid -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--primary-accent);">Currencies & Items</h3>
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
                <div class="stat-box">
                    <div class="value">${state.playerProfile.noub_score || 0} 🪙</div>
                    <div class="label">NOUB Score</div>
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
