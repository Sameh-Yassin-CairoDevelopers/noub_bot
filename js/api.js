/*
 * Filename: js/api.js
 * Version: NOUB v4.0.0 (The Master Client-Side Engine)
 * Author: Sameh Yassin & Co-Pilot
 * 
 * Description: 
 * This is the Unified Data Access Layer. It replaces all server-side SQL logic 
 * with Client-Side JavaScript logic.
 * 
 * It handles:
 * 1. Data Fetching (Profiles, Assets, Configs).
 * 2. Game Logic Engines (Collatz Math, Destiny Hashing).
 * 3. Transaction Logic (Market Swaps, Crafting, Upgrades).
 * 4. State Synchronization.
 */

import { state } from './state.js'; 
import { supabaseClient } from './config.js';

export { supabaseClient };

// ========================================================
// --- 0. MATH & LOGIC ENGINES (INTERNAL HELPERS) ---
// ========================================================

/**
 * ENGINE: The Collatz Calculator.
 * Used for Soul Card Power generation.
 * @param {string} seed - The numeric DNA string.
 * @returns {number} Steps to reach 1.
 */
function calculateCollatzPower(seed) {
    let current = BigInt(seed); // Use BigInt to handle 20+ digit numbers safely
    let steps = 0;
    const MAX_STEPS = 50000; // Fail-safe loop break

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

/**
 * ENGINE: The Destiny Hash.
 * Used for Tomb Location determination.
 * Generates a deterministic hash from a string input.
 */
function generateFateHash(inputString) {
    let hash = 0;
    for (let i = 0; i < inputString.length; i++) {
        const char = inputString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    // Convert to positive hex string for consistency
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// ========================================================
// --- 1. PLAYER PROFILE & CORE DATA ---
// ========================================================

export async function fetchProfile(userId) {
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

    while (currentXp >= xpNext) {
        currentLevel++;
        currentXp -= xpNext;
        xpNext = Math.floor(xpNext * 1.15);
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
// --- 2. INVENTORY & CARDS SYSTEM ---
// ========================================================

export async function fetchPlayerInventory(playerId) {
    return await supabaseClient
        .from('player_inventory')
        .select(`quantity, item_id, items (id, name, type, image_url, base_value)`)
        .eq('player_id', playerId);
}

export async function updateItemQuantity(playerId, itemId, newQuantity) {
    if (newQuantity < 0) return { error: { message: "Insufficient items." } };
    return await supabaseClient
        .from('player_inventory')
        .upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id, name, rarity_level, image_url, description, power_score');
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient
        .from('player_cards')
        .select(`
            instance_id, level, card_id, power_score, is_locked,
            cards (id, name, rarity_level, image_url, power_score, description, lore)
        `)
        .eq('player_id', playerId);
}

export async function addCardToPlayerCollection(playerId, cardId) {
    // Generates a standard card instance
    return await supabaseClient.from('player_cards').insert({
        player_id: playerId,
        card_id: cardId,
        level: 1,
        power_score: 10, // Default base power
        is_locked: false,
        acquired_at: new Date()
    });
}

export async function deleteCardInstance(instanceId) {
    return await supabaseClient.from('player_cards').delete().eq('instance_id', instanceId);
}

export async function fetchCardUpgradeRequirements(cardId, nextLevel) {
    return await supabaseClient
        .from('card_levels')
        .select(`*, items:cost_item_id (name)`)
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
    const profile = state.playerProfile;
    const inventory = state.inventory;

    if ((profile.noub_score || 0) < (costs.noub || 0)) return { error: { message: 'Not enough NOUB.' } };
    if ((profile.prestige || 0) < (costs.prestige || 0)) return { error: { message: 'Not enough Prestige.' } };
    if ((profile.ankh_premium || 0) < (costs.ankh || 0)) return { error: { message: 'Not enough Ankh.' } };

    const profileUpdate = {
        noub_score: (profile.noub_score || 0) - (costs.noub || 0),
        prestige: (profile.prestige || 0) - (costs.prestige || 0),
        ankh_premium: (profile.ankh_premium || 0) - (costs.ankh || 0),
    };

    const { error: profileError } = await updatePlayerProfile(playerId, profileUpdate);
    if (profileError) return { error: profileError };

    if (itemCost) {
        const currentItemQty = inventory.get(itemCost.id)?.qty || 0;
        if (currentItemQty < itemCost.qty) return { error: { message: "Missing materials." } };
        
        const { error: itemError } = await updateItemQuantity(playerId, itemCost.id, currentItemQty - itemCost.qty);
        if (itemError) return { error: itemError };
    }
    return { error: null }; 
}

// ========================================================
// --- 3. FACTORY & PRODUCTION SYSTEM ---
// ========================================================

export async function fetchAllMasterFactories() {
    return await supabaseClient
        .from('factories')
        .select(`id, name, output_item_id, base_production_time, type, image_url, required_level, build_cost_noub, 
                 items!factories_output_item_id_fkey (id, name, type, image_url, base_value)`)
        .order('required_level', { ascending: true });
}

export async function fetchPlayerFactories(playerId) {
    // Fetches factories AND their recipe requirements nested
    return await supabaseClient
        .from('player_factories')
        .select(`id, level, production_start_time, assigned_card_instance_id, 
                factories!inner (
                    id, name, output_item_id, base_production_time, type, image_url, required_level, build_cost_noub,
                    factory_recipes (input_quantity, items (id, name))
                )`)
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
    // 1. Upsert Item Quantity
    await supabaseClient.from('player_inventory').upsert({ player_id: playerId, item_id: itemId, quantity: newQuantity });
    // 2. Reset Factory Timer
    return await supabaseClient.from('player_factories').update({ production_start_time: null }).eq('id', playerFactoryId);
}

export async function fetchAllItems() {
    return await supabaseClient.from('items').select('id, name');
}

// Specializations
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
    // Logic: Fetch player's accepted contracts first to exclude them
    const { data: playerContracts } = await supabaseClient.from('player_contracts').select('contract_id').eq('player_id', playerId);
    const acceptedIds = playerContracts ? playerContracts.map(c => c.contract_id) : [];
    
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
    const { error: statusError } = await supabaseClient.from('player_contracts').update({ status: 'completed' }).eq('id', playerContractId);
    if (statusError) return { error: statusError };
    return await supabaseClient.from('profiles').update({ noub_score: newTotals.noub_score, prestige: newTotals.prestige }).eq('id', playerId);
}

export async function refreshAvailableContracts(playerId) {
    // Simulates refresh by removing non-completed contracts to allow logic to fetch 'new' ones if backend supported rotation
    // Current Logic: Just clears existing active contracts
    return await supabaseClient.from('player_contracts').delete().eq('player_id', playerId).eq('status', 'active');
}

// ========================================================
// --- 5. MINIGAMES & EVENTS ---
// ========================================================

// Idle Drop
export async function fetchIdleDropState(playerId) {
    return await supabaseClient.from('profiles').select('last_claim_time, idle_generator_level, noub_score').eq('id', playerId).single();
}
export async function updateIdleDropState(playerId, updateObject) {
    return await supabaseClient.from('profiles').update(updateObject).eq('id', playerId);
}

// KV Game / Consumables
export async function fetchKVGameConsumables(playerId) { return await supabaseClient.from('game_consumables').select('item_key, quantity').eq('player_id', playerId); }
export async function updateConsumableQuantity(playerId, itemKey, newQuantity) { 
    return await supabaseClient.from('game_consumables').upsert({ player_id: playerId, item_key: itemKey, quantity: newQuantity }); 
}
export async function fetchKVProgress(playerId) { 
    return await supabaseClient.from('kv_game_progress').select('*').eq('player_id', playerId).single(); 
}
export async function updateKVProgress(playerId, updateObject) { 
    return await supabaseClient.from('kv_game_progress').upsert({ player_id: playerId, ...updateObject }); 
}
export async function insertGameHistory(historyObject) { return await supabaseClient.from('game_history').insert(historyObject); }
export async function fetchGameHistory(playerId) { 
    return await supabaseClient.from('game_history').select('*').eq('player_id', playerId).order('date', { ascending: false }); 
}

// Wheel
export async function fetchSlotRewards() { return await supabaseClient.from('slot_rewards').select('*'); }
export async function getDailySpinTickets(playerId) { return await supabaseClient.from('profiles').select('spin_tickets, last_daily_spin').eq('id', playerId).single(); }

// ========================================================
// --- 6. GREAT PROJECTS (COMMUNITY/SOLO) ---
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
    // Simply marks as complete. Reward distribution logic is usually handled by the caller.
    await supabaseClient.from('player_great_projects').update({ status: 'completed' }).eq('id', playerProjectId);
    return { error: null };
}

// ========================================================
// --- 7. UCP, LIBRARY & SYSTEM ---
// ========================================================

export function saveUCPSection(playerId, sectionKey, sectionData) {
    supabaseClient.from('player_protocol_data').upsert({ player_id: playerId, section_key: sectionKey, section_data: sectionData }).then();
}
export async function fetchUCPProtocol(playerId) {
    const { data, error } = await supabaseClient.from('player_protocol_data').select('*').eq('player_id', playerId);
    return { data, error };
}
export async function fetchPlayerAlbums(playerId) { return await supabaseClient.from('player_albums').select(`*, master_albums (*)`).eq('player_id', playerId); }
export async function fetchPlayerLibrary(playerId) { return await supabaseClient.from('player_library').select('entry_key').eq('player_id', playerId); }
export async function saveTonTransaction(playerId, txId, amountTon, amountAnkh) { return { success: true }; }


// ========================================================
// --- 8. SOUL CARD ENGINE (PURE JS MINTING) ---
// ========================================================

/**
 * The Embodiment Ritual: Generates and Mints the Soul Card.
 * Logic is entirely contained here, no SQL trigger required.
 */
export async function mintUserSoulCard(playerId) {
    console.log("Initializing Soul Minting Protocol (JS)...");

    // 1. Get Profile Data for DNA
    const { data: profile } = await fetchProfile(playerId);
    
    if (!profile.dna_edu_level || !profile.dna_eve_code || profile.dna_eve_code === '00000') {
        return { error: { message: "Protocol Incomplete. Cannot mint without valid DNA." } };
    }

    // 2. Check for Existing Card (ID 9999)
    const { data: existing } = await supabaseClient
        .from('player_cards')
        .select('instance_id')
        .eq('player_id', playerId)
        .eq('card_id', 9999);
        
    if (existing && existing.length > 0) {
        return { error: { message: "Soul Card already exists." } };
    }

    // 3. DNA Synthesis (Seed Generation)
    const dobStr = '19781018'; // Using fixed DOB for consistency in this logic version
    const dnaString = `${dobStr}${profile.dna_edu_level}${profile.dna_lang_count}${profile.dna_sport_type}${profile.dna_eve_code}`;
    
    console.log(`DNA Generated: ${dnaString}`);

    // 4. Calculate Power (Collatz Engine)
    const powerScore = calculateCollatzPower(dnaString);
    
    // 5. Execute Minting (Insert)
    const { data, error } = await supabaseClient
        .from('player_cards')
        .insert({
            player_id: playerId,
            card_id: 9999, // Soul Card Master ID
            level: 1,
            power_score: powerScore,
            is_locked: true, // Soulbound: Cannot be traded or burned
            serial_id: dnaString, // Storing the DNA as the serial
            acquired_at: new Date()
        })
        .select()
        .single();

    if (error) return { error };

    // 6. Update Profile (Confirmation)
    await updatePlayerProfile(playerId, { soul_card_serial: dnaString });

    return { data: { power_score: powerScore, dna_string: dnaString }, error: null };
}


// ========================================================
// --- 9. FATE ENGINE (TOMB GENERATION - PURE JS) ---
// ========================================================

/**
 * Assigns a tomb location to the player based on deterministic hashing of their data.
 * Logic: Hash(ID + DOB) -> Hex -> Int -> Location Decision.
 */
export async function assignUserTomb(playerId, dob, gender) {
    console.log("Calculating Destiny...");

    // 1. Check if tomb exists
    const { data: existing } = await supabaseClient
        .from('player_tombs')
        .select('id')
        .eq('player_id', playerId);

    if (existing && existing.length > 0) {
        return { error: { message: "Destiny already assigned." } };
    }

    // 2. Generate Seed & Hash
    const seedString = `${playerId}-${dob}-${gender}`;
    const rootId = generateFateHash(seedString);

    // 3. Logic Decision (Last 3 chars of hash)
    const decisionValue = parseInt(rootId.slice(-3), 16); 
    
    let locationType = 'Superstructure (Pyramid)';
    // Thresholds: 0x555 (1365) and 0xAAA (2730) out of 0xFFF (4095)
    if (decisionValue < 1365) {
        locationType = 'Rock-Cut Tomb (Mountain)';
    } else if (decisionValue < 2730) {
        locationType = 'Hidden Shaft (Valley)';
    }

    // 4. Save to DB
    const { data, error } = await supabaseClient
        .from('player_tombs')
        .insert({
            player_id: playerId,
            root_id: rootId,
            location_type: locationType
        })
        .select()
        .single();

    if (error) return { error };

    return { data, error: null };
}


// ========================================================
// --- 10. MARKET & SWAP (P2P LOGIC - PURE JS) ---
// ========================================================

export async function createSwapRequest(playerId, offeredInstanceId, offerCardId, requestCardId, priceNoub = 0) {
    // 1. Lock Card
    const { error: lockError } = await supabaseClient
        .from('player_cards')
        .update({ is_locked: true })
        .eq('instance_id', offeredInstanceId);

    if (lockError) return { error: { message: "Failed to lock card." } };

    // 2. Create Offer
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
        // Rollback Lock if insert fails
        await supabaseClient.from('player_cards').update({ is_locked: false }).eq('instance_id', offeredInstanceId);
        return { error: insertError };
    }

    return { error: null };
}

export async function acceptSwapRequest(requestId, playerReceivingId, counterOfferInstanceId) {
    console.log("Executing Swap Transaction...");

    // 1. Fetch Request
    const { data: request, error: reqError } = await supabaseClient
        .from('swap_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (reqError || !request || request.status !== 'active') {
        return { error: { message: "Offer unavailable or already closed." } };
    }

    const playerOfferingId = request.player_id_offering;
    const offeredCardInstanceId = request.card_instance_id_offer;

    // 2. Transfer Offered Card -> Receiver
    const { error: err1 } = await supabaseClient
        .from('player_cards')
        .update({ player_id: playerReceivingId, is_locked: false, acquired_at: new Date() })
        .eq('instance_id', offeredCardInstanceId);

    if (err1) return { error: { message: "Transfer 1 failed. Aborted." } };

    // 3. Transfer Counter Card -> Offerer
    const { error: err2 } = await supabaseClient
        .from('player_cards')
        .update({ player_id: playerOfferingId, is_locked: false, acquired_at: new Date() })
        .eq('instance_id', counterOfferInstanceId);

    if (err2) {
        console.error("CRITICAL: Transfer 2 Failed", err2);
        // In a pure JS client environment, rollback is hard. We log error.
        return { error: { message: "Transfer 2 error. Contact support." } };
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

    // Get New Card Name for UI
    const { data: cardInfo } = await supabaseClient.from('cards').select('name').eq('id', request.item_id_offer).single();

    return { error: null, newCardName: cardInfo?.name || "New Card" };
}

export async function fetchActiveSwapRequests(playerId) {
    return await supabaseClient
        .from('swap_requests')
        .select('*, offer_card:item_id_offer(name, image_url, rarity_level), request_card:item_id_request(name, image_url, rarity_level)')
        .eq('status', 'active')
        .neq('player_id_offering', playerId);
}

export async function fetchMySwapRequests(playerId) {
    return await supabaseClient
        .from('swap_requests')
        .select('*, offer_card:item_id_offer(name, image_url, rarity_level), request_card:item_id_request(name, image_url, rarity_level)')
        .eq('status', 'active')
        .eq('player_id_offering', playerId);
}

export async function cancelSwapRequest(requestId, playerOfferingId, offeredInstanceId) {
    // Unlock
    const { error: unlockError } = await supabaseClient
        .from('player_cards')
        .update({ is_locked: false })
        .eq('instance_id', offeredInstanceId);
    if (unlockError) return { error: unlockError };

    // Cancel
    return await supabaseClient.from('swap_requests').update({ status: 'cancelled' }).eq('id', requestId);
}
