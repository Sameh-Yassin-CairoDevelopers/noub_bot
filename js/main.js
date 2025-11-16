/*
 * Filename: js/main.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2
 * Description: Main entry point. Loads all modules and starts authentication.
 * REMOVED: Import for the deprecated tasks.js module.
*/

// --- CORE MODULES ---
import './config.js'; 
import './state.js'; 
import './api.js';
import { setupEventListeners } from './ui.js'; 
import { setupAuthEventListeners, handleInitialSession } from './auth.js';


// --- SCREEN MODULES ---
import './screens/contracts.js'; // Still needed for quest tracking logic
import './screens/upgrade.js'; 
import './screens/home.js'; 
import './screens/chat.js'; 
// DELETED: slotgame.js import removed
import './screens/kvgame.js'; 
import './screens/collection.js'; 
import './screens/economy.js'; 
import './screens/shop.js';
import './screens/profile.js';
import './screens/history.js';    
import './screens/library.js';    
import './screens/settings.js';   
import './screens/albums.js';     
import './screens/wheel.js';      
import './screens/exchange.js'; 
import './screens/activity.js'; 
import './screens/tasks.js';
// ... (بعد import './screens/tasks.js';)
import './screens/projects.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // 0. CRITICAL: Initialize Telegram Web App SDK
    if (window.Telegram && window.Telegram.WebApp) {
         window.Telegram.WebApp.ready();
         window.Telegram.WebApp.expand(); // Expand the web app to full screen
    }

    // 1. Setup all event listeners (for navigation, forms, etc.)
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Handle the initial session check (login/app start)
    handleInitialSession();

});

