/*
 * Filename: js/main.js
 * Version: 20.4 (Entry Point - Complete)
 * Description: The main entry point for the "Noub" application.
 * Initializes all event listeners and handles the initial session check.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './screens/contracts.js'; // Ensure modules are loaded
import './screens/games.js';     
import './screens/upgrade.js';   
import './screens/chat.js';   

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});

