/*
 * Filename: js/ui.js
 * Version: NOUB v1.5 (Centralized Card Management & Project Navigation)
 * Description: UI Controller Module. This version streamlines the UI by removing
 * the separate 'upgrade' screen navigation and integrating the new 'projects' screen.
 * It also contains the core functions for Game Juice effects.
*/

// --- Core Imports ---
import { state } from './state.js';
import { ASSET_PATHS } from './config.js';

// --- Screen Module Imports ---
import * as collectionModule from './screens/collection.js';
// import * as upgradeModule from './screens/upgrade.js'; // DEPRECATED: Upgrade logic is now in collection.js
import * as historyModule from './screens/history.js';
import * as libraryModule from './screens/library.js';
import * as settingsModule from './screens/settings.js';
import * as albumsModule from './screens/albums.js';
import * as wheelModule from './screens/wheel.js';
import * as exchangeModule from './screens/exchange.js';
import * as activityModule from './screens/activity.js';
import * as tasksModule from './screens/tasks.js';
import * as projectsModule from './screens/projects.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderKVGame } from './screens/kvgame.js';
import { renderChat } from './screens/chat.js';
import { renderHome } from './screens/home.js';
import { renderMsGame } from './screens/ms_game.js'; 
// ADD THIS LINE: Import the new render function (if you decide to use it)
import { renderSwapScreen, handleCancelOffer } from './screens/swap_screen.js'; // <-- ADD handleCancelOffer HERE


// --- Re-exporting render functions for standardized access ---
export const renderCollection = collectionModule.renderCollection;
// export const renderUpgrade = upgradeModule.renderUpgrade; // DEPRECATED
export const renderHistory = historyModule.renderHistory;
export const renderLibrary = libraryModule.renderLibrary;
export const renderSettings = settingsModule.renderSettings;
export const renderAlbums = albumsModule.renderAlbums;
export const renderWheel = wheelModule.renderWheel;
export const renderActivity = activityModule.renderActivity;
export const renderExchange = exchangeModule.renderExchange;
export const renderTasks = tasksModule.renderTasks;
export const renderProjects = projectsModule.renderProjects;


// --- Game Juice & Effects Helper Functions ---

const audioCache = new Map();

/**
 * Plays a sound effect if sounds are enabled in settings.
 * @param {string} soundName - The name of the sound file (e.g., 'claim_reward').
 */
export function playSound(soundName) {
    if (localStorage.getItem('soundEnabled') !== 'true') return;
    let audio = audioCache.get(soundName);
    if (!audio) {
        audio = new Audio(`audio/${soundName}.mp3`);
        audioCache.set(soundName, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(error => console.error(`Error playing sound '${soundName}':`, error));
}

/**
 * Displays a visual effect (GIF) overlay.
 * @param {string} effectName - The name of the effect file (e.g., 'reward_major').
 * @param {number} [duration=2500] - Duration in milliseconds.
 */
export function showVisualEffect(effectName, duration = 2500) {
    if (localStorage.getItem('animationEnabled') !== 'true') return;
    const container = document.getElementById('visual-effect-container');
    const img = document.getElementById('visual-effect-img');
    if (!container || !img) return;
    img.src = `images/effects/${effectName}.gif`;
    container.classList.remove('hidden');
    setTimeout(() => {
        container.classList.add('hidden');
        img.src = '';
    }, duration);
}

/**
 * Triggers haptic feedback on the Telegram app.
 * @param {string} [type='light'] - The impact style: 'light', 'medium', 'heavy', 'rigid', 'soft'.
 */
export function triggerHaptic(type = 'light') {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
    }
}

/**
 * Triggers a notification-style haptic feedback.
 * @param {string} [notificationType='success'] - 'success', 'warning', or 'error'.
 */
export function triggerNotificationHaptic(notificationType = 'success') {
     if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred(notificationType);
    }
}


// --- Core UI Utility Functions ---

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}
window.openModal = openModal;

export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
window.showToast = showToast;

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');


// A module-level flag to track the initial, automatic navigation event.
// This is used to prevent sound playback before the user's first interaction,
// adhering to modern browser autoplay policies.
let isFirstNavigation = true;

/**
 * The main navigation router for the application.
 * It manages screen visibility, updates the active state of navigation buttons,
 * and calls the appropriate render function for the target screen.
 * This version includes a fix to prevent sound playback on initial load.
 * @param {string} targetId - The ID of the screen element to navigate to.
 */
export function navigateTo(targetId) {
    // 1. Manage Screen Visibility: Hide all screens, then show the target screen.
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(targetId);
    if (screen) {
        screen.classList.remove('hidden');
    }

    // 2. Update Navigation UI: Remove 'active' class from all nav items, then add it to the target.
    navItems.forEach(i => i.classList.remove('active'));
    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if (targetNavItem) {
        targetNavItem.classList.add('active');
    }

    // 3. Play User Feedback (Sound & Haptics)
    // CRITICAL FIX for Autoplay Policy:
    // We only play feedback on subsequent navigations, which are guaranteed to be
    // triggered by a user interaction (a click). The very first navigation is programmatic.
    if (!isFirstNavigation) {
        playSound('click');
        triggerHaptic('soft');
    }
    // After the first programmatic navigation, all subsequent calls will be from user actions.
    isFirstNavigation = false;

    // 4. Render Screen Content: Call the specific render function for the target screen.
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
        case 'projects-screen':
            projectsModule.renderProjects();
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
        
        // --- NEW: Idle Drop and P2P Swap Screen Links ---
        case 'ms-game-screen': // Idle Drop Generator
            // Assuming the render function is available (via import or global scope)
            renderMsGame(); 
            break;
        case 'swap-screen': // P2P Swap Market
            renderSwapScreen(); // <--- Call the new render function
            // For now, it could be empty or navigate to an existing screen for temporary use
            // If you have a temporary render function, use it here, otherwise just leave it to load the empty screen
            break;
        // --- END NEW ---
    }
}


export function updateHeaderUI(profile) {
    if (!profile) return;
    const noubDisplay = document.getElementById('noub-display');
    if (noubDisplay) {
        noubDisplay.textContent = Math.floor(profile.noub_score || 0);
    }
    const headerAvatarImg = document.getElementById('header-avatar-img');
    if (headerAvatarImg) {
        headerAvatarImg.src = profile.avatar_url || 'images/user_avatar.png';
    }
}

function setupNavEvents() {
    document.querySelectorAll('.bottom-nav a[data-target]').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.target));
    });
    document.querySelectorAll('.home-layout a[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
             e.preventDefault();
             navigateTo(link.dataset.target);
        });
    });
    const headerProfileBtn = document.querySelector('.header-profile-btn');
    if (headerProfileBtn) {
        headerProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(headerProfileBtn.dataset.target);
        });
    }
    const bottomShopBtn = document.getElementById('bottom-shop-btn');
    if (bottomShopBtn) bottomShopBtn.addEventListener('click', () => {
        playSound('click');
        openShopModal();
    });
    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) moreBtn.addEventListener('click', () => {
        playSound('click');
        openModal('more-modal');
    });
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

/**
 * A global setup function that initializes all static event listeners for the UI.
 */
export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();

    const stockTabs = document.querySelectorAll('.stock-tab-btn');
    stockTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stock-tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.stock-content-tab').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const contentTab = document.getElementById(`stock-content-${tab.dataset.stockTab}`);
            if (contentTab) contentTab.classList.add('active');
            playSound('click');
        });
    });
}







