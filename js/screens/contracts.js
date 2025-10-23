/*
 * Filename: js/screens/contracts.js
 * Version: 19.0 (Stability & Contract Refresh)
 * Description: View Logic Module for the contracts screen.
 * Implemented contract refresh button and adopted full state refresh upon delivery.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js'; // NEW IMPORT

const activeContractsContainer = document.getElementById('active-contracts-container');
const availableContractsContainer = document.getElementById('available-contracts-container');
const contractDetailModal = document.getElementById('contract-detail-modal');
const refreshBtn = document.getElementById('refresh-contracts-btn');

/**
 * Handles the logic for accepting a new contract.
 */
async function handleAcceptContract(contractId) {
    showToast('Accepting contract...');
    const { error } = await api.acceptContract(state.currentUser.id, contractId);

    if (error) {
        showToast('Error accepting contract!', 'error');
    } else {
        showToast('Contract Accepted!', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
        renderAvailableContracts();
    }
}

/**
 * Handles the logic for delivering/completing an active contract.
 */
async function handleDeliverContract(playerContract, requirements) {
    showToast('Delivering goods...');

    // 1. Consume required items from inventory
    const consumePromises = requirements.map(req => {
        const currentQty = state.inventory.get(req.items.id)?.qty || 0;
        const newQty = currentQty - req.quantity;
        state.inventory.set(req.items.id, { ...state.inventory.get(req.items.id), qty: newQty }); // Update state locally
        return api.updateItemQuantity(state.currentUser.id, req.items.id, newQty);
    });
    await Promise.all(consumePromises);

    // 2. Calculate new currency totals
    const contractDetails = playerContract.contracts;
    const newTotals = {
        score: (state.playerProfile.score || 0) + contractDetails.reward_score,
        prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige
    };

    // 3. Mark contract as complete and update profile
    const { error } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);

    if (error) {
        showToast('Error completing contract!', 'error');
        // IMPORTANT: The state is refreshed below, which will fix the currency if the update failed.
    } else {
        showToast('Contract Completed! Rewards received.', 'success');
    }

    // CRITICAL FIX: Refresh all player state from the database after transaction
    await refreshPlayerState();

    window.closeModal('contract-detail-modal');
    renderActiveContracts();
}

/**
 * NEW FUNCTION: Handles the "Refresh" button click, clearing old contracts for testing.
 */
async function handleRefreshContracts() {
    refreshBtn.disabled = true;
    showToast('Refreshing available contracts...');
    
    // In a real game, this would generate new contracts. Here, we delete old history.
    const { error } = await api.refreshAvailableContracts(state.currentUser.id);

    if (error) {
        showToast('Error refreshing contracts!', 'error');
        console.error(error);
    } else {
        showToast('Contracts refreshed!', 'success');
        renderAvailableContracts();
    }

    refreshBtn.disabled = false;
}

/**
 * Opens the detail modal for a specific contract.
 */
async function openContractModal(contractId, playerContract = null) {
    const { data: contract, error } = await api.fetchContractWithRequirements(contractId);
    if (error) {
        showToast('Error fetching contract details!', 'error');
        return;
    }

    // Check inventory for requirements
    let allRequirementsMet = true;
    const requirementsHTML = contract.contract_requirements.map(req => {
        const playerQty = state.inventory.get(req.items.id)?.qty || 0;
        const hasEnough = playerQty >= req.quantity;
        if (!hasEnough) allRequirementsMet = false;
        
        return `
            <div class="req-item">
                <div class="req-item-name">
                    <img src="${req.items.image_url || 'images/default_item.png'}" alt="${req.items.name}">
                    <span>${req.items.name}</span>
                </div>
                <span class="req-item-progress ${hasEnough ? 'met' : ''}">${playerQty} / ${req.quantity}</span>
            </div>
        `;
    }).join('');

    const isAccepted = playerContract !== null;
    let actionButtonHTML;
    if (isAccepted) {
        actionButtonHTML = `<button id="contract-action-btn" class="action-button" ${allRequirementsMet ? '' : 'disabled'}>Deliver</button>`;
    } else {
        actionButtonHTML = `<button id="contract-action-btn" class="action-button">Accept Contract</button>`;
    }

    const modalHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('contract-detail-modal')">&times;</button>
            <div class="contract-modal-header">
                <h3>${contract.title}</h3>
            </div>
            <p class="contract-modal-desc">${contract.description}</p>
            
            <h4 class="contract-modal-subtitle">Requirements</h4>
            <div class="contract-modal-reqs">${requirementsHTML}</div>
            
            <h4 class="contract-modal-subtitle">Rewards</h4>
            <div class="contract-modal-rewards">
                <div class="reward-item">
                    <span class="icon">☥</span>
                    <div>${contract.reward_score} Ankh</div>
                </div>
                <div class="reward-item">
                    <span class="icon">👑</span>
                    <div>${contract.reward_prestige} Prestige</div>
                </div>
            </div>
            
            ${actionButtonHTML}
        </div>
    `;

    contractDetailModal.innerHTML = modalHTML;
    openModal('contract-detail-modal');

    const actionBtn = document.getElementById('contract-action-btn');
    if (isAccepted) {
        actionBtn.onclick = () => handleDeliverContract(playerContract, contract.contract_requirements);
    } else {
        actionBtn.onclick = () => handleAcceptContract(contractId);
    }
}

/**
 * Renders the list of contracts the player has accepted but not completed.
 */
export async function renderActiveContracts() {
    if (!state.currentUser) return;
    activeContractsContainer.innerHTML = 'Loading active contracts...';

    const { data: contracts, error } = await api.fetchPlayerContracts(state.currentUser.id);

    if (error) {
        activeContractsContainer.innerHTML = '<p class="error-message">Error loading contracts.</p>';
        return;
    }
    if (!contracts || contracts.length === 0) {
        activeContractsContainer.innerHTML = '<p>You have no active contracts.</p>';
        return;
    }

    activeContractsContainer.innerHTML = '';
    contracts.forEach(pc => {
        const contract = pc.contracts;
        const card = document.createElement('div');
        card.className = 'contract-card';
        card.innerHTML = `
            <h4>${contract.title}</h4>
            <div class="contract-rewards">
                Rewards: <span>${contract.reward_score} ☥</span> | <span>${contract.reward_prestige} 👑</span>
            </div>
        `;
        card.onclick = () => openContractModal(contract.id, pc);
        activeContractsContainer.appendChild(card);
    });
}

/**
 * Renders the list of new contracts available for the player to accept.
 */
export async function renderAvailableContracts() {
    if (!state.currentUser) return;
    availableContractsContainer.innerHTML = 'Loading available contracts...';

    // Attach refresh event listener
    refreshBtn.addEventListener('click', handleRefreshContracts);

    const { data: contracts, error } = await api.fetchAvailableContracts(state.currentUser.id);
    
    if (error) {
        availableContractsContainer.innerHTML = '<p class="error-message">Error loading contracts.</p>';
        return;
    }
    if (!contracts || contracts.length === 0) {
        availableContractsContainer.innerHTML = '<p>No new contracts available at this time.</p>';
        return;
    }

    availableContractsContainer.innerHTML = '';
    contracts.forEach(contract => {
        const card = document.createElement('div');
        card.className = 'contract-card';
        card.innerHTML = `
            <h4>${contract.title}</h4>
            <div class="contract-rewards">
                Rewards: <span>${contract.reward_score} ☥</span> | <span>${contract.reward_prestige} 👑</span>
            </div>
        `;
        card.onclick = () => openContractModal(contract.id);
        availableContractsContainer.appendChild(card);
    });
}
