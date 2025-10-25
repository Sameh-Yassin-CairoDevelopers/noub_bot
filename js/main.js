/*
 * Filename: js/main.js
 * Version: 22.5 (CRITICAL SAFE ENTRY POINT)
 * Description: Only loads core files required for authentication.
*/

// IMPORTANT: All these imports must use './' if the files are in the same /js/ directory.
import './config.js'; 
import './state.js'; 
import { setupEventListeners } from './ui.js'; 
import { setupAuthEventListeners, handleInitialSession } from './auth.js';
import './api.js'; // Ensure API is loaded
import './screens/contracts.js'; // We load these modules to initialize their functions
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
    
    setupEventListeners();
    setupAuthEventListeners();

    handleInitialSession();

});
