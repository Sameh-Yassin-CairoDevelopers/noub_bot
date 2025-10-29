/*
 * Filename: js/api.js
 * Version: NOUB 0.0.3 (API EXPANSION - ACTIVITY LOG)
 * Description: Data Access Layer Module. Centralizes all database interactions.
 * ADDED: logActivity and fetchActivityLog functions.
*/

import { supabaseClient } from './config.js';

// --- Player and Card Functions (UNCHANGED) ---

export async function fetchProfile(userId) {
    return await supabaseClient.from('profiles').select('*').eq('id', userId).single();
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient.from('player_cards').select('instance_id, level, card_id, power_score, cards(*)').eq('player_id', playerId);
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id');
}

export async function updatePlayerProfile(playerId, updateObject) {
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
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
            *,
            items (name, image_url)
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


// --- Economy API Functions (UNCHANGED) ---

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

export async function updatePlayerFactoryLevel(playerFactoryId, newLevel) {
    return await supabaseClient
        .from('player_factories')
        .update({ level: newLevel })
        .eq('id', playerFactoryId);
}

export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`quantity, item_id, items (id, name, type, image_url)`)
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


// --- Contract API Functions (UNCHANGED) ---

export async function fetchAvailableContracts(playerId) {
    const { data: playerContractIds, error: playerError } = await supabaseClient
        .from('player_contracts')
        .select('contract_id')
        .eq('player_id', playerId);

    if (playerError) return { data: [], error: playerError };

    const acceptedIds = playerContractIds.map(c => c.contract_id);
    
    if (acceptedIds.length === 0) {
        return await supabaseClient.from('contracts').select('*');
    }
    
    return await supabaseClient
        .from('contracts')
        .select('*')
        .not('id', 'in', `(${acceptedIds.join(',')})`);
}

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
        .update({ score: newTotals.score, prestige: newTotals.prestige })
        .eq('id', playerId);
}

export async function refreshAvailableContracts(playerId) {
    return await supabaseClient
        .from('player_contracts')
        .delete()
        .eq('player_id', playerId);
}


// --- Games & Consumables API Functions (UNCHANGED) ---

export async function fetchSlotRewards() {
    return await supabaseClient.from('slot_rewards').select('*');
}

export async function getDailySpinTickets(playerId) {
    const { data: profileData, error } = await supabaseClient.from('profiles')
        .select('spin_tickets, last_daily_spin')
        .eq('id', playerId)
        .single();
    
    if (error || !profileData) return { available: false, profileData: null };

    const lastSpinTime = new Date(profileData.last_daily_spin).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    const available = (now - lastSpinTime) > twentyFourHours;

    return { available, profileData };
}

export async function fetchKVGameConsumables(playerId) {
    return await supabaseClient
        .from('game_consumables')
        .select('*')
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
        .select('*')
        .eq('player_id', playerId)
        .single();
}

export async function updateKVProgress(playerId, updateObject) {
    return await supabaseClient
        .from('kv_game_progress')
        .upsert({ player_id: playerId, ...updateObject });
}


// --- UCP-LLM Protocol API Functions (UNCHANGED) ---

export async function saveUCPSection(playerId, sectionKey, sectionData) {
    return await supabaseClient
        .from('player_protocol_data')
        .upsert({ player_id: playerId, section_key: sectionKey, section_data: sectionData, last_updated: new Date().toISOString() });
}

export async function fetchUCPProtocol(playerId) {
    return await supabaseClient
        .from('player_protocol_data')
        .select('*')
        .eq('player_id', playerId);
}


// --- TON Integration Functions (UNCHANGED) ---

export async function saveTonTransaction(playerId, txId, amountTon, amountAnkh) {
    return { success: true, amount: amountAnkh }; 
}


// =================================================================================
// --- NOUB 0.0.3 ADDITIONS (Activity Log & Utility) ---
// =================================================================================

/**
 * Logs a critical player activity to the database.
 * @param {uuid} playerId - The user's ID.
 * @param {string} activityType - 'EXCHANGE', 'PURCHASE', 'UPGRADE', 'CONTRACT_COMPLETE'.
 * @param {string} description - Detailed description of the event.
 */
export async function logActivity(playerId, activityType, description) {
    return await supabaseClient
        .from('activity_log')
        .insert({ 
            player_id: playerId, 
            activity_type: activityType, 
            description: description 
        });
}

/**
 * Fetches the recent activity log for the player.
 */
export async function fetchActivityLog(playerId) {
    return await supabaseClient
        .from('activity_log')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(50); 
}

// --- NOUB 0.0.2 ADDITIONS (History, Library, Albums - UNCHANGED) ---

/**
 * Fetches the complete game history for the player.
 */
export async function fetchGameHistory(playerId) {
    return await supabaseClient
        .from('game_history')
        .select('*')
        .eq('player_id', playerId)
        .order('date', { ascending: false });
}

/**
 * Fetches the player's current status on all master card albums/sets.
 */
export async function fetchPlayerAlbums(playerId) {
    return await supabaseClient
        .from('player_albums')
        .select(`
            album_id, 
            is_completed, 
            reward_claimed,
            master_albums (id, name, icon, description, card_ids)
        `)
        .eq('player_id', playerId);
}

/**
 * Fetches the player's unlocked entries in the Tomb Encyclopedia (Library).
 */
export async function fetchPlayerLibrary(playerId) {
    return await supabaseClient
        .from('player_library')
        .select('entry_key')
        .eq('player_id', playerId);
}
