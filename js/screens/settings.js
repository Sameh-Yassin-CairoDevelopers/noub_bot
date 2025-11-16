/*
 * Filename: js/screens/settings.js
 * Version: NOUB v1.4 (Game Settings & Preferences)
 * Description: View Logic Module for the Player Settings screen. This version
 * implements functional avatar selection, username changes, and introduces
 * toggles for sound and animation effects, saving these preferences to localStorage.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- Module-level State & Constants ---
const settingsContainer = document.getElementById('settings-screen');

// Master list of available avatars. In a larger game, this could be fetched from a database.
const MASTER_AVATARS = [
    { id: 'default_explorer', name: 'Default Explorer', image_url: 'images/user_avatar.png', is_unlocked: true, level_req: 0 },
    { id: 'pharaoh_mask', name: 'Pharaoh Mask', image_url: 'images/pharaoh_mask.png', is_unlocked: false, level_req: 10 },
    { id: 'eve_guide', name: 'Eve Guide (Premium)', image_url: 'images/eve_avatar.png', is_unlocked: false, ankh_cost: 50 },
    { id: 'anubis_icon', name: 'Anubis Icon', image_url: 'images/anubis_icon.png', is_unlocked: false, level_req: 62 },
];

let selectedAvatarUrl = 'images/user_avatar.png'; // Local state to track the user's selection before saving.


// --- Core UI Logic for Settings Sub-components ---

/**
 * Updates the visual state of a settings toggle button based on its value in localStorage.
 * @param {string} key - The localStorage key ('soundEnabled' or 'animationEnabled').
 * @param {HTMLElement} button - The button element to update.
 */
function updateToggleButton(key, button) {
    const isEnabled = localStorage.getItem(key) === 'true';
    const settingName = key.replace('Enabled', '');
    button.textContent = `${settingName.charAt(0).toUpperCase() + settingName.slice(1)}: ${isEnabled ? 'ON' : 'OFF'}`;
    button.style.backgroundColor = isEnabled ? 'var(--success-color)' : 'var(--danger-color)';
}

/**
 * Handles the click event for a settings toggle button, updating the preference in localStorage.
 * @param {string} key - The localStorage key to toggle.
 * @param {HTMLElement} button - The button element that was clicked.
 */
function handleToggle(key, button) {
    const currentValue = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !currentValue); // Invert the boolean value
    updateToggleButton(key, button);
    const settingName = key.replace('Enabled', '');
    showToast(`${settingName.charAt(0).toUpperCase() + settingName.slice(1)} settings updated.`, 'info');
}

/**
 * Renders the grid of available and locked avatars for the player to choose from.
 * @param {number} playerLevel - The current level of the player.
 * @param {number} playerAnkhPremium - The player's current Ankh Premium balance.
 * @param {string} currentAvatarUrl - The URL of the player's currently equipped avatar.
 */
function renderAvatarSelection(playerLevel, playerAnkhPremium, currentAvatarUrl) {
    const avatarGrid = document.getElementById('avatar-selection-grid');
    if (!avatarGrid) return;
    avatarGrid.innerHTML = '';

    MASTER_AVATARS.forEach(avatar => {
        const isUnlocked = avatar.is_unlocked || (avatar.level_req && playerLevel >= avatar.level_req);
        const statusText = isUnlocked ? 'UNLOCKED' : (avatar.level_req ? `LVL ${avatar.level_req} Req.` : `${avatar.ankh_cost} ☥`);
        const cost = avatar.ankh_cost ? `${avatar.ankh_cost} Ankh` : (avatar.level_req ? `Level ${avatar.level_req}` : 'N/A');
        
        const isCurrentlySelected = currentAvatarUrl === avatar.image_url;
        const avatarElement = document.createElement('div');
        avatarElement.className = `card-stack avatar-item ${isCurrentlySelected ? 'selected' : ''}`;
        avatarElement.dataset.avatarId = avatar.id;
        avatarElement.dataset.imageUrl = avatar.image_url;
        avatarElement.dataset.unlocked = isUnlocked;
        avatarElement.dataset.name = avatar.name;
        avatarElement.dataset.cost = cost;
        
        avatarElement.innerHTML = `
            <img src="${avatar.image_url || 'images/user_avatar.png'}" alt="${avatar.name}" class="card-image">
            <h4>${avatar.name}</h4>
            <p style="font-size: 0.7em; margin: 0; color: ${isUnlocked ? 'var(--success-color)' : 'var(--danger-color)'};">${statusText}</p>
        `;
        
        if (isUnlocked) {
            avatarElement.addEventListener('click', handleAvatarSelect);
        } else if (avatar.ankh_cost) {
            avatarElement.addEventListener('click', () => {
                showToast(`Unlock ${avatar.name} for ${avatar.ankh_cost} Ankh Premium in the Shop!`, 'info');
            });
        }

        avatarGrid.appendChild(avatarElement);
        if (isCurrentlySelected) selectedAvatarUrl = avatar.image_url;
    });
}


// --- Event Handlers ---

/**
 * Handles the click event for selecting an avatar from the grid.
 * @param {Event} event - The click event.
 */
function handleAvatarSelect(event) {
    const avatarItem = event.currentTarget;
    const isUnlocked = avatarItem.dataset.unlocked === 'true';

    if (!isUnlocked) {
        showToast(`This avatar is locked!`, 'error');
        return;
    }

    document.querySelectorAll('.avatar-item').forEach(item => item.classList.remove('selected'));
    avatarItem.classList.add('selected');
    selectedAvatarUrl = avatarItem.dataset.imageUrl;

    document.getElementById('save-avatar-btn').disabled = false;
    showToast(`Selected: ${avatarItem.dataset.name}`, 'info');
}

/**
 * Handles saving the new username to the player's profile.
 */
async function handleSaveUsername() {
    const newUsername = document.getElementById('username-input').value.trim();
    if (!newUsername || newUsername.length < 3) {
        showToast("Username must be at least 3 characters.", 'error');
        return;
    }
    if (newUsername === state.playerProfile.username) {
        showToast("Username not changed.", 'info');
        return;
    }
    
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { username: newUsername });

    if (error) {
        showToast(`Error: Failed to update username!`, 'error');
        console.error('Update Username Error:', error);
    } else {
        await refreshPlayerState();
        showToast(`Username updated to ${newUsername}!`, 'success');
        updateHeaderUI(state.playerProfile);
    }
}

/**
 * Handles saving the newly selected avatar URL to the player's profile.
 */
async function handleSaveAvatar() {
    if (selectedAvatarUrl === state.playerProfile.avatar_url) {
        showToast("Avatar is already set to the selected image.", 'info');
        document.getElementById('save-avatar-btn').disabled = true;
        return;
    }
    
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { avatar_url: selectedAvatarUrl });

    if (error) {
        showToast(`Error: Failed to update avatar!`, 'error');
        console.error('Update Avatar Error:', error);
    } else {
        await refreshPlayerState();
        showToast(`Avatar updated successfully!`, 'success');
        document.getElementById('save-avatar-btn').disabled = true;
        updateHeaderUI(state.playerProfile);
    }
}


/**
 * Main rendering function for the Settings screen.
 * This function builds the entire screen's HTML and attaches all necessary event listeners.
 */
export async function renderSettings() {
    if (!state.currentUser || !state.playerProfile) return;

    const currentAvatar = state.playerProfile.avatar_url || MASTER_AVATARS[0].image_url;

    settingsContainer.innerHTML = `
        <h2>Settings & Preferences</h2>
        
        <!-- Game Settings Section for sound and animation toggles -->
        <div class="settings-section">
            <h3>Game Settings</h3>
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="toggle-sound-btn" class="action-button small"></button>
                <button id="toggle-animation-btn" class="action-button small"></button>
            </div>
        </div>

        <!-- Player Profile Section for username and avatar changes -->
        <div class="settings-section">
            <h3>Player Profile</h3>
            <label for="username-input">Explorer Name:</label>
            <input type="text" id="username-input" value="${state.playerProfile.username || ''}" placeholder="Enter new username" required>
            <button id="save-username-btn" class="action-button small upgrade-button">Save Name</button>
            
            <h3 style="margin-top: 20px;">Avatar Selection</h3>
            <p style="color: var(--text-secondary); font-size:0.8em;">Select your avatar and click Apply.</p>
            <div id="avatar-selection-grid" class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));"></div>
            <button id="save-avatar-btn" class="action-button small upgrade-button" style="margin-top: 10px;" disabled>Apply Selected Avatar</button>
        </div>
    `;

    // 1. Initialize and attach listeners for Game Settings buttons
    const soundBtn = document.getElementById('toggle-sound-btn');
    const animationBtn = document.getElementById('toggle-animation-btn');

    if (soundBtn) {
        updateToggleButton('soundEnabled', soundBtn);
        soundBtn.onclick = () => handleToggle('soundEnabled', soundBtn);
    }
    if (animationBtn) {
        updateToggleButton('animationEnabled', animationBtn);
        animationBtn.onclick = () => handleToggle('animationEnabled', animationBtn);
    }

    // 2. Render the avatar selection grid
    renderAvatarSelection(state.playerProfile.level, state.playerProfile.ankh_premium, currentAvatar);

    // 3. Attach listeners for profile action buttons
    document.getElementById('save-username-btn')?.addEventListener('click', handleSaveUsername);
    document.getElementById('save-avatar-btn')?.addEventListener('click', handleSaveAvatar);
}
