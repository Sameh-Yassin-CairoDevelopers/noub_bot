/*
 * Filename: js/screens/collection.js
 * Version: NOUB v1.9.0 (Final Card Status Visual & Logic)
 * Description: Implements the final visual and functional logic for card states
 * based on the Executive Specification (Expert/Burn Lock).
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerHaptic, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const collectionContainer = document.getElementById('collection-container');

// --- Comprehensive Card Rewards Dictionary (Unchanged) ---
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
    10: { type: 'RESOURCE_PACK', payload: [{ item_id: 1, quantity: 50 }] },
    11: { type: 'RESOURCE_PACK', payload: [{ item_id: 2, quantity: 75 }] },
    12: { type: 'RESOURCE_PACK', payload: [{ item_id: 3, quantity: 100 }] },
    13: { type: 'RESOURCE_PACK', payload: [{ item_id: 11, quantity: 20 }] },
    14: { type: 'RESOURCE_PACK', payload: [{ item_id: 12, quantity: 25 }] },
    15: { type: 'RESOURCE_PACK', payload: [{ item_id: 13, quantity: 30 }] },
    16: { type: 'RESOURCE_PACK', payload: [{ item_id: 25, quantity: 10 }] },
    17: { type: 'RESOURCE_PACK', payload: [{ item_id: 26, quantity: 5 }] },
    18: { type: 'RESOURCE_PACK', payload: [{ item_id: 40, quantity: 2 }, { item_id: 45, quantity: 1 }] },
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
    Object.keys(rewardObject).forEach(key => rewardString += `${rewardObject[key]}${key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥'} `);
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

async function handleUpgrade(playerCard, requirements) {
    showToast('Upgrading card...', 'info');
    const currencyCosts = { noub: requirements.cost_noub, prestige: requirements.cost_prestige, ankh: requirements.cost_ankh };
    const itemCost = requirements.cost_item_id ? { id: requirements.cost_item_id, qty: requirements.cost_item_qty, name: requirements.items?.name } : null;
    const { error: costError } = await api.transactUpgradeCosts(state.currentUser.id, currencyCosts, itemCost);
    if (costError) {
        return showToast(`Upgrade failed: ${costError.message}`, 'error');
    }
    const newLevel = playerCard.level + 1;
    const newPowerScore = playerCard.power_score + requirements.power_increase;
    const { error: upgradeError } = await api.performCardUpgrade(playerCard.instance_id, newLevel, newPowerScore);
    if (upgradeError) {
        return showToast('Failed to update card level.', 'error');
    }

    const { leveledUp, newLevel: playerNewLevel } = await api.addXp(state.currentUser.id, 20);
    if (leveledUp) {
        showToast(`LEVEL UP! You have reached Level ${playerNewLevel}!`, 'success');
    }

    playSound('reward_grand');
    triggerNotificationHaptic('success');
    showToast(`${playerCard.cards.name} has been upgraded to Level ${newLevel}!`, 'success');
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderCollection();
}

async function showUpgradeDetails(playerCard) {
    const detailsContainer = document.getElementById('card-interaction-details');
    detailsContainer.innerHTML = `<p>Fetching upgrade requirements...</p>`;
    const nextLevel = playerCard.level + 1;
    
    document.getElementById('card-upgrade-btn').disabled = true;
    document.getElementById('card-burn-btn').disabled = true;

    const { data: requirements, error } = await api.fetchCardUpgradeRequirements(playerCard.card_id, nextLevel);
    
    document.getElementById('card-upgrade-btn').disabled = false;
    document.getElementById('card-burn-btn').disabled = false;

    if (error || !requirements) {
        detailsContainer.innerHTML = `
            <div style="background: #2a2a2e; padding: 10px; border-radius: 6px; text-align: center;">
                <p style="color: var(--primary-accent); font-weight: bold; margin: 0;">This card has reached its maximum level.</p>
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
            <h4>Upgrade to Level ${nextLevel}</h4>
            <p><strong>Costs:</strong> ${costsText.join(', ')}</p>
            <p><strong>Power Increase:</strong> +${requirements.power_increase}</p>
            <button id="confirm-upgrade-btn" class="action-button">Confirm Upgrade</button>
        </div>
    `;
    detailsContainer.querySelector('#confirm-upgrade-btn').onclick = () => handleUpgrade(playerCard, requirements);
}

/**
 * Displays the burn/sacrifice confirmation details.
 * @param {object} playerCard - The specific instance of the player's card.
 * @param {object} burnInfo - The reward information for this card type.
 * @param {string} actionType - The display name of the action ('Burn' or 'Sacrifice').
 * @param {Set<string>} assignedCardInstanceIds - A set of instance IDs for all assigned experts.
 */
function showBurnDetails(playerCard, burnInfo, actionType, assignedCardInstanceIds) {
    const detailsContainer = document.getElementById('card-interaction-details');

    // --- Safeguard Logic ---
    if (assignedCardInstanceIds.has(playerCard.instance_id)) {
        detailsContainer.innerHTML = `
            <div style="background: #2a2a2e; padding: 10px; border-radius: 6px; text-align: center;">
                <p style="color: var(--danger-color); font-weight: bold; margin: 0;">This expert is assigned to a factory and cannot be burned. Please unassign it first.</p>
            </div>`;
        document.getElementById('card-burn-btn').disabled = true;
        return;
    }
    // --- End Safeguard ---

    let confirmationText = '';
    switch (burnInfo.type) {
        case 'CURRENCY':
            const currencies = Object.entries(burnInfo.payload).map(([key, value]) => `${value} ${key}`).join(', ');
            confirmationText = `You will receive: ${currencies}.`;
            break;
        case 'RESOURCE_PACK':
            confirmationText = `You will receive a pack of valuable resources.`;
            break;
        case 'SACRIFICE':
            confirmationText = `You will ${burnInfo.text}. This action is irreversible.`;
            break;
    }
    detailsContainer.innerHTML = `
        <div style="background: #2a2a2e; padding: 10px; border-radius: 6px;">
            <h4>Confirm ${actionType}</h4>
            <p>${confirmationText}</p>
            <button id="confirm-burn-btn" class="action-button danger">Yes, ${actionType} it!</button>
        </div>
    `;
    document.getElementById('card-burn-btn').disabled = false; 
    detailsContainer.querySelector('#confirm-burn-btn').onclick = () => handleBurnOrSacrifice(playerCard, burnInfo);
}

async function handleBurnOrSacrifice(playerCard, burnInfo) {
    showToast(`${burnInfo.type === 'SACRIFICE' ? 'Sacrificing' : 'Burning'} card...`, 'info');
    const { error: deleteError } = await api.deleteCardInstance(playerCard.instance_id);
    if (deleteError) {
        return showToast('Error removing card!', 'error');
    }
    
    let success = false;
    switch (burnInfo.type) {
        case 'CURRENCY':
            success = await grantReward(burnInfo.payload);
            break;
        case 'RESOURCE_PACK':
            success = await grantReward({ noub: 500 });
            showToast("Resource Pack received!", "success");
            break;
        case 'SACRIFICE':
            success = await grantReward({ prestige: 100 });
            showToast("Sacrifice successful! Your reward has been granted.", "success");
            break;
    }

    if (success) {
        const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 5);
        if (leveledUp) {
            showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
        }

        playSound('claim_reward');
        triggerHaptic('medium');
        await refreshPlayerState();
        window.closeModal('card-interaction-modal');
        renderCollection();
    }
}

/**
 * Opens the main interaction modal for a selected card.
 * @param {object} playerCard - The specific instance of the player's card.
 * @param {Set<string>} assignedCardInstanceIds - A set of instance IDs for all assigned experts.
 */
async function openCardInteractionModal(playerCard, assignedCardInstanceIds) {
    const modal = document.getElementById('card-interaction-modal');
    const masterCard = playerCard.cards;
    const burnInfo = CARD_BURN_REWARDS[masterCard.id];
    const actionType = burnInfo.type === 'SACRIFICE' ? 'Sacrifice' : 'Burn';
    
    // Check max level and assignment status before rendering
    const isMaxLevel = playerCard.level >= 5;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <div class="card-display" style="text-align: center; margin-bottom: 20px;">
                <img src="${masterCard.image_url}" alt="${masterCard.name}" style="width: 150px; height: 150px; border-radius: 10px; border: 2px solid var(--primary-accent);">
                <h3>${masterCard.name}</h3>
                <p>Level: ${playerCard.level} | Power: ${playerCard.power_score}</p>
            </div>
            <div class="action-buttons" style="display: flex; flex-direction: column; gap: 10px;">
                <button id="card-upgrade-btn" class="action-button" ${isMaxLevel ? 'disabled' : ''}>${isMaxLevel ? 'Max Level' : 'Upgrade'}</button>
                <button id="card-burn-btn" class="action-button danger">${actionType}</button>
            </div>
            <div id="card-interaction-details" style="margin-top: 20px;"></div>
        </div>
    `;

    const upgradeBtn = modal.querySelector('#card-upgrade-btn');
    if (!isMaxLevel) {
        upgradeBtn.onclick = () => showUpgradeDetails(playerCard);
    }
    
    // Pass the logic to showBurnDetails for the final check before confirmation
    modal.querySelector('#card-burn-btn').onclick = () => showBurnDetails(playerCard, burnInfo, actionType, assignedCardInstanceIds);
    openModal('card-interaction-modal');
}

/**
 * Main render function for the "My Cards" screen.
 * FIXED: Applies the 'assigned-expert' class to the card if ANY instance is assigned.
 */
export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading your collection...';

    const [{ data: playerCards, error: cardsError }, { data: playerFactories, error: factoriesError }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    if (cardsError || factoriesError) {
        return collectionContainer.innerHTML = '<p class="error-message">Error fetching collection data.</p>';
    }
    if (!playerCards || playerCards.length === 0) {
        return collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
    }

    // --- Create a set of assigned expert IDs for quick lookup ---
    const assignedCardInstanceIds = new Set(
        playerFactories
            .map(f => f.assigned_card_instance_id)
            .filter(id => id !== null)
    );
    // --- END NEW ---

    collectionContainer.innerHTML = '';
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
    const sortedCards = Array.from(cardMap.values()).sort((a, b) => a.master.id - b.master.id);
    
    sortedCards.forEach(cardData => {
        const masterCard = cardData.master;
        const instances = cardData.instances;
        // The instance we show in the collection grid (usually the highest level one)
        const displayInstance = instances.reduce((max, current) => (current.level > max.level ? current : max), instances[0]);
        
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', masterCard.rarity_level || 0);
        
        // --- FIXED LOGIC: Check if ANY instance of this CARD TYPE is assigned ---
        const isAnyInstanceAssigned = instances.some(inst => assignedCardInstanceIds.has(inst.instance_id));
        
        if (isAnyInstanceAssigned) {
             // Apply the CSS class to the visual representation
             cardElement.classList.add('assigned-expert'); 
        }
        // --- END FIXED LOGIC ---

        cardElement.innerHTML = `
            <img src="${masterCard.image_url || 'images/default_card.png'}" alt="${masterCard.name}" class="card-image">
            <h4>${masterCard.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${displayInstance.level}</span>
                <span class="card-count">x${instances.length}</span>
            </div>
        `;
        cardElement.onclick = () => {
            playSound('click');
            // Pass the set of assigned IDs to the modal function
            openCardInteractionModal(displayInstance, assignedCardInstanceIds);
        };
        collectionContainer.appendChild(cardElement);
    });
}
