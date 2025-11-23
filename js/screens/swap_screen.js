/*
 * Filename: js/screens/swap_screen.js
 * Version: NOUB v2.2.1 (P2P Swap Market - Final Create Logic)
 * Description: Implements the UI structure for the Player-to-Player Swap Market,
 * and the logic for the initial card selection for creating a new request.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Element References (to be set in renderSwapScreen)
let swapContainer;

// --- CARD SELECTOR LOGIC ---

/**
 * Opens a modal for the player to select a card from their collection.
 * @param {string} mode - 'offer' (select a card to give) or 'request' (select a card to receive).
 */
async function openCardSelectorModal(mode) {
    const { data: playerCards, error } = await api.fetchPlayerCards(state.currentUser.id);

    if (error || !playerCards || playerCards.length === 0) {
        showToast("You have no cards to offer.", 'error');
        return;
    }

    let cardsHTML = playerCards.map(pc => {
        // Assume 'is_locked_for_swap' is added to player_cards table
        const isLocked = pc.is_locked_for_swap; 
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
    let modal = document.getElementById('card-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'card-selector-modal';
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }
    
    // Set the modal content
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-selector-modal')">&times;</button>
            <h2>Select Card to ${mode.toUpperCase()}</h2>
            <p>Select the specific card instance you wish to offer for trade.</p>
            <div class="card-grid">${cardsHTML}</div>
        </div>
    `;

    // Attach click handlers
    modal.querySelectorAll('.card-stack').forEach(cardElement => {
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


// --------------------------------------------------------
// --- MAIN SWAP SCREEN LOGIC ---
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

/**
 * Renders the list of all active swap requests (excluding the current player's).
 */
async function renderBrowseRequests() {
    const content = document.getElementById('swap-content-browse');
    content.innerHTML = '<p style="text-align:center;">Loading active requests...</p>';
    
    // NOTE: This assumes api.fetchActiveSwapRequests returns data with card image URLs
    const { data: requests, error } = await api.fetchActiveSwapRequests(state.currentUser.id);

    if (error) {
        return content.innerHTML = '<p class="error-error">Error fetching swap requests.</p>';
    }

    if (requests.length === 0) {
        return content.innerHTML = '<p style="text-align:center; margin-top:20px;">No active swap requests found. Be the first to create one!</p>';
    }

    // --- Dynamic Rendering of Request Cards (Mockup based on CapsGame) ---
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
                
                <div class="trade-summary">
                    <div class="offer-side">
                        <img src="${req.offer_card.image_url || 'images/default_card.png'}" alt="Offer Card">
                        <div class="details">
                            <h4>Offer: ${req.offer_card.name}</h4>
                            <span class="rarity ${offerRarityClass}">Rarity Lvl ${req.offer_card.rarity_level || 0}</span>
                        </div>
                    </div>
                    
                    <div class="trade-icon">🔄</div>
                    
                    <div class="request-side">
                        <img src="${req.request_card.image_url || 'images/default_card.png'}" alt="Request Card">
                        <div class="details">
                            <h4>Requests: ${req.request_card.name}</h4>
                            <span class="rarity ${requestRarityClass}">Rarity Lvl ${req.request_card.rarity_level || 0}</span>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <button class="action-button small" onclick="handleAcceptSwap('${req.id}')">Accept Trade</button>
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
    
    // --- NEW: Fetch and Render Player's Requests ---
    const { data: requests, error } = await api.fetchMySwapRequests(state.currentUser.id);

    if (error) {
        return content.innerHTML = '<p class="error-error">Error fetching your swap requests.</p>';
    }

    if (requests.length === 0) {
        return content.innerHTML = `
            <p style="text-align:center; margin-top:20px;">You have no active swap requests.</p>
            <button class="action-button small" style="margin-top: 15px;" onclick="handleSwapTabSwitch('create')">Create a new offer</button>
        `;
    }

    // --- Dynamic Rendering of Request Cards (Using the same visual style as browse) ---
    content.innerHTML = requests.map(req => {
        const offerRarityClass = `rarity-${req.offer_card.rarity_level || 0}`; 
        const requestRarityClass = `rarity-${req.request_card.rarity_level || 0}`;

        return `
            <div class="swap-request-card my-request">
                <div class="card-header">
                    <span class="username">Your Offer</span>
                    <span class="timestamp">${new Date(req.created_at).toLocaleTimeString()}</span>
                </div>
                
                <div class="trade-summary">
                    <div class="offer-side">
                        <img src="${req.offer_card.image_url || 'images/default_card.png'}" alt="Offer Card">
                        <div class="details">
                            <h4>Offer: ${req.offer_card.name}</h4>
                            <span class="rarity ${offerRarityClass}">Rarity Lvl ${req.offer_card.rarity_level || 0}</span>
                        </div>
                    </div>
                    
                    <div class="trade-icon">🔄</div>
                    
                    <div class="request-side">
                        <img src="${req.request_card.image_url || 'images/default_card.png'}" alt="Request Card">
                        <div class="details">
                            <h4>Requests: ${req.request_card.name}</h4>
                            <span class="rarity ${requestRarityClass}">Rarity Lvl ${req.request_card.rarity_level || 0}</span>
                        </div>
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

// --- Placeholder for Cancellation (Must be implemented later) ---
function handleCancelOffer(requestId) {
    showToast(`Cancellation logic for ${requestId} pending.`, 'info');
    // NOTE: This will require another complex API function to unlock the card and change the status.
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
                <button id="finalize-swap-btn" class="action-button small" style="margin-top: 10px;" disabled>Finalize Swap Request</button>
            </div>
            
            <button id="start-create-btn" class="action-button" onclick="window.openCardSelectorModal('offer')">
                Select Card to Offer
            </button>
            <p style="margin-top: 20px; font-size: 0.8em; color:var(--text-secondary);">
                You will choose which card from your collection to offer, and which card type you wish to receive in return.
            </p>
        </div>
    `;
    
    // Re-attach the selector function (since it is needed globally)
    window.openCardSelectorModal = openCardSelectorModal;

    // Finalize button handler
    document.getElementById('finalize-swap-btn').onclick = finalizeSwapRequest;
}


// --- FINAL SUBMISSION LOGIC ---

async function finalizeSwapRequest() {
    if (!window.SwapOfferData || !window.SwapOfferData.instanceId) {
        return showToast("Please select a card to offer first.", 'error');
    }
    
    // MOCKUP: For now, we assume the player requests card ID 10 (a Pharaonic Ruler) for any 
    const requestCardId = 10; 
    
    showToast("Finalizing swap request...", 'info');
    
    const { error } = await api.createSwapRequest(
        state.currentUser.id,
        window.SwapOfferData.instanceId,
        window.SwapOfferData.cardId,
        requestCardId
    );
    
    if (!error) {
        showToast("Swap Request Created! Check 'My Requests' tab.", 'success');
        // Clean up and refresh
        window.SwapOfferData = null;
        await refreshPlayerState();
        // Switch to My Requests tab to show the new request
        handleSwapTabSwitch('my_requests'); 
    } else {
        showToast(`Failed to create swap request. Error: ${error.message}`, 'error');
    }
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
    }

    // Initial load: Render the default 'browse' tab
    handleSwapTabSwitch('browse');
    
    // Attach global handler for card acceptance (MOCK)
    window.handleAcceptSwap = async (requestId) => {
        showToast(`Attempting to accept request ${requestId}...`, 'info');
        // This is highly complex and requires a confirmation modal for the player to select the card they offer
        showToast("Acceptance flow is complex. Implementation pending.", 'error');
        // await api.acceptSwapRequest(requestId, state.currentUser.id);
    };
}
