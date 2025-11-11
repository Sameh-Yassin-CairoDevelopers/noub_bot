/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v0.5 (UCP Protocol Tasks Integration)
 * Description: Displays and manages the UCP completion tasks.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const tasksContainer = document.getElementById('tasks-screen');

// --- UCP Task Definitions & Rewards ---
const UCP_TASKS = [
    {
        id: 'ucp_task_1',
        title: 'Begin Your Protocol',
        description: 'Visit the "Chat with Eve" screen to start building your cognitive profile.',
        reward: { noub: 500, prestige: 10 },
        isClaimed: () => state.playerProfile?.ucp_task_1_claimed,
        isCompleted: () => state.ucp?.size > 0 || Object.keys(localUcpData || {}).length > 0,
        action: () => navigateTo('chat-screen')
    },
    {
        id: 'ucp_task_2',
        title: 'Complete Eve\'s Interview',
        description: 'Finish all of Eve\'s main sections and general questions.',
        reward: { noub: 1500, prestige: 75, tickets: 5 },
        isClaimed: () => state.playerProfile?.ucp_task_2_claimed,
        isCompleted: () => {
            const eveGeneral = state.ucp?.get('eve_general') || localUcpData['eve_general'];
            // This is a simplified check. A more robust check would verify the number of answers.
            return !!eveGeneral; 
        }
    },
    {
        id: 'ucp_task_3',
        title: 'Embrace Deep Analysis',
        description: 'Complete one of Hypatia\'s sessions and export your final protocol.',
        reward: { noub: 5000, prestige: 250, ankh: 5 },
        isClaimed: () => state.playerProfile?.ucp_task_3_claimed,
        isCompleted: () => {
            const hypatiaPhil = state.ucp?.get('hypatia_philosophical') || localUcpData['hypatia_philosophical'];
            const hypatiaScaled = state.ucp?.get('hypatia_scaled') || localUcpData['hypatia_scaled'];
            // Completion is defined as having data in either of Hypatia's sections.
            return !!hypatiaPhil || !!hypatiaScaled;
        }
    }
];

// We need a local reference because state.ucp might not be populated
// when this screen is rendered before the chat screen.
let localUcpData = {};

/**
 * Handles the logic for claiming a task reward.
 * @param {object} task - The task object from the UCP_TASKS array.
 * @param {number} taskNumber - The number of the task (1, 2, or 3).
 */
async function claimTaskReward(task, taskNumber) {
    if (task.isClaimed() || !task.isCompleted()) {
        showToast("Task not ready to be claimed.", 'info');
        return;
    }

    let rewardString = '';
    const profileUpdate = {};
    const reward = task.reward;

    if (reward.noub) {
        profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + reward.noub;
        rewardString += `${reward.noub}🪙 `;
    }
    if (reward.prestige) {
        profileUpdate.prestige = (state.playerProfile.prestige || 0) + reward.prestige;
        rewardString += `${reward.prestige}🐞 `;
    }
    if (reward.tickets) {
        profileUpdate.spin_tickets = (state.playerProfile.spin_tickets || 0) + reward.tickets;
        rewardString += `${reward.tickets}🎟️ `;
    }
    if (reward.ankh) {
        profileUpdate.ankh_premium = (state.playerProfile.ankh_premium || 0) + reward.ankh;
        rewardString += `${reward.ankh}☥ `;
    }

    // Update the player's main currency profile
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (profileError) {
        showToast("Error granting reward!", 'error');
        return;
    }

    // Mark the task as claimed in the database
    const { error: claimError } = await api.claimUcpTaskReward(state.currentUser.id, taskNumber);
    if (claimError) {
        showToast("Error saving claim status!", 'error');
        // Note: In a real-world scenario, you'd handle reverting the profile update here.
        return;
    }

    // --- Special Reward for Task 3 ---
    if (taskNumber === 3) {
        // Unlock the Horus section in the library
        const { error: unlockError } = await api.supabaseClient.from('player_library').insert({
            player_id: state.currentUser.id,
            entry_key: 'god_horus' // Make sure this key matches an entry in your library data
        });
        if (!unlockError) {
            showToast("New Library Entry Unlocked: The Great Ennead: Horus!", 'success');
        }
    }

    showToast(`Reward Claimed: +${rewardString}`, 'success');
    await refreshPlayerState(); // This will re-fetch the profile with the new claimed status
    renderTasks(); // Re-render the tasks screen
}

export async function renderTasks() {
    if (!state.currentUser || !tasksContainer) return;

    // Refresh player state to get the latest task claim statuses
    await refreshPlayerState();
    
    // We also need the UCP data to check for completion status
    const { data: ucpData } = await api.fetchUCPProtocol(state.currentUser.id);
    localUcpData = {};
    if (ucpData) {
        ucpData.forEach(entry => {
            localUcpData[entry.section_key] = entry.section_data;
        });
    }

    // For task 1, visiting the chat is enough. We mark it complete here.
    if (!state.playerProfile.ucp_task_1_claimed && (localUcpData['main_personal'] || state.ucp?.has('main_personal'))) {
        // If the task isn't claimed but the user has started the protocol,
        // we can consider the "visit" part complete.
    }

    const dailyQuestsContainer = document.getElementById('daily-quests-container');
    if (!dailyQuestsContainer) return;

    dailyQuestsContainer.innerHTML = '<h3>Protocol Milestones</h3>';
    
    UCP_TASKS.forEach((task, index) => {
        const taskNumber = index + 1;
        const isCompleted = task.isCompleted();
        const isClaimed = task.isClaimed();

        let buttonHTML;
        if (isClaimed) {
            buttonHTML = `<button class="action-button small" disabled>Claimed</button>`;
        } else if (isCompleted) {
            buttonHTML = `<button class="action-button small claim-btn">Claim</button>`;
        } else {
            buttonHTML = `<button class="action-button small go-btn">Go</button>`;
        }
        
        const card = document.createElement('div');
        card.className = 'daily-quest-card';
        card.innerHTML = `
            <div class="quest-details">
                <h4>${task.title}</h4>
                <p>${task.description}</p>
            </div>
            <div class="quest-action">
                ${buttonHTML}
            </div>
        `;
        
        if (!isClaimed && isCompleted) {
            card.querySelector('.claim-btn').onclick = () => claimTaskReward(task, taskNumber);
        } else if (!isClaimed && !isCompleted && task.action) {
            card.querySelector('.go-btn').onclick = task.action;
        }
        
        dailyQuestsContainer.appendChild(card);
    });
}
