/*
 * Filename: js/state.js
 * Version: NOUB 0.0.6 (Core State - NOUB & ANKH Rework)
 * Description: Holds the shared state of the application.
 * Updated: Player profile currencies to reflect NOUB and ANKH premium.
*/

// Create the state object once as a constant.
const state = {
    currentUser: null,       // Supabase user object
    playerProfile: null,     // Player's profile data (currencies, name, stats) - now includes noub_score and ankh_premium
    inventory: new Map(),    // Player's inventory (Resources, Materials, Goods)
    consumables: new Map(),  // Game consumable items (Hints, Time Amulets)
    ucp: new Map(),          // UCP protocol data (Eve's answers)
};

// Export the single, shared instance of the state object.
export { state };
