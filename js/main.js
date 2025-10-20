
import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';

// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before any JavaScript code that interacts with the DOM is executed.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application,
    // such as navigation bar clicks and auth form buttons.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check if there's an active session from a previous visit.
    // This function will handle the entire process of either showing the
    // login screen or loading the game directly for a returning user.
    handleInitialSession();

});
