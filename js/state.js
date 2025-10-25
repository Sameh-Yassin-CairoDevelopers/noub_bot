/*
 * Filename: js/state.js
 * Version: NOUB 0.0.1 Eve Edition (Core State - Complete)
 * Description: Holds the shared state of the application.
 * Includes new Maps for UCP protocol data and game consumables.
*/

// Create the state object once as a constant.
const state = {
    currentUser: null,       // Supabase user object
    playerProfile: null,     // Player's profile data (currencies, name, stats)
    inventory: new Map(),    // Player's inventory (Resources, Materials, Goods)
    consumables: new Map(),  // NEW: Game consumable items (Hints, Time Amulets)
    ucp: new Map(),          // NEW: UCP protocol data (Eve's answers)
};

// Export the single, shared instance of the state object.
export { state };
