/*
 * Filename: js/ui.js
 * Version: NOUB 0.0.1 Eve Edition (FINAL UI Integration - Complete)
 * Description: UI Controller Module. Handles navigation, toast messages, and header updates.
 * Implements final routing for all 10 screens and handles TON Connect visibility.
*/

// NOTE: All screen imports MUST use the correct relative path './screens/file.js'
import { renderCollection } from './screens/collection.js';
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderSlotGame } from './screens/slotgame.js'; 
import { renderKVGame } from './screens/kvgame.js'; 
import { renderUpgrade } from './screens/upgrade.js'; 
import { renderChat } from './screens/chat.js'; 
import { renderHome } from './screens/home.js'; 
import { state } from './state.js'; // Import state from same directory

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
        case 'home-screen': 
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
        case 'slot-game-screen':
            renderSlotGame(); 
            break;
        case 'kv-game-screen':
            renderKVGame(); 
            break;
        case 'card-upgrade-screen':
            renderUpgrade();
            break;
        case 'chat-screen':
            renderChat(); 
            break;
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    document.getElementById('ankh-display').textContent = profile.score || 0;
    document.getElementById('prestige-display').textContent = profile.prestige || 0;
    document.getElementById('blessing-display').textContent = profile.blessing || 0;
    
    // Safety check for spin ticket display
    const spinDisplay = document.getElementById('spin-ticket-display');
    if(spinDisplay) {
        spinDisplay.textContent = profile.spin_tickets || 0;
    }
    
    // Check TON connect button visibility (if user has connected their wallet before)
    const connectButton = document.getElementById('connectButton');
    if (connectButton && profile.ton_address) {
        // NOTE: TonConnectUI library handles rendering the button itself once initialized in auth.js
        // We only ensure the container is visible if needed.
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
    if (shopBtn) shopBtn.addEventListener('click', () => openShopModal());
    
    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) moreBtn.addEventListener('click', () => openModal('more-modal'));
}

function setupMoreMenuEvents() {
    // Helper function to close modal and navigate
    const handleMoreClick = (event) => {
        event.preventDefault(); 
        const targetId = event.currentTarget.dataset.target; 
        window.closeModal('more-modal');
        navigateTo(targetId);
    };

    // Attach listeners safely to all 'a' elements inside the more modal
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
    
    // NOTE: Home Shop button requires special attention if it opens the modal
    const homeShopBtn = document.getElementById('home-shop-btn');
    if(homeShopBtn) {
        homeShopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openShopModal();
        });
    }
}
```
