/*
 * Filename: js/state.js
 * Version: 16.0 (Refined UI)
 * Description: Holds the shared state of the application.
 * Added a flag to track the splash screen animation status.
*/

// Create the state object once as a constant.
const state = {
    currentUser: null,
    playerProfile: null,
    inventory: new Map(),
    isSplashFinished: false, // Flag to manage the initial splash screen animation
};

// Export the single, shared instance of the state object.
export { state };
