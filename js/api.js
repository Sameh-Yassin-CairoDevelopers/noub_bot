import { supabaseClient } from './config.js';

// --- Player and Card Functions ---

export async function fetchProfile(userId) {
    return await supabaseClient.from('profiles').select('*').eq('id', userId).single();
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient.from('player_cards').select('cards(*)').eq('player_id', playerId);
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id');
}

export async function updatePlayerScore(playerId, newScore) {
    return await supabaseClient.from('profiles').update({ score: newScore }).eq('id', playerId);
}

export async function addCardToPlayerCollection(playerId, cardId) {
    return await supabaseClient.from('player_cards').insert({ player_id: playerId, card_id: cardId });
}


// --- Economy API Functions ---

/**
 * DEFINITIVE FIX: Fetches all factories owned by a player.
 * This version resolves the "more than one relationship" ambiguity by explicitly
 * telling Supabase which foreign key to use for the 'items' join: 'factories_output_item_id_fkey'.
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

/**
 * Fetches all master data for factories.
 * @returns {Promise}
 */
export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}

/**
 * Fetches a player's entire inventory, joining with the master item data.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`
            quantity,
            items (id, name, type, image_url)
        `)
        .eq('player_id', playerId);
}

/**
 * Starts the production timer for a specific player-owned factory.
 * @param {number} playerFactoryId - The unique ID of the row in the 'player_factories' table.
 * @param {string} startTime - The ISO 8601 timestamp for when production started.
 * @returns {Promise} A Supabase query promise.
 */
export async function startProduction(playerFactoryId, startTime) {
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: startTime })
        .eq('id', playerFactoryId);
}

/**
 * Claims the finished product from a factory, updates the player's inventory, and resets the timer.
 * @param {string} playerId - The UUID of the player.
 * @param {number} playerFactoryId - The ID of the player_factories row.
 * @param {number} itemId - The ID of the item being claimed.
 * @param {number} newQuantity - The new total quantity of the item in the inventory.
 * @returns {Promise} A Supabase query promise for the final step.
 */
export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    // 1. Upsert inventory.
    const { error: upsertError } = await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    
    if (upsertError) {
        console.error("CRITICAL ERROR during inventory upsert:", upsertError);
        return { error: upsertError };
    }
    
    // 2. Clear production timer.
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: null })
        .eq('id', playerFactoryId);
}
