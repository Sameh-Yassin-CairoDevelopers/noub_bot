
/*
 * Filename: js/api.js
 * Version: 15.0 (Crafting Update & Complete)
 * Description: Data Access Layer Module.
 * This version adds the 'updateItemQuantity' function for crafting
 * and simplifies the inventory fetch query.
*/

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
                items!factories_output_item_id_fkey (id, name, image_url),
                factory_recipes (
                    input_quantity,
                    items (id, name, image_url)
                )
            )
        `)
        .eq('player_id', playerId);
}

export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}

/**
 * REFACTORED: Fetches a player's inventory.
 * Now returns a simpler data structure for easier state management.
 */
export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`quantity, item_id, items (name, type, image_url)`)
        .eq('player_id', playerId);
}

export async function startProduction(playerFactoryId, startTime) {
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: startTime })
        .eq('id', playerFactoryId);
}

export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    
    return await supabaseClient
        .from('player_factories')
        .update({ production_start_time: null })
        .eq('id', playerFactoryId);
}

/**
 * NEW: Updates the quantity of a specific item in the player's inventory.
 * Used for consuming resources during crafting.
 */
export async function updateItemQuantity(playerId, itemId, newQuantity) {
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}
