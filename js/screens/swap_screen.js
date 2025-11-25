/*
 * Filename: js/screens/swap_screen.js
 * Version: NOUB v2.3.1 (Dynamic P2P Market - English UI)
 * Author: Sameh Yassin & Co-Pilot
 * 
 * Description: 
 * This module manages the Player-to-Player (P2P) Swap Market UI and Logic.
 * It handles the complete lifecycle of a trade:
 * 1. Browsing active offers from other players.
 * 2. Managing the user's own active requests (including cancellation).
 * 3. Creating new requests with dynamic selection (Offer Inventory vs Request Catalog).
 * 4. Executing trades using Atomic Database Transactions (via API).
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- Global Scope References ---
let swapContainer;
let cardSelectorModal;

/**
 * @type {object} SwapOfferData
 * @description Temporary storage for the "Create Request" flow.
 * Holds the IDs and Names of cards selected by the user before final submission.
 */
window.SwapOfferData = {
    offerInstanceId: null, // The specific card UUID the user owns (to be locked)
    offerCardId: null,     // The Master ID (e.g., 10 for Ramses)
    offerCardName: null,
    requestCardId: null,   // The Master ID the user wants to receive
    requestCardName: null
};

// --------------------------------------------------------
// --- 1. NAVIGATION & INITIALIZATION LOGIC
// --------------------------------------------------------

/**
 * Main Entry Point: Renders the Swap Screen layout.
 * Implements a Singleton-like check to prevent re-rendering the container structure.
 */
export async function renderSwapScreen() {
    if (!state.currentUser) return;
    
    // Ensure UI framework is built once
    if (!document.getElementById('swap-tabs-container')) {
        swapContainer = document.getElementById('swap-screen');
        swapContainer.innerHTML = `
            <h2 class="screen-title">P2P Market</h2>
            
            <!-- Tab Navigation -->
            <div id="swap-tabs-container" class="tabs-header">
                <button class="swap-tab-btn active" data-swap-tab="browse">Browse Offers</button>
                <button class="swap-tab-btn" data-swap-tab="my_requests">My Requests</button>
                <button class="swap-tab-btn" data-swap-tab="create">Create Offer</button>
            </div>
            
            <!-- Dynamic Content Areas -->
            <div id="swap-content-browse" class="swap-content-tab"></div>
            <div id="swap-content-my_requests" class="swap-content-tab hidden"></div>
            <div id="swap-content-create" class="swap-content-tab hidden"></div>
        `;
        
        // Attach event listeners for tabs
        document.querySelectorAll('.swap-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleSwapTabSwitch(e.target.dataset.swapTab));
        });
    }

    // Initial Load: Start at Browse Tab
    handleSwapTabSwitch('browse');
}

/**
 * Handles switching between main tabs (Browse, My Requests, Create).
 * Performs lazy loading of data for the selected tab.
 * @param {string} tabName 
 */
function handleSwapTabSwitch(tabName) {
    // UI Updates (Active State)
    document.querySelectorAll('.swap-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.swap-tab-btn[data-swap-tab="${tabName}"]`)?.classList.add('active');

    document.querySelectorAll('.swap-content-tab').forEach(content => content.classList.add('hidden'));
    document.getElementById(`swap-content-${tabName}`).classList.remove('hidden');

    // Logic Dispatcher
    switch(tabName) {
        case 'browse':
            renderBrowseRequests();
            break;
        case 'my_requests':
            renderMyRequests();
            break;
        case 'create':
            renderCreateRequestUI();
            break;
    }
}

// --------------------------------------------------------
// --- 2. CREATE REQUEST LOGIC (The Dynamic Flow)
// --------------------------------------------------------

/**
 * Renders the UI for creating a new trade.
 * Features a visual comparison between "What I Give" vs "What I Want".
 */
function renderCreateRequestUI() {
    const content = document.getElementById('swap-content-create');
    
    // Initialize data state if null
    if (!window.SwapOfferData) window.SwapOfferData = {};
    
    const offerText = window.SwapOfferData.offerCardName || "Select Card";
    const requestText = window.SwapOfferData.requestCardName || "Select Card";
    
    // Validations for the "Finalize" button
    const canFinalize = window.SwapOfferData.offerInstanceId && window.SwapOfferData.requestCardId;
    const finalizeBtnStyle = canFinalize ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"';

    content.innerHTML = `
        <div class="create-swap-ui game-container" style="text-align:center; padding: 20px;">
            <h3 style="color:var(--primary-accent); margin-bottom: 20px; border-bottom: 1px dashed #555; padding-bottom:10px;">
                Create New Trade
            </h3>
            
            <!-- Visual Trade Summary -->
            <div class="trade-visual-box" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px;">
                
                <!-- Left Side: Offer -->
                <div style="flex: 1; text-align:center;">
                    <p style="color: #888; font-size: 0.8em; margin-bottom:5px;">You Give</p>
                    <div class="card-slot" onclick="window.openCardSelectorModal('offer')" style="cursor:pointer; border: 1px dashed var(--success-color); padding: 10px; border-radius: 8px;">
                        <span style="color: var(--success-color); font-weight: bold; font-size: 1.1em;">${offerText}</span>
                        <div style="font-size:0.7em; color:#aaa; margin-top:5px;">(Tap to change)</div>
                    </div>
                </div>

                <!-- Icon -->
                <div style="font-size: 2em; padding: 0 10px;">⇄</div>

                <!-- Right Side: Request -->
                <div style="flex: 1; text-align:center;">
                    <p style="color: #888; font-size: 0.8em; margin-bottom:5px;">You Get</p>
                    <div class="card-slot" onclick="window.openCardSelectorModal('request')" style="cursor:pointer; border: 1px dashed var(--accent-blue); padding: 10px; border-radius: 8px;">
                        <span style="color: var(--accent-blue); font-weight: bold; font-size: 1.1em;">${requestText}</span>
                        <div style="font-size:0.7em; color:#aaa; margin-top:5px;">(Tap to change)</div>
                    </div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                <button class="action-button small" onclick="window.openCardSelectorModal('offer')">
                    1. Select from My Cards
                </button>
                <button class="action-button small" onclick="window.openCardSelectorModal('request')">
                    2. Select from Catalog
                </button>
            </div>

            <hr style="border-color: #333; margin-bottom: 20px;">

            <button id="finalize-swap-btn" class="action-button" onclick="window.finalizeSwapRequest()" ${finalizeBtnStyle}>
                Post Trade Offer
            </button>
            
            <p style="margin-top: 20px; font-size: 0.8em; color:var(--text-secondary); line-height: 1.6;">
                <span style="color:var(--danger-color);">Warning:</span> The card you offer will be <strong>locked</strong> immediately.
                <br>It cannot be used or burned until the trade is completed or cancelled.
            </p>
        </div>
    `;
}

/**
 * Opens a modal to select a card.
 * Handles two distinct modes:
 * 1. 'offer': Selects from USER INVENTORY (requires Instance ID for locking).
 * 2. 'request': Selects from GAME CATALOG (requires Master ID only).
 * 
 * @param {string} mode - 'offer' | 'request'
 */
async function openCardSelectorModal(mode) {
    let cardsToShow = [];
    let title = "";

    showToast("Loading data...", "info");

    try {
        if (mode === 'offer') {
            title = "Select a Card to Offer";
            // API Call: Get User's Owned Cards
            const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);
            if (error || !playerCards) return showToast("No data found.", 'error');
            if (playerCards.length === 0) return showToast("Inventory is empty!", 'error');
            
            // Map to view model (Include Instance ID)
            cardsToShow = playerCards.map(pc => ({
                id: pc.cards.id,
                uniqueId: pc.instance_id, // Critical for locking
                name: pc.cards.name,
                image: pc.cards.image_url,
                level: pc.level,
                isLocked: pc.is_locked, // Visual indicator for unavailable cards
                rarity: pc.cards.rarity_level
            }));

        } else if (mode === 'request') {
            title = "Select a Card to Request";
            // API Call: Get Master Catalog
            const { data: masterCards, error } = await api.fetchAllMasterCards();
            if (error || !masterCards) return showToast("Failed to load catalog.", 'error');

            // Map to view model (No Instance ID needed)
            cardsToShow = masterCards.map(mc => ({
                id: mc.id,
                uniqueId: null,
                name: mc.name,
                image: mc.image_url || 'images/default_card.png',
                level: null,
                isLocked: false,
                rarity: mc.rarity_level || 0
            }));
        }

        // Build HTML Grid
        let cardsHTML = cardsToShow.map(c => {
            // Disable locked cards in 'offer' mode
            const lockedStyle = c.isLocked ? 'opacity: 0.5; cursor: not-allowed; filter: grayscale(100%);' : 'cursor: pointer;';
            const lockedBadge = c.isLocked ? '<div style="background:red; color:white; font-size:0.7em; padding:2px; border-radius:4px; position:absolute; top:5px; right:5px;">LOCKED</div>' : '';
            const levelBadge = c.level ? `<div class="card-details"><span class="card-level">LVL ${c.level}</span></div>` : '';
            
            // Determine Rarity Border Color (Optional visual polish)
            const rarityColor = getRarityColor(c.rarity);
            
            // Click Action
            const clickAction = c.isLocked ? '' : `onclick="window.selectCardForSwap('${mode}', '${c.id}', '${c.uniqueId}', '${c.name}')"`;

            return `
                <div class="card-stack" style="${lockedStyle} border-color: ${rarityColor};" ${clickAction}>
                    ${lockedBadge}
                    <img src="${c.image || 'images/default_card.png'}" class="card-image">
                    <h4>${c.name}</h4>
                    ${levelBadge}
                </div>
            `;
        }).join('');

        // Inject Modal to DOM (Singleton Pattern)
        cardSelectorModal = document.getElementById('card-selector-modal');
        if (!cardSelectorModal) {
            cardSelectorModal = document.createElement('div');
            cardSelectorModal.id = 'card-selector-modal';
            cardSelectorModal.className = 'modal-overlay hidden';
            document.body.appendChild(cardSelectorModal);
        }
        
        cardSelectorModal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close-btn" onclick="window.closeModal('card-selector-modal')">&times;</button>
                <h3 style="color:var(--primary-accent); text-align:center;">${title}</h3>
                <div class="card-grid" style="max-height: 60vh; overflow-y: auto; margin-top:15px;">
                    ${cardsHTML}
                </div>
            </div>
        `;
        window.openModal('card-selector-modal');

    } catch (e) {
        console.error(e);
        showToast("Unexpected error.", 'error');
    }
}

/**
 * Callback function triggered when a user selects a card from the modal.
 * Updates the global SwapOfferData state and refreshes the UI.
 */
window.selectCardForSwap = function(mode, masterId, uniqueId, name) {
    if (!window.SwapOfferData) window.SwapOfferData = {};

    if (mode === 'offer') {
        window.SwapOfferData.offerCardId = masterId;
        window.SwapOfferData.offerInstanceId = uniqueId; // Needed for DB Lock
        window.SwapOfferData.offerCardName = name;
    } else {
        window.SwapOfferData.requestCardId = masterId;   // Needed for DB Request
        window.SwapOfferData.requestCardName = name;
    }

    window.closeModal('card-selector-modal');
    renderCreateRequestUI(); // Re-render to show selected names
}

/**
 * Submits the final trade request to the API.
 * Locks the offered card and creates the swap_requests record.
 */
async function finalizeSwapRequest() {
    // 1. Validation
    if (!window.SwapOfferData || !window.SwapOfferData.offerInstanceId) {
        return showToast("Please select a card to offer first.", 'error');
    }
    if (!window.SwapOfferData.requestCardId) {
        return showToast("Please select a card to request.", 'error');
    }
    
    showToast("Posting offer...", 'info');
    
    // 2. API Call
    const { error } = await api.createSwapRequest(
        state.currentUser.id,
        window.SwapOfferData.offerInstanceId, // Instance to lock
        window.SwapOfferData.offerCardId,     // Type offered
        window.SwapOfferData.requestCardId    // Type requested
    );
    
    // 3. Handle Result
    if (!error) {
        showToast("Trade Offer Created! Your card is locked.", 'success');
        window.SwapOfferData = null; // Clear state
        await refreshPlayerState();
        handleSwapTabSwitch('my_requests'); // Redirect to My Requests
    } else {
        showToast(`Failed to create offer: ${error.message}`, 'error');
    }
}

// --------------------------------------------------------
// --- 3. BROWSING & ACCEPTING REQUESTS
// --------------------------------------------------------

/**
 * Renders active requests from other players.
 */
async function renderBrowseRequests() {
    const content = document.getElementById('swap-content-browse');
    content.innerHTML = '<p style="text-align:center;">Loading market...</p>';
    
    const { data: requests, error } = await api.fetchActiveSwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = '<p class="error-error">Error loading data.</p>';
    if (!requests || requests.length === 0) return content.innerHTML = '<p style="text-align:center; margin-top:20px; color:#aaa;">No active offers found. Be the first!</p>';

    content.innerHTML = requests.map(req => {
        const username = req.player_id_offering.substring(0, 8); // Masked ID
        return `
            <div class="swap-request-card">
                <div class="card-header" style="display:flex; justify-content:space-between; font-size:0.8em; color:#888; margin-bottom:10px;">
                    <span>Seller: <span style="color:#fff;">User-${username}</span></span>
                    <span>${new Date(req.created_at).toLocaleDateString()}</span>
                </div>
                
                <div class="trade-display-wrapper">
                    <!-- Left: They Offer -->
                    <div class="trade-card-item">
                        <div style="position:relative;">
                            <img src="${req.offer_card.image_url || 'images/default_card.png'}" alt="Offer">
                            <div style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.7); font-size:0.7em; padding:2px;">OFFER</div>
                        </div>
                        <h4>${req.offer_card.name}</h4>
                    </div>
                    
                    <div class="trade-icon" style="align-self:center; font-size:1.5em; color:var(--primary-accent);">⇄</div>
                    
                    <!-- Right: They Want -->
                    <div class="trade-card-item">
                        <div style="position:relative;">
                            <img src="${req.request_card.image_url || 'images/default_card.png'}" alt="Request" style="filter: sepia(0.5);">
                            <div style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.7); font-size:0.7em; padding:2px;">REQUEST</div>
                        </div>
                        <h4>${req.request_card.name}</h4>
                    </div>
                </div>

                <div class="actions" style="text-align:center; margin-top:15px;">
                    <button class="action-button small" onclick="window.handleAcceptSwap('${req.id}')">
                        Accept Trade
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Triggered when a player clicks "Accept Trade".
 * Step 1: Verifies they have the requested card.
 * Step 2: Asks them to select WHICH specific copy to give.
 */
async function handleAcceptSwap(requestId) {
    // Fetch request details to know what is needed
    const { data: request, error: fetchError } = await api.supabaseClient
        .from('swap_requests')
        .select('item_id_request, request_card_details:item_id_request(name)')
        .eq('id', requestId)
        .single();
        
    if (fetchError || !request) return showToast("Offer no longer available.", 'error');

    const requiredCardId = request.item_id_request;
    const requiredCardName = request.request_card_details.name;
    
    // Fetch player's cards
    const { data: myCards, error: cardsError } = await api.fetchPlayerCards(state.currentUser.id);
    
    // Filter: Do I have the required card? And is it unlocked?
    const matchingCards = myCards.filter(pc => pc.card_id === requiredCardId && !pc.is_locked);
    
    if (matchingCards.length === 0) {
        return showToast(`You do not own a "${requiredCardName}" to trade.`, 'error');
    }

    // Show selection modal
    let modal = document.getElementById('accept-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'accept-selector-modal';
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }
    
    const cardsHTML = matchingCards.map(pc => `
        <div class="card-stack" onclick="window.executeAcceptance('${requestId}', '${pc.instance_id}')" style="cursor:pointer;">
            <img src="${pc.cards.image_url || 'images/default_card.png'}" class="card-image">
            <h4>${pc.cards.name}</h4>
            <div class="card-details">LVL ${pc.level}</div>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('accept-selector-modal')">&times;</button>
            <h3>Complete Trade</h3>
            <p>You own ${matchingCards.length} copies of "${requiredCardName}".<br>Select which one to trade:</p>
            <div class="card-grid">${cardsHTML}</div>
        </div>
    `;
    window.openModal('accept-selector-modal');
}

/**
 * Step 3: Executes the actual trade via Atomic DB Function.
 */
async function executeAcceptance(requestId, counterOfferInstanceId) {
    window.closeModal('accept-selector-modal');
    showToast("Processing trade...", 'info');
    
    // Calls the secure RPC function we updated
    const { error, newCardName } = await api.acceptSwapRequest(
        requestId,
        state.currentUser.id,
        counterOfferInstanceId 
    );
    
    if (!error) {
        showToast(`Trade successful! You received: ${newCardName}`, 'success');
        await refreshPlayerState();
        renderBrowseRequests(); // Refresh list
    } else {
        showToast(`Trade failed: ${error.message}`, 'error');
    }
}

// --------------------------------------------------------
// --- 4. MANAGE MY REQUESTS
// --------------------------------------------------------

async function renderMyRequests() {
    const content = document.getElementById('swap-content-my_requests');
    content.innerHTML = '<p style="text-align:center;">Loading...</p>';
    
    const { data: requests, error } = await api.fetchMySwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = '<p class="error-error">Error loading requests.</p>';
    if (requests.length === 0) return content.innerHTML = '<p style="text-align:center; margin-top:20px;">You have no active trade offers.</p>';

    content.innerHTML = requests.map(req => {
        return `
            <div class="swap-request-card my-request" style="border-left: 4px solid var(--primary-accent);">
                <div class="card-header">
                    <span style="color:var(--primary-accent);">My Offer</span>
                    <span>${new Date(req.created_at).toLocaleDateString()}</span>
                </div>
                
                <div class="trade-display-wrapper">
                    <div class="trade-card-item">
                        <img src="${req.offer_card.image_url || 'images/default_card.png'}" style="border: 2px solid var(--success-color);">
                        <p>Giving</p>
                        <h4>${req.offer_card.name}</h4>
                    </div>
                    <div class="trade-icon">➡️</div>
                    <div class="trade-card-item">
                        <img src="${req.request_card.image_url || 'images/default_card.png'}" style="border: 2px dashed var(--accent-blue);">
                        <p>Asking For</p>
                        <h4>${req.request_card.name}</h4>
                    </div>
                </div>

                <div class="actions" style="justify-content:center;">
                    <button class="action-button small danger" onclick="window.handleCancelOffer('${req.id}')">
                        Cancel & Refund Card
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Cancels the offer and unlocks the card.
 * Export added to prevent import errors in other modules.
 */
export async function handleCancelOffer(requestId) {
    if(!confirm("Are you sure you want to cancel this offer and unlock your card?")) return;
    
    showToast("Cancelling...", 'info');
    
    // Fetch missing details first (need instance ID to unlock)
    const { data: request } = await api.supabaseClient
        .from('swap_requests')
        .select('card_instance_id_offer, player_id_offering')
        .eq('id', requestId)
        .single();

    if (request) {
        const { error } = await api.cancelSwapRequest(
            requestId,
            request.player_id_offering,
            request.card_instance_id_offer
        );
        
        if (!error) {
            showToast("Offer cancelled. Card unlocked.", 'success');
            await refreshPlayerState();
            renderMyRequests();
        } else {
            showToast("Cancellation failed.", 'error');
        }
    }
}

// --- Helper: Rarity Color Logic ---
function getRarityColor(level) {
    switch(level) {
        case 0: return '#95a5a6'; // Common (Gray)
        case 2: return '#3498db'; // Rare (Blue)
        case 4: return '#9b59b6'; // Epic (Purple)
        case 6: return '#f39c12'; // Legendary (Orange)
        case 8: return '#f1c40f'; // Diamond (Gold)
        default: return '#555';
    }
}

// --------------------------------------------------------
// --- GLOBAL SCOPE EXPOSURE (Vital for HTML onclicks)
// --------------------------------------------------------
window.handleCancelOffer = handleCancelOffer;
window.handleAcceptSwap = handleAcceptSwap;
window.executeAcceptance = executeAcceptance;
window.openCardSelectorModal = openCardSelectorModal;
window.selectCardForSwap = selectCardForSwap;
window.finalizeSwapRequest = finalizeSwapRequest;
