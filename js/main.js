/*
 * Filename: js/main.js
 * Version: 17.0 (Stable & Splash-Screen-Removed)
 * Description: The main entry point for the "Noub" application.
 * Simplified to only initialize the core event listeners and session handler.
*/

import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application,
    // such as navigation bar clicks and auth form buttons.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load.
    // This will either show the login screen or load the game directly.
    handleInitialSession();

});
