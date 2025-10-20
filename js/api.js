import { supabaseClient } from './config.js';

// --- Player and Card Functions (Unchanged) ---
export async function fetchProfile(userId) { /* ... same as before ... */ }
export async function fetchPlayerCards(playerId) { /* ... same as before ... */ }
// ... and so on for all unchanged functions ...

// --- REFACTORED Economy API Functions ---

/**
 * DEFINITIVE FIX: Fetches all factories owned by a player.
 * This version resolves the "more than one relationship" ambiguity by explicitly
 * telling Supabase which foreign key to use for the 'items' join.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchPlayerFactories(playerId) {
    return await supabaseClient
        .from('player_factories')
        .select(`
            id,
            level,
            production_start_time,
            factories (
                name, 
                type, 
                base_production_time, 
                image_url, 
                output_item_id, 
                items!factories_output_item_id_fkey (id, name, image_url)
            )
        `)
        .eq('player_id', playerId);
}

// ... (All other functions in this file remain the same as the last complete version) ...

export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}

export async function fetchPlayerInventory(playerId) {
    // ...
}

export async function startProduction(playerFactoryId, startTime) {
    // ...
}

export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    // ...
}
