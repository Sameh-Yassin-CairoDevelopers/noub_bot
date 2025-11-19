/*
 * Filename: js/api.js
 * Version: NOUB v1.8.4 (Definitive Query Fix)
 * Description: Data Access Layer Module. This version provides the definitive and final
 * fix for the factory progression system by correcting the syntax of the fetchPlayerFactories
 * query, resolving the data loading error permanently. It also includes the necessary
 * functions for building and fetching all master factories.
*/

import { state } from './state.js';
import { supabaseClient } from './config.js';

export { supabaseClient };

// --- Player and Card Functions ---

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
            card_id, 
            upgrade_level, 
            cost_noub, 
            cost_prestige, 
            cost_ankh, 
            cost_item_id, 
            cost_item_qty, 
            power_increase,
            items:card_levels_cost_item_id_fkey (id, name, image_url)
        `)
        .eq('card_id', cardId)
        .eq('upgrade_level', nextLevel)
        .single();
}

export async function performCardUpgrade(playerCardId, newLevel, newPowerScore) {
    return await supabaseClient.from('player_cards').update({ level: newLevel, power_score: newPowerScore }).eq('instance_id', playerCardId);
}

export async function deleteCardInstance(instanceId) {
    return await supabaseClient.from('player_cards').delete().eq('instance_id', instanceId);
}

export async function transactUpgradeCosts(playerId, costs, itemCost = null) {
    const profile = state.playerProfile;
    const inventory = state.inventory;
    if ((profile.noub_score || 0) < (costs.noub || 0)) return { error: { message: 'Not enough NOUB.' } };
    if ((profile.prestige || 0) < (costs.prestige || 0)) return { error: { message: 'Not enough Ankh.' } };
    if (itemCost && (inventory.get(itemCost.id)?.qty || 0) < itemCost.qty) return { error: { message: `Not enough ${inventory.get(itemCost.id)?.details.name || 'items'}.` } };
    const profileUpdate = {
        noub_score: (profile.noub_score || 0) - (costs.noub || 0),
        prestige: (profile.prestige || 0) - (costs.prestige || 0),
        ankh_premium: (profile.ankh_premium || 0) - (costs.ankh || 0),
    };
    const { error: profileError } = await updatePlayerProfile(playerId, profileUpdate);
    if (profileError) return { error: profileError };
    if (itemCost) {
        const currentItemQty = inventory.get(itemCost.id)?.qty || 0;
        const { error: itemError } = await updateItemQuantity(playerId, itemCost.id, currentItemQty - itemCost.qty);
        if (itemError) {
            return { error: itemError };
        }
    }
    return { error: null };
}

// --- Economy API Functions ---

export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select('*');
}

export async function buildFactory(playerId, factoryId) {
    return await supabaseClient.from('player_factories').upsert(
        {
            player_id: playerId,
            factory_id: factoryId,
            level: 1
        },
        {
            onConflict: 'player_id,factory_id'
        }
    );
}

export async function fetchPlayerFactories(playerId) {
    return await supabaseClient.from('player_factories').select(`
        id, 
        level, 
        production_start_time, 
        assigned_card_instance_id, 
        player_cards (instance_id, level, cards ( name, image_url, power_score )), 
        factories!inner (
            id, name, output_item_id, base_production_time, type, image_url, 
            specialization_path_id, required_level, build_cost_noub, 
            items!factories_output_item_id_fkey (id, name, type, image_url, base_value), 
            factory_recipes (input_quantity, items (id, name, type, image_url, base_value))
        )
    `).eq('player_id', playerId);
}

export async function updatePlayerFactoryLevel(playerFactoryId, newLevel) {
    return await supabaseClient.from('player_factories').update({ level: newLevel }).eq('id', playerFactoryId);
}

export async function fetchPlayerInventory(playerId) {
    return await supabaseClient.from('player_inventory').select(`quantity, item_id, items (id, name, type, image_url, base_value)`).eq('player_id', playerId);
}

export async function startProduction(playerFactoryId, startTime) {
    return await supabaseClient.from('player_factories').update({ production_start_time: startTime }).eq('id', playerFactoryId);
}

export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    await supabaseClient.from('player_inventory').upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    return await supabaseClient.from('player_factories').update({ production_start_time: null }).eq('id', playerFactoryId);
}

export async function updateItemQuantity(playerId, itemId, newQuantity) {
    return await supabaseClient.from('player_inventory').upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}

export async function claimUcpTaskReward(playerId, taskNumber) {
    const updateObject = {};
    updateObject[`ucp_task_${taskNumber}_claimed`] = true;
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
}

// --- Contract API Functions ---

export async function fetchAvailableContracts(playerId) {
    const { data: playerContractIds, error: playerError } = await supabaseClient.from('player_contracts').select('contract_id').eq('player_id', playerId);
    if (playerError) {
        console.error("Error fetching player contract IDs:", playerError);
        return { data: [], error: playerError };
    }
    const acceptedIds = playerContractIds.map(c => c.contract_id);
    if (acceptedIds.length === 0) {
        return await supabaseClient.from('contracts').select('id, title, description, reward_score, reward_prestige');
    }
    return await supabaseClient.from('contracts').select('id, title, description, reward_score, reward_prestige').not('id', 'in', `(${acceptedIds.join(',')})`);
}

export async function fetchPlayerContracts(playerId) {
    return await supabaseClient.from('player_contracts').select(`id, status, accepted_at, contracts (id, title, description, reward_score, reward_prestige)`).eq('player_id', playerId).eq('status', 'active');
}

export async function fetchContractWithRequirements(contractId) {
    return await supabaseClient.from('contracts').select(`id, title, description, reward_score, reward_prestige, contract_requirements (quantity, items (id, name, image_url))`).eq('id', contractId).single();
}

export async function acceptContract(playerId, contractId) {
    return await supabaseClient.from('player_contracts').insert({ player_id: playerId, contract_id: contractId });
}

export async function completeContract(playerId, playerContractId, newTotals) {
    const { error: contractError } = await supabaseClient.from('player_contracts').update({ status: 'completed' }).eq('id', playerContractId);
    if (contractError) return { error: contractError };
    return await supabaseClient.from('profiles').update({ noub_score: newTotals.noub_score, prestige: newTotals.prestige }).eq('id', playerId);
}

export async function refreshAvailableContracts(playerId) {
    return await supabaseClient.from('player_contracts').delete().eq('player_id', playerId);
}

// --- Games & Consumables API Functions ---

export async function fetchSlotRewards() { return await supabaseClient.from('slot_rewards').select('id, prize_name, prize_type, value, weight'); }
export async function getDailySpinTickets(playerId) { return await supabaseClient.from('profiles').select('spin_tickets, last_daily_spin, noub_score, ankh_premium').eq('id', playerId).single(); }
export async function fetchKVGameConsumables(playerId) { return await supabaseClient.from('game_consumables').select('item_key, quantity').eq('player_id', playerId); }
export async function updateConsumableQuantity(playerId, itemKey, newQuantity) { return await supabaseClient.from('game_consumables').upsert({ player_id: playerId, item_key: itemKey, quantity: newQuantity }); }
export async function fetchKVProgress(playerId) { return await supabaseClient.from('kv_game_progress').select('current_kv_level, last_game_result, unlocked_levels_json').eq('player_id', playerId).single(); }
export async function updateKVProgress(playerId, updateObject) { return await supabaseClient.from('kv_game_progress').upsert({ player_id: playerId, ...updateObject }); }

// --- UCP-LLM Protocol API Functions ---

export function saveUCPSection(playerId, sectionKey, sectionData) {
    supabaseClient.from('player_protocol_data').upsert({ player_id: playerId, section_key: sectionKey, section_data: sectionData }).then(({ error }) => { if (error) console.error('Background Save Error:', error); });
}

export async function fetchUCPProtocol(playerId) {
    const { data, error } = await supabaseClient.rpc('get_player_protocol', { p_id: playerId });
    if (error) console.error("Error calling RPC function 'get_player_protocol':", error);
    return { data, error };
}

export async function fetchAllItems() {
    return await supabaseClient.from('items').select('id, name');
}

// --- TON Integration, Activity Log, History, Library, Albums ---
export async function saveTonTransaction(playerId, txId, amountTon, amountAnkhPremium) { return { success: true, amount: amountAnkhPremium }; }
export async function logActivity(playerId, activityType, description) { return await supabaseClient.from('activity_log').insert({ player_id: playerId, activity_type: activityType, description: description }); }
export async function fetchActivityLog(playerId) { return await supabaseClient.from('activity_log').select('id, player_id, activity_type, description, created_at').eq('player_id', playerId).order('created_at', { ascending: false }).limit(500); }
export async function insertGameHistory(historyObject) { return await supabaseClient.from('game_history').insert(historyObject); }
export async function fetchGameHistory(playerId) { return await supabaseClient.from('game_history').select('id, player_id, game_type, level_kv, result_status, time_taken, code, date').eq('player_id', playerId).order('date', { ascending: false }); }
export async function fetchPlayerAlbums(playerId) { return await supabaseClient.from('player_albums').select(`album_id, is_completed, reward_claimed, master_albums (id, name, icon, description, card_ids, reward_ankh, reward_prestige)`).eq('player_id', playerId); }
export async function fetchPlayerLibrary(playerId) { return await supabaseClient.from('player_library').select('entry_key').eq('player_id', playerId); }

// --- Specialization API Functions ---

export async function fetchSpecializationPaths() { return await supabaseClient.from('specialization_paths').select('*'); }
export async function fetchPlayerSpecializations(playerId) { return await supabaseClient.from('player_specializations').select('*, specialization_paths(*)').eq('player_id', playerId); }
export async function unlockSpecialization(playerId, pathId) { return await supabaseClient.from('player_specializations').insert({ player_id: playerId, specialization_path_id: pathId, is_active: true }); }

// --- Great Projects API Functions ---

export async function fetchAllGreatProjects() {
    return await supabaseClient.from('master_great_projects').select('*').order('min_player_level', { ascending: true });
}
export async function fetchPlayerGreatProjects(playerId) {
    return await supabaseClient.from('player_great_projects').select(`id, project_id, start_time, status, progress, master_great_projects ( * )`).eq('player_id', playerId);
}
export async function subscribeToProject(playerId, projectId) {
    return await supabaseClient.from('player_great_projects').insert({ player_id: playerId, project_id: projectId, start_time: new Date().toISOString(), status: 'active', progress: {} });
}
export async function deliverToProject(playerProjectId, newProgress) {
    return await supabaseClient.from('player_great_projects').update({ progress: newProgress }).eq('id', playerProjectId);
}

export async function completeGreatProject(playerProjectId, rewards) {
    if (!playerProjectId || !rewards) {
        return { error: { message: "Invalid project ID or rewards." } };
    }
    const { error: statusError } = await supabaseClient
        .from('player_great_projects')
        .update({ status: 'completed' })
        .eq('id', playerProjectId);
    if (statusError) {
        console.error("Error updating project status:", statusError);
        return { error: statusError };
    }
    const player = state.playerProfile;
    const profileUpdate = {
        noub_score: (player.noub_score || 0) + (rewards.noub || 0),
        prestige: (player.prestige || 0) + (rewards.prestige || 0),
        ankh_premium: (player.ankh_premium || 0) + (rewards.ankh || 0),
    };
    const { error: rewardError } = await updatePlayerProfile(player.id, profileUpdate);
    if (rewardError) {
        console.error("Error granting project rewards:", rewardError);
        return { error: rewardError };
    }
    return { error: null };
}

// --- Player Leveling System ---

export async function addXp(playerId, amount) {
    if (!playerId || !amount || amount <= 0) {
        return { error: { message: 'Invalid player ID or XP amount.' } };
    }
    const { data: currentProfile, error: fetchError } = await supabaseClient
        .from('profiles')
        .select('level, xp, xp_to_next_level')
        .eq('id', playerId)
        .single();
    if (fetchError) {
        console.error("addXp: Error fetching profile.", fetchError);
        return { error: fetchError };
    }
    let { level, xp, xp_to_next_level } = currentProfile;
    xp += amount;
    let leveledUp = false;
    while (xp >= xp_to_next_level) {
        leveledUp = true;
        level++;
        xp -= xp_to_next_level;
        xp_to_next_level = Math.floor(xp_to_next_level * 1.1);
    }
    const updateObject = {
        xp: xp,
        level: level,
        xp_to_next_level: xp_to_next_level
    };
    const { error: updateError } = await updatePlayerProfile(playerId, updateObject);
    if (updateError) {
        console.error("addXp: Error updating profile.", updateError);
        return { error: updateError };
    }
    if (leveledUp) {
        console.log(`Player ${playerId} leveled up to level ${level}!`);
    }
    return { error: null, leveledUp: leveledUp, newLevel: level };
}
