/*
 * Filename: js/state.js
 * Version: 22.5 (Core State - Complete)
 * Description: Holds the shared state of the application.
*/

// Create the state object once as a constant.
const state = {
    currentUser: null,
    playerProfile: null,
    inventory: new Map(),
    consumables: new Map(), 
    ucp: new Map(), 
};

// Export the single, shared instance of the state object.
export { state };
