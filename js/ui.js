/*
 * Filename: js/ui.js
 * Version: 19.2 (CRITICAL UI Fix & Complete)
 * Description: UI Controller Module. FIXED: Resolved TypeError by fetching DOM elements
 * inside the setup functions to prevent race conditions.
*/

import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';

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
    const modal = document.getElementById(modal);
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
        // The remaining screens will render nothing until implemented
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    document.getElementById('ankh-display').textContent = profile.score || 0;
    document.getElementById('prestige-display').textContent = profile.prestige || 0;
    document.getElementById('blessing-display').textContent = profile.blessing || 0;
}

export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setupNavEvents() {
    navItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', () => navigateTo(item.dataset.target));
        }
    });
    document.getElementById('shop-nav-btn').addEventListener('click', openShopModal);
    document.getElementById('more-nav-btn').addEventListener('click', () => openModal('more-modal'));
}

/**
 * FIX APPLIED: Elements are fetched inside this function to ensure they exist.
 */
function setupMoreMenuEvents() {
    const profileBtn = document.getElementById('more-profile-btn');
    const albumsBtn = document.getElementById('more-albums-btn');
    const eveBtn = document.getElementById('more-eve-btn');
    
    // Safety check: ensure buttons exist before adding listeners
    if(profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.closeModal('more-modal');
            navigateTo('profile-screen');
        });
    }

    if(albumsBtn) {
        albumsBtn.addEventListener('click', () => {
            window.closeModal('more-modal');
            navigateTo('albums-screen');
        });
    }
    
    if(eveBtn) {
        eveBtn.addEventListener('click', () => {
            window.closeModal('more-modal');
            navigateTo('chat-screen');
        });
    }
}

export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();
}
