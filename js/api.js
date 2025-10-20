import { supabaseClient } from './config.js';

// --- Player and Card Functions (Unchanged) ---
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
            id, level, production_start_time,
            factories!inner (
                id, name, type, base_production_time, image_url, output_item_id, 
                items!factories_output_item_id_fkey (id, name, image_url)
            )
        `)
        .eq('player_id', playerId);
}
export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}
export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(` quantity, items (id, name, type, image_url) `)
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
 * @param {string} playerId - The UUID of the player.
 * @param {number} itemId - The ID of the item to update.
 * @param {number} newQuantity - The new quantity for the item.
 * @returns {Promise} A Supabase query promise.
 */
export async function updateItemQuantity(playerId, itemId, newQuantity) {
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}
