/*
 * Filename: js/screens/settings.js
 * Version: NOUB 0.0.8 (SETTINGS MODULE - FIX: Avatar Selection & Saving)
 * Description: View Logic Module for the Player Settings screen.
 * NEW: Implements functional avatar selection and saving to 'avatar_url' column.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const settingsContainer = document.getElementById('settings-screen');

// --- MASTER AVATAR DATA (Reference list) ---
const MASTER_AVATARS = [
    { id: 'default_explorer', name: 'Default Explorer', image_url: 'images/user_avatar.png', is_unlocked: true, level_req: 0 },
    { id: 'pharaoh_mask', name: 'Pharaoh Mask', image_url: 'images/pharaoh_mask.png', is_unlocked: false, level_req: 10 },
    { id: 'eve_guide', name: 'Eve Guide (Premium)', image_url: 'images/eve_avatar.png', is_unlocked: false, ankh_cost: 50 },
    { id: 'anubis_icon', name: 'Anubis Icon', image_url: 'images/anubis_icon.png', is_unlocked: false, level_req: 62 },
];

let selectedAvatarUrl = 'images/user_avatar.png'; // Track selected avatar locally

/**
 * Handles the click event for selecting an avatar.
 */
function handleAvatarSelect(event) {
    const avatarItem = event.currentTarget;
    const isUnlocked = avatarItem.dataset.unlocked === 'true';

    if (!isUnlocked) {
        const cost = avatarItem.dataset.cost;
        showToast(`This avatar is locked! Requires ${cost}.`, 'error');
        return;
    }

    // Deselect all and select the current one
    document.querySelectorAll('.avatar-item').forEach(item => item.classList.remove('selected'));
    avatarItem.classList.add('selected');
    selectedAvatarUrl = avatarItem.dataset.imageUrl;

    document.getElementById('save-avatar-btn').disabled = false;
    showToast(`Selected: ${avatarItem.dataset.name}`, 'info');
}

/**
 * Renders the Avatar Selection Grid based on player status.
 */
function renderAvatarSelection(playerLevel, playerAnkhPremium, currentAvatarUrl) {
    const avatarGrid = document.getElementById('avatar-selection-grid');
    if (!avatarGrid) return;
    avatarGrid.innerHTML = '';

    MASTER_AVATARS.forEach(avatar => {
        let isUnlocked = avatar.is_unlocked || (avatar.level_req && playerLevel >= avatar.level_req);
        let statusText = isUnlocked ? 'UNLOCKED' : (avatar.level_req ? `LVL ${avatar.level_req} Req.` : `${avatar.ankh_cost} ☥`);
        let cost = avatar.ankh_cost ? `${avatar.ankh_cost} Ankh` : (avatar.level_req ? `Level ${avatar.level_req}` : 'N/A');
        
        // This is simplified. In a real app, you'd check a separate 'player_avatars' table.
        // For now, only check level/cost and assume unlocked ones are always available.
        
        const isCurrentlySelected = currentAvatarUrl === avatar.image_url;

        const avatarElement = document.createElement('div');
        avatarElement.className = `card-stack avatar-item ${isCurrentlySelected ? 'selected' : ''}`;
        avatarElement.setAttribute('data-avatar-id', avatar.id);
        avatarElement.setAttribute('data-image-url', avatar.image_url);
        avatarElement.setAttribute('data-unlocked', isUnlocked);
        avatarElement.setAttribute('data-name', avatar.name);
        avatarElement.setAttribute('data-cost', cost);
        
        avatarElement.innerHTML = `
            <img src="${avatar.image_url || 'images/user_avatar.png'}" alt="${avatar.name}" class="card-image">
            <h4>${avatar.name}</h4>
            <p style="font-size: 0.7em; margin: 0; color: ${isUnlocked ? 'var(--success-color)' : 'var(--danger-color)'};">${statusText}</p>
        `;
        
        if (isUnlocked) {
            avatarElement.addEventListener('click', handleAvatarSelect);
        } else if (avatar.ankh_cost) {
            // Purchase logic for premium avatars could go here
            avatarElement.addEventListener('click', () => {
                showToast(`Unlock ${avatar.name} for ${avatar.ankh_cost} Ankh Premium!`, 'info');
            });
        }

        avatarGrid.appendChild(avatarElement);
        
        if (isCurrentlySelected) selectedAvatarUrl = avatar.image_url;
    });
}


/**
 * Renders the Settings screen, populating current data and unlocked options.
 */
export async function renderSettings() {
    if (!state.currentUser || !state.playerProfile) return;

    // Use current avatar URL from the profile (assuming column exists and is fetched)
    const currentAvatar = state.playerProfile.avatar_url || MASTER_AVATARS[0].image_url;

    settingsContainer.innerHTML = `
        <h2>Settings & Preferences</h2>
        
        <div class="settings-section">
            <h3>Player Profile</h3>
            
            <label for="username-input">Explorer Name:</label>
            <input type="text" id="username-input" value="${state.playerProfile.username || ''}" placeholder="Enter new username" required>
            <button id="save-username-btn" class="action-button small upgrade-button">Save Name</button>
            
            <h3 style="margin-top: 20px;">Avatar Selection</h3>
            <p style="color: var(--text-secondary); font-size:0.8em;">Select your avatar. Avatar is saved automatically upon selection.</p>
            <div id="avatar-selection-grid" class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));">
                <!-- Avatars will be rendered here -->
            </div>
            <button id="save-avatar-btn" class="action-button small upgrade-button" style="margin-top: 10px;" disabled>Apply Selected Avatar</button>
        </div>
    `;

    // 1. Render Avatar Selection Grid
    renderAvatarSelection(state.playerProfile.level, state.playerProfile.ankh_premium, currentAvatar);

    // 2. Attach Action Listeners
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

    showToast(`Attempting to save name to ${newUsername}...`, 'info');
    
    // Check if the username is taken (API function would be needed here, omitted for simplicity)
    
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
    if (selectedAvatarUrl === state.playerProfile.avatar_url) {
        showToast("Avatar is already set to the selected image.", 'info');
        document.getElementById('save-avatar-btn').disabled = true;
        return;
    }
    
    showToast(`Applying new avatar...`, 'info');
    
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { avatar_url: selectedAvatarUrl });

    if (error) {
        showToast(`Error: Failed to update avatar!`, 'error');
        console.error('Update Avatar Error:', error);
    } else {
        await refreshPlayerState();
        showToast(`Avatar updated successfully!`, 'success');
        document.getElementById('save-avatar-btn').disabled = true;
        
        // Refresh profile screen to see the change immediately
        import('./profile.js').then(({ renderProfile }) => renderProfile()); 
        
        // Update header UI if it shows the avatar (currently it doesn't, but for completeness)
        updateHeaderUI(state.playerProfile);
    }
}
