/*
 * Filename: js/api.js
 * Version: Pharaoh's Legacy 'NOUB' v0.4 (UCP RPC & Fire-and-Forget)
 * Description: Data Access Layer Module. Centralizes all database interactions.
 * FINAL FIX: Implements the most robust fetching via RPC and background saving for the UCP protocol.
*/

import { supabaseClient } from './config.js';

export { supabaseClient };

// --- Player and Card Functions ---

export async function fetchProfile(userId) {
    // أضف الأعمدة الثلاثة الجديدة هنا
    return await supabaseClient.from('profiles').select('id, created_at, username, noub_score, ankh_premium, prestige, spin_tickets, last_daily_spin, ton_address, level, completed_contracts_count, ucp_task_1_claimed, ucp_task_2_claimed, ucp_task_3_claimed').eq('id', userId).single();
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient.from('player_cards').select('instance_id, level, card_id, power_score, cards(id, name, rarity_level, image_url, power_score, description, lore)').eq('player_id', playerId);
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id, name');
}

export async function updatePlayerProfile(playerId, updateObject) {
    try {
        const { data, error } = await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
        if (error) {
            console.error("Supabase API Error in updatePlayerProfile:", error.message, "Details:", error.details, "Hint:", error.hint, "Update object:", updateObject);
            return { data: null, error };
        }
        return { data, error: null };
    } catch (e) {
        console.error("Unexpected error in updatePlayerProfile:", e, "Update object:", updateObject);
        return { data: null, error: { message: e.message || "Unknown error during profile update" } };
    }
}

export async function addCardToPlayerCollection(playerId, cardId) {
    const { data: cardDetails } = await supabaseClient.from('cards').select('power_score').eq('id', cardId).single();
    const initialPower = cardDetails ? cardDetails.power_score : 1;
    
    return await supabaseClient.from('player_cards').insert({ 
        player_id: playerId, 
        card_id: cardId,
        power_score: initialPower
    });
}

export async function fetchCardUpgradeRequirements(cardId, nextLevel) {
    return await supabaseClient
        .from('card_levels')
        .select(`
            id, card_id, upgrade_level, cost_ankh, cost_prestige, cost_blessing, cost_item_id, cost_item_qty, power_increase,
            items (id, name, image_url)
        `)
        .eq('card_id', cardId)
        .eq('upgrade_level', nextLevel)
        .single();
}

export async function performCardUpgrade(playerCardId, newLevel, newPowerScore) {
    return await supabaseClient
        .from('player_cards')
        .update({ level: newLevel, power_score: newPowerScore }) 
        .eq('instance_id', playerCardId);
}

export async function deleteCardInstance(instanceId) {
    return await supabaseClient
        .from('player_cards')
        .delete()
        .eq('instance_id', instanceId);
}


// --- Economy API Functions ---

export async function fetchPlayerFactories(playerId) {
    return await supabaseClient
        .from('player_factories')
        .select(`
            id, level, production_start_time,
            factories!inner (
                id, name, output_item_id, base_production_time, type, image_url, specialization_path_id,
                items!factories_output_item_id_fkey (id, name, type, image_url, base_value),
                factory_recipes (
                    input_quantity,
                    items (id, name, type, image_url, base_value)
                )
            )
        `)
        .eq('player_id', playerId);
}

export async function updatePlayerFactoryLevel(playerFactoryId, newLevel) {
    return await supabaseClient
        .from('player_factories')
        .update({ level: newLevel })
        .eq('id', playerFactoryId);
}

export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`quantity, item_id, items (id, name, type, image_url, base_value)`)
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
/**
 * Updates the claim status for a specific UCP task in the user's profile.
 * @param {string} playerId - The ID of the current player.
 * @param {number} taskNumber - The task number (1, 2, or 3).
 */
export async function claimUcpTaskReward(playerId, taskNumber) {
    const updateObject = {};
    updateObject[`ucp_task_${taskNumber}_claimed`] = true;
    
    return await supabaseClient
        .from('profiles')
        .update(updateObject)
        .eq('id', playerId);
}


// --- Contract API Functions ---

export async function fetchAvailableContracts(playerId) {
    const { data: playerContractIds, error: playerError } = await supabaseClient
        .from('player_contracts')
        .select('contract_id')
        .eq('player_id', playerId);

    if (playerError) {
        console.error("Error fetching player contract IDs:", playerError);
        return { data: [], error: playerError };
    }

    const acceptedIds = playerContractIds.map(c => c.contract_id);
    
    if (acceptedIds.length === 0) {
        return await supabaseClient.from('contracts').select('id, title, description, reward_score, reward_prestige');
    }
    
    return await supabaseClient
        .from('contracts')
        .select('id, title, description, reward_score, reward_prestige')
        .not('id', 'in', `(${acceptedIds.join(',')})`);
}

export async function fetchPlayerContracts(playerId) {
    return await supabaseClient
        .from('player_contracts')
        .select(`
            id, status, accepted_at,
            contracts (id, title, description, reward_score, reward_prestige) 
        `)
        .eq('player_id', playerId)
        .eq('status', 'active');
}

export async function fetchContractWithRequirements(contractId) {
    return await supabaseClient
        .from('contracts')
        .select(`
            id, title, description, reward_score, reward_prestige,
            contract_requirements (
                quantity,
                items (id, name, image_url)
            )
        `)
        .eq('id', contractId)
        .single();
}

export async function acceptContract(playerId, contractId) {
    return await supabaseClient
        .from('player_contracts')
        .insert({ player_id: playerId, contract_id: contractId });
}

export async function completeContract(playerId, playerContractId, newTotals) {
    const { error: contractError } = await supabaseClient
        .from('player_contracts')
        .update({ status: 'completed' })
        .eq('id', playerContractId);
        
    if (contractError) return { error: contractError };

    return await supabaseClient
        .from('profiles')
        .update({ noub_score: newTotals.noub_score, prestige: newTotals.prestige })
        .eq('id', playerId);
}

export async function refreshAvailableContracts(playerId) {
    return await supabaseClient
        .from('player_contracts')
        .delete()
        .eq('player_id', playerId);
}


// --- Games & Consumables API Functions ---

export async function fetchSlotRewards() {
    return await supabaseClient.from('slot_rewards').select('id, prize_name, prize_type, value, weight');
}

export async function getDailySpinTickets(playerId) {
    return await supabaseClient.from('profiles')
        .select('spin_tickets, last_daily_spin, noub_score, ankh_premium')
        .eq('id', playerId)
        .single();
}

export async function fetchKVGameConsumables(playerId) {
    return await supabaseClient
        .from('game_consumables')
        .select('item_key, quantity')
        .eq('player_id', playerId);
}

export async function updateConsumableQuantity(playerId, itemKey, newQuantity) {
    return await supabaseClient
        .from('game_consumables')
        .upsert({ player_id: playerId, item_key: itemKey, quantity: newQuantity });
}

export async function fetchKVProgress(playerId) {
    return await supabaseClient
        .from('kv_game_progress')
        .select('current_kv_level, last_game_result, unlocked_levels_json')
        .eq('player_id', playerId)
        .single();
}

export async function updateKVProgress(playerId, updateObject) {
    return await supabaseClient
        .from('kv_game_progress')
        .upsert({ player_id: playerId, ...updateObject });
}


// --- UCP-LLM Protocol API Functions ---

/**
 * Saves a section using "fire and forget". We don't await the result
 * to keep the UI snappy and avoid race conditions.
 * The object sent matches the 3-column table structure.
 */
export function saveUCPSection(playerId, sectionKey, sectionData) {
    supabaseClient
        .from('player_protocol_data')
        .upsert({ 
            player_id: playerId, 
            section_key: sectionKey, 
            section_data: sectionData
        })
        .then(({ error }) => {
            if (error) {
                console.error('Background Save Error:', error);
            }
        });
}


/**
 * Fetches the complete UCP protocol for a player.
 * Uses .rpc() as the most reliable method to avoid 406 errors.
 */
export async function fetchUCPProtocol(playerId) {
    const { data, error } = await supabaseClient.rpc('get_player_protocol', { p_id: playerId });
    if (error) {
        console.error("Error calling RPC function 'get_player_protocol':", error);
    }
    return { data, error };
}


// --- TON Integration Functions ---

export async function saveTonTransaction(playerId, txId, amountTon, amountAnkhPremium) {
    return { success: true, amount: amountAnkhPremium }; 
}


// --- Activity Log & Utility ---

export async function logActivity(playerId, activityType, description) {
    return await supabaseClient
        .from('activity_log')
        .insert({ 
            player_id: playerId, 
            activity_type: activityType, 
            description: description 
        });
}

export async function fetchActivityLog(playerId) {
    return await supabaseClient
        .from('activity_log')
        .select('id, player_id, activity_type, description, created_at')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(500); 
}

// --- History, Library, Albums ---

export async function insertGameHistory(historyObject) {
    return await supabaseClient.from('game_history').insert(historyObject);
}

export async function fetchGameHistory(playerId) {
    return await supabaseClient
        .from('game_history')
        .select('id, player_id, game_type, level_kv, result_status, time_taken, code, date')
        .eq('player_id', playerId)
        .order('date', { ascending: false }); 
}

export async function fetchPlayerAlbums(playerId) {
    return await supabaseClient
        .from('player_albums')
        .select(`
            album_id, is_completed, reward_claimed,
            master_albums (id, name, icon, description, card_ids, reward_ankh, reward_prestige)
        `)
        .eq('player_id', playerId);
}

export async function fetchPlayerLibrary(playerId) {
    return await supabaseClient
        .from('player_library')
        .select('entry_key')
        .eq('player_id', playerId);
}


// --- Specialization API Functions ---

export async function fetchSpecializationPaths() {
    return await supabaseClient.from('specialization_paths').select('*');
}

export async function fetchPlayerSpecializations(playerId) {
    return await supabaseClient.from('player_specializations').select('*, specialization_paths(*)').eq('player_id', playerId);
}

export async function unlockSpecialization(playerId, pathId) {
    return await supabaseClient.from('player_specializations').insert({
        player_id: playerId,
        specialization_path_id: pathId,
        is_active: true
    });
}

