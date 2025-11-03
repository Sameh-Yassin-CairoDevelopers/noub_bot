/*
 * Filename: js/screens/settings.js
 * Version: NOUB 0.0.6 (SETTINGS MODULE - FINAL FIX)
 * Description: View Logic Module for the Player Settings screen.
 * Handles username update. Avatar selection is simplified due to DB schema.
 * FIXED: Removed avatar_url assumptions for saving/loading avatar as it's not in DB schema.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const settingsContainer = document.getElementById('settings-screen');

// --- MASTER AVATAR DATA (Reference list) ---
// NOTE: These avatars are now local references, not stored in DB's profiles table directly
const MASTER_AVATARS = [
    { id: 'default_explorer', name: 'Default Explorer', image_url: 'images/user_avatar.png', is_unlocked: true },
    { id: 'pharaoh_mask', name: 'Pharaoh Mask', image_url: 'images/pharaoh_mask.png', is_unlocked: false, unlock_condition: { type: 'card_count', value: 10 } },
    { id: 'eve_guide', name: 'Eve Guide (Premium)', image_url: 'images/eve_avatar.png', is_unlocked: false, unlock_condition: { type: 'item_purchase', itemId: 'premium_avatar' } },
    { id: 'anubis_icon', name: 'Anubis Icon', image_url: 'images/anubis_icon.png', is_unlocked: false, unlock_condition: { type: 'kv_completion', level: 62 } },
];

let selectedAvatarUrl = 'images/user_avatar.png'; // Track selected avatar locally

/**
 * Renders the Settings screen, populating current data and unlocked options.
 */
export async function renderSettings() {
    if (!state.currentUser) return;

    if (!settingsContainer) {
        console.error("Settings container not found in DOM.");
        return;
    }

    // Since avatar_url is not in profiles table, we'll simplify avatar handling.
    // For now, it will always show the default explorer avatar in the UI.
    // To enable dynamic avatars, avatar_url column must be added to 'profiles' table.
    const currentDisplayedAvatar = 'images/user_avatar.png'; // Always display default from HTML
    selectedAvatarUrl = currentDisplayedAvatar; // Default selected to what's displayed

    settingsContainer.innerHTML = `
        <h2>Settings & Preferences</h2>
        
        <div class="settings-section">
            <h3>Player Profile</h3>
            
            <label for="username-input">Explorer Name:</label>
            <input type="text" id="username-input" value="${state.playerProfile.username || ''}" placeholder="Enter new username" required>
            <button id="save-username-btn" class="action-button small upgrade-button">Save Name</button>
            
            <h3 style="margin-top: 20px;">Avatar Selection (Currently Not Supported via DB)</h3>
            <p style="color: var(--text-secondary); font-size:0.8em;">To enable dynamic avatar selection, please add 'avatar_url' column to your 'profiles' table in Supabase.</p>
            <div id="avatar-selection-grid" class="card-grid" style="opacity: 0.5; pointer-events: none;">
                <!-- Avatar items will be rendered here, but disabled -->
                <div class="card-stack avatar-item selected" 
                     data-avatar-id="default_explorer" 
                     data-image-url="images/user_avatar.png"
                     style="border-color: var(--success-color);"
                >
                    <img src="images/user_avatar.png" alt="Default Explorer" class="card-image">
                    <h4>Default Explorer</h4>
                    <p style="color: var(--success-color); font-size: 0.8em; margin: 0;">ACTIVE</p>
                </div>
            </div>
            <button id="save-avatar-btn" class="action-button small upgrade-button" style="margin-top: 10px; opacity: 0.5; pointer-events: none;" disabled>Apply Selected Avatar</button>
        </div>
    `;

    // 1. Render Avatar Selection Grid (mostly disabled)
    const avatarGrid = document.getElementById('avatar-selection-grid');
    if (avatarGrid) {
        // We'll only render the default as active and others as locked/disabled for now.
        // If avatar_url is added to DB, this logic needs full re-implementation.
    }


    // 3. Attach Action Listeners
    document.getElementById('save-username-btn')?.addEventListener('click', handleSaveUsername);
    // document.getElementById('save-avatar-btn')?.addEventListener('click', handleSaveAvatar); // Disabled for now
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

    showToast(`Attempting to save name to ${newUsername}...`, 'info');
    
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

// handleSaveAvatar function is commented out/disabled because avatar_url is not in DB.
/*
async function handleSaveAvatar() {
    // This function requires 'avatar_url' to be a column in your 'profiles' table.
    // Re-enable and re-implement once 'avatar_url' is added to Supabase.
    showToast("Avatar saving is currently disabled. Add 'avatar_url' column to profiles table.", 'error');
}
*/
