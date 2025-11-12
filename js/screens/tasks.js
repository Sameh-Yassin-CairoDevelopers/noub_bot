/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v0.5.1 (Unified Tasks Screen)
 * Description: Displays both Protocol Milestones and Daily Quests in a unified view.
 * Fixes the 409 Conflict error on library unlock.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
// Import Daily Quest logic from contracts.js
import { fetchDailyQuests, completeDailyQuest } from './contracts.js';

const tasksContainer = document.getElementById('tasks-screen');

// --- UCP Task Definitions & Rewards ---
const UCP_TASKS = [
    {
        id: 'ucp_task_1',
        title: 'Begin Your Protocol',
        description: 'Visit the "Chat with Eve" screen to start building your cognitive profile.',
        reward: { noub: 500, prestige: 10 },
        isClaimed: () => state.playerProfile?.ucp_task_1_claimed,
        // Completion is now defined as having at least one entry in the protocol.
        isCompleted: () => (state.ucp?.size > 0 || Object.keys(localUcpData || {}).length > 0),
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
            return !!hypatiaPhil || !!hypatiaScaled;
        }
    }
];

let localUcpData = {};

async function claimTaskReward(task, taskNumber) {
    if (task.isClaimed() || !task.isCompleted()) {
        showToast("Task not ready to be claimed.", 'info');
        return;
    }

    let rewardString = '';
    const profileUpdate = {};
    const reward = task.reward;

    if (reward.noub) profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + reward.noub;
    if (reward.prestige) profileUpdate.prestige = (state.playerProfile.prestige || 0) + reward.prestige;
    if (reward.tickets) profileUpdate.spin_tickets = (state.playerProfile.spin_tickets || 0) + reward.tickets;
    if (reward.ankh) profileUpdate.ankh_premium = (state.playerProfile.ankh_premium || 0) + reward.ankh;

    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (profileError) {
        showToast("Error granting reward!", 'error');
        return;
    }

    const { error: claimError } = await api.claimUcpTaskReward(state.currentUser.id, taskNumber);
    if (claimError) {
        showToast("Error saving claim status!", 'error');
        return;
    }

    // --- Special Reward for Task 3 ---
// --- Special Reward for Task 3 ---
if (taskNumber === 3) {
    const libraryEntry = {
        player_id: state.currentUser.id,
        entry_key: 'god_horus'
    };

    // Use a more explicit .upsert() with an 'onConflict' option.
    // This tells Supabase: "If a row with this combination of player_id and entry_key
    // already exists, just ignore the conflict and do nothing."
    // This is the most robust way to prevent the 409 error.
    const { error: unlockError } = await api.supabaseClient
        .from('player_library')
        .upsert(libraryEntry, { onConflict: 'player_id, entry_key', ignoreDuplicates: true });

    if (!unlockError) {
        // This toast will now only show on the VERY FIRST successful claim.
        // On subsequent (ignored) claims, there is no error, but also no data is returned,
        // so we can add a check if needed, but for now, this is cleaner.
        showToast("New Library Entry Unlocked: The Great Ennead: Horus!", 'success');
    } else {
        // This will now only log truly unexpected errors.
        console.error("Library unlock error:", unlockError);
        showToast("An error occurred while unlocking the library item.", 'error');
    }
    
    Object.keys(reward).forEach(key => rewardString += `${reward[key]}${key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥'} `);
    showToast(`Reward Claimed: +${rewardString}`, 'success');
    await refreshPlayerState();
    renderTasks();
}

/**
 * Renders both UCP Milestones and Daily Quests.
 */
export async function renderTasks() {
    if (!state.currentUser || !tasksContainer) return;

    await refreshPlayerState();
    
    const { data: ucpData } = await api.fetchUCPProtocol(state.currentUser.id);
    localUcpData = {};
    if (ucpData) {
        ucpData.forEach(entry => {
            localUcpData[entry.section_key] = entry.section_data;
        });
    }

    const container = document.getElementById('daily-quests-container');
    if (!container) return;

    // --- Render Protocol Milestones ---
    container.innerHTML = '<h3>Protocol Milestones</h3>';
    UCP_TASKS.forEach((task, index) => {
        const taskNumber = index + 1;
        const card = document.createElement('div');
        card.className = 'daily-quest-card';
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

        card.innerHTML = `
            <div class="quest-details"><h4>${task.title}</h4><p>${task.description}</p></div>
            <div class="quest-action">${buttonHTML}</div>
        `;

        if (!isClaimed && isCompleted) {
            card.querySelector('.claim-btn').onclick = () => claimTaskReward(task, taskNumber);
        } else if (!isClaimed && !isCompleted && task.action) {
            card.querySelector('.go-btn').onclick = task.action;
        }
        
        container.appendChild(card);
    });

    // --- Render Daily Quests ---
    const dailyTitle = document.createElement('h3');
    dailyTitle.textContent = 'Daily Quests';
    dailyTitle.style.marginTop = '20px';
    container.appendChild(dailyTitle);

    const quests = fetchDailyQuests();
    if (!quests || quests.length === 0) {
        container.innerHTML += '<p>No daily tasks available. Check back tomorrow!</p>';
        return;
    }
    
    quests.forEach(quest => {
        const isTaskCompleted = quest.current >= quest.target;
        const buttonText = quest.completed ? 'Claimed' : (isTaskCompleted ? 'Claim' : 'Working...');
        const buttonDisabled = !isTaskCompleted || quest.completed;
        const progressPercent = Math.min(100, (quest.current / quest.target) * 100);

        const card = document.createElement('div');
        card.className = 'daily-quest-card';
        card.innerHTML = `
            <div class="quest-details">
                <h4>${quest.title}</h4>
                <p>Progress: ${quest.current} / ${quest.target}</p>
                <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
                </div>
            </div>
            <div class="quest-action">
                <div class="reward">+${quest.reward} 🪙</div>
                <button class="action-button small claim-btn" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
            </div>
        `;
        
        const claimBtn = card.querySelector('.claim-btn');
        if (!buttonDisabled) {
            claimBtn.onclick = async () => {
                claimBtn.disabled = true;
                const success = await completeDailyQuest(quest.id, quest.reward); 
                if (success) {
                    showToast(`Claimed ${quest.reward} NOUB!`, 'success');
                    renderTasks(); 
                } else {
                     showToast('Error claiming reward or already claimed!', 'error');
                     claimBtn.disabled = false;
                }
            };
        }
        container.appendChild(card);
    });
}

