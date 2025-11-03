/*
 * Filename: js/main.js
 * Version: NOUB 0.0.6 (CRITICAL SAFE ENTRY POINT - FINAL ORCHESTRATION + TWA Fix)
 * Description: Main entry point. Loads all modules and starts authentication.
 * Includes TWA SDK Initialization.
 * UPDATED: Removed deprecated TWA color settings.
*/

// --- CORE MODULES (in /js/ directory - imported with './') ---
import './config.js'; 
import './state.js'; 
import './api.js';
import { setupEventListeners } from './ui.js'; 
import { setupAuthEventListeners, handleInitialSession } from './auth.js';


// --- SCREEN MODULES (in /js/screens/ directory - imported with './screens/') ---
// Importing them here ensures the browser loads their code and initializes their functionality.
import './screens/contracts.js';
import './screens/upgrade.js'; 
import './screens/home.js'; 
import './screens/chat.js'; 
import './screens/slotgame.js'; 
import './screens/kvgame.js'; 
import './screens/collection.js'; 
import './screens/economy.js'; 
import './screens/shop.js';
import './screens/profile.js';

// --- NEW/UPDATED MODULES (NOUB 0.0.3/0.0.4) ---
import './screens/history.js';    
import './screens/library.js';    
import './screens/settings.js';   
import './screens/albums.js';     
import './screens/wheel.js';      
import './screens/exchange.js'; 
import './screens/activity.js'; 


document.addEventListener('DOMContentLoaded', () => {
    
    // 0. CRITICAL: Initialize Telegram Web App SDK
    if (window.Telegram && window.Telegram.WebApp) {
         window.Telegram.WebApp.ready();
         // Telegram Web App Header/Background color settings might be deprecated in newer TWA versions.
         // Commenting them out to avoid console warnings.
         // window.Telegram.WebApp.setHeaderColor('#121212'); 
         // window.Telegram.WebApp.setBackgroundColor('#121212');
    }

    // 1. Setup all event listeners (for navigation, forms, etc.)
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Handle the initial session check (login/app start)
    handleInitialSession();

});
