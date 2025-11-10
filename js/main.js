/*
 * Filename: js/main.js
 * Version: NOUB v0.4 (Card Experience Overhaul)
 * Description: Main entry point for the application. It imports all necessary modules,
 *              sets up event listeners, and initializes the user session.
 * CHANGE: Removed imports for the obsolete collection.js and upgrade.js modules
 *         as their functionality has been merged into albums.js.
*/

// --- 1. CORE MODULES ---
// These are the foundational modules that manage the application's state,
// configuration, database communication, and authentication.
import './config.js'; 
import './state.js'; 
import './api.js';
import { setupEventListeners } from './ui.js'; 
import { setupAuthEventListeners, handleInitialSession } from './auth.js';


// --- 2. SCREEN LOGIC MODULES ---
// Each file here contains the specific logic for one screen of the application.
// Importing them here makes their code available to the main application bundle.
import './screens/contracts.js'; // Manages contracts and also contains daily quest logic.
import './screens/home.js';      // Logic for the main dashboard screen.
import './screens/chat.js';     // Logic for the Eve UCP-LLM chat interface.
import './screens/kvgame.js';   // Logic for the "Valley of the Kings" mini-game.
import './screens/economy.js';  // Logic for the production and stockpile screens.
import './screens/shop.js';     // Logic for the in-game shop modal.
import './screens/profile.js';  // Logic for the player profile screen.
import './screens/history.js';    // Logic for the game history screen.
import './screens/library.js';    // Logic for the encyclopedia/library screen.
import './screens/settings.js';   // Logic for the user settings screen.
import './screens/albums.js';     // NEW CENTRAL HUB: Manages albums and all card interactions (view, upgrade, burn).
import './screens/wheel.js';      // Logic for the "Wheel of Fortune" mini-game.
import './screens/exchange.js'; // Logic for the currency exchange screen.
import './screens/activity.js'; // Logic for the player activity log screen.
import './screens/tasks.js';    // Logic for the daily tasks screen.

// OBSOLETE MODULES (REMOVED):
// import './screens/upgrade.js';   // Functionality merged into albums.js
// import './screens/collection.js';// Functionality merged into albums.js


// --- 3. APPLICATION INITIALIZATION ---

/**
 * The primary event listener that fires once the initial HTML document has been
 * completely loaded and parsed, without waiting for stylesheets, images, and subframes to finish loading.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // A. Initialize the Telegram Web App SDK to enable integration features.
    if (window.Telegram && window.Telegram.WebApp) {
         window.Telegram.WebApp.ready();
         window.Telegram.WebApp.expand(); // Expands the web app to full screen for a better user experience.
    }

    // B. Set up all UI and authentication-related event listeners.
    // This makes the application interactive.
    setupEventListeners();
    setupAuthEventListeners();

    // C. Handle the initial user session. This function determines if a user is
    // already logged in or if the authentication screen should be displayed.
    // This is the final step that starts the game for the user.
    handleInitialSession();

});
