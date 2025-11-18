/*
 * Filename: js/screens/contracts.js
 * Version: Pharaoh's Legacy 'NOUB' v1.5.1 (XP System Integration)
 * Description: View Logic Module for the contracts screen. This version integrates
 * the new XP system, granting players experience points upon successful contract completion.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { TOKEN_RATES } from '../config.js';
import { trackTaskProgress } from './tasks.js';

const activeContractsContainer = document.getElementById('active-contracts-container');
const availableContractsContainer = document.getElementById('available-contracts-container');
const contractDetailModal = document.getElementById('contract-detail-modal');

// --- CONSTANTS ---
const CONTRACT_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown after acceptance

// --- Daily Quest Logic ---

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
 * Tracks player actions and updates progress towards Daily Quests.
 */
export function trackDailyActivity(activityType, value = 1, itemName = null) {
    const quests = loadDailyQuests();
    let changed = false;

    quests.forEach(quest => {
        if (!quest.completed) {
            if (quest.type === activityType) {
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
 * Handles the delivery of resources to complete a contract.
 * NEW: Grants the player +10 XP upon successful completion.
 * @param {object} playerContract - The player's active contract instance.
 * @param {Array} contractRequirements - The list of required items and quantities.
 */
async function handleDeliverContract(playerContract, contractRequirements) {
    showToast('Delivering goods...');

    const acceptedTime = new Date(playerContract.accepted_at).getTime();
    const now = Date.now();
    const elapsedTime = now - acceptedTime;

    if (elapsedTime < CONTRACT_COOLDOWN_MS) {
        const remainingTime = Math.ceil((CONTRACT_COOLDOWN_MS - elapsedTime) / 1000);
        showToast(`Delivery cooldown active. Try again in ${remainingTime} seconds.`, 'error');
        return;
    }
    
    let allRequirementsMet = true;
    contractRequirements.forEach(req => {
        const playerQty = state.inventory.get(req.items.id)?.qty || 0;
        if (playerQty < req.quantity) allRequirementsMet = false;
    });

    if (!allRequirementsMet) {
         showToast('Error: Insufficient resources to fulfill the contract!', 'error');
         return;
    }

    const consumePromises = contractRequirements.map(req => {
        const currentQty = state.inventory.get(req.items.id)?.qty || 0;
        const newQty = currentQty - req.quantity;
        state.inventory.set(req.items.id, { ...state.inventory.get(req.items.id), qty: newQty });
        return api.updateItemQuantity(state.currentUser.id, req.items.id, newQty);
    });
    await Promise.all(consumePromises);

    const contractDetails = playerContract.contracts;
    
    let totalNoubReward = contractDetails.reward_score;
    const newTotals = {
        noub_score: (state.playerProfile.noub_score || 0) + totalNoubReward,
        prestige: (state.playerProfile.prestige || 0) + contractDetails.reward_prestige
    };

    const { error: contractError } = await api.completeContract(state.currentUser.id, playerContract.id, newTotals);
        
    if (contractError) {
         showToast('Error completing contract!', 'error');
         console.error(contractError);
         return;
    }

    const { bonusNoub } = await updateContractCompletionCount(state.currentUser.id);
    totalNoubReward += bonusNoub;
    
    // --- NEW: Grant XP for contract completion ---
    const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 10);
    if (leveledUp) {
        showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
    }
    // --- END NEW ---

    await trackTaskProgress('contract_complete');

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
    if (!statsContainer) return;

    const noub = state.playerProfile.noub_score || 0;
    const ankh = state.playerProfile.ankh_premium || 0;
    const prestige = state.playerProfile.prestige || 0;
    const tickets = state.playerProfile.spin_tickets || 0;

    statsContainer.innerHTML = `
        <div class="stats-row" style="display: flex; justify-content: space-around; background: var(--surface-dark); padding: 7px; border-radius: 8px; margin-bottom: 10px;">
            <div class="stat-item"><span class="icon">🪙</span> ${noub}</div>
            <div class="stat-item"><span class="icon">☥</span> ${ankh}</div>
            <div class="stat-item"><span class="icon">🐞</span> ${prestige}</div>
            <div class="stat-item"><span class="icon">🎟️</span> ${tickets}</div>
        </div>
    `;
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
    let actionButtonHTML = '';
    let deliverDisabled = !allRequirementsMet;
    let buttonText = 'Deliver';
    
    if (isAccepted) {
        const acceptedTime = new Date(playerContract.accepted_at).getTime();
        const now = Date.now();
        const elapsedTime = now - acceptedTime;
        
        if (elapsedTime < CONTRACT_COOLDOWN_MS) {
            const remainingTime = Math.ceil((CONTRACT_COOLDOWN_MS - elapsedTime) / 1000);
            deliverDisabled = true;
            buttonText = `Cooldown: ${remainingTime}s`;
            
            setTimeout(() => {
                // Re-open if modal is still visible to update the timer button
                if (!contractDetailModal.classList.contains('hidden')) {
                    openContractModal(contractId, playerContract);
                }
            }, remainingTime * 1000 + 100);
        } else {
             deliverDisabled = !allRequirementsMet;
        }

        actionButtonHTML = `<button id="contract-action-btn" class="action-button" ${deliverDisabled ? 'disabled' : ''}>${buttonText}</button>`;
        
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
                    <span class="icon">🪙</span>
                    <div>${contract.reward_score} NOUB</div>
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
    import('../ui.js').then(({ openModal }) => openModal('contract-detail-modal'));

    const actionBtn = document.getElementById('contract-action-btn');
    if (isAccepted) {
        actionBtn.onclick = () => handleDeliverContract(playerContract, contract.contract_requirements);
    } else {
        actionBtn.onclick = () => handleAcceptContract(contractId);
    }
}

export async function renderActiveContracts() {
    if (!state.currentUser) return;
    
    let statsDiv = document.getElementById('contracts-player-stats');
    if (!statsDiv) {
         statsDiv = document.createElement('div');
         statsDiv.id = 'contracts-player-stats';
         const contractsScreen = document.getElementById('contracts-screen');
         if (contractsScreen.firstChild) {
            contractsScreen.insertBefore(statsDiv, contractsScreen.firstChild.nextSibling);
         } else {
             contractsScreen.appendChild(statsDiv);
         }
    }
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
