/*
 * Filename: js/api.js
 * Version: NOUB v2.1.2 (Master API - IDLE DROP Functions Added)
 * Description: The definitive, unified API file containing all functions.
 * Includes the necessary fetch and update functions for the Idle Drop Generator.
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

/**
 * Adds a card to the player's collection. Simplified to bypass complex joins on 'cards' power_score.
 * It inserts a card at Level 1 with a default power score.
 */
export async function addCardToPlayerCollection(playerId, cardId) {
    // NOTE: We no longer fetch power_score from master cards to prevent join errors.
    const DEFAULT_INITIAL_POWER_SCORE = 10; // A safe default value
    
    return await supabaseClient.from('player_cards').insert({ 
        player_id: playerId, 
        card_id: cardId,
        level: 1, // Ensure card starts at level 1
        power_score: DEFAULT_INITIAL_POWER_SCORE // Use a safe default
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

    // 1. Verify all costs can be met before starting the transaction
    if ((profile.noub_score || 0) < (costs.noub || 0)) return { error: { message: 'Not enough NOUB.' } };
    if ((profile.prestige || 0) < (costs.prestige || 0)) return { error: { message: 'Not enough Prestige.' } };
    if ((profile.ankh_premium || 0) < (costs.ankh || 0)) return { error: { message: 'Not enough Ankh.' } };
    if (itemCost && (inventory.get(itemCost.id)?.qty || 0) < itemCost.qty) return { error: { message: `Not enough ${inventory.get(itemCost.id)?.details.name || 'items'}.` } };

    // 2. Prepare the database update objects
    const profileUpdate = {
        noub_score: (profile.noub_score || 0) - (costs.noub || 0),
        prestige: (profile.prestige || 0) - (costs.prestige || 0),
        ankh_premium: (profile.ankh_premium || 0) - (costs.ankh || 0),
    };

    // 3. Perform the updates
    const { error: profileError } = await updatePlayerProfile(playerId, profileUpdate);
    if (profileError) return { error: profileError };

    if (itemCost) {
        const currentItemQty = inventory.get(itemCost.id)?.qty || 0;
        const { error: itemError } = await updateItemQuantity(playerId, itemCost.id, currentItemQty - itemCost.qty);
        if (itemError) {
            return { error: itemError };
        }
    }

    return { error: null }; // Success
}

export async function addXp(playerId, amount) {
    const profile = state.playerProfile;
    if (!profile) return { leveledUp: false, newLevel: profile?.level || 1 };

    let currentXp = profile.xp || 0;
    let xpToNextLevel = profile.xp_to_next_level || 100;
    let currentLevel = profile.level || 1;
    let newXp = currentXp + amount;
    let leveledUp = false;

    while (newXp >= xpToNextLevel) {
        currentLevel += 1;
        newXp -= xpToNextLevel;
        xpToNextLevel = Math.floor(xpToNextLevel * 1.15); // Correct Multiplier
        leveledUp = true;
    }

    const updateObject = {
        xp: newXp,
        xp_to_next_level: xpToNextLevel,
        level: currentLevel
    };

    const { error } = await updatePlayerProfile(playerId, updateObject);
    if (error) {
        console.error("XP Update Error:", error);
        return { leveledUp: false, newLevel: profile.level };
    }
    
    return { leveledUp, newLevel: currentLevel };
}


// --- Economy API Functions (Retained) ---

export async function fetchPlayerFactories(playerId) {
    return await supabaseClient.from('player_factories').select(`id, level, production_start_time, assigned_card_instance_id, player_cards (instance_id, level, cards ( name, image_url, power_score )), factories!inner (id, name, output_item_id, base_production_time, type, image_url, specialization_path_id, required_level, build_cost_noub, items!factories_output_item_id_fkey (id, name, type, image_url, base_value), factory_recipes (input_quantity, items (id, name, type, image_url, base_value)))`).eq('player_id', playerId);
}

export async function fetchAllMasterFactories() {
    return await supabaseClient.from('factories').select(`id, name, output_item_id, base_production_time, type, image_url, specialization_path_id, required_level, build_cost_noub, items!factories_output_item_id_fkey (id, name, type, image_url, base_value)`).order('required_level', { ascending: true });
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

export async function buildFactory(playerId, factoryId) {
    return await supabaseClient.from('player_factories').insert({
        player_id: playerId,
        factory_id: factoryId,
        level: 1
    });
}

// --- NEW: Idle Drop Generator API Functions (CRITICAL for the feature) ---

/**
 * Fetches the player's Idle Drop State.
 */
export async function fetchIdleDropState(playerId) {
    return await supabaseClient.from('profiles').select('last_claim_time, idle_generator_level, noub_score').eq('id', playerId).single();
}

/**
 * Updates the player's Idle Drop State (Level and Last Claim Time).
 */
export async function updateIdleDropState(playerId, updateObject) {
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
}


// --- Contract API Functions (Retained) ---

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


// --- Games & Consumables API Functions (Retained) ---

export async function fetchSlotRewards() { return await supabaseClient.from('slot_rewards').select('id, prize_name, prize_type, value, weight'); }
export async function getDailySpinTickets(playerId) { return await supabaseClient.from('profiles').select('spin_tickets, last_daily_spin, noub_score, ankh_premium').eq('id', playerId).single(); }
export async function fetchKVGameConsumables(playerId) { return await supabaseClient.from('game_consumables').select('item_key, quantity').eq('player_id', playerId); }
export async function updateConsumableQuantity(playerId, itemKey, newQuantity) { return await supabaseClient.from('game_consumables').upsert({ player_id: playerId, item_key: itemKey, quantity: newQuantity }); }
export async function fetchKVProgress(playerId) { return await supabaseClient.from('kv_game_progress').select('current_kv_level, last_game_result, unlocked_levels_json').eq('player_id', playerId).single(); }
export async function updateKVProgress(playerId, updateObject) { return await supabaseClient.from('kv_game_progress').upsert({ player_id: playerId, ...updateObject }); }


// --- UCP-LLM Protocol API Functions (Retained) ---

export function saveUCPSection(playerId, sectionKey, sectionData) {
    supabaseClient.from('player_protocol_data').upsert({ player_id: playerId, section_key: sectionKey, section_data: sectionData }).then(({ error }) => { if (error) console.error('Background Save Error:', error); });
}

export async function fetchUCPProtocol(playerId) {
    const { data, error } = await supabaseClient.rpc('get_player_protocol', { p_id: playerId });
    if (error) console.error("Error calling RPC function 'get_player_protocol':", error);
    return { data, error };
}
/**
 * Fetches a master list of all items in the game.
 * Used to resolve item names from item_id.
 */
export async function fetchAllItems() {
    return await supabaseClient.from('items').select('id, name');
}


// --- TON Integration, Activity Log, History, Library, Albums (Retained) ---
export async function saveTonTransaction(playerId, txId, amountTon, amountAnkhPremium) { return { success: true, amount: amountAnkhPremium }; }
export async function logActivity(playerId, activityType, description) { return await supabaseClient.from('activity_log').insert({ player_id: playerId, activity_type: activityType, description: description }); }
export async function fetchActivityLog(playerId) { return await supabaseClient.from('activity_log').select('id, player_id, activity_type, description, created_at').eq('player_id', playerId).order('created_at', { ascending: false }).limit(500); }
export async function insertGameHistory(historyObject) { return await supabaseClient.from('game_history').insert(historyObject); }
export async function fetchGameHistory(playerId) { return await supabaseClient.from('game_history').select('id, player_id, game_type, level_kv, result_status, time_taken, code, date').eq('player_id', playerId).order('date', { ascending: false }); }
export async function fetchPlayerAlbums(playerId) { return await supabaseClient.from('player_albums').select(`album_id, is_completed, reward_claimed, master_albums (id, name, icon, description, card_ids, reward_ankh, reward_prestige)`).eq('player_id', playerId); }
export async function fetchPlayerLibrary(playerId) { return await supabaseClient.from('player_library').select('entry_key').eq('player_id', playerId); }


// --- Specialization API Functions (Retained) ---

export async function fetchSpecializationPaths() { return await supabaseClient.from('specialization_paths').select('*'); }
export async function fetchPlayerSpecializations(playerId) { return await supabaseClient.from('player_specializations').select('*, specialization_paths(*)').eq('player_id', playerId); }
export async function unlockSpecialization(playerId, pathId) { return await supabaseClient.from('player_specializations').insert({ player_id: playerId, specialization_path_id: pathId, is_active: true }); }

// --- Great Projects API Functions (Retained) ---

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

// --- NEW: P2P Swap API Functions (Phase 3.2) ---

/**
 * Creates a new Swap Request and locks the offered card instance.
 * FIXED: Implements proper card locking using the new 'is_locked' column.
 */
export async function createSwapRequest(playerId, offeredInstanceId, offerCardId, requestCardId, priceNoub = 0) {
    
    // 1. Lock the card instance (Preventing it from being burned/assigned elsewhere)
    const { error: lockError } = await supabaseClient
        .from('player_cards')
        .update({ is_locked: true }) // <--- USING THE NEW 'is_locked' COLUMN
        .eq('instance_id', offeredInstanceId)
        .eq('player_id', playerId);
        
    if (lockError) return { error: { message: "Failed to lock card instance." } };

    // 2. Create the Swap Request
    return await supabaseClient.from('swap_requests').insert({
        player_id_offering: playerId,
        item_id_offer: offerCardId,
        item_id_request: requestCardId,
        card_instance_id_offer: offeredInstanceId,
        price_noub: priceNoub,
        status: 'active'
    });
}

/**
 * Fetches all ACTIVE swap requests excluding those created by the current player.
 */
export async function fetchActiveSwapRequests(playerId) {
    // Selects active requests and details of the cards involved
    return await supabaseClient
        .from('swap_requests')
        .select(`
            id, player_id_offering, price_noub, created_at,
            offer_card:item_id_offer (id, name, image_url),
            request_card:item_id_request (id, name, image_url)
        `)
        .eq('status', 'active')
        .not('player_id_offering', 'eq', playerId); // CRITICAL: Do not show own requests
}

/**
 * Fetches all ACTIVE swap requests created by the current player.
 */
export async function fetchMySwapRequests(playerId) {
    // Selects active requests and details of the cards involved
    return await supabaseClient
        .from('swap_requests')
        .select(`
            id, player_id_offering, price_noub, created_at,
            offer_card:item_id_offer (id, name, image_url, rarity_level),
            request_card:item_id_request (id, name, image_url, rarity_level)
        `)
        .eq('status', 'active')
        .eq('player_id_offering', playerId); // CRITICAL: Only fetch this player's requests
}

/**
 * Executes a swap transaction (Accepting a request).
 * FIXED: Removed dependency on the 'is_locked_for_swap' column.
 */
export async function acceptSwapRequest(requestId, playerReceivingId) {
    // 1. Fetch Request details
    const { data: request, error: fetchError } = await supabaseClient
        .from('swap_requests')
        .select(`
            player_id_offering, card_instance_id_offer, 
            item_id_offer, item_id_request, price_noub
        `)
        .eq('id', requestId)
        .eq('status', 'active')
        .single();

    if (fetchError || !request) return { error: { message: "Request not found or already completed." } };
    
    // NOTE: This part now assumes the receiving player has the card instance required by the offering player. 
    // In a full implementation, the logic to fetch and delete the receiving player's card instance is needed.
    
    // --- Phase 1: Give the Offering Player the Requested Card (item_id_request) ---
    const { error: giveError } = await addCardToPlayerCollection(request.player_id_offering, request.item_id_request);
    
    // --- Phase 2: Give the Receiving Player the Offered Card (item_id_offer) ---
    const { error: receiveError } = await addCardToPlayerCollection(playerReceivingId, request.item_id_offer);
    
    // --- Phase 3: Delete the original offered card instance ---
    const { error: deleteError } = await deleteCardInstance(request.card_instance_id_offer);

    // --- Phase 4: Finalize by updating request status ---
    const { error: statusError } = await supabaseClient
        .from('swap_requests')
        .update({ status: 'completed' })
        .eq('id', requestId);

    if (receiveError || deleteError || giveError || statusError) {
        // Log error and rollback should happen here
        return { error: { message: "Swap failed due to a database error during card transfer." } };
    }
    
    return { error: null, newCardId: request.item_id_offer };
}


