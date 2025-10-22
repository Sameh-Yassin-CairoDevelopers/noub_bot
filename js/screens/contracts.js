/*
 * Filename: js/screens/contracts.js
 * Version: 18.1 (Interaction Fix)
 * Description: View Logic Module for the contracts screen.
 * This version ensures the onclick event listeners are correctly attached to each contract card.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';

const activeContractsContainer = document.getElementById('active-contracts-container');
const availableContractsContainer = document.getElementById('available-contracts-container');
const contractDetailModal = document.getElementById('contract-detail-modal');

async function handleAcceptContract(contractId) {
    showToast('Accepting contract...');
    const { error } = await api.acceptContract(state.currentUser.id, contractId);

    if (error) {
        showToast('Error accepting contract!', 'error');
        console.error(error);
    } else {
        showToast('Contract Accepted!', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
        renderAvailableContracts();
    }
}

async function handleDeliverContract(playerContract, requirements) {
    showToast('Delivering goods...');

    // Consume required items
    const consumePromises = requirements.map(req => {
        const currentQty = state.inventory.get(req.items.id)?.qty || 0;
        const newQty = currentQty - req.quantity;
        state.inventory.set(req.items.id, { ...state.inventory.get(req.items.id), qty: newQty });
        return api.updateItemQuantity(state.currentUser.id, req.items.id, newQty);
    });
    await Promise.all(consumePromises);

    // Calculate new currency totals
    const contractDetails = playerContract.contracts;
    const newTotals = {
        score: (state.playerProfile.score || 0) + contractDetails.reward_score,
        prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige
    };

    const { error } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);

    if (error) {
        showToast('Error completing contract!', 'error');
        console.error(error);
    } else {
        state.playerProfile.score = newTotals.score;
        state.playerProfile.prestige = newTotals.prestige;
        updateHeaderUI();
        showToast('Contract Completed! Rewards received.', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
    }
}

async function openContractModal(contractId, playerContract = null) {
    const { data: contract, error } = await api.fetchContractWithRequirements(contractId);
    if (error) {
        showToast('Error fetching contract details!', 'error');
        return;
    }

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
        // THIS IS THE CRUCIAL LINE THAT MAKES THE CARD CLICKABLE
        card.onclick = () => openContractModal(contract.id, pc);
        activeContractsContainer.appendChild(card);
    });
}

export async function renderAvailableContracts() {
    if (!state.currentUser) return;
    availableContractsContainer.innerHTML = 'Loading available contracts...';

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
        // THIS IS THE CRUCIAL LINE THAT MAKES THE CARD CLICKABLE
        card.onclick = () => openContractModal(contract.id);
        availableContractsContainer.appendChild(card);
    });
}
