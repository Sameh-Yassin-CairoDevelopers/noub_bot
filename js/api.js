/*
 * Filename: js/api.js
 * Version: 18.0 (Contracts API - Complete)
 * Description: Data Access Layer Module.
 * This version adds a full suite of functions for interacting with the new contracts system.
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

export async function updateItemQuantity(playerId, itemId, newQuantity) {
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}


// --- NEW: Contract API Functions ---

/**
 * Fetches all contracts that the player has NOT yet accepted or completed.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise}
 */
export async function fetchAvailableContracts(playerId) {
    // Select all contract IDs the player has already interacted with.
    const { data: playerContractIds, error: playerError } = await supabaseClient
        .from('player_contracts')
        .select('contract_id')
        .eq('player_id', playerId);

    if (playerError) {
        console.error("Error fetching player's existing contracts:", playerError);
        return { data: [], error: playerError };
    }

    const acceptedIds = playerContractIds.map(c => c.contract_id);
    
    // If the player has no contracts, the list is empty, which can cause an SQL error.
    if (acceptedIds.length === 0) {
        return await supabaseClient.from('contracts').select('*');
    }
    
    // Fetch all contracts from the master list where the ID is not in the player's list.
    return await supabaseClient
        .from('contracts')
        .select('*')
        .not('id', 'in', `(${acceptedIds.join(',')})`);
}

/**
 * Fetches all contracts currently active for the player.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise}
 */
export async function fetchPlayerContracts(playerId) {
    return await supabaseClient
        .from('player_contracts')
        .select(`
            id, 
            status,
            contracts (id, title, description, reward_score, reward_prestige)
        `)
        .eq('player_id', playerId)
        .eq('status', 'active');
}

/**
 * Fetches the full details of a single contract, including its item requirements.
 * @param {number} contractId - The ID of the contract.
 * @returns {Promise}
 */
export async function fetchContractWithRequirements(contractId) {
    return await supabaseClient
        .from('contracts')
        .select(`
            *,
            contract_requirements (
                quantity,
                items (id, name, image_url)
            )
        `)
        .eq('id', contractId)
        .single();
}

/**
 * Adds a contract to the player's list of active contracts.
 * @param {string} playerId - The UUID of the player.
 * @param {number} contractId - The ID of the contract to accept.
 * @returns {Promise}
 */
export async function acceptContract(playerId, contractId) {
    return await supabaseClient
        .from('player_contracts')
        .insert({ player_id: playerId, contract_id: contractId });
}

/**
 * Marks a player's contract as complete and awards the prizes.
 * @param {string} playerId - The UUID of the player.
 * @param {number} playerContractId - The ID of the row in the player_contracts table.
 * @param {object} newTotals - An object containing the new total score and prestige.
 * @returns {Promise}
 */
export async function completeContract(playerId, playerContractId, newTotals) {
    // Step 1: Mark the contract as 'completed'
    const { error: contractError } = await supabaseClient
        .from('player_contracts')
        .update({ status: 'completed' })
        .eq('id', playerContractId);
        
    if (contractError) return { error: contractError };

    // Step 2: Update the player's profile with the new currency totals
    return await supabaseClient
        .from('profiles')
        .update({ score: newTotals.score, prestige: newTotals.prestige })
        .eq('id', playerId);
}
