/*
 * Filename: js/ui.js
 * Version: NOUB v1.4 (Game Juice & Effects Module)
 * Description: UI Controller Module. This version is expanded to handle all UI logic,
 * navigation, and the management of "Game Juice" effects such as sound playback,
 * visual animations, and haptic feedback, respecting user preferences stored in localStorage.
*/

// --- Core Imports ---
import { state } from './state.js';
import { ASSET_PATHS } from './config.js';

// --- Screen Module Imports ---
// This pattern allows us to call the render functions of each screen module.
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
import * as projectsModule from './screens/projects.js'; // Import for new screen
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderKVGame } from './screens/kvgame.js';
import { renderChat } from './screens/chat.js';
import { renderHome } from './screens/home.js';


// --- Re-exporting render functions for standardized access from main.js ---
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
export const renderProjects = projectsModule.renderProjects; // Export for new screen


// --- NEW: Game Juice & Effects Helper Functions ---

// A simple cache to store loaded Audio objects, preventing re-downloading of sound files.
const audioCache = new Map();

/**
 * Plays a sound effect if sounds are enabled in settings.
 * It uses a cache to improve performance on subsequent plays.
 * @param {string} soundName - The name of the sound file (e.g., 'claim_reward') without the extension.
 */
export function playSound(soundName) {
    // Respect the user's preference stored in localStorage.
    if (localStorage.getItem('soundEnabled') !== 'true') return;

    let audio = audioCache.get(soundName);
    if (!audio) {
        audio = new Audio(`audio/${soundName}.mp3`);
        audioCache.set(soundName, audio);
    }
    // Ensure the sound can play from the beginning if it was already playing.
    audio.currentTime = 0;
    audio.play().catch(error => console.error(`Error playing sound '${soundName}':`, error));
}

/**
 * Displays a visual effect (e.g., a GIF) as a screen overlay for a short duration.
 * @param {string} effectName - The name of the effect file (e.g., 'reward_major') without the extension.
 * @param {number} [duration=2500] - The duration in milliseconds to show the effect.
 */
export function showVisualEffect(effectName, duration = 2500) {
    // Respect the user's preference stored in localStorage.
    if (localStorage.getItem('animationEnabled') !== 'true') return;

    const container = document.getElementById('visual-effect-container');
    const img = document.getElementById('visual-effect-img');
    if (!container || !img) return;

    img.src = `images/effects/${effectName}.gif`;
    container.classList.remove('hidden');

    setTimeout(() => {
        container.classList.add('hidden');
        img.src = ''; // Clear src to stop the GIF from consuming resources in the background.
    }, duration);
}

/**
 * Triggers haptic feedback on the Telegram app if the API is available.
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

/**
 * Hides a modal overlay. Exposed to window for use in inline onclick attributes in HTML.
 * @param {string} modalId - The ID of the modal to close.
 */
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Displays a modal overlay.
 * @param {string} modalId - The ID of the modal to open.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}
window.openModal = openModal; // Also expose to window for legacy onclick attributes if any.

/**
 * Displays a short-lived toast notification message.
 * @param {string} message - The text to display.
 * @param {string} [type='info'] - The type of toast: 'info', 'success', or 'error'.
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
window.showToast = showToast; // Expose globally for convenience.

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

/**
 * The main navigation router for the application.
 * Hides all screens and shows the target screen, then calls its render function.
 * @param {string} targetId - The ID of the screen to navigate to.
 */
export function navigateTo(targetId) {
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(targetId);
    if (screen) screen.classList.remove('hidden');

    navItems.forEach(i => i.classList.remove('active'));
    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if (targetNavItem) {
        targetNavItem.classList.add('active');
    }

    // Play a standard click sound for navigation
    playSound('click');
    triggerHaptic('soft');

    switch (targetId) {
        case 'home-screen': renderHome(); break;
        case 'collection-screen': collectionModule.renderCollection(); break;
        case 'economy-screen': renderProduction(); break;
        case 'albums-screen': albumsModule.renderAlbums(); break;
        case 'tasks-screen': tasksModule.renderTasks(); break;
        case 'projects-screen': projectsModule.renderProjects(); break; // UPDATED
        case 'contracts-screen': renderActiveContracts(); renderAvailableContracts(); break;
        case 'card-upgrade-screen': upgradeModule.renderUpgrade(); break;
        case 'kv-game-screen': renderKVGame(); break;
        case 'profile-screen': renderProfile(); break;
        case 'chat-screen': renderChat(); break;
        case 'history-screen': historyModule.renderHistory(); break;
        case 'library-screen': libraryModule.renderLibrary(); break;
        case 'settings-screen': settingsModule.renderSettings(); break;
        case 'wheel-screen': wheelModule.renderWheel(); break;
        case 'exchange-screen': exchangeModule.renderExchange(); break;
        case 'activity-screen': activityModule.renderActivity(); break;
    }
}

/**
 * Updates the main header UI with the player's currency and avatar.
 * @param {object} profile - The player's profile object from the state.
 */
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

/**
 * Sets up all primary navigation event listeners for the application.
 */
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

/**
 * Sets up event listeners for the items within the "More" (hamburger) menu modal.
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
 * A global setup function that initializes all static event listeners for the UI.
 */
export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();

    // Event listeners for stockpile tabs in the economy screen
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
