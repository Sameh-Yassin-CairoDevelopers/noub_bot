/*
 * Filename: js/ui.js
 * Version: NOUB v0.4 (Card Experience Overhaul)
 * Description: UI Controller Module. Handles all UI logic and navigation.
 * CHANGE: Removed navigation cases and imports for the now-obsolete 
 *         'collection.js' and 'upgrade.js' modules. All card interactions
 *         are now handled through the 'albums.js' module.
*/

// --- CORE IMPORTS ---
import { state } from './state.js';

// --- SCREEN MODULES IMPORTS ---
// REMOVED: import * as collectionModule from './screens/collection.js';
// REMOVED: import * as upgradeModule from './screens/upgrade.js';
import * as historyModule from './screens/history.js';
import * as libraryModule from './screens/library.js';
import * as settingsModule from './screens/settings.js';
import * as albumsModule from './screens/albums.js';
import * as wheelModule from './screens/wheel.js';
import * as exchangeModule from './screens/exchange.js';
import * as activityModule from './screens/activity.js';
import * as tasksModule from './screens/tasks.js';

// Other screen imports
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderKVGame } from './screens/kvgame.js';
import { renderChat } from './screens/chat.js';
import { renderHome } from './screens/home.js';


// --- EXPORTS for modules that are still separate ---
export const renderHistory = historyModule.renderHistory;
export const renderLibrary = libraryModule.renderLibrary;
export const renderSettings = settingsModule.renderSettings;
export const renderAlbums = albumsModule.renderAlbums;
export const renderWheel = wheelModule.renderWheel;
export const renderActivity = activityModule.renderActivity;
export const renderExchange = exchangeModule.renderExchange;
export const renderTasks = tasksModule.renderTasks;


// --- GLOBAL UTILITY FUNCTIONS ---

/**
 * Closes a modal dialog by its ID.
 * @param {string} modalId - The ID of the modal overlay to hide.
 */
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Displays a short-lived notification message (toast).
 * @param {string} message - The text to display.
 * @param {string} type - The type of toast ('info', 'success', 'error').
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Use textContent for security instead of innerHTML
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500); // Remove after fade out
    }, 3000);
}
window.showToast = showToast; // Make it globally accessible for inline calls

/**
 * Opens a modal dialog by its ID.
 * @param {string} modalId - The ID of the modal overlay to show.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}
window.openModal = openModal; // Make it globally accessible


// --- NAVIGATION LOGIC ---

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

/**
 * The main router for the application. Hides all screens and shows the target one.
 * It also calls the appropriate render function for the target screen.
 * @param {string} targetId - The ID of the screen to navigate to.
 */
export function navigateTo(targetId) {
    // Hide all screens
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    
    // Show the target screen
    const screen = document.getElementById(targetId);
    if (screen) {
        screen.classList.remove('hidden');
    }

    // Update the active state of the bottom navigation bar
    navItems.forEach(i => i.classList.remove('active'));
    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if(targetNavItem) {
        targetNavItem.classList.add('active');
    }

    // Call the corresponding render function for the screen
    switch (targetId) {
        case 'home-screen':
            renderHome();
            break;
        case 'economy-screen':
            renderProduction();
            break;
        case 'albums-screen':
            albumsModule.renderAlbums();
            break;
        case 'tasks-screen':
            tasksModule.renderTasks();
            break;
        case 'contracts-screen':
            renderActiveContracts();
            renderAvailableContracts();
            break;
        case 'kv-game-screen':
            renderKVGame();
            break;
        case 'profile-screen':
            renderProfile();
            break;
        case 'chat-screen':
            renderChat();
            break;
        case 'history-screen':
            historyModule.renderHistory();
            break;
        case 'library-screen':
            libraryModule.renderLibrary();
            break;
        case 'settings-screen':
            settingsModule.renderSettings();
            break;
        case 'wheel-screen':
            wheelModule.renderWheel();
            break;
        case 'exchange-screen':
            exchangeModule.renderExchange();
            break;
        case 'activity-screen':
            activityModule.renderActivity();
            break;
        // NOTE: 'collection-screen' and 'card-upgrade-screen' have been removed
        // as their functionality is now integrated into 'albums-screen'.
    }
}

/**
 * Updates the main header UI with the player's current NOUB score and avatar.
 * @param {object} profile - The player's profile object from the state.
 */
export function updateHeaderUI(profile) {
    if (!profile) return;

    const noubDisplay = document.getElementById('noub-display');
    if(noubDisplay) {
        noubDisplay.textContent = profile.noub_score || 0;
    }

    const headerAvatarImg = document.getElementById('header-avatar-img');
    if (headerAvatarImg) {
        headerAvatarImg.src = profile.avatar_url || 'images/user_avatar.png';
    }
}


// --- EVENT LISTENER SETUP ---

/**
 * Sets up all navigation event listeners for the bottom bar, home screen icons, etc.
 */
function setupNavEvents() {
    // Bottom navigation bar links
    document.querySelectorAll('.bottom-nav a[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.target);
        });
    });

    // Home screen icon links
    document.querySelectorAll('.home-layout a[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
             e.preventDefault();
             navigateTo(link.dataset.target);
        });
    });
    
    // Header profile button (top left avatar)
    const headerProfileBtn = document.querySelector('.header-profile-btn');
    if (headerProfileBtn) {
        headerProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(headerProfileBtn.dataset.target);
        });
    }

    // Shop button in the bottom navigation bar
    const bottomShopBtn = document.getElementById('bottom-shop-btn');
    if (bottomShopBtn) {
        bottomShopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openShopModal();
        });
    }

    // Hamburger menu button ("More")
    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('more-modal');
        });
    }
}

/**
 * Sets up event listeners for the items inside the "More" menu modal.
 */
function setupMoreMenuEvents() {
    const handleMoreClick = (event) => {
        event.preventDefault();
        const targetId = event.currentTarget.dataset.target;
        window.closeModal('more-modal');
        navigateTo(targetId);
    };

    const moreMenuItems = document.querySelectorAll('#more-modal .more-menu-item');
    moreMenuItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', handleMoreClick);
        }
    });
}

/**
 * Main function to set up all event listeners for the entire application UI.
 */
export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();

    // Event listeners for the Stockpile tabs in the economy screen
    const stockTabs = document.querySelectorAll('.stock-tab-btn');
    stockTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stock-tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.stock-content-tab').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const contentId = `stock-content-${tab.dataset.stockTab}`;
            const contentElement = document.getElementById(contentId);
            if (contentElement) {
                contentElement.classList.add('active');
            }
        });
    });
}
