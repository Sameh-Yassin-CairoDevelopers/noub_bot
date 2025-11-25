/*
 * Filename: js/screens/swap_screen.js
 * Version: NOUB v2.2.2 (FINAL P2P Swap Logic & UI)
 * Description: Implements the full functionality and rendering for the Player-to-Player 
 * Swap Market. Includes logic for creating, browsing, and canceling swap requests.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Element References (to be set in renderSwapScreen)
let swapContainer;
let cardSelectorModal;

// Global object to store data during the multi-step creation flow
window.SwapOfferData = null;

// --------------------------------------------------------
// --- CORE LOGIC FUNCTIONS ---
// --------------------------------------------------------

/**
 * Handles the logic for switching between the Swap Market tabs.
 * @param {string} tabName - 'browse', 'my_requests', or 'create'.
 */
function handleSwapTabSwitch(tabName) {
    // 1. Update active tab UI
    document.querySelectorAll('.swap-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.swap-tab-btn[data-swap-tab="${tabName}"]`)?.classList.add('active');

    // 2. Hide all content and show the selected one
    document.querySelectorAll('.swap-content-tab').forEach(content => content.classList.add('hidden'));
    document.getElementById(`swap-content-${tabName}`).classList.remove('hidden');

    // 3. Render content dynamically
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

// --- P2P Swap Functionality ---

/**
 * Executes the final creation of a swap request after card selection.
 */
async function finalizeSwapRequest() {
    if (!window.SwapOfferData || !window.SwapOfferData.instanceId) {
        return showToast("Please select a card to offer first.", 'error');
    }
    
    // MOCKUP: For now, we assume the player requests card ID 10 (Ramses II)
    const requestCardId = 10; 
    
    showToast("Finalizing swap request...", 'info');
    
    // Call the API function to create the request and lock the card instance
    const { error } = await api.createSwapRequest(
        state.currentUser.id,
        window.SwapOfferData.instanceId,
        window.SwapOfferData.cardId,
        requestCardId
    );
    
    if (!error) {
        showToast("Swap Request Created! Your card is now locked for trade.", 'success');
        // Clean up and refresh
        window.SwapOfferData = null;
        await refreshPlayerState();
        // Switch to My Requests tab to show the new request
        handleSwapTabSwitch('my_requests'); 
    } else {
        showToast(`Failed to create swap request. Error: ${error.message}`, 'error');
    }
}



// --- Finalized Cancellation Logic ---
/**
 * Handles the logic for cancelling the player's own offer.
 * NOTE: Added 'export' to make it accessible by the onclick attribute in HTML.
 * @param {string} requestId - The ID of the swap request to cancel.
 */
export async function handleCancelOffer(requestId) { // <--- ADD 'export' HERE
    showToast("Attempting to cancel swap offer...", 'info');

    // NOTE: This will require fetching the card_instance_id_offer first! 
    const { data: request, error: fetchError } = await api.supabaseClient
        .from('swap_requests')
        .select('card_instance_id_offer, player_id_offering')
        .eq('id', requestId)
        .single();
        
    if (fetchError || !request) return showToast("Error: Request not found.", 'error');

    // Call the API function to cancel the request and unlock the card
    const { error } = await api.cancelSwapRequest(
        requestId,
        request.player_id_offering,
        request.card_instance_id_offer
    );
    
    if (!error) {
        showToast("Offer cancelled and card unlocked!", 'success');
        await refreshPlayerState();
        renderMyRequests(); // Re-render the tab to show the offer is gone
    } else {
        showToast(`Cancellation failed: ${error.message}`, 'error');
    }
}


// --- FINALIZED ACCEPT TRADE LOGIC ---

/**
 * Step 1: Opens a modal for the accepting player to choose the card they will give up.
 * @param {string} requestId - The ID of the swap request to be accepted.
 */
async function handleAcceptSwap(requestId) {
    // Fetch the request details to know *which card* the accepting player MUST offer
    const { data: request, error: fetchError } = await api.supabaseClient
        .from('swap_requests')
        .select('item_id_request, request_card_details:item_id_request(name, image_url)')
        .eq('id', requestId)
        .single();
        
    if (fetchError || !request) return showToast("Request not found or invalid.", 'error');

    const requiredCardId = request.item_id_request;
    const requiredCardName = request.request_card_details.name;
    const requiredCardImage = request.request_card_details.image_url;
    
    // 1. Fetch the accepting player's cards that match the request
    const { data: playerAvailableCards, error: cardsError } = await api.fetchPlayerCards(state.currentUser.id);
    if (cardsError) return showToast("Error fetching your cards.", 'error');
    
    // 2. Filter: Only show cards that match the requested item_id (the card they must give)
    const offerableCards = playerAvailableCards.filter(pc => 
        pc.card_id === requiredCardId && !pc.is_locked
    );
    
    if (offerableCards.length === 0) {
        return showToast(`You must offer a ${requiredCardName} to accept this trade. You do not have one.`, 'error');
    }

    // 3. Build the modal to select the card instance to give up
    let cardsHTML = offerableCards.map(pc => {
        const card = pc.cards;
        return `
            <div class="card-stack" data-instance-id="${pc.instance_id}" data-card-name="${card.name}" onclick="executeAcceptance('${requestId}', '${pc.instance_id}')">
                <img src="${card.image_url || 'images/default_card.png'}" class="card-image">
                <h4>${card.name}</h4>
                <div class="card-details"><span class="card-level">LVL ${pc.level}</span></div>
            </div>
        `;
    }).join('');

    // 4. Create/Open the selector modal
    let modal = document.getElementById('accept-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'accept-selector-modal';
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('accept-selector-modal')">&times;</button>
            <h2>Counter-Offer: Select Your ${requiredCardName}</h2>
            <p style="margin-bottom: 20px;">You are accepting the trade. Select the specific ${requiredCardName} instance you wish to give up.</p>
            <div class="card-grid">${cardsHTML}</div>
        </div>
    `;
    window.openModal('accept-selector-modal');
}

/**
 * Step 2: Executes the full atomic transaction after the card instance is selected.
 * @param {string} requestId - The ID of the swap request.
 * @param {string} counterOfferInstanceId - The instance ID of the card the accepting player offers in return.
 */
async function executeAcceptance(requestId, counterOfferInstanceId) {
    window.closeModal('accept-selector-modal');
    showToast("Executing trade...", 'info');
    
    const { error, newCardName } = await api.acceptSwapRequest(
        requestId,
        state.currentUser.id,
        counterOfferInstanceId 
    );
    
    if (!error) {
        showToast(`Trade Complete! You received: ${newCardName}.`, 'success');
        await refreshPlayerState();
        renderBrowseRequests();
    } else {
        showToast(`Trade failed: ${error.message}`, 'error');
        console.error("Swap Execution Error:", error);
    }
}
// Attach the necessary global function
window.executeAcceptance = executeAcceptance;

// --------------------------------------------------------
// --- RENDER LOGIC (UI Presentation) ---
// --------------------------------------------------------

/**
 * Renders the list of all active swap requests (excluding the current player's).
 */
async function renderBrowseRequests() {
    const content = document.getElementById('swap-content-browse');
    content.innerHTML = '<p style="text-align:center;">Loading active requests...</p>';
    
    const { data: requests, error } = await api.fetchActiveSwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = '<p class="error-error">Error fetching swap requests.</p>';
    if (requests.length === 0) return content.innerHTML = '<p style="text-align:center; margin-top:20px;">No active swap requests found. Be the first to create one!</p>';

    content.innerHTML = requests.map(req => {
        const username = req.player_id_offering.substring(0, 8); 
        const offerRarityClass = `rarity-${req.offer_card.rarity_level || 0}`; 
        const requestRarityClass = `rarity-${req.request_card.rarity_level || 0}`;

        return `
            <div class="swap-request-card">
                <div class="card-header">
                    <span class="username">@${username}</span>
                    <span class="timestamp">${new Date(req.created_at).toLocaleTimeString()}</span>
                </div>
                
                <div class="trade-display-wrapper">
                    <div class="trade-card-item">
                        <img src="${req.offer_card.image_url || 'images/default_card.png'}" alt="Offer Card">
                        <p style="margin: 5px 0 0 0; font-size: 0.8em;">Offer:</p>
                        <h4 style="margin: 0; font-size: 0.9em;">${req.offer_card.name}</h4>
                        <span class="rarity ${offerRarityClass}" style="font-size: 0.7em;">Rarity Lvl ${req.offer_card.rarity_level || 0}</span>
                    </div>
                    
                    <div class="trade-icon">➡️</div>
                    
                    <div class="trade-card-item">
                        <img src="${req.request_card.image_url || 'images/default_card.png'}" alt="Request Card">
                        <p style="margin: 5px 0 0 0; font-size: 0.8em;">Requests:</p>
                        <h4 style="margin: 0; font-size: 0.9em;">${req.request_card.name}</h4>
                        <span class="rarity ${requestRarityClass}" style="font-size: 0.7em;">Rarity Lvl ${req.request_card.rarity_level || 0}</span>
                    </div>
                </div>

                <div class="actions">
                    <button class="action-button small" onclick="window.handleAcceptSwap('${req.id}')">Accept Trade</button>
                    <span class="price">${req.price_noub > 0 ? `+${req.price_noub} 🪙` : '1:1 Swap'}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Renders the current player's active requests.
 */
async function renderMyRequests() {
    const content = document.getElementById('swap-content-my_requests');
    content.innerHTML = '<p style="text-align:center;">Loading your active requests...</p>';
    
    // NOTE: Uses api.fetchMySwapRequests which needs implementation in api.js
    const { data: requests, error } = await api.fetchMySwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = '<p class="error-error">Error fetching your swap requests.</p>';
    if (requests.length === 0) return content.innerHTML = `<p style="text-align:center; margin-top:20px;">You have no active swap requests.</p>`;

    content.innerHTML = requests.map(req => {
        const offerRarityClass = `rarity-${req.offer_card.rarity_level || 0}`; 
        const requestRarityClass = `rarity-${req.request_card.rarity_level || 0}`;

        return `
            <div class="swap-request-card my-request">
                <div class="card-header">
                    <span class="username">Your Offer</span>
                    <span class="timestamp">${new Date(req.created_at).toLocaleTimeString()}</span>
                </div>
                
                <div class="trade-display-wrapper">
                    <div class="trade-card-item">
                        <img src="${req.offer_card.image_url || 'images/default_card.png'}" alt="Offer Card">
                        <p style="margin: 5px 0 0 0; font-size: 0.8em;">Offer:</p>
                        <h4 style="margin: 0; font-size: 0.9em;">${req.offer_card.name}</h4>
                        <span class="rarity ${offerRarityClass}" style="font-size: 0.7em;">Rarity Lvl ${req.offer_card.rarity_level || 0}</span>
                    </div>
                    
                    <div class="trade-icon">➡️</div>
                    
                    <div class="trade-card-item">
                        <img src="${req.request_card.image_url || 'images/default_card.png'}" alt="Request Card">
                        <p style="margin: 5px 0 0 0; font-size: 0.8em;">Requests:</p>
                        <h4 style="margin: 0; font-size: 0.9em;">${req.request_card.name}</h4>
                        <span class="rarity ${requestRarityClass}" style="font-size: 0.7em;">Rarity Lvl ${req.request_card.rarity_level || 0}</span>
                    </div>
                </div>

                <div class="actions">
                    <button class="action-button small danger" onclick="handleCancelOffer('${req.id}')">Cancel Offer</button>
                    <span class="price">${req.price_noub > 0 ? `+${req.price_noub} 🪙` : '1:1 Swap'}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Renders the form to create a new swap request.
 */
function renderCreateRequestUI() {
    const content = document.getElementById('swap-content-create');
    // Clear previous data
    window.SwapOfferData = null; 
    
    // Renders the initial state
    content.innerHTML = `
        <div class="create-swap-ui game-container" style="text-align:center; padding: 20px;">
            <p style="color:var(--primary-accent); font-weight:bold;">CREATE NEW SWAP REQUEST</p>
            
            <!-- Area to show the selected card (starts hidden) -->
            <div id="offer-selection-display" style="min-height: 100px; margin-bottom: 20px; border: 1px dashed #444; border-radius: 8px; padding: 10px; display: none;">
                <p>Offering: <span id="offered-card-name" style="color: var(--success-color);"></span></p>
                <p>Requesting: <span id="request-card-name" style="color: var(--accent-blue);">Any Card</span></p>
                <button id="finalize-swap-btn" class="action-button small" style="margin-top: 10px;">Finalize Swap Request</button>
            </div>
            
            <button id="start-create-btn" class="action-button" onclick="window.openCardSelectorModal('offer')">
                Select Card to Offer
            </button>
            <p style="margin-top: 20px; font-size: 0.8em; color:var(--text-secondary);">
                You will choose which card from your collection to offer, and which card type you wish to receive in return.
            </p>
        </div>
    `;
    
    // Re-attach the selector function
    window.openCardSelectorModal = openCardSelectorModal;

    // Finalize button handler
    document.getElementById('finalize-swap-btn').onclick = finalizeSwapRequest;
}

// --- CARD SELECTOR LOGIC ---

/**
 * Opens a modal for the player to select a card from their collection.
 * (Simplified version: does not require accepting player's card instance)
 */
async function openCardSelectorModal(mode) {
    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error || !playerCards || playerCards.length === 0) {
        showToast("You have no cards to offer.", 'error');
        return;
    }

    // Filter out locked cards
    let cardsHTML = playerCards.map(pc => {
        // We now check the dedicated 'is_locked' column
        const isLocked = pc.is_locked; 
        const card = pc.cards;

        return `
            <div class="card-stack ${isLocked ? 'is-locked' : ''}" data-instance-id="${pc.instance_id}" data-card-id="${card.id}" data-card-name="${card.name}" style="${isLocked ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;'}">
                <img src="${card.image_url || 'images/default_card.png'}" class="card-image">
                <h4>${card.name}</h4>
                <div class="card-details"><span class="card-level">LVL ${pc.level}</span></div>
            </div>
        `;
    }).join('');

    // Create a temporary modal if it doesn't exist
    cardSelectorModal = document.getElementById('card-selector-modal');
    if (!cardSelectorModal) {
        cardSelectorModal = document.createElement('div');
        cardSelectorModal.id = 'card-selector-modal';
        cardSelectorModal.className = 'modal-overlay hidden';
        document.body.appendChild(cardSelectorModal);
    }
    
    // Set the modal content
    cardSelectorModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-selector-modal')">&times;</button>
            <h2>Select Card to ${mode.toUpperCase()}</h2>
            <p>Select the specific card instance you wish to offer for trade.</p>
            <div class="card-grid">${cardsHTML}</div>
        </div>
    `;

    // Attach click handlers
    cardSelectorModal.querySelectorAll('.card-stack').forEach(cardElement => {
        cardElement.addEventListener('click', () => {
            if (cardElement.classList.contains('is-locked')) {
                showToast("This card is locked for another swap or assignment.", 'info');
                return;
            }
            
            const cardName = cardElement.dataset.cardName;
            const cardInstanceId = cardElement.dataset.instanceId;
            const cardId = cardElement.dataset.cardId;

            showToast(`Selected ${cardName} as the offer!`, 'success');
            
            // --- Final Step: Update UI and Store Data ---
            document.getElementById('offered-card-name').textContent = cardName;
            document.getElementById('offer-selection-display').style.display = 'block';
            document.getElementById('start-create-btn').style.display = 'none';
            document.getElementById('finalize-swap-btn').disabled = false;
            
            // Store selected data globally for final submission
            window.SwapOfferData = { instanceId: cardInstanceId, cardId: cardId, cardName: cardName };
            
            window.closeModal('card-selector-modal');
        });
    });

    window.openModal('card-selector-modal');
}


// --- FINAL RENDER AND INITIALIZATION ---

export async function renderSwapScreen() {
    if (!state.currentUser) return;
    
    // Ensure UI is built once
    if (!document.getElementById('swap-tabs-container')) {
        swapContainer = document.getElementById('swap-screen');
        swapContainer.innerHTML = `
            <h2>P2P Swap Market</h2>
            <div id="swap-tabs-container">
                <button class="swap-tab-btn active" data-swap-tab="browse">Browse</button>
                <button class="swap-tab-btn" data-swap-tab="my_requests">My Requests</button>
                <button class="swap-tab-btn" data-swap-tab="create">Create</button>
            </div>
            
            <div id="swap-content-browse" class="swap-content-tab"></div>
            <div id="swap-content-my_requests" class="swap-content-tab hidden"></div>
            <div id="swap-content-create" class="swap-content-tab hidden"></div>
        `;
        
        // Attach event listeners to the tabs
        document.querySelectorAll('.swap-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleSwapTabSwitch(e.target.dataset.swapTab));
        });

        // Initialize global handler for acceptance (must be available in the window scope)
        window.handleAcceptSwap = handleAcceptSwap;
        window.openCardSelectorModal = openCardSelectorModal; // Make card selector available globally
    }

    // Initial load: Render the default 'browse' tab
    handleSwapTabSwitch('browse');
}
// --------------------------------------------------------
// --- FINAL FIX: EXPOSE FUNCTIONS TO GLOBAL SCOPE (WINDOW) ---
// --- This solves the Uncaught ReferenceError for HTML onclick ---
// --------------------------------------------------------

window.handleCancelOffer = handleCancelOffer;
window.handleAcceptSwap = handleAcceptSwap;
window.executeAcceptance = executeAcceptance;
window.openCardSelectorModal = openCardSelectorModal; 


// NOTE: No further action is needed inside ui.js or main.js for this specific fix.
