/*
 * Filename: js/main.js
 * Version: 20.1 (Entry Point - Complete)
 * Description: The main entry point for the "Noub" application.
 * Initializes all event listeners and handles the initial session check.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './screens/contracts.js'; // Ensure contracts module is loaded
import './screens/games.js';     // Ensure games module is loaded
import './screens/upgrade.js';   // Ensure upgrade module is loaded

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});
