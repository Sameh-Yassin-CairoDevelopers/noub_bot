/*
 * Filename: js/ui.js
 * Version: 20.2 (FINAL UI Stability Fix)
 * Description: UI Controller Module. Applied safety checks to all DOM element listeners
 * to prevent the "Cannot read properties of null" error and ensure clean startup.
 * Fixed the More Menu closing logic.
*/

import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderGames } from './screens/games.js'; // New Import
import { renderUpgrade } from './screens/upgrade.js'; // New Import

// Make closeModal globally available for all onclick attributes in dynamically generated HTML
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

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
        case 'contracts-screen':
            renderActiveContracts();
            renderAvailableContracts();
            break;
        case 'games-screen': // New Screen
            renderGames();
            break;
        case 'card-upgrade-screen': // New Screen
            renderUpgrade();
            break;
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    document.getElementById('ankh-display').textContent = profile.score || 0;
    document.getElementById('prestige-display').textContent = profile.prestige || 0;
    document.getElementById('blessing-display').textContent = profile.blessing || 0;
    document.getElementById('spin-ticket-display').textContent = profile.spin_tickets || 0; // Update Spin Ticket Display
}

export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * FIX APPLIED: Added safety checks for shop and more buttons.
 */
function setupNavEvents() {
    navItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', () => navigateTo(item.dataset.target));
        }
    });

    const shopBtn = document.getElementById('shop-nav-btn');
    if (shopBtn) shopBtn.addEventListener('click', openShopModal);

    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) moreBtn.addEventListener('click', () => openModal('more-modal'));
}

/**
 * FIX APPLIED: Added safety checks for all menu buttons.
 */
function setupMoreMenuEvents() {
    const profileBtn = document.getElementById('more-profile-btn');
    const albumsBtn = document.getElementById('more-albums-btn');
    const eveBtn = document.getElementById('more-eve-btn');
    const gamesBtn = document.getElementById('more-games-btn');
    const upgradeBtn = document.getElementById('more-upgrade-btn');
    
    // Helper function to close modal and navigate
    const handleMoreClick = (targetId) => {
        window.closeModal('more-modal');
        navigateTo(targetId);
    };

    if (profileBtn) profileBtn.addEventListener('click', () => handleMoreClick('profile-screen'));
    if (albumsBtn) albumsBtn.addEventListener('click', () => handleMoreClick('albums-screen'));
    if (eveBtn) eveBtn.addEventListener('click', () => handleMoreClick('chat-screen'));
    if (gamesBtn) gamesBtn.addEventListener('click', () => handleMoreClick('games-screen'));
    if (upgradeBtn) upgradeBtn.addEventListener('click', () => handleMoreClick('card-upgrade-screen'));
}

export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();
}
