
  /*
 * Filename: js/screens/shop.js
 * Version: NOUB 0.0.14 (SHOP OVERHAUL - CRITICAL FIX: Prevent Duplicate Library Unlock)
 * Description: Implements the multi-tabbed Shop interface.
 * CRITICAL FIX: Logic added to check if a library item is already unlocked and hides/disables the buy button.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { trackDailyActivity } from './contracts.js';

const shopModal = document.getElementById('shop-modal');

// --- Shop Item Data ---

const CARD_PACKS = [
    { id: 'papyrus', name: 'Papyrus Scroll Pack', cost: 250, reward_count: 1, desc: 'Contains 1 random card (Common guaranteed).', icon: '📜' },
    { id: 'canopic', name: 'Canopic Jar Pack', cost: 1000, reward_count: 3, desc: 'Contains 3 cards (Rare guaranteed).', icon: '🏺' },
    { id: 'sarcophagus', name: 'Sarcophagus Crate', cost: 5000, reward_count: 5, desc: 'Contains 5 cards (Epic guaranteed).', icon: '⚰️' }
];

const GAME_ITEMS = [
    { key: 'hint_scroll', name: 'Hint Scroll (KV Game)', costNoub: 150, costAnkhPremium: 0, quantity: 1, desc: 'Reveals the last digit of the current KV code.', icon: '💡', type: 'consumable' },
    { key: 'time_amulet_45s', name: 'Time Amulet (+45s)', costNoub: 250, costAnkhPremium: 0, quantity: 1, desc: 'Adds 45 seconds to the KV game timer.', icon: '⏱️', type: 'consumable' },
    { key: 'hint_bundle', name: 'Bundle of 5 Hints', costNoub: 0, costAnkhPremium: 5, quantity: 5, desc: '5 Hint Scrolls for 5 Ankh Premium.', icon: '✨', type: 'consumable' },
    { key: 'instant_prod', name: 'Instant Production Scroll', costNoub: 0, costAnkhPremium: 10, quantity: 1, desc: 'Instantly completes a single running factory production.', icon: '⚡', type: 'consumable' },
    // NEW: Library Unlock Items (The Great Ennead)
    { key: 'god_ra', name: 'Scroll of Ra', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Ra" entry in the Encyclopedia.', icon: '📚', type: 'library_unlock' },
    { key: 'god_shu', name: 'Scroll of Shu', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Shu" entry (Requires Ra).', icon: '📚', type: 'library_unlock' },
    { key: 'god_tefnut', name: 'Scroll of Tefnut', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Tefnut" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_geb', name: 'Scroll of Geb', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Geb" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_nut', name: 'Scroll of Nut', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Nut" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_osiris', name: 'Scroll of Osiris', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Osiris" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_isis', name: 'Scroll of Isis', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Isis" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_set', name: 'Scroll of Set', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Set" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_nephthys', name: 'Scroll of Nephthys', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Nephthys" entry.', icon: '📚', type: 'library_unlock' },
    { key: 'god_horus', name: 'Scroll of Horus', costNoub: 1000, costAnkhPremium: 0, quantity: 1, desc: 'Unlocks the "Horus" entry.', icon: '📚', type: 'library_unlock' },
];

const TON_PACKAGES = [
    { name: 'Minor Ankh Deposit', ton_amount: 0.00015, ankh_amount: 100 },
    { name: 'Major Ankh Deposit', ton_amount: 0.00015, ankh_amount: 500 },
    { name: 'Pharaoh\'s Treasury', ton_amount: 0.00015, ankh_amount: 1500 }
];


// --- Core Transaction Handlers ---

async function handleBuyCardPack(packCost, packId) {
    if (!state.currentUser || (state.playerProfile.noub_score || 0) < packCost) {
        showToast("Not enough NOUB (🪙)!", 'error');
        return;
    }

    const newNoubScore = (state.playerProfile.noub_score || 0) - packCost;
    const { error: scoreError } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });

    if (scoreError) {
        showToast("Error updating balance.", 'error');
        return;
    }

    const { data: masterCards } = await api.fetchAllMasterCards();
    if (!masterCards || masterCards.length === 0) return;

    let rewardCount = CARD_PACKS.find(p => p.id === packId)?.reward_count || 1;
    const insertPromises = [];

    for (let i = 0; i < rewardCount; i++) {
        const randomCard = masterCards[Math.floor(Math.random() * masterCards.length)];
        insertPromises.push(api.addCardToPlayerCollection(state.currentUser.id, randomCard.id));
    }
    await Promise.all(insertPromises);

    showToast(`Purchased ${rewardCount} card(s)! Check your collection.`, 'success');
    await refreshPlayerState();
    if (!shopModal.classList.contains('hidden')) renderCardPacks();
}

/**
 * Handles the purchase of both consumables and library items.
 */
async function handleBuyGameItem(item) {
    const { key, costNoub, costAnkhPremium, quantity, type } = item;
    const currentNoub = state.playerProfile.noub_score || 0;
    const currentAnkhPremium = state.playerProfile.ankh_premium || 0;

    // 1. Check for purchase conflicts (already unlocked)
    if (type === 'library_unlock') {
         // Fetch player library data once
         const { data: libraryData } = await api.fetchPlayerLibrary(state.currentUser.id);
         const isUnlocked = libraryData.some(entry => entry.entry_key === key);

         if (isUnlocked) {
             showToast("This Encyclopedia entry is already unlocked!", 'info');
             return;
         }
         
         // Logic for sequential unlock (Optional: check previous key if needed, e.g., 'god_shu' requires 'god_ra')
         // For a cleaner UX, we rely on the DB not failing if a sequential unlock is enforced there.
    }

    if (currentNoub < costNoub || currentAnkhPremium < costAnkhPremium) {
        showToast("Missing currency!", 'error');
        return;
    }

    // 2. Deduct costs
    const profileUpdate = {
        noub_score: currentNoub - costNoub,
        ankh_premium: currentAnkhPremium - costAnkhPremium
    };
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);

    if (profileError) {
        showToast("Error deducting cost!", 'error');
        return;
    }

    // 3. Handle item grant based on type
    if (type === 'library_unlock') {
         // Grant library unlock directly to player_library table
         const { error: unlockError } = await api.supabaseClient.from('player_library').insert({
             player_id: state.currentUser.id,
             entry_key: key
         });
         
         if (unlockError) {
             showToast("Error granting library unlock!", 'error');
             console.error("Library Unlock Error:", unlockError);
             return;
         }
         showToast(`Encyclopedia unlocked: ${item.name}!`, 'success');
         // Redirect user to the library to see the new content
         import('../ui.js').then(({ navigateTo, closeModal }) => {
             closeModal('shop-modal');
             navigateTo('library-screen');
         });
    } else { // 'consumable' type
        const currentConsumableQty = state.consumables.get(key) || 0;
        const newConsumableQty = currentConsumableQty + quantity;
        await api.updateConsumableQuantity(state.currentUser.id, key, newConsumableQty);
        showToast(`Acquired ${quantity} x ${item.name}!`, 'success');
    }
    
    // 4. Success and Refresh
    await refreshPlayerState();
    if (!shopModal.classList.contains('hidden')) renderGameItems(); 
}


// --- TON EXCHANGE Logic (Unchanged) ---

async function handleTonExchange(tonAmount, ankhAmount) {
    if (!window.TonConnectUI || !window.TonConnectUI.connected) {
        showToast("Please connect your TON wallet first!", 'error');
        return;
    }

    // CRITICAL: Replace this with your actual TON wallet address!
    const gameWalletAddress = "UQDYpGLl1efwDOSJb_vFnbAZ5Rz5z-AmSzrbRwM5IcNN_erF"; 

    const amountNanos = (tonAmount * 1e9).toFixed(0); 

    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 60, 
        messages: [{
            address: gameWalletAddress,
            amount: amountNanos,
        }]
    };

    try {
        showToast("Waiting for TON wallet confirmation...", 'info');
        const result = await TonConnectUI.sendTransaction(transaction);
        const txId = result.boc.substring(0, 10); 

        // 1. Record transaction (Mocked API call)
        await api.saveTonTransaction(state.currentUser.id, txId, tonAmount, ankhAmount);
        
        // 2. Grant Ankh Premium
        const newAnkhPremium = (state.playerProfile.ankh_premium || 0) + ankhAmount;
        await api.updatePlayerProfile(state.currentUser.id, { ankh_premium: newAnkhPremium });

        showToast(`TON Transaction successful! Granted ${ankhAmount} ☥ Ankh Premium.`, 'success');
        await refreshPlayerState();
        if (!shopModal.classList.contains('hidden')) renderTonExchange();

    } catch (error) {
        console.error("TON Transaction Failed:", error);
        showToast("TON transaction cancelled or failed. Check console for an invalid address or balance.", 'error');
    }
}


// --- Rendering Functions ---

function renderCardPacks() {
    const shopItemsCardsContainer = document.getElementById('shop-items-cards-container');
    if (!shopItemsCardsContainer) return;
    
    shopItemsCardsContainer.innerHTML = CARD_PACKS.map(pack => `
        <div class="shop-item">
            <div class="icon">${pack.icon}</div>
            <div class="details">
                <h4>${pack.name}</h4>
                <p>${pack.desc}</p>
            </div>
            <button class="buy-btn" onclick="window.handleBuyCardPack(${pack.cost}, '${pack.id}')">
                ${pack.cost} 🪙
            </button>
        </div>
    `).join('');
}

/**
 * Renders Game Items tab, checking for unlock status.
 */
function renderGameItems() {
    const shopItemsGameItemsContainer = document.getElementById('shop-items-game_items-container');
     if (!shopItemsGameItemsContainer) return;
     
     // Fetch unlocked keys for library checks
     api.fetchPlayerLibrary(state.currentUser.id).then(({ data: libraryData }) => {
         const unlockedKeys = new Set(libraryData.map(entry => entry.entry_key));
         
         shopItemsGameItemsContainer.innerHTML = GAME_ITEMS.map(item => {
             const costDisplay = item.costNoub > 0 ? `${item.costNoub} 🪙` : `${item.costAnkhPremium} ☥`;
             const isLibraryUnlock = item.type === 'library_unlock';
             const isUnlocked = isLibraryUnlock && unlockedKeys.has(item.key);
             
             let buttonHTML;
             if (isUnlocked) {
                 buttonHTML = `<button class="buy-btn" disabled style="background-color: var(--success-color);">Unlocked</button>`;
             } else {
                 buttonHTML = `<button class="buy-btn" 
                     onclick='window.handleBuyGameItem(${JSON.stringify(item)})'
                 >
                     ${costDisplay}
                 </button>`;
             }

             return `
                 <div class="shop-item">
                     <div class="icon">${item.icon}</div>
                     <div class="details">
                         <h4>${item.name}</h4>
                         <p>${item.desc}</p>
                     </div>
                     ${buttonHTML}
                 </div>
             `;
         }).join('');
     });
}

function renderTonExchange() {
     const shopItemsTonExchangeContainer = document.getElementById('shop-items-ton_exchange-container');
     if (!shopItemsTonExchangeContainer) return;

     const isConnected = window.TonConnectUI && window.TonConnectUI.connected;
     
     if (!isConnected) {
         shopItemsTonExchangeContainer.innerHTML = `
             <p style="text-align: center; color: var(--danger-color); margin-bottom: 20px;">
                 You must connect your TON wallet to purchase Ankh Premium.
             </p>
             <div id="connectButtonTonExchange" style="margin: 0 auto; width: 250px;"></div>
             <p style="margin-top: 15px; font-size: 0.9em; color: var(--text-secondary); text-align: center;">
                 *Use the 'Connect' button above or in the header.
             </p>
         `;
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
                 <p>Get ${pkg.ankh_amount} ☥ Ankh Premium instantly.</p>
             </div>
             <button class="buy-btn" style="background-color: var(--ankh-premium-color); color: var(--background-dark);"
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
    await refreshPlayerState();

    renderCardPacks();
    renderGameItems();
    renderTonExchange();

    document.querySelectorAll('.shop-tab-btn').forEach(btn => {
        btn.onclick = () => handleTabSwitch(btn.dataset.shopTab);
    });
    
    trackDailyActivity('visits', 1);
    openModal('shop-modal');
}

// CRITICAL: Attach global handlers
window.handleBuyCardPack = handleBuyCardPack;
window.handleBuyGameItem = handleBuyGameItem;
window.handleTonExchange = handleTonExchange;

