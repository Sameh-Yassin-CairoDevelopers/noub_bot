/*
 * Filename: js/api.js
 * Version: Pharaoh's Legacy 'NOUB' v1.3.1 (Complete API Module)
 * Description: Data Access Layer Module. This version is a complete, accurate and fully functional,
 * including the Great Projects API and all prior fixes. 
*/

import { supabaseClient } from './config.js';

export { supabaseClient };

// --- Player and Card Functions ---

/**
 * Fetches the complete player profile using a dedicated RPC function.
 */
export async function fetchProfile(userId) {
    const { data, error } = await supabaseClient.rpc('get_player_profile', { p_id: userId });

    if (error) {
        console.error("Error calling RPC function 'get_player_profile':", error);
        return { data: null, error };
    }

    return { data: data ? data[0] : null, error: null };
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
            id,
            level,
            production_start_time,
            assigned_card_instance_id, 
            player_cards (
                instance_id,
                level,
                cards ( name, image_url, power_score )
            ),
            factories!inner (
                id,
                name,
                output_item_id,
                base_production_time,
                type,
                image_url,
                specialization_path_id,
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

export async function fetchUCPProtocol(playerId) {
    const { data, error } = await supabaseClient.rpc('get_player_protocol', { p_id: playerId });
    if (error) {
        console.error("Error calling RPC function 'get_player_protocol':", error);
    }
    return { data, error };
}

// --- Great Projects API Functions ---

/**
 * Fetches all available great projects from the master list, ordered by minimum level requirement.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchAllGreatProjects() {
    return await supabaseClient
        .from('master_great_projects')
        .select('*')
        .order('min_player_level', { ascending: true });
}

/**
 * Fetches the player's currently active or completed projects, joining with the master project data.
 * @param {string} playerId - The ID of the current player.
 * @returns {Promise} A Supabase query promise.
 */
export async function fetchPlayerGreatProjects(playerId) {
    return await supabaseClient
        .from('player_great_projects')
        .select(`
            id,
            start_time,
            status,
            progress,
            master_great_projects ( * )
        `)
        .eq('player_id', playerId);
}

/**
 * Subscribes a player to a new great project by creating a new entry in the player_great_projects table.
 * @param {string} playerId - The ID of the current player.
 * @param {number} projectId - The ID of the project from master_great_projects.
 * @returns {Promise} A Supabase query promise.
 */
export async function subscribeToProject(playerId, projectId) {
    return await supabaseClient
        .from('player_great_projects')
        .insert({
            player_id: playerId,
            project_id: projectId,
            start_time: new Date().toISOString(),
            status: 'active',
            progress: {} // Initial progress is an empty object
        });
}

/**
 * Updates the player's resource delivery progress on a specific project.
 * @param {number} playerProjectId - The unique ID of the player's project instance (from player_great_projects).
 * @param {object} newProgress - The updated progress JSON object.
 * @returns {Promise} A Supabase query promise.
 */
export async function deliverToProject(playerProjectId, newProgress) {
    return await supabaseClient
        .from('player_great_projects')
        .update({ progress: newProgress })
        .eq('id', playerProjectId);
}
