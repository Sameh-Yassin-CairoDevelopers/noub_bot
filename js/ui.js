
/*
 * Filename: js/ui.js
 * Version: 16.0 (Refined UI)
 * Description: UI Controller Module. Major refactor to handle the new unified
 * production screen and the "More" hamburger menu, improving navigation logic.
*/

import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { state } from './state.js';

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

/**
 * Opens a modal window by its ID.
 * @param {string} modalId - The ID of the modal element to open.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Closes a modal window by its ID. Now globally available.
 * @param {string} modalId - The ID of the modal element to close.
 */
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Handles navigation between different screens.
 * @param {string} targetId - The ID of the screen element to display.
 */
export function navigateTo(targetId) {
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(targetId);
    if (screen) screen.classList.remove('hidden');

    navItems.forEach(i => i.classList.toggle('active', i.dataset.target === targetId));

    switch (targetId) {
        case 'collection-screen':
            renderCollection();
            break;
        case 'production-screen':
            renderProduction();
            break;
        case 'stock-screen':
            renderStock();
            break;
        case 'profile-screen':
            renderProfile();
            break;
        // Add cases for contracts, albums, eve later
    }
}

/**
 * Updates the header UI with the latest player currency data.
 */
export function updateHeaderUI() {
    if (!state.playerProfile) return;
    document.getElementById('ankh-display').textContent = state.playerProfile.score || 0;
    document.getElementById('prestige-display').textContent = state.playerProfile.prestige || 0;
    document.getElementById('blessing-display').textContent = state.playerProfile.blessing || 0;
}

/**
 * Displays a short-lived notification message (toast).
 * @param {string} message - The text to display.
 * @param {string} [type='info'] - The type of toast.
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Sets up event listeners for the primary bottom navigation bar.
 */
function setupNavEvents() {
    navItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', () => navigateTo(item.dataset.target));
        }
    });

    // Handle special buttons that open modals
    document.getElementById('shop-nav-btn').addEventListener('click', openShopModal);
    document.getElementById('more-nav-btn').addEventListener('click', () => openModal('more-modal'));
}

/**
 * Sets up event listeners for the buttons inside the "More" menu modal.
 */
function setupMoreMenuEvents() {
    document.getElementById('more-profile-btn').addEventListener('click', () => {
        closeModal('more-modal');
        navigateTo('profile-screen');
    });
    document.getElementById('more-albums-btn').addEventListener('click', () => {
        closeModal('more-modal');
        navigateTo('albums-screen');
    });
    document.getElementById('more-eve-btn').addEventListener('click', () => {
        closeModal('more-modal');
        navigateTo('chat-screen');
    });
}

/**
 * Main setup function for all UI-related event listeners.
 */
export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();
}
