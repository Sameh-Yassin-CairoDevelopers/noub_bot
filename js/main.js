/*
 * Filename: js/main.js
 * Version: 16.0 (Refined UI)
 * Description: The main entry point for the "Noub" application.
 * This version makes key functions globally available for HTML onclick attributes.
*/

import { setupEventListeners, closeModal } from './ui.js';
import { setupAuthEventListeners, handleInitialSession, showRegisterForm, showLoginForm } from './auth.js';

// --- Global Functions ---
// Make necessary functions globally accessible for inline HTML 'onclick' attributes.
// This is a simple approach for dynamically generated content or simple event handling.
window.closeModal = closeModal;
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;


// The 'DOMContentLoaded' event ensures that the entire HTML document has been loaded
// and parsed before our main script logic runs.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Set up all the static event listeners for the application.
    setupEventListeners();
    setupAuthEventListeners();

    // 2. Check for an active session and handle the initial app load,
    // including the splash screen transition.
    handleInitialSession();

});
