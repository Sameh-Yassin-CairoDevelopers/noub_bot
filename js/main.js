/*
 * Filename: js/main.js
 * Version: 19.0 (Stability & Contract Refresh)
 * Description: The main entry point for the "Noub" application.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './screens/contracts.js'; // Ensure contracts module is loaded

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});
