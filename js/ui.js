/*
 * Filename: js/ui.js
 * Version: 16.3 (Definitive Global Fix - Complete)
 * Description: UI Controller Module. closeModal is now globally accessible.
*/

import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { state } from './state.js';

const contentContainer = document.getElementById('content-container');
const navItems = document.querySelectorAll('.nav-item');

// Make this function globally available for onclick attributes in HTML
// This definitively solves the "closeModal is not defined" error.
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

export function navigateTo(targetId) {
    contentContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(targetId);
    if (screen) screen.classList.remove('hidden');

    navItems.forEach(i => i.classList.toggle('active', i.dataset.target === targetId));

    switch (targetId) {
        case 'collection-screen': renderCollection(); break;
        case 'production-screen': renderProduction(); break;
        case 'stock-screen': renderStock(); break;
        case 'profile-screen': renderProfile(); break;
    }
}

export function updateHeaderUI() {
    if (!state.playerProfile) return;
    document.getElementById('ankh-display').textContent = state.playerProfile.score || 0;
    document.getElementById('prestige-display').textContent = state.playerProfile.prestige || 0;
    document.getElementById('blessing-display').textContent = state.playerProfile.blessing || 0;
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

function setupMoreMenuEvents() {
    document.getElementById('more-profile-btn').addEventListener('click', () => {
        window.closeModal('more-modal');
        navigateTo('profile-screen');
    });
    document.getElementById('more-albums-btn').addEventListener('click', () => {
        window.closeModal('more-modal');
        navigateTo('albums-screen');
    });
    document.getElementById('more-eve-btn').addEventListener('click', () => {
        window.closeModal('more-modal');
        navigateTo('chat-screen');
    });
}

export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();
}
