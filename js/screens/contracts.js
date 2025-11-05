/*
 * Filename: js/screens/contracts.js
 * Version: NOUB 0.0.7 (Daily Quests & Contracts - FIX: Implement Completion Bonus)
 * Description: View Logic Module for the contracts screen. 
 * NEW: Implements the logic to track and grant a NOUB bonus after completing 10 contracts.
 * UPDATED: Currency usage for NOUB.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { TOKEN_RATES } from '../config.js'; // Import TOKEN_RATES for constants

const activeContractsContainer = document.getElementById('active-contracts-container');
const availableContractsContainer = document.getElementById('available-contracts-container');
const contractDetailModal = document.getElementById('contract-detail-modal');

// --- Daily Quest Logic (Unchanged) ---

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
        // Reset quests if it's a new day
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
 * Tracks player actions and updates progress towards Daily Quests.
 */
export function trackDailyActivity(activityType, value = 1, itemName = null) {
    const quests = loadDailyQuests();
    let changed = false;

    quests.forEach(quest => {
        if (!quest.completed) {
            if (quest.type === activityType) {
                // Check for specific resource types if needed
                if (quest.type === 'resources' && quest.item_name !== itemName) return;
                
                quest.current = Math.min(quest.target, quest.current + value);
                changed = true;
            }
        }
    });

    if (changed) {
        saveDailyQuests(quests);
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen && !homeScreen.classList.contains('hidden')) {
            import('./home.js').then(({ renderHome }) => renderHome());
        }
    }
}

export function fetchDailyQuests() {
    return loadDailyQuests();
}

/**
 * Completes a daily quest and grants the reward.
 */
export async function completeDailyQuest(questId, reward) {
    const quests = loadDailyQuests();
    const questIndex = quests.findIndex(q => q.id === questId);

    if (questIndex !== -1 && quests[questIndex].current >= quests[questIndex].target && !quests[questIndex].completed) {
        quests[questIndex].completed = true;
        saveDailyQuests(quests);

        // Grant reward (NOUB only for Daily Quests)
        const newNoubScore = (state.playerProfile.noub_score || 0) + reward; // Use noub_score
        const { error } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: newNoubScore }); // Update noub_score

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
        showToast('Contract Accepted!', 'success');
        window.closeModal('contract-detail-modal');
        renderActiveContracts();
        renderAvailableContracts();
    }
}

/**
 * NEW: Updates the contract completion count in player profile.
 */
async function updateContractCompletionCount(playerId) {
    // 1. Fetch current contracts count
    let count = state.playerProfile.completed_contracts_count || 0;
    count++;

    // 2. Check for Bonus
    let bonusNoub = 0;
    if (count % TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT === 0) {
        bonusNoub = TOKEN_RATES.CONTRACT_COMPLETION_BONUS_NOUB;
        showToast(`Contract Bonus! +${bonusNoub} NOUB for completing ${TOKEN_RATES.CONTRACT_COMPLETION_BONUS_COUNT} contracts!`, 'success');
    }

    // 3. Update the profile with new count and potential bonus
    const newNoubScore = (state.playerProfile.noub_score || 0) + bonusNoub;

    await api.updatePlayerProfile(playerId, { 
        completed_contracts_count: count,
        noub_score: newNoubScore
    });

    return { count, bonusNoub };
}


async function handleDeliverContract(playerContract, requirements) {
    showToast('Delivering goods...');

    const consumePromises = requirements.map(req => {
        const currentQty = state.inventory.get(req.items.id)?.qty || 0;
        const newQty = currentQty - req.quantity;
        state.inventory.set(req.items.id, { ...state.inventory.get(req.items.id), qty: newQty });
        return api.updateItemQuantity(state.currentUser.id, req.items.id, newQty);
    });
    await Promise.all(consumePromises);

    const contractDetails = playerContract.contracts;
    
    // 1. Calculate Standard Rewards
    let totalNoubReward = contractDetails.reward_score;
    const newTotals = {
        noub_score: (state.playerProfile.noub_score || 0) + totalNoubReward, // Use reward_score for NOUB
        prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige
    };

    // 2. Complete Contract in DB
    const { error: contractError } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);
        
    if (contractError) {
         showToast('Error completing contract!', 'error');
         console.error(contractError);
         return;
    }

    // 3. Update Completion Count & Check for Bonus
    const { bonusNoub } = await updateContractCompletionCount(state.currentUser.id);
    totalNoubReward += bonusNoub;

    // 4. Final Refresh and Toast
    await refreshPlayerState();
    showToast(`Contract Completed! Rewards: +${totalNoubReward} 🪙, +${contractDetails.reward_prestige} 🐞`, 'success');
    window.closeModal('contract-detail-modal');
    renderActiveContracts();
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
                    <span class="icon">🪙</span> <!-- NOUB icon -->
                    <div>${contract.reward_score} NOUB</div> <!-- Using reward_score for NOUB -->
                </div>
                <div class="reward-item">
                    <span class="icon">🐞</span>
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
                Rewards: <span>${contract.reward_score} 🪙</span> | <span>${contract.reward_prestige} 🐞</span>
            </div>
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
            <div class="contract-rewards">
                Rewards: <span>${contract.reward_score} 🪙</span> | <span>${contract.reward_prestige} 🐞</span>
            </div>
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
    
    // NOTE: This currently deletes all player contracts to refresh. 
    // In a final version, this should only fetch new contracts or generate them on the backend.
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
