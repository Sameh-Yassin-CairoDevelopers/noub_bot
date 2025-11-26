/*
 * Filename: js/screens/collection.js
 * Version: NOUB v2.4.0 (Final Release Candidate)
 * Description: 
 * This module manages the visualization and interaction logic for the player's NFT/Card collection.
 * It handles data aggregation, state derivation (Locked/Assigned), and the rendering of 
 * both standard gameplay cards and the unique "Soul Card".
 * 
 * Architecture:
 * - Uses Client-Side Aggregation to group card instances.
 * - Implements Atomic Transactions via API calls for Upgrades and Burns.
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerHaptic, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Reference
const collectionContainer = document.getElementById('collection-container');

// --- CONFIGURATION: Burn Rewards Table ---
// Defines the deterministic rewards for sacrificing cards based on Card ID.
const CARD_BURN_REWARDS = {
    1: { type: 'CURRENCY', payload: { noub: 50, prestige: 1 } },
    2: { type: 'CURRENCY', payload: { noub: 75, prestige: 2 } },
    3: { type: 'CURRENCY', payload: { noub: 100, prestige: 3 } },
    4: { type: 'CURRENCY', payload: { noub: 250, prestige: 5 } },
    5: { type: 'CURRENCY', payload: { noub: 500, prestige: 8 } },
    6: { type: 'CURRENCY', payload: { noub: 1000, prestige: 12 } },
    7: { type: 'CURRENCY', payload: { noub: 2000, prestige: 20 } },
    8: { type: 'CURRENCY', payload: { noub: 3500, prestige: 35 } },
    9: { type: 'CURRENCY', payload: { noub: 5000, prestige: 50, ankh: 5 } },
    // ... Resource Packs
    10: { type: 'RESOURCE_PACK', payload: [{ item_id: 1, quantity: 50 }] },
    11: { type: 'RESOURCE_PACK', payload: [{ item_id: 2, quantity: 75 }] },
    12: { type: 'RESOURCE_PACK', payload: [{ item_id: 3, quantity: 100 }] },
    13: { type: 'RESOURCE_PACK', payload: [{ item_id: 11, quantity: 20 }] },
    14: { type: 'RESOURCE_PACK', payload: [{ item_id: 12, quantity: 25 }] },
    15: { type: 'RESOURCE_PACK', payload: [{ item_id: 13, quantity: 30 }] },
    16: { type: 'RESOURCE_PACK', payload: [{ item_id: 25, quantity: 10 }] },
    17: { type: 'RESOURCE_PACK', payload: [{ item_id: 26, quantity: 5 }] },
    18: { type: 'RESOURCE_PACK', payload: [{ item_id: 40, quantity: 2 }, { item_id: 45, quantity: 1 }] },
    // ... Special Effects
    19: { type: 'SACRIFICE', action: 'INSTANT_CONTRACT', value: 1, text: "instantly complete one of your active contracts" },
    20: { type: 'SACRIFICE', action: 'PRESTIGE_BOOST', value: 100, text: "gain 100 Prestige" },
    21: { type: 'SACRIFICE', action: 'TICKET_BOOST', value: 20, text: "gain 20 Spin Tickets" },
    22: { type: 'SACRIFICE', action: 'ANKH_BOOST', value: 10, text: "gain 10 Ankh Premium" },
    23: { type: 'SACRIFICE', action: 'INSTANT_PROD', value: 3, text: "instantly finish production on 3 random factories" },
    24: { type: 'SACRIFICE', action: 'GRAND_REWARD_PACK', value: 1, text: "receive a Grand Reward Pack" },
    25: { type: 'SACRIFICE', action: 'FINISH_GREAT_PROJECT', value: 1, text: "instantly complete one active Great Project" },
    26: { type: 'SACRIFICE', action: 'OPEN_SARCOPHAGUS', value: 1, text: "open a free Sarcophagus Crate" },
    27: { type: 'SACRIFICE', action: 'RESET_CONTRACTS', value: 1, text: "instantly refresh your available contracts" },
};

// --------------------------------------------------------
// --- HELPER LOGIC: Transactions & State Mutations ---
// --------------------------------------------------------

/**
 * Grants rewards to the player profile directly.
 * Used for Burn/Sacrifice outcomes.
 */
async function grantReward(rewardObject, isGrand = false) {
    const profileUpdate = {};
    let rewardString = '';
    if (rewardObject.noub) profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + rewardObject.noub;
    if (rewardObject.prestige) profileUpdate.prestige = (state.playerProfile.prestige || 0) + rewardObject.prestige;
    if (rewardObject.tickets) profileUpdate.spin_tickets = (state.playerProfile.spin_tickets || 0) + rewardObject.tickets;
    if (rewardObject.ankh) profileUpdate.ankh_premium = (state.playerProfile.ankh_premium || 0) + rewardObject.ankh;
    
    if (Object.keys(profileUpdate).length === 0) return true;
    
    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (error) {
        showToast("Error granting reward!", 'error');
        playSound('error');
        triggerNotificationHaptic('error');
        return false;
    }
    
    Object.keys(rewardObject).forEach(key => {
        const icon = key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥';
        rewardString += `${rewardObject[key]}${icon} `;
    });
    
    showToast(`Reward Claimed: +${rewardString}`, 'success');
    
    if (isGrand) {
        playSound('reward_grand');
        triggerNotificationHaptic('success');
    } else {
        playSound('claim_reward');
        triggerHaptic('medium');
    }
    return true;
}

/**
 * Handles the Card Upgrade Process.
 * Validates costs, executes the transaction, and updates the card stats.
 */
async function handleUpgrade(playerCard, requirements) {
    showToast('Upgrading card...', 'info');
    
    const currencyCosts = { 
        noub: requirements.cost_noub, 
        prestige: requirements.cost_prestige, 
        ankh: requirements.cost_ankh 
    };
    const itemCost = requirements.cost_item_id ? { 
        id: requirements.cost_item_id, 
        qty: requirements.cost_item_qty, 
        name: requirements.items?.name 
    } : null;

    // 1. Process Payment
    const { error: costError } = await api.transactUpgradeCosts(state.currentUser.id, currencyCosts, itemCost);
    if (costError) {
        return showToast(`Upgrade failed: ${costError.message}`, 'error');
    }
    
    // 2. Update Card Stats
    const newLevel = playerCard.level + 1;
    const newPowerScore = playerCard.power_score + requirements.power_increase;
    const { error: upgradeError } = await api.performCardUpgrade(playerCard.instance_id, newLevel, newPowerScore);
    if (upgradeError) {
        return showToast('Failed to update card level.', 'error');
    }

    // 3. Grant XP
    const { leveledUp, newLevel: playerNewLevel } = await api.addXp(state.currentUser.id, 20);
    if (leveledUp) {
        showToast(`LEVEL UP! You have reached Level ${playerNewLevel}!`, 'success');
    }

    // 4. Success Feedback
    playSound('reward_grand');
    triggerNotificationHaptic('success');
    showToast(`${playerCard.cards.name} has been upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderCollection();
}

// --------------------------------------------------------
// --- MODAL RENDERERS: Upgrade & Burn Details ---
// --------------------------------------------------------

async function showUpgradeDetails(playerCard) {
    const detailsContainer = document.getElementById('card-interaction-details');
    detailsContainer.innerHTML = `<div class="loading-spinner small"></div>`;
    const nextLevel = playerCard.level + 1;
    
    document.getElementById('card-upgrade-btn').disabled = true;
    document.getElementById('card-burn-btn').disabled = true;

    const { data: requirements, error } = await api.fetchCardUpgradeRequirements(playerCard.card_id, nextLevel);
    
    // Re-enable buttons
    document.getElementById('card-upgrade-btn').disabled = false;
    document.getElementById('card-burn-btn').disabled = false;

    if (error || !requirements) {
        detailsContainer.innerHTML = `
            <div style="background: #2a2a2e; padding: 10px; border-radius: 6px; text-align: center;">
                <p style="color: var(--primary-accent); font-weight: bold; margin: 0;">MAXIMUM LEVEL REACHED</p>
            </div>`;
        document.getElementById('card-upgrade-btn').disabled = true;
        return;
    }

    let costsText = [];
    if (requirements.cost_noub > 0) costsText.push(`${requirements.cost_noub} 🪙`);
    if (requirements.cost_prestige > 0) costsText.push(`${requirements.cost_prestige} 🐞`);
    if (requirements.cost_ankh > 0) costsText.push(`${requirements.cost_ankh} ☥`);
    if (requirements.cost_item_id) {
        const itemName = requirements.items?.name || `Item #${requirements.cost_item_id}`;
        costsText.push(`${requirements.cost_item_qty} x ${itemName}`);
    }

    detailsContainer.innerHTML = `
        <div style="background: #2a2a2e; padding: 10px; border-radius: 6px;">
            <h4 style="color:var(--accent-blue);">Upgrade to Level ${nextLevel}</h4>
            <p><strong>Required:</strong> ${costsText.join(', ')}</p>
            <p><strong>Effect:</strong> Power +${requirements.power_increase}</p>
            <button id="confirm-upgrade-btn" class="action-button small" style="margin-top:10px;">Confirm Upgrade</button>
        </div>
    `;
    detailsContainer.querySelector('#confirm-upgrade-btn').onclick = () => handleUpgrade(playerCard, requirements);
}

function showBurnDetails(playerCard, burnInfo, actionType, assignedCardInstanceIds) {
    const detailsContainer = document.getElementById('card-interaction-details');

    // --- Safeguard Logic: Prevent burning active cards ---
    if (assignedCardInstanceIds.has(playerCard.instance_id)) {
        detailsContainer.innerHTML = `
            <div style="background: #3a1111; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid red;">
                <p style="color: #ff5555; font-weight: bold; margin: 0;">
                    ⛔ Active Duty<br>
                    <span style="font-size:0.8em; color:#ccc;">This Expert is assigned to a factory. Unassign them first.</span>
                </p>
            </div>`;
        document.getElementById('card-burn-btn').disabled = true;
        return;
    }
    
    // Prevent burning locked cards (e.g. in Swap offers)
    if (playerCard.is_locked) {
        detailsContainer.innerHTML = `
            <div style="background: #3a1111; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid red;">
                 <p style="color: #ff5555; font-weight: bold; margin: 0;">
                    🔒 Locked<br>
                    <span style="font-size:0.8em; color:#ccc;">This card is currently locked (e.g., in a Trade Offer).</span>
                </p>
            </div>`;
        document.getElementById('card-burn-btn').disabled = true;
        return;
    }

    let confirmationText = '';
    switch (burnInfo.type) {
        case 'CURRENCY':
            const currencies = Object.entries(burnInfo.payload).map(([key, value]) => `${value} ${key}`).join(', ');
            confirmationText = `You will receive: ${currencies}.`;
            break;
        case 'RESOURCE_PACK':
            confirmationText = `You will receive a Resource Pack.`;
            break;
        case 'SACRIFICE':
            confirmationText = `Effect: ${burnInfo.text}. (Irreversible)`;
            break;
    }
    
    detailsContainer.innerHTML = `
        <div style="background: #2a2a2e; padding: 10px; border-radius: 6px; border: 1px solid var(--danger-color);">
            <h4 style="color:var(--danger-color);">Confirm ${actionType}</h4>
            <p>${confirmationText}</p>
            <button id="confirm-burn-btn" class="action-button danger small">Proceed</button>
        </div>
    `;
    document.getElementById('card-burn-btn').disabled = false; 
    detailsContainer.querySelector('#confirm-burn-btn').onclick = () => handleBurnOrSacrifice(playerCard, burnInfo);
}

async function handleBurnOrSacrifice(playerCard, burnInfo) {
    showToast(`Processing...`, 'info');
    
    // 1. Delete Card
    const { error: deleteError } = await api.deleteCardInstance(playerCard.instance_id);
    if (deleteError) {
        return showToast('Error processing request.', 'error');
    }
    
    // 2. Grant Rewards
    let success = false;
    switch (burnInfo.type) {
        case 'CURRENCY':
            success = await grantReward(burnInfo.payload);
            break;
        case 'RESOURCE_PACK':
            success = await grantReward({ noub: 500 }); // Fallback logic for pack
            showToast("Resources added to inventory.", "success");
            break;
        case 'SACRIFICE':
            success = await grantReward({ prestige: 100 }); // Generic sacrifice reward
            showToast("Sacrifice Accepted.", "success");
            break;
    }

    if (success) {
        const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 5);
        if (leveledUp) showToast(`LEVEL UP! Level ${newLevel}!`, 'success');

        playSound('claim_reward');
        triggerHaptic('medium');
        await refreshPlayerState();
        window.closeModal('card-interaction-modal');
        renderCollection();
    }
}

async function openCardInteractionModal(playerCard, assignedCardInstanceIds) {
    const modal = document.getElementById('card-interaction-modal');
    const masterCard = playerCard.cards;
    
    // Special Handling for Soul Card (ID 9999)
    if (masterCard.id === 9999 || masterCard.id == '9999') {
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center; border: 2px solid gold;">
                <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
                <h3 style="color: gold; margin-bottom:10px;">The Soul Mirror</h3>
                <img src="${masterCard.image_url}" style="width: 150px; border-radius: 50%; box-shadow: 0 0 20px gold; margin-bottom:15px;">
                <p style="color: #ccc;">"A reflection of the bearer's true essence."</p>
                <div style="margin: 15px 0; font-family: monospace; color: cyan;">
                    DNA Sequence: ${state.playerProfile.dna_eve_code || 'UNKNOWN'}
                </div>
                <p style="font-size: 0.8em; color: #888;">This card cannot be burned or traded. It is part of you.</p>
            </div>
        `;
        openModal('card-interaction-modal');
        return;
    }

    // Standard Card Modal
    const burnInfo = CARD_BURN_REWARDS[masterCard.id] || CARD_BURN_REWARDS[1]; // Fallback
    const actionType = burnInfo.type === 'SACRIFICE' ? 'Sacrifice' : 'Burn';
    const isMaxLevel = playerCard.level >= 5;
    
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <div class="card-display" style="text-align: center; margin-bottom: 20px;">
                <img src="${masterCard.image_url}" alt="${masterCard.name}" style="width: 120px; height: 120px; border-radius: 8px; border: 2px solid var(--primary-accent);">
                <h3 style="margin: 10px 0 5px 0;">${masterCard.name}</h3>
                <div style="display:flex; justify-content:center; gap:15px; font-size:0.9em; color:#aaa;">
                    <span>Level: <b style="color:#fff;">${playerCard.level}</b></span>
                    <span>Power: <b style="color:#fff;">${playerCard.power_score}</b></span>
                </div>
            </div>
            
            <div class="action-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button id="card-upgrade-btn" class="action-button small" ${isMaxLevel ? 'disabled' : ''}>
                    ${isMaxLevel ? 'Max Lvl' : 'Upgrade'}
                </button>
                <button id="card-burn-btn" class="action-button danger small">
                    ${actionType}
                </button>
            </div>
            <div id="card-interaction-details" style="margin-top: 15px;"></div>
        </div>
    `;

    const upgradeBtn = modal.querySelector('#card-upgrade-btn');
    if (!isMaxLevel) {
        upgradeBtn.onclick = () => showUpgradeDetails(playerCard);
    }
    modal.querySelector('#card-burn-btn').onclick = () => showBurnDetails(playerCard, burnInfo, actionType, assignedCardInstanceIds);
    openModal('card-interaction-modal');
}


// --------------------------------------------------------
// --- MAIN RENDER LOGIC (The Requested Function) ---
// --------------------------------------------------------

/**
 * Main Rendering Function for the "My Cards" Screen.
 * 
 * Logic Flow:
 * 1. Concurrent Data Fetching: Gets Cards & Factories to minimize latency.
 * 2. Assignment Mapping: Creates a Set of assigned IDs for O(1) checking.
 * 3. Aggregation: Groups card instances by Type (Master ID).
 * 4. Sorting: Puts Soul Card first, then sorts by ID.
 * 5. DOM Construction: Builds the grid with visual indicators for status.
 */
export async function renderCollection() {
    if (!state.currentUser) return;
    
    collectionContainer.innerHTML = '<div class="loading-spinner">Loading collection...</div>';

    // 1. Parallel API Calls
    const [{ data: playerCards, error: cardsError }, { data: playerFactories, error: factoriesError }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    // 2. Error & Empty State Handling
    if (cardsError || factoriesError) {
        console.error("Data Error:", cardsError, factoriesError);
        return collectionContainer.innerHTML = '<p class="error-message">Could not retrieve collection.</p>';
    }
    if (!playerCards || playerCards.length === 0) {
        return collectionContainer.innerHTML = '<div class="empty-state"><p>Your collection is empty.</p><p>Visit the Shop to acquire your first cards.</p></div>';
    }

    // 3. Assignment State derivation (O(1) Lookup Set)
    const assignedCardInstanceIds = new Set(
        playerFactories
            .map(f => f.assigned_card_instance_id)
            .filter(id => id !== null)
    );

    // 4. Grouping Logic (Flat Array -> Map)
    const cardMap = new Map();
    playerCards.forEach(pc => {
        if (!cardMap.has(pc.card_id)) {
            cardMap.set(pc.card_id, {
                master: pc.cards,
                instances: []
            });
        }
        cardMap.get(pc.card_id).instances.push(pc);
    });

    // 5. Sorting Logic (Soul Card Priority)
    const sortedCards = Array.from(cardMap.values()).sort((a, b) => {
        if (a.master.id == 9999) return -1; // Top Priority
        if (b.master.id == 9999) return 1;
        return a.master.id - b.master.id;   // Ascending Order
    });
    
    // 6. Rendering
    collectionContainer.innerHTML = '';
    
    sortedCards.forEach(cardData => {
        const masterCard = cardData.master;
        const instances = cardData.instances;
        
        // Representative Instance (Highest Level)
        const displayInstance = instances.reduce((max, current) => (current.level > max.level ? current : max), instances[0]);
        
        // Check Global Assignment Status for this Card Type
        // Note: Checks if ANY instance of this type is assigned.
        const isAnyInstanceAssigned = instances.some(inst => assignedCardInstanceIds.has(inst.instance_id));
        
        const cardElement = document.createElement('div');
        
        if (masterCard.id == 9999) {
            // --- Soul Card Special Render ---
            cardElement.className = `card-stack soul-card`;
            const dnaDisplay = state.playerProfile.dna_eve_code || 'GENESIS';
            
            cardElement.innerHTML = `
                <div class="soul-glow"></div>
                <img src="${masterCard.image_url}" alt="Soul Mirror" class="card-image">
                <h4 style="color: var(--primary-accent); text-shadow: 0 0 5px gold;">${masterCard.name}</h4>
                <div class="card-details">
                    <span class="card-level" style="color: cyan;">Power: ${displayInstance.power_score}</span>
                </div>
                <div style="font-size: 0.55em; color: #888; margin-top: 4px; font-family: monospace;">
                    DNA: ${dnaDisplay}
                </div>
            `;
        } else {
            // --- Standard Card Render ---
            cardElement.className = `card-stack`;
            cardElement.setAttribute('data-rarity', masterCard.rarity_level || 0);
            
            // Apply visual marker if Assigned
            if (isAnyInstanceAssigned) {
                 cardElement.classList.add('assigned-expert'); 
            }
            
            cardElement.innerHTML = `
                <img src="${masterCard.image_url || 'images/default_card.png'}" alt="${masterCard.name}" class="card-image">
                <h4>${masterCard.name}</h4>
                <div class="card-details">
                    <span class="card-level">LVL ${displayInstance.level}</span>
                    <span class="card-count">x${instances.length}</span>
                </div>
            `;
        }

        // Click Interaction
        cardElement.onclick = () => {
            playSound('click');
            // Pass the assigned set for detailed handling in modal
            openCardInteractionModal(displayInstance, assignedCardInstanceIds);
        };
        
        collectionContainer.appendChild(cardElement);
    });
}

// Expose globally for external calls (if necessary)
window.openCardInteractionModal = openCardInteractionModal;
