/*
 * Filename: js/screens/swap_screen.js
 * Version: NOUB v3.1.0 (Final Complete Edition)
 * Author: Sameh Yassin & Co-Pilot
 * 
 * Description: 
 * Manages the Player-to-Player (P2P) Swap Market UI.
 * This module is purely Client-Side Logic acting as a controller for the new Pure JS API.
 * It handles the full trade lifecycle: Create, Browse, Accept, Cancel.
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- Module Scope Variables ---
let swapContainer;
let cardSelectorModal;
let acceptSelectorModal;

/**
 * Global State for "Create Offer" Flow.
 * Stores temporary selections before the user clicks "Publish".
 */
window.SwapOfferData = {
    offerInstanceId: null, // UUID of the card to give (Owned)
    offerCardId: null,     // Master ID of the card to give
    offerCardName: null,
    requestCardId: null,   // Master ID of the card to receive
    requestCardName: null
};

// ========================================================
// --- 1. NAVIGATION & TABS ---
// ========================================================

export async function renderSwapScreen() {
    if (!state.currentUser) return;
    
    // Singleton Render: Only build layout if missing
    if (!document.getElementById('swap-tabs-container')) {
        swapContainer = document.getElementById('swap-screen');
        swapContainer.innerHTML = `
            <h2 class="screen-title" style="text-align:center; color:var(--primary-accent); margin-bottom:15px;">Global Exchange</h2>
            
            <!-- Tab Navigation -->
            <div id="swap-tabs-container" class="tabs-header" style="display:flex; justify-content:space-around; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:5px;">
                <button class="swap-tab-btn active" data-swap-tab="browse" style="flex:1; padding:10px; background:none; border:none; color:#888; cursor:pointer; font-weight:bold;">Market</button>
                <button class="swap-tab-btn" data-swap-tab="my_requests" style="flex:1; padding:10px; background:none; border:none; color:#888; cursor:pointer; font-weight:bold;">My Offers</button>
                <button class="swap-tab-btn" data-swap-tab="create" style="flex:1; padding:10px; background:none; border:none; color:#888; cursor:pointer; font-weight:bold;">Post Offer</button>
            </div>
            
            <!-- Content Containers -->
            <div id="swap-content-browse" class="swap-content-tab"></div>
            <div id="swap-content-my_requests" class="swap-content-tab hidden"></div>
            <div id="swap-content-create" class="swap-content-tab hidden"></div>
        `;
        
        // Event Delegation for Tabs
        document.querySelectorAll('.swap-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleSwapTabSwitch(e.target.dataset.swapTab));
        });
    }

    // Initial Load
    handleSwapTabSwitch('browse');
}

function handleSwapTabSwitch(tabName) {
    // 1. Update Active Tab Style
    document.querySelectorAll('.swap-tab-btn').forEach(btn => {
        const isActive = btn.dataset.swapTab === tabName;
        btn.classList.toggle('active', isActive);
        btn.style.color = isActive ? 'var(--primary-accent)' : '#888';
        btn.style.borderBottom = isActive ? '2px solid var(--primary-accent)' : 'none';
    });

    // 2. Toggle Content Visibility
    document.querySelectorAll('.swap-content-tab').forEach(div => div.classList.add('hidden'));
    const targetDiv = document.getElementById(`swap-content-${tabName}`);
    if (targetDiv) targetDiv.classList.remove('hidden');

    // 3. Load Data
    if (tabName === 'browse') renderBrowseRequests();
    else if (tabName === 'my_requests') renderMyRequests();
    else if (tabName === 'create') renderCreateRequestUI();
}

// ========================================================
// --- 2. CREATE REQUEST UI ---
// ========================================================

function renderCreateRequestUI() {
    const content = document.getElementById('swap-content-create');
    
    // Restore or Reset State
    if (!window.SwapOfferData) window.SwapOfferData = {};
    
    const offerName = window.SwapOfferData.offerCardName || "Select Card...";
    const requestName = window.SwapOfferData.requestCardName || "Select Card...";
    
    // Validation
    const isValid = window.SwapOfferData.offerInstanceId && window.SwapOfferData.requestCardId;
    const btnOpacity = isValid ? '1' : '0.5';
    const btnCursor = isValid ? 'pointer' : 'not-allowed';

    content.innerHTML = `
        <div class="create-ui" style="text-align:center; padding:10px;">
            <h3 style="color:var(--accent-blue); margin-bottom:20px;">Create New Trade</h3>
            
            <!-- Trade Visualizer -->
            <div style="display:flex; align-items:center; justify-content:space-between; background:#1a1a1a; padding:15px; border-radius:12px; margin-bottom:20px; border:1px solid #444;">
                
                <!-- OFFER SIDE -->
                <div style="width:40%; cursor:pointer;" onclick="window.openCardSelectorModal('offer')">
                    <p style="font-size:0.7em; color:#aaa; margin-bottom:5px; text-transform:uppercase;">You Give</p>
                    <div style="border:1px dashed var(--success-color); padding:15px 5px; border-radius:8px; color:var(--success-color); font-weight:bold; min-height:50px; display:flex; align-items:center; justify-content:center;">
                        ${offerName}
                    </div>
                </div>
                
                <div style="font-size:1.5em; color:#666;">⇄</div>
                
                <!-- REQUEST SIDE -->
                <div style="width:40%; cursor:pointer;" onclick="window.openCardSelectorModal('request')">
                    <p style="font-size:0.7em; color:#aaa; margin-bottom:5px; text-transform:uppercase;">You Want</p>
                    <div style="border:1px dashed var(--accent-blue); padding:15px 5px; border-radius:8px; color:var(--accent-blue); font-weight:bold; min-height:50px; display:flex; align-items:center; justify-content:center;">
                        ${requestName}
                    </div>
                </div>
            </div>
            
            <!-- Info & Action -->
            <p style="font-size:0.75em; color:#666; margin-bottom:20px; line-height:1.4;">
                <span style="color:var(--danger-color);">Note:</span> The card you offer will be locked.<br>
                It cannot be used until the trade ends.
            </p>

            <button id="finalize-swap-btn" class="action-button" style="width:100%; opacity:${btnOpacity}; cursor:${btnCursor};" 
                onclick="window.finalizeSwapRequest()" ${isValid ? '' : 'disabled'}>
                Publish Offer
            </button>
        </div>
    `;
}

/**
 * Opens modal to select cards.
 * Mode 'offer' = From User Inventory.
 * Mode 'request' = From Master Game Catalog.
 */
async function openCardSelectorModal(mode) {
    showToast("Loading...", "info");
    
    let listData = [];
    let modalTitle = "";

    try {
        if (mode === 'offer') {
            modalTitle = "Select from your Collection";
            const { data } = await api.fetchPlayerCards(state.currentUser.id);
            
            // Filter: Show unlocked cards only
            if (data) {
                listData = data.filter(pc => !pc.is_locked).map(pc => ({
                    id: pc.cards.id,
                    uniqueId: pc.instance_id,
                    name: pc.cards.name,
                    img: pc.cards.image_url,
                    rarity: pc.cards.rarity_level
                }));
            }
        } else {
            modalTitle = "Select Desired Card";
            const { data } = await api.fetchAllMasterCards();
            
            if (data) {
                listData = data.map(mc => ({
                    id: mc.id,
                    uniqueId: null,
                    name: mc.name,
                    img: mc.image_url,
                    rarity: mc.rarity_level || 0
                }));
            }
        }

        if (listData.length === 0) return showToast("No cards found.", 'error');

        // DOM Creation
        const modalId = 'card-selector-modal';
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal-overlay hidden';
            document.body.appendChild(modal);
        }

        const gridHTML = listData.map(c => {
            const rarityColor = getRarityColor(c.rarity);
            return `
                <div onclick="window.selectCardForSwap('${mode}', ${c.id}, '${c.uniqueId}', '${c.name}')" 
                     style="text-align:center; cursor:pointer; padding:8px; background:#222; border-radius:8px; border:1px solid ${rarityColor};">
                    <img src="${c.img || 'images/default_card.png'}" style="width:50px; height:50px; border-radius:4px; object-fit:cover;">
                    <div style="font-size:0.7em; margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#ddd;">
                        ${c.name}
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-height:70vh;">
                <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
                <h3 style="text-align:center; color:#fff; margin-bottom:15px;">${modalTitle}</h3>
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; overflow-y:auto; max-height:50vh; padding-right:5px;">
                    ${gridHTML}
                </div>
            </div>
        `;
        openModal(modalId);

    } catch (e) {
        console.error(e);
        showToast("Error loading list.", 'error');
    }
}

window.selectCardForSwap = (mode, masterId, uniqueId, name) => {
    if (mode === 'offer') {
        window.SwapOfferData.offerCardId = masterId;
        window.SwapOfferData.offerInstanceId = uniqueId;
        window.SwapOfferData.offerCardName = name;
    } else {
        window.SwapOfferData.requestCardId = masterId;
        window.SwapOfferData.requestCardName = name;
    }
    window.closeModal('card-selector-modal');
    renderCreateRequestUI();
};

async function finalizeSwapRequest() {
    const { offerInstanceId, offerCardId, requestCardId } = window.SwapOfferData;
    
    if (!offerInstanceId || !requestCardId) return;
    
    const btn = document.getElementById('finalize-swap-btn');
    btn.disabled = true;
    btn.innerText = "Processing...";

    const { error } = await api.createSwapRequest(
        state.currentUser.id,
        offerInstanceId,
        offerCardId,
        requestCardId
    );

    if (error) {
        showToast(error.message, 'error');
        btn.disabled = false;
        btn.innerText = "Publish Offer";
    } else {
        showToast("Offer published!", 'success');
        window.SwapOfferData = { offerInstanceId: null, requestCardId: null }; // Reset
        await refreshPlayerState();
        handleSwapTabSwitch('my_requests');
    }
}

// ========================================================
// --- 3. BROWSE UI ---
// ========================================================

async function renderBrowseRequests() {
    const content = document.getElementById('swap-content-browse');
    content.innerHTML = '<p style="text-align:center; padding:20px;">Refreshing market...</p>';
    
    const { data: requests, error } = await api.fetchActiveSwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = `<p class="error-text">Connection error.</p>`;
    if (!requests || requests.length === 0) return content.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Market is currently empty.</p>';

    content.innerHTML = requests.map(req => {
        const shortUser = req.player_id_offering.slice(0, 6);
        const offerColor = getRarityColor(req.offer_card.rarity_level);
        const requestColor = getRarityColor(req.request_card.rarity_level);

        return `
            <div class="swap-card" style="background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75em; color:#666; margin-bottom:10px;">
                    <span>Merchant: <b style="color:#ccc;">${shortUser}</b></span>
                    <span>Price: 0 🪙</span> <!-- Placeholder for future pricing -->
                </div>
                
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <!-- OFFER -->
                    <div style="text-align:center; width:40%;">
                        <div style="position:relative; display:inline-block;">
                            <img src="${req.offer_card.image_url}" style="width:55px; height:55px; border-radius:6px; border:2px solid ${offerColor};">
                            <div style="font-size:0.6em; background:#333; color:#fff; padding:1px 4px; border-radius:4px; position:absolute; bottom:-5px; left:50%; transform:translateX(-50%);">OFFER</div>
                        </div>
                        <div style="font-size:0.75em; margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${req.offer_card.name}</div>
                    </div>

                    <div style="color:var(--primary-accent); font-size:1.5em;">➜</div>

                    <!-- REQUEST -->
                    <div style="text-align:center; width:40%;">
                        <div style="position:relative; display:inline-block;">
                            <img src="${req.request_card.image_url}" style="width:55px; height:55px; border-radius:6px; border:2px dashed ${requestColor}; opacity:0.8;">
                            <div style="font-size:0.6em; background:#333; color:#fff; padding:1px 4px; border-radius:4px; position:absolute; bottom:-5px; left:50%; transform:translateX(-50%);">WANT</div>
                        </div>
                        <div style="font-size:0.75em; margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${req.request_card.name}</div>
                    </div>
                </div>

                <button class="action-button small" style="width:100%; margin-top:15px; background:var(--accent-blue); border:none;" 
                    onclick="window.handleAcceptSwap('${req.id}')">
                    Accept Trade
                </button>
            </div>
        `;
    }).join('');
}

/**
 * User clicks "Accept Trade".
 * Validates ownership of the requested card before executing.
 */
async function handleAcceptSwap(requestId) {
    showToast("Checking requirements...", 'info');

    const { data: request } = await api.supabaseClient.from('swap_requests').select('*, item_id_request').eq('id', requestId).single();
    if (!request) return showToast("Offer expired.", 'error');

    // Check Inventory
    const { data: myCards } = await api.fetchPlayerCards(state.currentUser.id);
    const matching = myCards.filter(c => c.card_id === request.item_id_request && !c.is_locked);

    if (matching.length === 0) {
        return showToast("You don't have the required card to trade.", 'error');
    }

    // Show Instance Selector
    const modalId = 'accept-selector-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    const listHTML = matching.map(c => `
        <div onclick="window.executeAcceptance('${requestId}', '${c.instance_id}')" 
             style="background:#252525; padding:10px; margin-bottom:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; border:1px solid #444;">
             <div style="display:flex; align-items:center; gap:10px;">
                <img src="${c.cards.image_url}" style="width:40px; height:40px; border-radius:4px;">
                <div>
                    <div style="color:#fff; font-size:0.9em;">${c.cards.name}</div>
                    <div style="font-size:0.75em; color:#888;">Lvl ${c.level} • Pwr ${c.power_score}</div>
                </div>
             </div>
             <div style="color:var(--success-color); font-weight:bold; font-size:0.8em;">SELECT</div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <h3>Confirm Payment</h3>
            <p style="font-size:0.85em; color:#aaa; margin-bottom:15px;">Select which copy you want to give:</p>
            <div style="max-height:300px; overflow-y:auto;">
                ${listHTML}
            </div>
        </div>
    `;
    openModal(modalId);
}

async function executeAcceptance(requestId, paymentInstanceId) {
    window.closeModal('accept-selector-modal');
    showToast("Executing trade...", 'info');

    const { error, newCardName } = await api.acceptSwapRequest(
        requestId,
        state.currentUser.id,
        paymentInstanceId
    );

    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast(`Trade Complete! Received: ${newCardName}`, 'success');
        await refreshPlayerState();
        renderBrowseRequests();
    }
}

// ========================================================
// --- 4. MY REQUESTS UI ---
// ========================================================

async function renderMyRequests() {
    const content = document.getElementById('swap-content-my_requests');
    content.innerHTML = '<p style="text-align:center;">Syncing...</p>';
    
    const { data: requests, error } = await api.fetchMySwapRequests(state.currentUser.id);

    if (error) return content.innerHTML = '<p class="error-text">Network error.</p>';
    if (!requests || requests.length === 0) return content.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">You have no active offers.</p>';

    content.innerHTML = requests.map(req => `
        <div class="swap-card" style="background:#1e1e1e; border-left:4px solid var(--primary-accent); border-radius:10px; padding:15px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; font-size:0.8em; color:#888; margin-bottom:10px;">
                <span style="color:var(--primary-accent); font-weight:bold;">ACTIVE OFFER</span>
                <span>${new Date(req.created_at).toLocaleDateString()}</span>
            </div>
            
            <div style="display:flex; align-items:center; justify-content:space-around;">
                <div style="text-align:center;">
                    <img src="${req.offer_card.image_url}" style="width:45px; height:45px; border-radius:5px; opacity:0.7;">
                    <div style="font-size:0.7em;">You Give</div>
                </div>
                <div style="font-size:1.2em;">➜</div>
                <div style="text-align:center;">
                    <img src="${req.request_card.image_url}" style="width:45px; height:45px; border-radius:5px; opacity:0.7;">
                    <div style="font-size:0.7em;">You Ask</div>
                </div>
            </div>

            <button class="action-button small danger" style="width:100%; margin-top:15px;" onclick="window.handleCancelOffer('${req.id}')">
                Cancel Offer
            </button>
        </div>
    `).join('');
}

export async function handleCancelOffer(requestId) {
    if (!confirm("Cancel this offer? Your card will be returned to you.")) return;

    // Need to fetch request first to know which instance to unlock
    const { data: request } = await api.supabaseClient.from('swap_requests').select('card_instance_id_offer, player_id_offering').eq('id', requestId).single();
    
    if (request) {
        const { error } = await api.cancelSwapRequest(requestId, request.player_id_offering, request.card_instance_id_offer);
        if (!error) {
            showToast("Offer cancelled.", 'success');
            await refreshPlayerState();
            renderMyRequests();
        } else {
            showToast("Failed to cancel.", 'error');
        }
    }
}

// ========================================================
// --- HELPER & BINDING ---
// ========================================================

function getRarityColor(level) {
    switch(level) {
        case 0: return '#95a5a6';
        case 2: return '#3498db';
        case 4: return '#9b59b6';
        case 6: return '#f39c12';
        case 8: return '#f1c40f';
        default: return '#666';
    }
}

// Export global handlers for HTML onclick
window.openCardSelectorModal = openCardSelectorModal;
window.selectCardForSwap = (mode, masterId, uniqueId, name) => {
    if (mode === 'offer') {
        window.SwapOfferData.offerCardId = masterId;
        window.SwapOfferData.offerInstanceId = uniqueId;
        window.SwapOfferData.offerCardName = name;
    } else {
        window.SwapOfferData.requestCardId = masterId;
        window.SwapOfferData.requestCardName = name;
    }
    window.closeModal('card-selector-modal');
    renderCreateRequestUI();
};
window.finalizeSwapRequest = finalizeSwapRequest;
window.handleAcceptSwap = handleAcceptSwap;
window.executeAcceptance = executeAcceptance;
window.handleCancelOffer = handleCancelOffer;
