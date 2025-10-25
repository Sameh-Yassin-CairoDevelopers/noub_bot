/*
 * Filename: js/main.js
 * Version: NOUB 0.0.1 Eve Edition (CRITICAL SAFE ENTRY POINT - Final)
 * Description: Main entry point. Loads all modules and starts authentication.
 * Ensures all module paths are correct for a stable build.
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


document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Setup all event listeners (for navigation, forms, etc.)
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Handle the initial session check (login/app start)
    handleInitialSession();

});
