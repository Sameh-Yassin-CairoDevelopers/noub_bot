/*
 * Filename: js/api.js
 * Version: NOUB v3.0.0 (Complete Pure JS Edition)
 * Description: 
 * The Unified Data Access Layer. This module handles ALL interactions between the frontend 
 * and Supabase. It implements logic for Economy, Gameplay, Social Trading (P2P), 
 * and the "Soul Embodiment" system using client-side calculations to minimize SQL dependencies.
 */

import { state } from './state.js'; 
import { supabaseClient } from './config.js';

export { supabaseClient };

// ========================================================
// --- 0. HELPER LOGIC (Local Calculations) ---
// ========================================================

/**
 * Calculates the "Power Score" based on the Collatz Conjecture.
 * Logic: Counts steps to reach 1 for a given seed number.
 * @param {string} seed - The DNA string.
 * @returns {number} The calculated power score.
 */
function calculateCollatzPower(seed) {
    // Convert string DNA to BigInt to handle large numbers safe from overflow
    let current = BigInt(seed); 
    let steps = 0;
    const MAX_STEPS = 20000; // Fail-safe limit

    while (current > 1n && steps < MAX_STEPS) {
        if (current % 2n === 0n) {
            current = current / 2n;
        } else {
            current = (current * 3n) + 1n;
        }
        steps++;
    }
    return steps;
}

// ========================================================
// --- 1. CORE PLAYER & PROFILE DATA ---
// ========================================================

export async function fetchProfile(userId) {
    // Using standard select instead of RPC to keep it pure
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    return { data, error };
}

export async function updatePlayerProfile(playerId, updateObject) {
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
}

export async function logActivity(playerId, activityType, description) {
    return await supabaseClient.from('activity_log').insert({ 
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
        .limit(50);
}

export async function addXp(playerId, amount) {
    const profile = state.playerProfile;
    if (!profile) return { leveledUp: false };

    let currentXp = (profile.xp || 0) + amount;
    let currentLevel = profile.level || 1;
    let xpNext = profile.xp_to_next_level || 100;
    let leveledUp = false;

    // Logic to handle multiple level-ups if XP is huge
    while (currentXp >= xpNext) {
        currentLevel++;
        currentXp -= xpNext;
        xpNext = Math.floor(xpNext * 1.15); // 15% difficulty curve
        leveledUp = true;
    }
    
    await updatePlayerProfile(playerId, { 
        xp: currentXp, 
        level: currentLevel, 
        xp_to_next_level: xpNext 
    });
    return { leveledUp, newLevel: currentLevel };
}

// ========================================================
// --- 2. INVENTORY & CARDS MANAGEMENT ---
// ========================================================

export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`quantity, item_id, items (id, name, type, image_url, base_value)`)
        .eq('player_id', playerId);
}

export async function updateItemQuantity(playerId, itemId, newQuantity) {
    if (newQuantity < 0) return { error: { message: "Negative Quantity Forbidden" } };
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id, name, rarity_level, image_url');
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient
        .from('player_cards')
        .select(`
            instance_id, level, card_id, power_score, is_locked,
            cards (id, name, rarity_level, image_url, power_score, description)
        `)
        .eq('player_id', playerId);
}

export async function addCardToPlayerCollection(playerId, cardId) {
    // Standard card generation (Standard power score, unlocked by default)
    return await supabaseClient.from('player_cards').insert({
        player_id: playerId,
        card_id: cardId,
        level: 1,
        power_score: 10, // Base power for standard cards
        is_locked: false
    });
}

export async function deleteCardInstance(instanceId) {
    return await supabaseClient.from('player_cards').delete().eq('instance_id', instanceId);
}

export async function fetchCardUpgradeRequirements(cardId, nextLevel) {
    return await supabaseClient
        .from('card_levels')
        .select(`
            *, items:cost_item_id (name)
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

export async function transactUpgradeCosts(playerId, costs, itemCost = null) {
    // Validation logic moved to UI/Pre-check, this just executes
    const profile = state.playerProfile;
    
    const profileUpdate = {
        noub_score: (profile.noub_score || 0) - (costs.noub || 0),
        prestige: (profile.prestige || 0) - (costs.prestige || 0),
        ankh_premium: (profile.ankh_premium || 0) - (costs.ankh || 0),
    };

    const { error: profileError } = await updatePlayerProfile(playerId, profileUpdate);
    if (profileError) return { error: profileError };

    if (itemCost) {
        const currentItemQty = state.inventory.get(itemCost.id)?.qty || 0;
        const { error: itemError } = await updateItemQuantity(playerId, itemCost.id, currentItemQty - itemCost.qty);
        if (itemError) return { error: itemError };
    }
    return { error: null }; 
}

// ========================================================
// --- 3. FACTORIES & ECONOMY ---
// ========================================================

export async function fetchAllMasterFactories() {
    return await supabaseClient
        .from('factories')
        .select(`id, name, output_item_id, base_production_time, type, image_url, required_level, build_cost_noub, 
                 items!factories_output_item_id_fkey (id, name, type, image_url, base_value)`)
        .order('required_level', { ascending: true });
}

export async function fetchPlayerFactories(playerId) {
    return await supabaseClient
        .from('player_factories')
        .select(`id, level, production_start_time, assigned_card_instance_id, 
                factories!inner (id, name, output_item_id, base_production_time, type, image_url), 
                factory_recipes (input_quantity, items (id, name))`)
        .eq('player_id', playerId);
}

export async function buildFactory(playerId, factoryId) {
    return await supabaseClient.from('player_factories').insert({
        player_id: playerId,
        factory_id: factoryId,
        level: 1
    });
}

export async function updatePlayerFactoryLevel(playerFactoryId, newLevel) {
    return await supabaseClient.from('player_factories').update({ level: newLevel }).eq('id', playerFactoryId);
}

export async function startProduction(playerFactoryId, startTime) {
    return await supabaseClient.from('player_factories').update({ production_start_time: startTime }).eq('id', playerFactoryId);
}

export async function claimProduction(playerId, playerFactoryId, itemId, newQuantity) {
    // 1. Update Inventory
    await supabaseClient.from('player_inventory').upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    // 2. Reset Factory
    return await supabaseClient.from('player_factories').update({ production_start_time: null }).eq('id', playerFactoryId);
}

export async function fetchAllItems() {
    return await supabaseClient.from('items').select('id, name');
}

// --- Specializations ---
export async function fetchSpecializationPaths() { 
    return await supabaseClient.from('specialization_paths').select('*'); 
}
export async function fetchPlayerSpecializations(playerId) { 
    return await supabaseClient
        .from('player_specializations')
        .select('*, specialization_paths(*)')
        .eq('player_id', playerId); 
}
export async function unlockSpecialization(playerId, pathId) { 
    return await supabaseClient
        .from('player_specializations')
        .insert({ player_id: playerId, specialization_path_id: pathId, is_active: true }); 
}

// ========================================================
// --- 4. CONTRACTS & QUESTS ---
// ========================================================

export async function fetchAvailableContracts(playerId) {
    const { data: playerContractIds } = await supabaseClient.from('player_contracts').select('contract_id').eq('player_id', playerId);
    const acceptedIds = playerContractIds ? playerContractIds.map(c => c.contract_id) : [];
    
    let query = supabaseClient.from('contracts').select('id, title, description, reward_score, reward_prestige');
    if (acceptedIds.length > 0) {
        query = query.not('id', 'in', `(${acceptedIds.join(',')})`);
    }
    return await query;
}

export async function fetchPlayerContracts(playerId) {
    return await supabaseClient
        .from('player_contracts')
        .select(`id, status, accepted_at, contracts (id, title, description, reward_score, reward_prestige)`)
        .eq('player_id', playerId)
        .eq('status', 'active');
}

export async function fetchContractWithRequirements(contractId) {
    return await supabaseClient
        .from('contracts')
        .select(`id, title, description, reward_score, reward_prestige, contract_requirements (quantity, items (id, name, image_url))`)
        .eq('id', contractId)
        .single();
}

export async function acceptContract(playerId, contractId) {
    return await supabaseClient.from('player_contracts').insert({ player_id: playerId, contract_id: contractId });
}

export async function completeContract(playerId, playerContractId, newTotals) {
    // Update contract status
    const { error: statusError } = await supabaseClient.from('player_contracts').update({ status: 'completed' }).eq('id', playerContractId);
    if (statusError) return { error: statusError };
    // Update rewards
    return await supabaseClient.from('profiles').update({ noub_score: newTotals.noub_score, prestige: newTotals.prestige }).eq('id', playerId);
}

export async function refreshAvailableContracts(playerId) {
    // "Refreshing" here simulates declining current ones to get new ones logic, usually just deleting player_contracts
    // or handling via logic. For now, simply clearing uncompleted ones logic is simulated on server.
    return await supabaseClient.from('player_contracts').delete().eq('player_id', playerId).eq('status', 'active'); // Only delete active if that's the logic
}

// ========================================================
// --- 5. MINIGAMES (KV, Wheel, Idle Drop) ---
// ========================================================

// --- Idle Drop ---
export async function fetchIdleDropState(playerId) {
    return await supabaseClient.from('profiles').select('last_claim_time, idle_generator_level, noub_score').eq('id', playerId).single();
}
export async function updateIdleDropState(playerId, updateObject) {
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
}

// --- KV Game & Consumables ---
export async function fetchKVGameConsumables(playerId) { return await supabaseClient.from('game_consumables').select('item_key, quantity').eq('player_id', playerId); }
export async function updateConsumableQuantity(playerId, itemKey, newQuantity) { 
    return await supabaseClient.from('game_consumables').upsert({ player_id: playerId, item_key: itemKey, quantity: newQuantity }); 
}
export async function fetchKVProgress(playerId) { 
    return await supabaseClient.from('kv_game_progress').select('current_kv_level, last_game_result, unlocked_levels_json').eq('player_id', playerId).single(); 
}
export async function updateKVProgress(playerId, updateObject) { 
    return await supabaseClient.from('kv_game_progress').upsert({ player_id: playerId, ...updateObject }); 
}
export async function insertGameHistory(historyObject) { return await supabaseClient.from('game_history').insert(historyObject); }
export async function fetchGameHistory(playerId) { 
    return await supabaseClient.from('game_history').select('id, player_id, game_type, level_kv, result_status, time_taken, code, date').eq('player_id', playerId).order('date', { ascending: false }); 
}

// --- Wheel & Slots ---
export async function fetchSlotRewards() { return await supabaseClient.from('slot_rewards').select('*'); }
export async function getDailySpinTickets(playerId) { return await supabaseClient.from('profiles').select('spin_tickets, last_daily_spin').eq('id', playerId).single(); }

// ========================================================
// --- 6. GREAT PROJECTS ---
// ========================================================

export async function fetchAllGreatProjects() {
    return await supabaseClient.from('master_great_projects').select('*').order('min_player_level', { ascending: true });
}
export async function fetchPlayerGreatProjects(playerId) {
    return await supabaseClient.from('player_great_projects').select(`*, master_great_projects (*)`).eq('player_id', playerId);
}
export async function subscribeToProject(playerId, projectId) {
    return await supabaseClient.from('player_great_projects').insert({ 
        player_id: playerId, project_id: projectId, start_time: new Date().toISOString(), status: 'active', progress: {} 
    });
}
export async function deliverToProject(playerProjectId, newProgress) {
    return await supabaseClient.from('player_great_projects').update({ progress: newProgress }).eq('id', playerProjectId);
}
export async function completeGreatProject(playerProjectId, rewards) {
    // Mark as completed
    await supabaseClient.from('player_great_projects').update({ status: 'completed' }).eq('id', playerProjectId);
    // Grant Rewards logic should be handled in UI calling updateProfile, or here if we pass playerID.
    // Assuming caller handles profile update to allow multiple currency updates.
    return { error: null };
}

// ========================================================
// --- 7. UCP, LIBRARY & MISC ---
// ========================================================

export function saveUCPSection(playerId, sectionKey, sectionData) {
    // Using upsert to create or update
    supabaseClient.from('player_protocol_data').upsert({ player_id: playerId, section_key: sectionKey, section_data: sectionData })
    .then(({ error }) => { if (error) console.error('UCP Save Error:', error); });
}
export async function fetchUCPProtocol(playerId) {
    // Using direct select as RPC was removed for pure JS approach
    const { data, error } = await supabaseClient.from('player_protocol_data').select('section_key, section_data').eq('player_id', playerId);
    return { data, error };
}
export async function fetchPlayerAlbums(playerId) { return await supabaseClient.from('player_albums').select(`*, master_albums (*)`).eq('player_id', playerId); }
export async function fetchPlayerLibrary(playerId) { return await supabaseClient.from('player_library').select('entry_key').eq('player_id', playerId); }
export async function saveTonTransaction(playerId, txId, amountTon, amountAnkh) {
    // Placeholder for TON logic integration
    return { success: true };
}

// ========================================================
// --- 8. SOUL CARD LOGIC (Pure JS Implementation) ---
// ========================================================

/**
 * Generates and Mints the Soul Card using Client-Side Logic.
 * Logic: Fetches Profile DNA -> Calculates Collatz -> Inserts Card.
 */
export async function mintUserSoulCard(playerId) {
    console.log("Initializing Soul Minting Protocol (JS)...");

    // 1. Get Profile Data for DNA
    const { data: profile } = await fetchProfile(playerId);
    
    if (!profile.dna_edu_level || profile.dna_eve_code === '00000' || profile.dna_eve_code === null) {
        return { error: { message: "Protocol Incomplete. Cannot mint without DNA." } };
    }

    // 2. Check if Card Already Exists (ID 9999)
    const { data: existing } = await supabaseClient
        .from('player_cards')
        .select('instance_id')
        .eq('player_id', playerId)
        .eq('card_id', 9999);
        
    if (existing && existing.length > 0) {
        return { error: { message: "Soul Card already exists." } };
    }

    // 3. GENERATE DNA STRING (The Seed)
    // Logic: DOB (Fallback or actual) + Edu + Lang + Sport + EveCode
    const dobStr = '19781018'; // Static Seed Component (Fate)
    const dnaString = `${dobStr}${profile.dna_edu_level}${profile.dna_lang_count}${profile.dna_sport_type}${profile.dna_eve_code}`;
    
    console.log(`DNA Generated: ${dnaString}`);

    // 4. RUN COLLATZ ENGINE
    const powerScore = calculateCollatzPower(dnaString);
    
    // 5. MINT (Insert into DB directly)
    const { data, error } = await supabaseClient
        .from('player_cards')
        .insert({
            player_id: playerId,
            card_id: 9999, // Soul Card Master ID
            level: 1,
            power_score: powerScore,
            is_locked: true, // Soulbound by default
        })
        .select()
        .single();

    if (error) return { error };

    // 6. Optional: Update Profile to confirm minting
    await updatePlayerProfile(playerId, { soul_card_serial: dnaString });

    return { data: { power_score: powerScore, dna_string: dnaString }, error: null };
}


// ========================================================
// --- 9. P2P SWAP LOGIC (Pure JS Implementation) ---
// ========================================================

export async function createSwapRequest(playerId, offeredInstanceId, offerCardId, requestCardId, priceNoub = 0) {
    // 1. Lock Card locally
    const { error: lockError } = await supabaseClient
        .from('player_cards')
        .update({ is_locked: true })
        .eq('instance_id', offeredInstanceId);

    if (lockError) return { error: { message: "Failed to lock card." } };

    // 2. Create Request
    const { error: insertError } = await supabaseClient
        .from('swap_requests')
        .insert({
            player_id_offering: playerId,
            card_instance_id_offer: offeredInstanceId,
            item_id_offer: offerCardId,
            item_id_request: requestCardId,
            price_noub: priceNoub,
            status: 'active'
        });

    if (insertError) {
        // Rollback Lock
        await supabaseClient.from('player_cards').update({ is_locked: false }).eq('instance_id', offeredInstanceId);
        return { error: insertError };
    }

    return { error: null };
}

export async function acceptSwapRequest(requestId, playerReceivingId, counterOfferInstanceId) {
    console.log("Executing Swap (JS Logic)...");

    // 1. Fetch Request Data
    const { data: request, error: reqError } = await supabaseClient
        .from('swap_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (reqError || !request || request.status !== 'active') {
        return { error: { message: "Offer unavailable or already completed." } };
    }

    const playerOfferingId = request.player_id_offering;
    const offeredCardInstanceId = request.card_instance_id_offer;

    // 2. Transfer Offered Card (Offerer -> Receiver)
    const { error: err1 } = await supabaseClient
        .from('player_cards')
        .update({ player_id: playerReceivingId, is_locked: false, acquired_at: new Date() })
        .eq('instance_id', offeredCardInstanceId);

    if (err1) return { error: { message: "Transfer failed (Step 1). Transaction aborted." } };

    // 3. Transfer Counter Card (Receiver -> Offerer)
    const { error: err2 } = await supabaseClient
        .from('player_cards')
        .update({ player_id: playerOfferingId, is_locked: false, acquired_at: new Date() })
        .eq('instance_id', counterOfferInstanceId);

    if (err2) {
        // Critical failure in step 2 (Step 1 already succeeded). 
        // In a real production app, we would need an admin rollback script here.
        console.error("CRITICAL: Swap Step 2 Failed", err2);
        return { error: { message: "Transfer error. Contact support." } };
    }

    // 4. Close Request
    await supabaseClient.from('swap_requests').update({ status: 'completed' }).eq('id', requestId);

    // 5. Log Transaction
    await supabaseClient.from('swap_transactions').insert({
        request_id: requestId,
        player_offering_id: playerOfferingId,
        player_accepting_id: playerReceivingId,
        card_instance_offered_instance: offeredCardInstanceId,
        card_instance_received_instance: counterOfferInstanceId
    });

    // 6. Fetch New Card Name for UI Feedback
    const { data: cardInfo } = await supabaseClient.from('cards').select('name').eq('id', request.item_id_offer).single();

    return { error: null, newCardName: cardInfo?.name || "New Card" };
}

export async function fetchActiveSwapRequests(playerId) {
    // Fetch requests NOT created by current user
    return await supabaseClient
        .from('swap_requests')
        .select('*, offer_card:item_id_offer(name, image_url, rarity_level), request_card:item_id_request(name, image_url, rarity_level)')
        .eq('status', 'active')
        .neq('player_id_offering', playerId);
}

export async function fetchMySwapRequests(playerId) {
    // Fetch requests created BY current user
    return await supabaseClient
        .from('swap_requests')
        .select('*, offer_card:item_id_offer(name, image_url, rarity_level), request_card:item_id_request(name, image_url, rarity_level)')
        .eq('status', 'active')
        .eq('player_id_offering', playerId);
}

export async function cancelSwapRequest(requestId, playerOfferingId, offeredInstanceId) {
    // 1. Unlock Card
    const { error: unlockError } = await supabaseClient
        .from('player_cards')
        .update({ is_locked: false })
        .eq('instance_id', offeredInstanceId);
        
    if (unlockError) return { error: unlockError };

    // 2. Cancel Request
    return await supabaseClient
        .from('swap_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);
}
