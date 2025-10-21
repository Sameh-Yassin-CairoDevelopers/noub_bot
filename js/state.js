
/*
 * Filename: js/state.js
 * Version: 15.1 (CRITICAL FIX & Complete)
 * Description: Holds the shared state of the application.
 * FIX: The state object is now created and exported correctly as a single instance.
*/

// Create the state object once as a constant.
const state = {
    currentUser: null,
    playerProfile: null,
    inventory: new Map(), // Use a Map for efficient item lookup by ID
};

// Export the single, shared instance of the state object.
// This ensures all modules are modifying the same object.
export { state };
