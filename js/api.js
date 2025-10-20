
import { supabaseClient } from './config.js';

// --- Player and Card Functions ---

/**
 * Fetches a single player profile by their user ID.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchProfile(userId) {
    return await supabaseClient.from('profiles').select('*').eq('id', userId).single();
}

/**
 * Fetches all cards owned by a specific player, joining with the master card data.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchPlayerCards(playerId) {
    return await supabaseClient.from('player_cards').select('cards(*)').eq('player_id', playerId);
}

/**
 * Fetches the IDs of all cards from the master list. Used for randomly awarding a card.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id');
}

/**
 * Updates the player's primary score (Ankh).
 * @param {string} playerId - The UUID of the player.
 * @param {number} newScore - The new score value.
 * @returns {Promise} A Supabase query promise.
 */
export async function updatePlayerScore(playerId, newScore) {
    return await supabaseClient.from('profiles').update({ score: newScore }).eq('id', playerId);
}

/**
 * Adds a new card to a player's collection.
 * @param {string} playerId - The UUID of the player.
 * @param {number} cardId - The ID of the card from the master list.
 * @returns {Promise} A Supabase query promise.
 */
export async function addCardToPlayerCollection(playerId, cardId) {
    return await supabaseClient.from('player_cards').insert({ player_id: playerId, card_id: cardId });
}


// --- Economy API Functions ---

/**
 * Fetches all factories owned by a player, including joined data about the factory type and its recipes.
 * This is a complex query that uses Supabase's joining capabilities.
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
                items (id, name, image_url)
            ),
            factory_recipes (
                input_quantity, 
                items (id, name, image_url)
            )
        `)
        .eq('player_id', playerId);
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
 * @param {string} playerId - The UUID of the player. (CRITICAL: This is the user's main ID)
 * @param {number} playerFactoryId - The ID of the player_factories row.
 * @param {number} itemId - The ID of the item being claimed.
 * @param {number} newQuantity - The new total quantity of the item in the inventory.
 * @returns {Promise} A Supabase query promise for the final step.
 */
export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    // This function performs two database operations.

    // 1. Upsert inventory: Update the item quantity if it exists, or insert if it's new.
    // *** CRITICAL FIX APPLIED HERE: Using the correct 'playerId' (the UUID) for the row's owner. ***
    const { error: upsertError } = await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    
    if (upsertError) {
        // Log the critical error for debugging and return it.
        console.error("CRITICAL ERROR during inventory upsert:", upsertError);
        return { error: upsertError };
    }
    
    // 2. Clear production timer in the player's factory to make it idle again.
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: null })
        .eq('id', playerFactoryId);
}
