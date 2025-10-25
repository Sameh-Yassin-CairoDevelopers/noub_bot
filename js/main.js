/*
 * Filename: js/main.js
 * Version: 22.3 (Final Import Fix - Complete)
 * Description: The main entry point for the "Noub" application.
 * CRITICAL FIX: Ensures all screen modules are imported correctly.
*/

// IMPORTANT: These files are located directly in the 'js' folder and are imported first.
import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './config.js'; // Ensure config is loaded

// --- Import all required screen modules from the 'screens' subdirectory ---
import './screens/contracts.js';
import './screens/upgrade.js';
import './screens/home.js';
import './screens/chat.js';
import './screens/slotgame.js'; 
import './screens/kvgame.js'; 

// NOTE: The following modules are also imported indirectly by the above files, 
// but we ensure they are loaded correctly if needed.
import './screens/collection.js'; 
import './screens/economy.js'; 
import './screens/shop.js';
import './screens/profile.js';


document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});
