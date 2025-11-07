/*
 * Filename: js/ui.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2
 * Description: UI Controller Module. Handles all UI logic and navigation.
 * UPDATED: Header UI logic, removed Slot Game navigation, and added new header profile button event.
*/

// --- CORE IMPORTS ---
import { state } from './state.js';
import { ASSET_PATHS } from './config.js';

// --- SCREEN MODULES IMPORTS ---
import * as collectionModule from './screens/collection.js';
import * as upgradeModule from './screens/upgrade.js';
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
// DELETED: renderSlotGame import removed
import { renderKVGame } from './screens/kvgame.js';
import { renderChat } from './screens/chat.js';
import { renderHome } from './screens/home.js';


// --- EXPORTS ---
export const renderCollection = collectionModule.renderCollection;
export const renderUpgrade = upgradeModule.renderUpgrade;
export const renderHistory = historyModule.renderHistory;
export const renderLibrary = libraryModule.renderLibrary;
export const renderSettings = settingsModule.renderSettings;
export const renderAlbums = albumsModule.renderAlbums;
export const renderWheel = wheelModule.renderWheel;
export const renderActivity = activityModule.renderActivity;
export const renderExchange = exchangeModule.renderExchange;
export const renderTasks = tasksModule.renderTasks;


// Make utility functions globally available for onclick attributes in HTML
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Named export for module imports
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // SECURITY FIX: Use textContent instead of innerHTML to prevent XSS
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
// Also make it globally available for any inline HTML onclick attributes
window.showToast = showToast;

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

export function navigateTo(targetId) {
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(targetId);
    if (screen) screen.classList.remove('hidden');

    navItems.forEach(i => i.classList.remove('active'));

    // Highlight the correct bottom nav item, if one exists
    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if(targetNavItem) {
        targetNavItem.classList.add('active');
    }

    // Call the appropriate render function for the target screen
    switch (targetId) {
        case 'home-screen':
            renderHome();
            break;
        case 'collection-screen':
            collectionModule.renderCollection();
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
        case 'card-upgrade-screen':
            upgradeModule.renderUpgrade();
            break;
        // DELETED: Case for 'slot-game-screen' removed
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
    }
}

/**
 * Updates the main header UI with player currencies and avatar.
 * @param {object} profile - The player's profile object from the state.
 */
export function updateHeaderUI(profile) {
    if (!profile) return;

    const noubDisplay = document.getElementById('noub-display');
    if(noubDisplay) {
        noubDisplay.textContent = profile.noub_score || 0;
    }

    // NEW: Update only the currencies that are still in the header
    // const prestigeDisplay = document.getElementById('prestige-display');
    // if(prestigeDisplay) {
    //     prestigeDisplay.textContent = profile.prestige || 0;
    // }

    // const ankhPremiumDisplay = document.getElementById('ankh-premium-display');
    // if(ankhPremiumDisplay) {
    //     ankhPremiumDisplay.textContent = profile.ankh_premium || 0;
    // }

    // NEW: Update header avatar image
    const headerAvatarImg = document.getElementById('header-avatar-img');
    if (headerAvatarImg) {
        headerAvatarImg.src = profile.avatar_url || 'images/user_avatar.png';
    }
}

function setupNavEvents() {
    // Bottom navigation bar links
    document.querySelectorAll('.bottom-nav a[data-target]').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.target));
    });

    // Home screen icon links
    document.querySelectorAll('.home-layout a[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
             e.preventDefault();
             const targetId = link.dataset.target;
             navigateTo(targetId);
        });
    });
    
    // NEW: Header profile button
    const headerProfileBtn = document.querySelector('.header-profile-btn');
    if (headerProfileBtn) {
        headerProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(headerProfileBtn.dataset.target);
        });
    }

    // Shop button in the bottom navigation bar
    const bottomShopBtn = document.getElementById('bottom-shop-btn');
    if (bottomShopBtn) bottomShopBtn.addEventListener('click', () => openShopModal());

    // Hamburger menu button
    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) moreBtn.addEventListener('click', () => openModal('more-modal'));
}

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

export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();

    // Stockpile tabs in economy screen
    const stockTabs = document.querySelectorAll('.stock-tab-btn');
    stockTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stock-tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.stock-content-tab').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`stock-content-${tab.dataset.stockTab}`).classList.add('active');
        });
    });
}
