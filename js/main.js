/*
 * Filename: js/main.js
 * Version: Pharaoh's Legacy 'NOUB' v2.1.3 (Final JS Core Fix)
 * Description: Main entry point. Loads all modules and starts authentication.
*/

// --- CORE MODULES ---
import './config.js'; 
import './state.js'; 
import './api.js';
import { setupEventListeners } from './ui.js'; 
import { setupAuthEventListeners, handleInitialSession } from './auth.js';

// --- SCREEN MODULES ---
import './screens/contracts.js'; 
import './screens/upgrade.js'; 
import './screens/home.js'; 
import './screens/chat.js'; 
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
import './screens/projects.js';

// --- NEW: Import the renderMsGame function from its module ---
import { renderMsGame } from './screens/ms_game.js'; 

// --- Re-export all necessary functions (including the newly imported one) ---
// This is typically done through a file like ui.js, but since we are modifying main.js, 
// we will ensure the function is available to the UI.
export { renderMsGame }; // Makes renderMsGame available globally if needed, and to ui.js if it imports from main.js

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
