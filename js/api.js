/*
 * Filename: js/api.js
 * Version: 18.0 (Contracts API)
 * Description: Data Access Layer Module.
 * This version adds a full suite of functions for interacting with the new contracts system.
*/

import { supabaseClient } from './config.js';

// --- Player and Card Functions (Unchanged) ---
export async function fetchProfile(userId) { /* ... */ }
export async function fetchPlayerCards(playerId) { /* ... */ }
// ... (rest of the card functions are unchanged)

// --- Economy API Functions (Unchanged) ---
export async function fetchPlayerFactories(playerId) { /* ... */ }
// ... (rest of the economy functions are unchanged)

// --- NEW: Contract API Functions ---

/**
 * Fetches all contracts that the player has NOT yet accepted.
 * @param {string} playerId - The UUID of the player.
 * @returns {Promise}
 */
export async function fetchAvailableContracts(playerId) {
    // Select all contracts whose IDs are NOT IN the list of contracts the player already has.
    const { data: playerContractIds, error: playerError } = await supabaseClient
        .from('player_contracts')
        .select('contract_id')
        .eq('player_id', playerId);

    if (playerError) return { error: playerError };

    const acceptedIds = playerContractIds.map(c => c.contract_id);
    
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
    // This function performs two operations: updates the contract status, then updates the player's profile.
    
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
