// Import render functions from their respective screen modules
import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderResources, renderWorkshops, renderStock } from './screens/economy.js';
import { state } from './state.js';

// DOM element references for frequent use
const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

/**
 * Handles navigation between different screens in the single-page application.
 * @param {string} targetId - The ID of the screen element to display.
 */
export function navigateTo(targetId) {
    // Hide all screens to ensure a clean slate
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    
    // Show the target screen
    const screen = document.getElementById(targetId);
    if (screen) {
        screen.classList.remove('hidden');
    }

    // Update the active state of the bottom navigation bar
    navItems.forEach(i => i.classList.toggle('active', i.dataset.target === targetId));

    // Call the specific render function for the newly displayed screen
    switch (targetId) {
        case 'collection-screen':
            renderCollection();
            break;
        case 'profile-screen':
            renderProfile();
            break;
        case 'resources-screen':
            renderResources();
            break;
        case 'factories-screen':
            renderWorkshops();
            break;
        case 'stock-screen':
            renderStock();
            break;
    }
}

/**
 * Updates the header UI with the latest player currency data from the shared state.
 */
export function updateHeaderUI() {
    if (!state.playerProfile) return;
    document.getElementById('ankh-display').textContent = state.playerProfile.score || 0;
    document.getElementById('prestige-display').textContent = state.playerProfile.prestige || 0;
    document.getElementById('blessing-display').textContent = state.playerProfile.blessing || 0;
}

/**
 * Displays a short-lived notification message (toast) to the user.
 * @param {string} message - The text to display in the toast.
 * @param {string} [type='info'] - The type of toast.
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    // Automatically remove the toast after 3 seconds
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Closes a modal window by its ID.
 * This function is exported to be used by other modules.
 * @param {string} modalId - The ID of the modal to close.
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Sets up global event listeners for the application, primarily for navigation.
 */
export function setupEventListeners() {
    // Standard navigation items
    navItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', () => navigateTo(item.dataset.target));
        }
    });

    // Special navigation items that open modals
    document.getElementById('shop-nav-btn').addEventListener('click', openShopModal);
}
