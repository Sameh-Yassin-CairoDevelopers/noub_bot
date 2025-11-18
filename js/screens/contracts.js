/*
 * Filename: js/screens/contracts.js
 * Version: NOUB v1.5.1 (XP Integration & Export Fix)
 * Description: View Logic Module for the contracts screen. Integrates XP,
 * task tracking, and ensures necessary functions are exported for other modules.
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

// --- CONSTANTS ---
const CONTRACT_COOLDOWN_MS = 60 * 1000;
const XP_FOR_CONTRACT_COMPLETE = 10;

// --- Legacy Daily Quest Logic (Kept for task compatibility) ---

const MASTER_DAILY_QUESTS = [
    { id: 'visit_shop', title: 'Visit the Market', target: 1, reward: 50, type: 'visits' },
    { id: 'spin_slot', title: 'Spin the Tomb of Treasures', target: 1, reward: 150, type: 'games' },
    { id: 'gather_stone', title: 'Gather Limestone (Raw)', target: 10, reward: 75, type: 'resources', item_name: 'Limestone' },
];
const DAILY_QUEST_STORAGE_KEY = 'noub_daily_quests_v1';

function loadDailyQuests() {
    const today = new Date().toISOString().split('T')[0];
    const stored = JSON.parse(localStorage.getItem(DAILY_QUEST_STORAGE_KEY) || '{}');
    if (stored.date !== today) {
        const freshQuests = MASTER_DAILY_QUESTS.map(q => ({
            ...q,
            current: 0,
            completed: false
        }));
        stored.date = today;
        stored.quests = freshQuests;
        localStorage.setItem(DAILY_QUEST_STORAGE_KEY, JSON.stringify(stored));
    }
    return stored.quests;
}

function saveDailyQuests(quests) {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(DAILY_QUEST_STORAGE_KEY, JSON.stringify({ date: today, quests: quests }));
}

/**
 * [LEGACY FUNCTION] Tracks player actions and updates progress for old daily quests (localStorage based).
 */
export function trackDailyActivity(activityType, value = 1, itemName = null) {
    const quests = loadDailyQuests();
    let changed = false;
    quests.forEach(quest => {
        if (!quest.completed && quest.type === activityType && (!quest.item_name || quest.item_name === itemName)) {
            quest.current = Math.min(quest.target, quest.current + value);
            changed = true;
        }
    });
    if (changed) saveDailyQuests(quests);
}

export function fetchDailyQuests() {
    return loadDailyQuests();
}

/**
 * [LEGACY FUNCTION] Completes a daily quest and grants the reward.
 * This function is now EXPORTED for use by the tasks module.
 */
export async function completeDailyQuest(questId, reward) {
    const quests = loadDailyQuests();
    const questIndex = quests.findIndex(q => q.id === questId);

    if (questIndex !== -1 && quests[questIndex].current >= quests[questIndex].target && !quests[questIndex].completed) {
        quests[questIndex].completed = true;
        saveDailyQuests(quests);
        const newNoubScore = (state.playerProfile.noub_score || 0) + reward;
        const { error } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore });

        if (!error) {
            await refreshPlayerState();
            return true;
        } else {
            quests[questIndex].completed = false;
            saveDailyQuests(quests);
            return false;
        }
    }
    return false;
}


// --- Royal Decrees (Contracts Logic) ---

async function handleAcceptContract(contractId) {
    showToast('Accepting contract...');
    const { error } = await api.acceptContract(state.currentUser.id, contractId);
    if (error) {
        showToast('Error accepting contract!', 'error');
        console.error(error);
    } else {
        await api.supabaseClient.from('player_contracts').update({ accepted_at: new Date().toISOString() }).eq('player_id', state.currentUser.id).eq('contract_id', contractId);
        showToast('Contract Accepted! Cooldown started.', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
        renderAvailableContracts();
    }
}

async function updateContractCompletionCount(playerId) {
    let count = state.playerProfile.completed_contracts_count || 0;
    count++;
    let bonusNoub = 0;
    if (TOKEN_RATES.CONTRACT_COMPLETION_BONUS_NOUB && TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT && count % TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT === 0) {
        bonusNoub = TOKEN_RATES.CONTRACT_COMPLETION_BONUS_NOUB;
        showToast(`Contract Bonus! +${bonusNoub} NOUB for completing ${TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT} contracts!`, 'success');
    }
    const newNoubScore = (state.playerProfile.noub_score || 0) + bonusNoub;
    await api.updatePlayerProfile(playerId, { completed_contracts_count: count, noub_score: newNoubScore });
    return { count, bonusNoub };
}

/**
 * Executes the contract delivery process. This is a critical transaction point.
 */
async function handleDeliverContract(playerContract, contractRequirements) {
    showToast('Delivering goods...');
    // 1. Cooldown Check
    const acceptedTime = new Date(playerContract.accepted_at).getTime();
    const elapsedTime = Date.now() - acceptedTime;
    if (elapsedTime < CONTRACT_COOLDOWN_MS) {
        const remainingTime = Math.ceil((CONTRACT_COOLDOWN_MS - elapsedTime) / 1000);
        return showToast(`Delivery cooldown active. Try again in ${remainingTime} seconds.`, 'error');
    }
    
    // 2. Resource Verification (Double check)
    let allRequirementsMet = true;
    for (const req of contractRequirements) {
        if ((state.inventory.get(req.items.id)?.qty || 0) < req.quantity) {
            allRequirementsMet = false;
            break;
        }
    }
    if (!allRequirementsMet) return showToast('Error: Insufficient resources to fulfill the contract!', 'error');

    // 3. Consume Resources
    const consumePromises = contractRequirements.map(req => {
        const currentQty = state.inventory.get(req.items.id).qty;
        return api.updateItemQuantity(state.currentUser.id, req.items.id, currentQty - req.quantity);
    });
    await Promise.all(consumePromises);

    // 4. Grant Rewards and Complete Contract
    const contractDetails = playerContract.contracts;
    let totalNoubReward = contractDetails.reward_score;
    const newTotals = { noub_score: (state.playerProfile.noub_score || 0) + totalNoubReward, prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige };

    const { error: contractError } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);
    if (contractError) return showToast('Error completing contract!', 'error');
    
    // 5. Grant XP and Update Task Progress
    await api.addXp(state.currentUser.id, XP_FOR_CONTRACT_COMPLETE);
    const { bonusNoub } = await updateContractCompletionCount(state.currentUser.id);
    totalNoubReward += bonusNoub;
    await trackTaskProgress('contract_complete');

    // 6. Final UI Update
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

async function openContractModal(contractId, playerContract = null) {
    const { data: contract, error } = await api.fetchContractWithRequirements(contractId);
    if (error) return showToast('Error fetching contract details!', 'error');

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
    if (refreshBtn) return;
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
