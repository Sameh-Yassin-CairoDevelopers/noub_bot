/*
 * Filename: js/screens/contracts.js
 * Version: NOUB v1.5 (Player Leveling & XP Integration)
 * Description: View Logic Module for the contracts screen. This version integrates
 * with the new leveling system by granting XP upon contract completion.
 * The legacy daily quest logic has been fully removed, centralizing all task
 * management within tasks.js.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { TOKEN_RATES } from '../config.js';
import { trackTaskProgress } from './tasks.js';

const activeContractsContainer = document.getElementById('active-contracts-container');
const availableContractsContainer = document.getElementById('available-contracts-container');
const contractDetailModal = document.getElementById('contract-detail-modal');

// --- Module Constants ---
const CONTRACT_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown after acceptance
const XP_FOR_CONTRACT_COMPLETE = 10;    // XP granted for completing any contract

// --- Core Contract Logic ---

/**
 * Handles the player's acceptance of a new contract.
 * @param {number} contractId - The ID of the contract to accept.
 */
async function handleAcceptContract(contractId) {
    showToast('Accepting contract...');
    const { error } = await api.acceptContract(state.currentUser.id, contractId);

    if (error) {
        showToast('Error accepting contract!', 'error');
        console.error(error);
    } else {
        // Log the acceptance time for cooldown tracking
        await api.supabaseClient.from('player_contracts')
            .update({ accepted_at: new Date().toISOString() })
            .eq('player_id', state.currentUser.id)
            .eq('contract_id', contractId);

        showToast('Contract Accepted! Cooldown started.', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
        renderAvailableContracts();
    }
}

/**
 * Increments the player's completed contract count and checks for milestone bonuses.
 * @param {string} playerId - The ID of the current player.
 */
async function updateContractCompletionCount(playerId) {
    let count = state.playerProfile.completed_contracts_count || 0;
    count++;

    let bonusNoub = 0;
    if (TOKEN_RATES.CONTRACT_COMPLETION_BONUS_NOUB && TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT && count % TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT === 0) {
        bonusNoub = TOKEN_RATES.CONTRACT_COMPLETION_BONUS_NOUB;
        showToast(`Contract Bonus! +${bonusNoub} NOUB for completing ${TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT} contracts!`, 'success');
    }

    const newNoubScore = (state.playerProfile.noub_score || 0) + bonusNoub;

    await api.updatePlayerProfile(playerId, { 
        completed_contracts_count: count,
        noub_score: newNoubScore
    });

    return { count, bonusNoub };
}

/**
 * Handles the delivery of resources to complete an active contract.
 * @param {object} playerContract - The player's active contract instance.
 * @param {Array} contractRequirements - The list of required items for the contract.
 */
async function handleDeliverContract(playerContract, contractRequirements) {
    showToast('Delivering goods...');

    // 1. Check for delivery cooldown
    const acceptedTime = new Date(playerContract.accepted_at).getTime();
    const elapsedTime = Date.now() - acceptedTime;

    if (elapsedTime < CONTRACT_COOLDOWN_MS) {
        const remainingTime = Math.ceil((CONTRACT_COOLDOWN_MS - elapsedTime) / 1000);
        return showToast(`Delivery cooldown active. Try again in ${remainingTime} seconds.`, 'error');
    }
    
    // 2. Verify player has all required resources
    let allRequirementsMet = true;
    for (const req of contractRequirements) {
        if ((state.inventory.get(req.items.id)?.qty || 0) < req.quantity) {
            allRequirementsMet = false;
            break;
        }
    }

    if (!allRequirementsMet) {
         return showToast('Error: Insufficient resources to fulfill the contract!', 'error');
    }

    // 3. Consume resources from player's inventory
    const consumePromises = contractRequirements.map(req => {
        const currentQty = state.inventory.get(req.items.id).qty;
        return api.updateItemQuantity(state.currentUser.id, req.items.id, currentQty - req.quantity);
    });
    await Promise.all(consumePromises);

    // 4. Grant contract rewards
    const contractDetails = playerContract.contracts;
    let totalNoubReward = contractDetails.reward_score;
    const newTotals = {
        noub_score: (state.playerProfile.noub_score || 0) + totalNoubReward,
        prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige
    };

    const { error: contractError } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);
    if (contractError) {
         // In a real app, logic to refund consumed items should be here.
         return showToast('Error completing contract!', 'error');
    }

    // 5. Update completion count and check for bonuses
    const { bonusNoub } = await updateContractCompletionCount(state.currentUser.id);
    totalNoubReward += bonusNoub;

    // 6. Grant XP and track for daily/weekly tasks
    await api.addXp(state.currentUser.id, XP_FOR_CONTRACT_COMPLETE);
    await trackTaskProgress('contract_complete');

    // 7. Refresh UI and show success message
    await refreshPlayerState();
    showToast(`Contract Completed! Rewards: +${totalNoubReward} 🪙, +${contractDetails.reward_prestige} 🐞`, 'success');
    window.closeModal('contract-detail-modal');
    renderActiveContracts();
}

/**
 * Renders the player's current currency balances at the top of the screen.
 */
function renderPlayerStats() {
    const statsContainer = document.getElementById('contracts-player-stats');
    if (!statsContainer) {
        const contractsScreen = document.getElementById('contracts-screen');
        const newStatsDiv = document.createElement('div');
        newStatsDiv.id = 'contracts-player-stats';
        contractsScreen.insertBefore(newStatsDiv, contractsScreen.firstChild);
    }
    document.getElementById('contracts-player-stats').innerHTML = `
        <div class="stats-row" style="display: flex; justify-content: space-around; background: var(--surface-dark); padding: 7px; border-radius: 8px; margin-bottom: 10px;">
            <div class="stat-item">🪙 ${Math.floor(state.playerProfile.noub_score || 0)}</div>
            <div class="stat-item">☥ ${state.playerProfile.ankh_premium || 0}</div>
            <div class="stat-item">🐞 ${state.playerProfile.prestige || 0}</div>
            <div class="stat-item">🎟️ ${state.playerProfile.spin_tickets || 0}</div>
        </div>
    `;
}

/**
 * Opens a modal showing the details of a specific contract.
 * @param {number} contractId - The ID of the master contract.
 * @param {object|null} playerContract - The player's instance of the contract, if accepted.
 */
async function openContractModal(contractId, playerContract = null) {
    const { data: contract, error } = await api.fetchContractWithRequirements(contractId);
    if (error) {
        return showToast('Error fetching contract details!', 'error');
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
    let actionButtonHTML = '';
    
    if (isAccepted) {
        const acceptedTime = new Date(playerContract.accepted_at).getTime();
        const elapsedTime = Date.now() - acceptedTime;
        let deliverDisabled = !allRequirementsMet;
        let buttonText = 'Deliver';
        
        if (elapsedTime < CONTRACT_COOLDOWN_MS) {
            const remainingTime = Math.ceil((CONTRACT_COOLDOWN_MS - elapsedTime) / 1000);
            deliverDisabled = true;
            buttonText = `Cooldown: ${remainingTime}s`;
            setTimeout(() => openContractModal(contractId, playerContract), 1000);
        }
        actionButtonHTML = `<button id="contract-action-btn" class="action-button" ${deliverDisabled ? 'disabled' : ''}>${buttonText}</button>`;
    } else {
        actionButtonHTML = `<button id="contract-action-btn" class="action-button">Accept Contract</button>`;
    }

    contractDetailModal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('contract-detail-modal')">&times;</button>
            <h3>${contract.title}</h3>
            <p>${contract.description}</p>
            <h4>Requirements</h4>
            <div class="contract-modal-reqs">${requirementsHTML}</div>
            <h4>Rewards</h4>
            <div class="contract-modal-rewards">
                <div class="reward-item">🪙 ${contract.reward_score} NOUB</div>
                <div class="reward-item">🐞 ${contract.reward_prestige} Prestige</div>
            </div>
            ${actionButtonHTML}
        </div>
    `;
    openModal('contract-detail-modal');

    const actionBtn = document.getElementById('contract-action-btn');
    if (isAccepted) {
        actionBtn.onclick = () => handleDeliverContract(playerContract, contract.contract_requirements);
    } else {
        actionBtn.onclick = () => handleAcceptContract(contractId);
    }
}

/**
 * Renders the list of contracts the player has currently accepted.
 */
export async function renderActiveContracts() {
    if (!state.currentUser) return;
    renderPlayerStats();
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
            <div class="contract-rewards">Rewards: <span>${contract.reward_score} 🪙</span> | <span>${contract.reward_prestige} 🐞</span></div>
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
    const refreshBtn = document.getElementById('refresh-contracts-btn');
    if (refreshBtn) refreshBtn.onclick = handleRefreshContracts;
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
            <div class="contract-rewards">Rewards: <span>${contract.reward_score} 🪙</span> | <span>${contract.reward_prestige} 🐞</span></div>
        `;
        card.onclick = () => openContractModal(contract.id);
        availableContractsContainer.appendChild(card);
    });
}

async function handleRefreshContracts() {
    const refreshBtn = document.getElementById('refresh-contracts-btn');
    if (!refreshBtn) return;
    refreshBtn.disabled = true;
    showToast('Refreshing available contracts...');
    const { error } = await api.refreshAvailableContracts(state.currentUser.id);
    if (error) {
        showToast('Error refreshing contracts!', 'error');
    } else {
        showToast('Contracts refreshed!', 'success');
        renderAvailableContracts();
    }
    refreshBtn.disabled = false;
}
