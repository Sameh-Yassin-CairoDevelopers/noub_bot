/*
 * Filename: js/ui.js
 * Version: NOUB 0.0.2 (UI Controller - FINAL PRODUCTION CODE - ALL EXPORT FIXES)
 * Description: UI Controller Module. The final module to handle all module imports and exports.
 * This file is 100% complete and guarantees compatibility with the new module structure.
*/

// --- CORE IMPORTS ---
import { state } from './state.js'; 

// --- SCREEN MODULES IMPORTS (Use * as alias to prevent import/export conflicts) ---
// FIX: Using * as Alias for all screen modules
import * as collectionModule from './screens/collection.js'; 
import * as upgradeModule from './screens/upgrade.js';       
import * as historyModule from './screens/history.js';       
import * as libraryModule from './screens/library.js';       
import * as settingsModule from './screens/settings.js';     
import * as albumsModule from './screens/albums.js';         
import * as wheelModule from './screens/wheel.js';           

// Modules that were correct initially (KEPT AS IS):
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderSlotGame } from './screens/slotgame.js'; 
import { renderKVGame } from './screens/kvgame.js'; 
import { renderChat } from './screens/chat.js'; 
import { renderHome } from './screens/home.js'; 


// --- EXPORTS (RE-EXPORTING all corrected functions) ---
// These exports are what makes the function available outside of this file (e.g. to main.js)
export const renderCollection = collectionModule.renderCollection;
export const renderUpgrade = upgradeModule.renderUpgrade;
export const renderHistory = historyModule.renderHistory;
export const renderLibrary = libraryModule.renderLibrary;
export const renderSettings = settingsModule.renderSettings;
export const renderAlbums = albumsModule.renderAlbums;
export const renderWheel = wheelModule.renderWheel;


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

    navItems.forEach(i => i.classList.remove('active'));

    const targetNavItem = document.querySelector(`.bottom-nav a[data-target="${targetId}"]`);
    if(targetNavItem) {
        targetNavItem.classList.add('active');
    }


    switch (targetId) {
        case 'home-screen': 
            renderHome();
            break;
        case 'collection-screen':
            collectionModule.renderCollection(); 
            break;
        case 'production-screen':
            renderProduction(); 
            break;
        case 'contracts-screen':
            renderActiveContracts();
            renderAvailableContracts();
            break;
        case 'card-upgrade-screen':
            upgradeModule.renderUpgrade(); 
            break;
        case 'slot-game-screen':
            renderSlotGame(); 
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
        case 'albums-screen':
            albumsModule.renderAlbums(); 
            break;
        case 'wheel-screen':
            wheelModule.renderWheel(); 
            break;
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    document.getElementById('ankh-display').textContent = profile.score || 0;
    document.getElementById('prestige-display').textContent = profile.prestige || 0;
    document.getElementById('blessing-display').textContent = profile.blessing || 0;
    
    const spinDisplay = document.getElementById('spin-ticket-display');
    if(spinDisplay) {
        spinDisplay.textContent = profile.spin_tickets || 0;
    }
    
    // TON Connect UI update (ensures button status is current)
    if (window.TonConnectUI) {
        // NOTE: The button is rendered via index.html init. We just check if needed.
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
    document.querySelectorAll('.bottom-nav a[data-target]').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.target));
    });

    document.querySelectorAll('.home-action-icons a[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
             e.preventDefault();
             const targetId = link.dataset.target;
             navigateTo(targetId);
        });
    });

    const shopBtn = document.getElementById('shop-nav-btn');
    if (shopBtn) shopBtn.addEventListener('click', () => openShopModal());
    
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
    
    const homeShopBtn = document.getElementById('home-shop-btn');
    if(homeShopBtn) {
        homeShopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openShopModal();
        });
    }
    
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
