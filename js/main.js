/*
 * Filename: js/main.js
 * Version: 18.0 (Contracts UI)
 * Description: The main entry point for the "Noub" application.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './screens/contracts.js'; // Import the new module to ensure it's loaded

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    handleInitialSession();

});
