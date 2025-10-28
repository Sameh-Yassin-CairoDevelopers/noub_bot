/*
 * Filename: js/screens/settings.js
 * Version: NOUB 0.0.2 (SETTINGS MODULE - COMPLETE)
 * Description: View Logic Module for the Player Settings screen.
 * Handles username update and avatar selection from unlocked options.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const settingsContainer = document.getElementById('settings-screen');

// --- MASTER AVATAR DATA (Reference list - would be fetched from Supabase in a final product) ---
const MASTER_AVATARS = [
    { id: 'default_explorer', name: 'Default Explorer', image_url: 'images/user_avatar.png', is_unlocked: true },
    { id: 'pharaoh_mask', name: 'Pharaoh Mask', image_url: 'images/pharaoh_mask.png', is_unlocked: false, unlock_condition: { type: 'card_count', value: 10 } },
    { id: 'eve_guide', name: 'Eve Guide (Premium)', image_url: 'images/eve_avatar.png', is_unlocked: false, unlock_condition: { type: 'item_purchase', itemId: 'premium_avatar' } },
    { id: 'anubis_icon', name: 'Anubis Icon', image_url: 'images/anubis_icon.png', is_unlocked: false, unlock_condition: { type: 'kv_completion', level: 62 } },
];


/**
 * Renders the Settings screen, populating current data and unlocked options.
 */
export async function renderSettings() {
    if (!state.currentUser) return;

    if (!settingsContainer) {
        console.error("Settings container not found in DOM.");
        return;
    }

    // NOTE: For the sake of this demo, we mock unlocked avatars by fetching the user's current avatar.
    const unlockedAvatarKeys = new Set();
    const currentAvatar = state.playerProfile.avatar_url || MASTER_AVATARS[0].image_url;
    unlockedAvatarKeys.add(currentAvatar);
    
    // Fallback: Ensure the current avatar's key is in the MASTER_AVATARS for selection rendering
    const currentAvatarMaster = MASTER_AVATARS.find(a => a.image_url === currentAvatar) || MASTER_AVATARS[0];
    unlockedAvatarKeys.add(currentAvatarMaster.id);


    settingsContainer.innerHTML = `
        <h2>Settings & Preferences</h2>
        
        <div class="settings-section">
            <h3>Player Profile</h3>
            
            <label for="username-input">Explorer Name:</label>
            <input type="text" id="username-input" value="${state.playerProfile.username || ''}" placeholder="Enter new username" required>
            <button id="save-username-btn" class="action-button small upgrade-button">Save Name</button>
            
            <h3 style="margin-top: 30px;">Avatar Selection</h3>
            <div id="avatar-selection-grid" class="card-grid">
                <!-- Avatar items will be rendered here -->
            </div>
            <button id="save-avatar-btn" class="action-button small upgrade-button" style="margin-top: 20px;">Apply Selected Avatar</button>
        </div>
    `;

    // 1. Render Avatar Selection Grid
    const avatarGrid = document.getElementById('avatar-selection-grid');
    if (avatarGrid) {
        avatarGrid.innerHTML = MASTER_AVATARS.map(avatar => {
            const isUnlocked = unlockedAvatarKeys.has(avatar.id) || avatar.is_unlocked;
            const isSelected = avatar.image_url === currentAvatar;
            const statusText = isUnlocked ? (isSelected ? 'ACTIVE' : 'Unlocked') : 'LOCKED';
            const statusColor = isUnlocked ? (isSelected ? 'var(--success-color)' : 'var(--primary-accent)') : 'var(--danger-color)';

            return `
                <div class="card-stack avatar-item ${isSelected ? 'selected' : ''} ${isUnlocked ? '' : 'locked'}" 
                     data-avatar-id="${avatar.id}" 
                     data-image-url="${avatar.image_url}"
                     style="border-color: ${isSelected ? 'var(--success-color)' : (isUnlocked ? 'var(--primary-accent)' : '#444')};"
                >
                    <img src="${avatar.image_url}" alt="${avatar.name}" class="card-image">
                    <h4>${avatar.name}</h4>
                    <p style="color: ${statusColor}; font-size: 0.8em; margin: 0;">${statusText}</p>
                </div>
            `;
        }).join('');

        // 2. Attach Selection Listeners
        avatarGrid.querySelectorAll('.avatar-item').forEach(item => {
            if (!item.classList.contains('locked')) {
                item.onclick = function() {
                    avatarGrid.querySelectorAll('.avatar-item').forEach(i => i.classList.remove('selected'));
                    this.classList.add('selected');
                };
            }
        });
    }


    // 3. Attach Action Listeners
    document.getElementById('save-username-btn')?.addEventListener('click', handleSaveUsername);
    document.getElementById('save-avatar-btn')?.addEventListener('click', handleSaveAvatar);
}


// --- Handler Functions ---

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

    // NOTE: Full username validation (uniqueness check) would be implemented here in a real product.
    showToast(`Attempting to save name to ${newUsername}...`, 'info');
    
    // We will update the username directly in the profile table
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

async function handleSaveAvatar() {
    const selectedItem = settingsContainer.querySelector('.avatar-item.selected');
    if (!selectedItem) {
        showToast("Please select an avatar first.", 'error');
        return;
    }
    
    const newAvatarUrl = selectedItem.dataset.imageUrl;
    
    if (newAvatarUrl === state.playerProfile.avatar_url) {
        showToast("Avatar not changed.", 'info');
        return;
    }

    showToast("Applying new avatar...", 'info');

    // We will update the avatar_url directly in the profile table
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { avatar_url: newAvatarUrl });

    if (error) {
        showToast(`Error: Failed to update avatar!`, 'error');
        console.error('Update Avatar Error:', error);
    } else {
        await refreshPlayerState();
        showToast("Avatar applied successfully!", 'success');
        updateHeaderUI(state.playerProfile);
        renderSettings(); // Re-render to show new 'ACTIVE' status
    }
}

// Export the function for use by ui.js
export { renderSettings };
