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
 * DEFINITIVE FINAL: Fetches all factories owned by a player.
 * This query is now corrected and complete, including the explicit JOIN hint.
 */
export async function fetchPlayerFactories(playerId) {
    return await supabaseClient
        .from('player_factories')
        .select(`
            id,
            level,
            production_start_time,
            factories!inner (
                id,
                name, 
                type, 
                base_production_time, 
                image_url, 
                output_item_id, 
                items!factories_output_item_id_fkey (id, name, image_url)
            ),
            factory_recipes (
                input_quantity,
                items (id, name, image_url)
            )
        `)
        .eq('player_id', playerId);
}

/**
 * Fetches all master data for factories.
 */
export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}

/**
 * Fetches a player's entire inventory, joining with the master item data.
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
 */
export async function startProduction(playerFactoryId, startTime) {
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: startTime })
        .eq('id', playerFactoryId);
}

/**
 * Claims the finished product from a factory, updates the player's inventory, and resets the timer.
 */
export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    const { error: upsertError } = await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    
    if (upsertError) {
        console.error("CRITICAL ERROR during inventory upsert:", upsertError);
        return { error: upsertError };
    }
    
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: null })
        .eq('id', playerFactoryId);
}

/**
 * Updates the quantity of a specific item in the player's inventory.
 * Used for consuming resources during crafting.
 */
export async function updateItemQuantity(playerId, itemId, newQuantity) {
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}
