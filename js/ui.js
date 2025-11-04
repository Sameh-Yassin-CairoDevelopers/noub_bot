/*
 * Filename: js/ui.js
 * Version: NOUB 0.0.7 (UI Controller - FINAL EXPORT FIX)
 * Description: UI Controller Module. Handles all UI logic and navigation.
 * FIXED: Restored 'showToast' as a named export while keeping it globally available.
*/

// --- CORE IMPORTS ---
import { state } from './state.js'; 
import { ASSET_PATHS } from './config.js';

// --- SCREEN MODULES IMPORTS ---
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

// Other screen imports
import { renderProfile } from './screens/profile.js';
import { openShopModal } from './screens/shop.js';
import { renderProduction, renderStock } from './screens/economy.js';
import { renderActiveContracts, renderAvailableContracts } from './screens/contracts.js';
import { renderSlotGame } from './screens/slotgame.js'; 
import { renderKVGame } from './screens/kvgame.js'; 
import { renderChat } from './screens/chat.js'; 
import { renderHome } from './screens/home.js'; 


// --- EXPORTS ---
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


// Make utility functions globally available for onclick attributes in HTML
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

    // Call the appropriate render function for the target screen
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
        case 'wheel-screen':
            wheelModule.renderWheel(); 
            break;
        case 'exchange-screen': 
            exchangeModule.renderExchange();
            break;
        case 'activity-screen': 
            activityModule.renderActivity();
            break;
        case 'card-upgrade-screen':
             upgradeModule.renderUpgrade(); 
             break;
    }
}

export function updateHeaderUI(profile) {
    if (!profile) return;
    
    const noubDisplay = document.getElementById('noub-display');
    if(noubDisplay) {
        noubDisplay.textContent = profile.noub_score || 0;
    }

    const prestigeDisplay = document.getElementById('prestige-display');
    if(prestigeDisplay) {
        prestigeDisplay.textContent = profile.prestige || 0;
    }
    
    const ankhPremiumDisplay = document.getElementById('ankh-premium-display');
    if(ankhPremiumDisplay) {
        ankhPremiumDisplay.textContent = profile.ankh_premium || 0;
    }
    
    const spinDisplay = document.getElementById('spin-ticket-display');
    if(spinDisplay) {
        spinDisplay.textContent = profile.spin_tickets || 0;
    }
}

// FIXED: Define showToast as a named export
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Also make it globally available for HTML onclick attributes
window.showToast = showToast;

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
