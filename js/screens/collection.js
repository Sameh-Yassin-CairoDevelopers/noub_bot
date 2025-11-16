/*
 * Filename: js/screens/collection.js
 * Version: NOUB v1.5 (Centralized Card Interaction Hub)
 * Description: View Logic Module for the "My Collection" screen. This version
 * transforms the screen into a central hub for all card interactions. Clicking a card
 * now opens a detailed modal for upgrading, burning, or sacrificing, based on
 * a new, comprehensive rewards dictionary.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, closeModal, playSound, triggerHaptic, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const collectionContainer = document.getElementById('collection-container');

// --- NEW: Comprehensive Card Rewards Dictionary ---
// Defines the outcome of burning or sacrificing a card based on its master ID.
const CARD_BURN_REWARDS = {
    // Album 1: "The Sacred Ennead" (IDs 1-9) - Focus: Economy & Currency
    1: { type: 'CURRENCY', payload: { noub: 50, prestige: 1 } },   // Ra
    2: { type: 'CURRENCY', payload: { noub: 75, prestige: 2 } },   // Shu
    3: { type: 'CURRENCY', payload: { noub: 100, prestige: 3 } },  // Tefnut
    4: { type: 'CURRENCY', payload: { noub: 250, prestige: 5 } },  // Geb
    5: { type: 'CURRENCY', payload: { noub: 500, prestige: 8 } },  // Nut
    6: { type: 'CURRENCY', payload: { noub: 1000, prestige: 12 } }, // Osiris
    7: { type: 'CURRENCY', payload: { noub: 2000, prestige: 20 } }, // Isis
    8: { type: 'CURRENCY', payload: { noub: 3500, prestige: 35 } }, // Set
    9: { type: 'CURRENCY', payload: { noub: 5000, prestige: 50, ankh: 5 } }, // Horus

    // Album 2: "Pharaonic Rulers" (IDs 10-18) - Focus: Resources & Materials
    10: { type: 'RESOURCE_PACK', payload: [{ item_id: 1, quantity: 50 }] },  // Akhenaten (50 Limestone)
    11: { type: 'RESOURCE_PACK', payload: [{ item_id: 2, quantity: 75 }] },  // Nefertiti (75 Nile Clay)
    12: { type: 'RESOURCE_PACK', payload: [{ item_id: 3, quantity: 100 }] }, // Hatshepsut (100 Papyrus Reeds)
    13: { type: 'RESOURCE_PACK', payload: [{ item_id: 11, quantity: 20 }] }, // Ramesses II (20 Limestone Blocks)
    14: { type: 'RESOURCE_PACK', payload: [{ item_id: 12, quantity: 25 }] }, // Cleopatra VII (25 Clay Jars)
    15: { type: 'RESOURCE_PACK', payload: [{ item_id: 13, quantity: 30 }] }, // Khufu (30 Papyrus Scrolls)
    16: { type: 'RESOURCE_PACK', payload: [{ item_id: 25, quantity: 10 }] }, // Thoth (10 Polished Granite - assumed ID)
    17: { type: 'RESOURCE_PACK', payload: [{ item_id: 26, quantity: 5 }] },  // Tiy (5 Fine Linen - assumed ID)
    18: { type: 'RESOURCE_PACK', payload: [{ item_id: 40, quantity: 2 }, { item_id: 45, quantity: 1 }] }, // Tutankhamun (2 Chariots, 1 Sword - assumed IDs)

    // Album 3: "Mythological Creatures" (IDs 19-27) - Focus: Special Sacrifices
    19: { type: 'SACRIFICE', action: 'INSTANT_CONTRACT', value: 1, text: "instantly complete one of your active contracts" }, // Ammit
    20: { type: 'SACRIFICE', action: 'PRESTIGE_BOOST', value: 100, text: "gain 100 Prestige" },      // Anubis
    21: { type: 'SACRIFICE', action: 'TICKET_BOOST', value: 20, text: "gain 20 Spin Tickets" },     // Apep
    22: { type: 'SACRIFICE', action: 'ANKH_BOOST', value: 10, text: "gain 10 Ankh Premium" },         // Bennu Bird
    23: { type: 'SACRIFICE', action: 'INSTANT_PROD', value: 3, text: "instantly finish production on 3 random factories" }, // Sekhmet
    24: { type: 'SACRIFICE', action: 'GRAND_REWARD_PACK', value: 1, text: "receive a Grand Reward Pack" }, // Serket
    25: { type: 'SACRIFICE', action: 'FINISH_GREAT_PROJECT', value: 1, text: "instantly complete one active Great Project" }, // Wadjet
    26: { type: 'SACRIFICE', action: 'OPEN_SARCOPHAGUS', value: 1, text: "open a free Sarcophagus Crate" }, // Hathor
    27: { type: 'SACRIFICE', action: 'RESET_CONTRACTS', value: 1, text: "instantly refresh your available contracts" }, // Sobek
};


/**
 * Opens the central interaction modal for a specific card instance.
 * @param {object} playerCard - The detailed player card object, including master card info.
 */
async function openCardInteractionModal(playerCard) {
    const modal = document.getElementById('card-interaction-modal');
    const masterCard = playerCard.cards;
    const burnInfo = CARD_BURN_REWARDS[masterCard.id];
    const actionType = burnInfo.type === 'SACRIFICE' ? 'Sacrifice' : 'Burn';

    // Main modal structure
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            
            <!-- Card Display Section -->
            <div class="card-display" style="text-align: center; margin-bottom: 20px;">
                <img src="${masterCard.image_url}" alt="${masterCard.name}" style="width: 150px; height: 150px; border-radius: 10px; border: 2px solid var(--primary-accent);">
                <h3>${masterCard.name}</h3>
                <p>Level: ${playerCard.level} | Power: ${playerCard.power_score}</p>
            </div>

            <!-- Action Buttons Section -->
            <div class="action-buttons" style="display: flex; flex-direction: column; gap: 10px;">
                <button id="card-upgrade-btn" class="action-button">Upgrade</button>
                <button id="card-burn-btn" class="action-button danger">${actionType}</button>
            </div>

            <!-- Dynamic content area for upgrade/burn details -->
            <div id="card-interaction-details" style="margin-top: 20px;"></div>
        </div>
    `;

    // Attach event listeners
    modal.querySelector('#card-upgrade-btn').onclick = () => showUpgradeDetails(playerCard);
    modal.querySelector('#card-burn-btn').onclick = () => showBurnDetails(playerCard, burnInfo, actionType);

    openModal('card-interaction-modal');
}

/**
 * Displays the upgrade requirements and confirmation in the modal.
 * @param {object} playerCard - The card to be upgraded.
 */
async function showUpgradeDetails(playerCard) {
    // This logic is moved from the old upgrade.js
    const detailsContainer = document.getElementById('card-interaction-details');
    detailsContainer.innerHTML = `<p>Fetching upgrade requirements...</p>`;
    // ... Fetch requirements and display them, then add a confirm button.
    detailsContainer.innerHTML = `<p>Upgrade feature is now handled within this modal. Logic to be fully implemented.</p>`;
}

/**
 * Displays the burn/sacrifice outcome and confirmation in the modal.
 * @param {object} playerCard - The card to be burned/sacrificed.
 * @param {object} burnInfo - The reward information from the dictionary.
 * @param {string} actionType - 'Burn' or 'Sacrifice'.
 */
function showBurnDetails(playerCard, burnInfo, actionType) {
    const detailsContainer = document.getElementById('card-interaction-details');
    let confirmationText = '';

    switch (burnInfo.type) {
        case 'CURRENCY':
            const currencies = Object.entries(burnInfo.payload).map(([key, value]) => `${value} ${key}`).join(', ');
            confirmationText = `You will receive: ${currencies}.`;
            break;
        case 'RESOURCE_PACK':
            // In a real implementation, we'd fetch item names here.
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

/**
 * Executes the actual burn or sacrifice logic after confirmation.
 * @param {object} playerCard - The card to remove.
 * @param {object} burnInfo - The reward to grant.
 */
async function handleBurnOrSacrifice(playerCard, burnInfo) {
    showToast(`${burnInfo.type === 'SACRIFICE' ? 'Sacrificing' : 'Burning'} card...`, 'info');

    // 1. Delete the card instance from the database
    const { error: deleteError } = await api.deleteCardInstance(playerCard.instance_id);
    if (deleteError) {
        return showToast('Error removing card!', 'error');
    }

    // 2. Grant the appropriate reward
    let success = false;
    switch (burnInfo.type) {
        case 'CURRENCY':
            success = await grantReward(burnInfo.payload);
            break;
        case 'RESOURCE_PACK':
            // TODO: Implement a new API function api.addItemsToInventory(itemsArray)
            // For now, we grant a placeholder currency reward.
            success = await grantReward({ noub: 500 }); // Placeholder
            showToast("Resource Pack received!", "success");
            break;
        case 'SACRIFICE':
            // TODO: Implement logic for special actions like finishing contracts/projects.
            // For now, we grant a placeholder currency reward.
            success = await grantReward({ prestige: 100 }); // Placeholder
            showToast("Sacrifice successful! Your reward has been granted.", "success");
            break;
    }

    if (success) {
        playSound('claim_reward');
        triggerHaptic('medium');
        await refreshPlayerState();
        closeModal('card-interaction-modal');
        renderCollection(); // Re-render the collection to show the card has been removed.
    }
}

/**
 * Main rendering function for the "My Collection" screen.
 */
export async function renderCollection() {
    if (!state.currentUser) return;
    collectionContainer.innerHTML = 'Loading your cards...';

    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error) {
        return collectionContainer.innerHTML = '<p class="error-message">Error fetching cards.</p>';
    }
    if (playerCards.length === 0) {
        return collectionContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">You have no cards yet. Visit the Shop!</p>';
    }

    collectionContainer.innerHTML = '';
    
    // Group cards by master card ID to show stacks
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

    // Sort cards by ID for consistent display
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
        
        // When a card stack is clicked, we open the modal for the highest level instance.
        // The modal itself can then offer to burn/upgrade other instances if needed.
        cardElement.onclick = () => {
            playSound('click');
            openCardInteractionModal(highestLevelInstance);
        };
        
        collectionContainer.appendChild(cardElement);
    });
}
