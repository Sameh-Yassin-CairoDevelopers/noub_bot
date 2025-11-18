/*
 * Filename: js/screens/collection.js
 * Version: NOUB v1.5.1 (Final Polish & XP Integration)
 * Description: Final version of the card interaction hub. This version integrates
 * the XP system by granting XP on upgrades and burns. It also adds critical UI/UX
 * improvements: hiding the upgrade button at max level and preventing the burn of
 * an assigned expert card.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerHaptic, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const collectionContainer = document.getElementById('collection-container');

// --- XP Grant Constants ---
const XP_FOR_UPGRADE = 50;
const XP_FOR_BURN = 5;

// --- Comprehensive Card Rewards Dictionary ---
const CARD_BURN_REWARDS = {
    // Album 1: "The Sacred Ennead" (IDs 1-9) - Focus: Economy & Currency
    1: { type: 'CURRENCY', payload: { noub: 50, prestige: 1 } },
    2: { type: 'CURRENCY', payload: { noub: 75, prestige: 2 } },
    3: { type: 'CURRENCY', payload: { noub: 100, prestige: 3 } },
    4: { type: 'CURRENCY', payload: { noub: 250, prestige: 5 } },
    5: { type: 'CURRENCY', payload: { noub: 500, prestige: 8 } },
    6: { type: 'CURRENCY', payload: { noub: 1000, prestige: 12 } },
    7: { type: 'CURRENCY', payload: { noub: 2000, prestige: 20 } },
    8: { type: 'CURRENCY', payload: { noub: 3500, prestige: 35 } },
    9: { type: 'CURRENCY', payload: { noub: 5000, prestige: 50, ankh: 5 } },
    // Album 2: "Pharaonic Rulers" (IDs 10-18) - Focus: Resources & Materials
    10: { type: 'RESOURCE_PACK', payload: [{ item_id: 1, quantity: 50 }] },
    11: { type: 'RESOURCE_PACK', payload: [{ item_id: 2, quantity: 75 }] },
    12: { type: 'RESOURCE_PACK', payload: [{ item_id: 3, quantity: 100 }] },
    13: { type: 'RESOURCE_PACK', payload: [{ item_id: 11, quantity: 20 }] },
    14: { type: 'RESOURCE_PACK', payload: [{ item_id: 12, quantity: 25 }] },
    15: { type: 'RESOURCE_PACK', payload: [{ item_id: 13, quantity: 30 }] },
    16: { type: 'RESOURCE_PACK', payload: [{ item_id: 25, quantity: 10 }] },
    17: { type: 'RESOURCE_PACK', payload: [{ item_id: 26, quantity: 5 }] },
    18: { type: 'RESOURCE_PACK', payload: [{ item_id: 40, quantity: 2 }, { item_id: 45, quantity: 1 }] },
    // Album 3: "Mythological Creatures" (IDs 19-27) - Focus: Special Sacrifices
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
        showVisualEffect('reward_major');
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

    // Grant XP for the upgrade
    await api.addXp(state.currentUser.id, XP_FOR_UPGRADE);

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
    
    // Hide the upgrade button immediately if the card is already at max level (e.g., 5)
    if (playerCard.level >= 5) {
        detailsContainer.innerHTML = `<p style="color: var(--text-secondary);">This card has reached its maximum level.</p>`;
        document.getElementById('card-upgrade-btn').style.display = 'none';
        return;
    }

    const { data: requirements, error } = await api.fetchCardUpgradeRequirements(playerCard.card_id, nextLevel);
    
    if (error || !requirements) {
        detailsContainer.innerHTML = `<p style="color: var(--text-secondary);">This card has reached its maximum level.</p>`;
        // Also hide the upgrade button if no requirements are found
        document.getElementById('card-upgrade-btn').style.display = 'none';
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

function showBurnDetails(playerCard, burnInfo, actionType) {
    const detailsContainer = document.getElementById('card-interaction-details');

    // Check if the card is assigned as an expert
    const isAssigned = Array.from(state.playerFactories.values()).some(factory => factory.assigned_card_instance_id === playerCard.instance_id);

    if (isAssigned) {
        detailsContainer.innerHTML = `
            <div style="background: #2a2a2e; padding: 10px; border-radius: 6px; text-align: center;">
                <h4 style="color: var(--danger-color);">Action Prohibited</h4>
                <p>This expert is currently assigned to a factory. You must unassign them from the Economy Hub before you can ${actionType.toLowerCase()} this card.</p>
            </div>
        `;
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
    detailsContainer.querySelector('#confirm-burn-btn').onclick = () => handleBurnOrSacrifice(playerCard, burnInfo);
}

async function handleBurnOrSacrifice(playerCard, burnInfo) {
    showToast(`${burnInfo.type === 'SACRIFICE' ? 'Sacrificing' : 'Burning'} card...`, 'info');
    const { error: deleteError } = await api.deleteCardInstance(playerCard.instance_id);
    if (deleteError) {
        return showToast('Error removing card!', 'error');
    }

    // Grant XP for burning/sacrificing
    await api.addXp(state.currentUser.id, XP_FOR_BURN);

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
        playSound('claim_reward');
        triggerHaptic('medium');
        await refreshPlayerState();
        window.closeModal('card-interaction-modal');
        renderCollection();
    }
}

async function openCardInteractionModal(playerCard) {
    const modal = document.getElementById('card-interaction-modal');
    const masterCard = playerCard.cards;
    const burnInfo = CARD_BURN_REWARDS[masterCard.id];
    const actionType = burnInfo.type === 'SACRIFICE' ? 'Sacrifice' : 'Burn';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <div class="card-display" style="text-align: center; margin-bottom: 20px;">
                <img src="${masterCard.image_url}" alt="${masterCard.name}" style="width: 150px; height: 150px; border-radius: 10px; border: 2px solid var(--primary-accent);">
                <h3>${masterCard.name}</h3>
                <p>Level: ${playerCard.level} | Power: ${playerCard.power_score}</p>
            </div>
            <div class="action-buttons" style="display: flex; flex-direction: column; gap: 10px;">
                <button id="card-upgrade-btn" class="action-button">Upgrade</button>
                <button id="card-burn-btn" class="action-button danger">${actionType}</button>
            </div>
            <div id="card-interaction-details" style="margin-top: 20px;"></div>
        </div>
    `;

    modal.querySelector('#card-upgrade-btn').onclick = () => showUpgradeDetails(playerCard);
    modal.querySelector('#card-burn-btn').onclick = () => showBurnDetails(playerCard, burnInfo, actionType);
    openModal('card-interaction-modal');
}

export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading your cards...';
    // We need factory data to check for assigned experts
    await Promise.all([refreshPlayerState(), api.fetchPlayerFactories(state.currentUser.id).then(res => {
        state.playerFactories = new Map(res.data.map(f => [f.id, f]));
    })]);

    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);
    if (error) {
        return collectionContainer.innerHTML = '<p class="error-message">Error fetching cards.</p>';
    }
    if (playerCards.length === 0) {
        return collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
    }
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
        const highestLevelInstance = instances.reduce((max, current) => (current.level > max.level ? current : max), instances[0]);
        const cardElement = document.createElement('div');
        cardElement.className = `card-stack`;
        cardElement.setAttribute('data-rarity', masterCard.rarity_level || 0);
        cardElement.innerHTML = `
            <img src="${masterCard.image_url || 'images/default_card.png'}" alt="${masterCard.name}" class="card-image">
            <h4>${masterCard.name}</h4>
            <div class="card-details">
                <span class="card-level">LVL ${highestLevelInstance.level}</span>
                <span class="card-count">x${instances.length}</span>
            </div>
        `;
        cardElement.onclick = () => {
            playSound('click');
            openCardInteractionModal(highestLevelInstance);
        };
        collectionContainer.appendChild(cardElement);
    });
}
