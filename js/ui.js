/*
 * Filename: js/ui.js
 * Version: 21.0 (Home Dashboard & Action Bar - Complete)
 * Description: UI Controller Module. Now sets home-screen as default and handles the
 * navigation logic for the new dashboard action icons.
*/

import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderGames } from './screens/games.js'; 
import { renderUpgrade } from './screens/upgrade.js'; 
import { renderHome } from './screens/home.js'; // NEW: Import home render function

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

    // Reset active navigation item first
    navItems.forEach(i => i.classList.remove('active'));

    // Check if the target is a bottom nav item, if so, set it active
    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if(targetNavItem) {
        targetNavItem.classList.add('active');
    }


    switch (targetId) {
        case 'home-screen': // NEW: Render home screen
            renderHome();
            break;
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
        case 'games-screen':
            renderGames();
            break;
        case 'card-upgrade-screen':
            renderUpgrade();
            break;
        // Remaining screens (albums, chat) are placeholders for now
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    document.getElementById('ankh-display').textContent = profile.score || 0;
    document.getElementById('prestige-display').textContent = profile.prestige || 0;
    document.getElementById('blessing-display').textContent = profile.blessing || 0;
    
    // Safety check for spin ticket display (may not exist on all screens)
    const spinDisplay = document.getElementById('spin-ticket-display');
    if(spinDisplay) {
        spinDisplay.textContent = profile.spin_tickets || 0;
    }
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
    // 1. Standard navigation items (bottom bar)
    navItems.forEach(item => {
        if (item.dataset.target) {
            item.addEventListener('click', () => navigateTo(item.dataset.target));
        }
    });

    // 2. Dashboard Quick Links (Home Action Icons)
    const quickLinks = document.querySelectorAll('.home-action-icons a[data-target]');
    quickLinks.forEach(link => {
        link.addEventListener('click', (e) => {
             e.preventDefault();
             const targetId = link.dataset.target;
             navigateTo(targetId);
        });
    });

    // 3. Special Modal Triggers
    const shopBtn = document.getElementById('shop-nav-btn');
    if (shopBtn) shopBtn.addEventListener('click', openShopModal);

    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) moreBtn.addEventListener('click', () => openModal('more-modal'));
}

function setupMoreMenuEvents() {
    const profileBtn = document.querySelector('#more-modal a[data-target="profile-screen"]');
    const albumsBtn = document.querySelector('#more-modal a[data-target="albums-screen"]');
    const eveBtn = document.querySelector('#more-modal a[data-target="chat-screen"]');
    const gamesBtn = document.querySelector('#more-modal a[data-target="games-screen"]');
    const upgradeBtn = document.querySelector('#more-modal a[data-target="card-upgrade-screen"]');
    
    // Helper function to close modal and navigate
    const handleMoreClick = (targetId) => {
        window.closeModal('more-modal');
        navigateTo(targetId);
    };

    // Attach listeners safely
    if (profileBtn) profileBtn.addEventListener('click', () => handleMoreClick('profile-screen'));
    if (albumsBtn) albumsBtn.addEventListener('click', () => handleMoreClick('albums-screen'));
    if (eveBtn) eveBtn.addEventListener('click', () => handleMoreClick('chat-screen'));
    if (gamesBtn) gamesBtn.addEventListener('click', () => handleMoreClick('games-screen'));
    if (upgradeBtn) upgradeBtn.addEventListener('click', () => handleMoreClick('card-upgrade-screen'));
}

export function setupEventListeners() {
    setupNavEvents();
    setupMoreMenuEvents();
    
    // NOTE: Home Shop button requires special attention if it opens the modal
    const homeShopBtn = document.getElementById('home-shop-btn');
    if(homeShopBtn) {
        homeShopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openShopModal();
        });
    }
}
