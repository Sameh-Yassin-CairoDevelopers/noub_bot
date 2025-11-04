/*
 * Filename: js/main.js
 * Version: NOUB 0.0.7 (CRITICAL SAFE ENTRY POINT - UI Rework)
 * Description: Main entry point. Loads all modules and starts authentication.
 * NEW: Imports the new tasks.js module.
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
import './screens/slotgame.js'; 
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

// NEW: Import the new tasks module
import './screens/tasks.js';


document.addEventListener('DOMContentLoaded', () => {
    
    // 0. CRITICAL: Initialize Telegram Web App SDK
    if (window.Telegram && window.Telegram.WebApp) {
         window.Telegram.WebApp.ready();
    }

    // 1. Setup all event listeners (for navigation, forms, etc.)
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Handle the initial session check (login/app start)
    handleInitialSession();

});
