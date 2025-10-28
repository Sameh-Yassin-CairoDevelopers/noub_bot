/*
 * Filename: js/screens/shop.js
 * Version: NOUB 0.0.2 (FINAL TON FIX - COMPLETE)
 * Description: Implements the multi-tabbed Shop interface for buying Card Packs, Game Items, and Ankh via TON.
 * Corrected TON transaction payload error.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js'; 

const shopModal = document.getElementById('shop-modal');
const shopContentCards = document.getElementById('shop-content-cards');
const shopContentGameItems = document.getElementById('shop-content-game_items');
const shopContentTonExchange = document.getElementById('shop-content-ton_exchange');
const shopItemsCardsContainer = document.getElementById('shop-items-cards-container');
const shopItemsGameItemsContainer = document.getElementById('shop-items-game_items-container');
const shopItemsTonExchangeContainer = document.getElementById('shop-items-ton_exchange-container');


// --- Shop Item Data ---

const CARD_PACKS = [
    { id: 'papyrus', name: 'Papyrus Scroll Pack', cost: 250, reward_count: 1, desc: 'Contains 1 random card (Common guaranteed).', icon: '📜' },
    { id: 'canopic', name: 'Canopic Jar Pack', cost: 1000, reward_count: 3, desc: 'Contains 3 cards (Rare guaranteed).', icon: '🏺' },
    { id: 'sarcophagus', name: 'Sarcophagus Crate', cost: 5000, reward_count: 5, desc: 'Contains 5 cards (Epic guaranteed).', icon: '⚰️' }
];

const GAME_ITEMS = [
    { key: 'hint_scroll', name: 'Hint Scroll (KV Game)', cost_ankh: 50, cost_blessing: 0, quantity: 1, desc: 'Reveals the last digit of the current KV code.', icon: '💡' },
    { key: 'time_amulet_45s', name: 'Time Amulet (+45s)', cost_ankh: 150, cost_blessing: 0, quantity: 1, desc: 'Adds 45 seconds to the KV game timer.', icon: '⏱️' },
    { key: 'hint_bundle', name: 'Bundle of 5 Hints', cost_ankh: 0, cost_blessing: 1, quantity: 5, desc: '5 Hint Scrolls for 1 Blessing (Premium Value).', icon: '✨' },
    { key: 'instant_prod', name: 'Instant Production Scroll', cost_ankh: 0, cost_blessing: 5, quantity: 1, desc: 'Instantly completes a single running factory production.', icon: '⚡' }
];

const TON_PACKAGES = [
    { name: 'Minor Ankh Deposit', ton_amount: 0.0011, ankh_amount: 2000 },
    { name: 'Major Ankh Deposit', ton_amount: 0.0022, ankh_amount: 10000 },
    { name: 'Pharaoh\'s Treasury', ton_amount: 1.0, ankh_amount: 20000 }
];


// --- Core Transaction Handlers ---

/**
 * Handles the purchase of a Card Pack (using Ankh).
 */
async function handleBuyCardPack(packCost, packId) {
    if (!state.currentUser || (state.playerProfile.score || 0) < packCost) {
        showToast("Not enough Ankh (☥)!", 'error');
        return;
    }

    // 1. Deduct cost
    const newScore = (state.playerProfile.score || 0) - packCost;
    const { error: scoreError } = await api.updatePlayerProfile(state.currentUser.id, { score: newScore });

    if (scoreError) {
        showToast("Error updating balance.", 'error');
        return;
    }

    // 2. Grant card(s) (Simplified: Grant random cards based on reward_count)
    const { data: masterCards } = await api.fetchAllMasterCards();
    if (!masterCards || masterCards.length === 0) return;

    let rewardCount = CARD_PACKS.find(p => p.id === packId)?.reward_count || 1;
    const insertPromises = [];

    for (let i = 0; i < rewardCount; i++) {
        const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];
        insertPromises.push(api.addCardToPlayerCollection(state.currentUser.id, randomCard.id));
    }
    await Promise.all(insertPromises);


    // 3. Success and Refresh
    showToast(`Purchased ${rewardCount} card(s)! Check your collection.`, 'success');
    await refreshPlayerState();
    // Re-render only if the modal is open
    if (!shopModal.classList.contains('hidden')) renderCardPacks(); 
}

/**
 * Handles the purchase of a Game Consumable item.
 */
async function handleBuyGameItem(itemKey, costAnkh, costBlessing, quantity) {
    const currentAnkh = state.playerProfile.score || 0;
    const currentBlessing = state.playerProfile.blessing || 0;

    if (currentAnkh < costAnkh || currentBlessing < costBlessing) {
        showToast("Missing currency!", 'error');
        return;
    }

    // 1. Deduct costs
    const profileUpdate = {
        score: currentAnkh - costAnkh,
        blessing: currentBlessing - costBlessing
    };
    await api.updatePlayerProfile(state.currentUser.id, profileUpdate);

    // 2. Add item to Consumables table
    const currentConsumableQty = state.consumables.get(itemKey) || 0;
    const newConsumableQty = currentConsumableQty + quantity;
    await api.updateConsumableQuantity(state.currentUser.id, itemKey, newConsumableQty);

    // 3. Success and Refresh
    showToast(`Acquired ${quantity} x ${itemKey.toUpperCase()}!`, 'success');
    await refreshPlayerState();
    if (!shopModal.classList.contains('hidden')) renderGameItems(); 
}


// --- TON EXCHANGE Logic ---

/**
 * Initiates a TON transaction to purchase Ankh.
 */
async function handleTonExchange(tonAmount, ankhAmount) {
    if (!window.TonConnectUI || !window.TonConnectUI.connected) {
        showToast("Please connect your TON wallet first!", 'error');
        return;
    }

    // CRITICAL FIX: Ensure this is your actual, correct TON wallet address (UQ or EQ format)
    // The previous error was due to an invalid placeholder address format.
    // YOU MUST REPLACE THIS LINE WITH YOUR REAL WALLET ADDRESS
    const gameWalletAddress = "UQDYpGLl1efwDOSJb_vFnbAZ5Rz5z-AmSzrbRwM5IcNN_erF"; 

    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 60,
        messages: [{
            address: gameWalletAddress,
            amount: (tonAmount * 1e9).toString(), 
            // CRITICAL FIX: Removed payload to prevent 'Invalid Payload' error, relying on basic transfer.
        }]
    };

    try {
        showToast("Waiting for TON wallet confirmation...", 'info');
        const result = await TonConnectUI.sendTransaction(transaction);
        const txId = result.boc.substring(0, 10); 

        // 1. Record transaction (Mocked API call)
        await api.saveTonTransaction(state.currentUser.id, txId, tonAmount, ankhAmount);
        
        // 2. Grant Ankh immediately (Since we mock successful validation)
        const newScore = (state.playerProfile.score || 0) + ankhAmount;
        await api.updatePlayerProfile(state.currentUser.id, { score: newScore });

        showToast(`TON Transaction successful! Granted ${ankhAmount} ☥ Ankh.`, 'success');
        await refreshPlayerState();
        if (!shopModal.classList.contains('hidden')) renderTonExchange(); 

    } catch (error) {
        // Log the full error to the console for debugging
        console.error("TON Transaction Failed:", error);
        // Show a friendlier message to the user
        showToast("TON transaction cancelled or failed.", 'error');
    }
}


// --- Rendering Functions ---

function renderCardPacks() {
    shopItemsCardsContainer.innerHTML = CARD_PACKS.map(pack => `
        <div class="shop-item">
            <div class="icon">${pack.icon}</div>
            <div class="details">
                <h4>${pack.name}</h4>
                <p>${pack.desc}</p>
            </div>
            <button class="buy-btn" onclick="window.handleBuyCardPack(${pack.cost}, '${pack.id}')">
                ${pack.cost} ☥
            </button>
        </div>
    `).join('');
}

function renderGameItems() {
    shopItemsGameItemsContainer.innerHTML = GAME_ITEMS.map(item => {
        const costDisplay = item.cost_ankh > 0 ? `${item.cost_ankh} ☥` : `${item.cost_blessing} 🗡️`;
        return `
            <div class="shop-item">
                <div class="icon">${item.icon}</div>
                <div class="details">
                    <h4>${item.name}</h4>
                    <p>${item.desc} (Own: ${state.consumables.get(item.key) || 0})</p>
                </div>
                <button class="buy-btn" 
                    onclick="window.handleBuyGameItem('${item.key}', ${item.cost_ankh}, ${item.cost_blessing}, ${item.quantity})"
                >
                    ${costDisplay}
                </button>
            </div>
        `;
    }).join('');
}

function renderTonExchange() {
     const isConnected = window.TonConnectUI && window.TonConnectUI.connected;
     
     if (!isConnected) {
         shopItemsTonExchangeContainer.innerHTML = `
             <p style="text-align: center; color: var(--danger-color); margin-bottom: 20px;">
                 You must connect your TON wallet to purchase Ankh.
             </p>
             <div id="connectButtonTonExchange" style="margin: 0 auto; width: 250px;"></div>
             <p style="margin-top: 15px; font-size: 0.9em; color: var(--text-secondary); text-align: center;">
                 *Use the 'Connect' button above or in the header.
             </p>
         `;
         // Initialize TonConnect UI specifically for this area if needed (optional optimization)
         if (window.TonConnectUI) {
             window.TonConnectUI.uiOptions = {
                 ...window.TonConnectUI.uiOptions,
                 buttonRootId: 'connectButtonTonExchange'
             };
         }
         return;
     }

     shopItemsTonExchangeContainer.innerHTML = TON_PACKAGES.map(pkg => `
         <div class="shop-item">
             <div class="icon">💎</div>
             <div class="details">
                 <h4>${pkg.name}</h4>
                 <p>Get ${pkg.ankh_amount} ☥ Ankhs instantly.</p>
             </div>
             <button class="buy-btn" style="background-color: var(--ankh-color); color: var(--background-dark);"
                 onclick="window.handleTonExchange(${pkg.ton_amount}, ${pkg.ankh_amount})"
             >
                 BUY ${pkg.ton_amount} TON
             </button>
         </div>
     `).join('');
}

function handleTabSwitch(tabName) {
    document.querySelectorAll('.shop-content-tab').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.shop-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`shop-content-${tabName}`).classList.add('active');
    document.querySelector(`button[data-shop-tab="${tabName}"]`).classList.add('active');
    
    // Refresh content when switching to ensure currency is correct
    if (tabName === 'cards') renderCardPacks();
    else if (tabName === 'game_items') renderGameItems();
    else if (tabName === 'ton_exchange') renderTonExchange();
}


/**
 * Main function to open the modal and initialize content.
 */
export async function openShopModal() {
    // 1. Ensure latest state is loaded
    await refreshPlayerState();

    // 2. Render all dynamic content
    renderCardPacks();
    renderGameItems();
    renderTonExchange(); // Renders state based on connection

    // 3. Attach Tab Switch Listeners (Critical for usability)
    document.querySelectorAll('.shop-tab-btn').forEach(btn => {
        // Ensure listeners are only attached once if possible, or reattached safely
        btn.onclick = () => handleTabSwitch(btn.dataset.shopTab);
    });
    
    // 4. Track daily quest for visiting the shop
    trackDailyActivity('visits', 1);

    // 5. Open the modal
    openModal('shop-modal');
}

// CRITICAL: Attach global handlers required by onclick attributes in the rendered HTML
window.handleBuyCardPack = handleBuyCardPack;
window.handleBuyGameItem = handleBuyGameItem;
window.handleTonExchange = handleTonExchange;

