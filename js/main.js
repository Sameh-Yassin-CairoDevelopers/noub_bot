/*
 * Filename: js/main.js
 * Version: 22.2 (Final Import Fix - Complete)
 * Description: The main entry point for the "Noub" application.
 * CRITICAL FIX: Ensures all screen modules are imported correctly from the 'screens' subdirectory.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';

// --- Import all required screen modules from the correct subdirectory ---
import './screens/contracts.js';
import './screens/games.js'; // NOTE: This module is now replaced by slotgame.js and kvgame.js, but keeping it ensures backward compatibility if any old logic relies on it.
import './screens/upgrade.js';
import './screens/home.js';
import './screens/chat.js';
import './screens/slotgame.js'; // NEW SCREEN
import './screens/kvgame.js'; // NEW SCREEN

// We must also import the files that were never in the 'screens' folder:
import './screens/collection.js';
import './screens/economy.js';
import './screens/shop.js';
import './screens/profile.js';
// ---------------------------------------------------------------------

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});
