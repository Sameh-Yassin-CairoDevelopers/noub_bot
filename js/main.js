
import { setupEventListeners } from './ui.js';
import { setupAuthEventListeners, handleInitialSession } from './auth.js';

// This is the entry point of our application.
document.addEventListener('DOMContentLoaded', () => {
    // Set up all the button clicks for navigation and auth forms
    setupEventListeners();
    setupAuthEventListeners();

    // Check if the user is already logged in from a previous session
    handleInitialSession();
});