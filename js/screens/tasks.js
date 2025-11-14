/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v0.9 (Advanced Rewards System)
 * Description: Implements a multi-layered rewards system with Onboarding, Daily,
 * and Weekly tasks, inspired by modern game reward tracks.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const tasksContainer = document.getElementById('tasks-screen');

// --- Task Definitions ---

// 1. ONBOARDING & SOCIAL TASKS (Milestones)
const ONBOARDING_TASKS = [
    {
        id: 'ucp_task_1',
        title: 'Begin Your Protocol',
        description: 'Visit the "Chat with Eve" screen to start building your cognitive profile.',
        reward: { noub: 500, prestige: 10 },
        isClaimed: () => state.playerProfile?.ucp_task_1_claimed,
        isCompleted: () => state.ucp?.size > 0,
        action: () => navigateTo('chat-screen'),
        taskNumber: 1
    },
    {
        id: 'join_chat',
        title: 'Join the NOUB Community Chat',
        description: 'https://t.me/Noub_chat',
        reward: { noub: 1000 },
        isClaimed: () => false, // Placeholder: This needs a server-side check or manual claim
        isCompleted: () => false, // Player clicks the link, then the button
        action: () => window.open('https://t.me/Noub_chat', '_blank')
    },
    {
        id: 'join_channel',
        title: 'Subscribe to NOUB NFTs Channel',
        description: 'https://t.me/NOUB_NFTS',
        reward: { noub: 1000 },
        isClaimed: () => false,
        isCompleted: () => false,
        action: () => window.open('https://t.me/NOUB_NFTS', '_blank')
    },
    {
        id: 'vote_bot',
        title: 'Vote for our Game Bot',
        description: 'Vote for @NoubGame_bot', // This link needs to be a real voting link
        reward: { tickets: 5 },
        isClaimed: () => false,
        isCompleted: () => false,
        action: () => { /* Add real voting link later */ showToast('Voting link not available yet.', 'info'); }
    },
];

// 2. DAILY TASKS
const DAILY_TASKS = [
    { id: 'daily_claim_1', title: 'Claim Production 3 Times', target: 3, reward: { noub: 250 } },
    { id: 'daily_contract_1', title: 'Complete 1 Contract', target: 1, reward: { prestige: 20 } },
    { id: 'daily_assign_1', title: 'Assign an Expert', target: 1, reward: { tickets: 2 } },
    // We can add more daily tasks here
];

// 3. WEEKLY TASKS
const WEEKLY_TASKS = [
    { id: 'weekly_produce_10', title: 'Produce 10 Clay Jars', target: 10, reward: { noub: 2000 } },
    { id: 'weekly_contracts_5', title: 'Complete 5 Contracts', target: 5, reward: { ankh: 5 } },
    { id: 'weekly_upgrade_3', title: 'Upgrade Buildings 3 Times', target: 3, reward: { prestige: 100 } },
    // We can add more weekly tasks here
];


// --- Reward Track Definitions ---
const DAILY_TRACK_STAGES = [
    { threshold: 1, reward: { tickets: 1 } },
    { threshold: 2, reward: { prestige: 10 } },
    { threshold: 3, reward: { noub: 500 } } // Grand prize for completing all 3
];

const WEEKLY_TRACK_STAGES = [
    { threshold: 1, reward: { noub: 500 } },
    { threshold: 2, reward: { prestige: 50 } },
    { threshold: 3, reward: { ankh: 10 } } // Grand prize
];


/**
 * Renders a single task card.
 * @param {HTMLElement} container - The parent element to append the card to.
 * @param {object} task - The task object.
 * @param {string} type - 'onboarding', 'daily', or 'weekly'.
 */
function renderTaskCard(container, task, type) {
    const isCompleted = task.isCompleted ? task.isCompleted() : false; // Use function if it exists
    const isClaimed = task.isClaimed ? task.isClaimed() : false;

    let buttonHTML;
    if (isClaimed) {
        buttonHTML = `<button class="action-button small" disabled>Claimed</button>`;
    } else if (isCompleted) {
        buttonHTML = `<button class="action-button small claim-btn">Claim</button>`;
    } else {
        // For social tasks, the button should say "Check" or "Done" after they visit the link
        buttonHTML = `<button class="action-button small go-btn">${task.action ? 'Go' : 'Working...'}</button>`;
    }
    
    const card = document.createElement('div');
    card.className = 'daily-quest-card'; // Re-using the same style
    card.innerHTML = `
        <div class="quest-details">
            <h4>${task.title}</h4>
            <p>${task.description}</p>
        </div>
        <div class="quest-action">
            ${buttonHTML}
        </div>
    `;

    // Add event listeners
    if (!isClaimed && isCompleted) {
        // Logic to claim the reward
        card.querySelector('.claim-btn').onclick = () => {
            // Placeholder for claim logic
            showToast(`Claiming reward for ${task.title}...`, 'success');
        };
    } else if (!isClaimed && !isCompleted && task.action) {
        card.querySelector('.go-btn').onclick = task.action;
    }
    
    container.appendChild(card);
}

/**
 * Renders a reward track (Daily or Weekly).
 * @param {HTMLElement} container - The parent element.
 * @param {string} title - 'Daily' or 'Weekly'.
 * @param {Array} stages - The array of reward stages.
 * @param {number} progress - The player's current progress on this track.
 */
function renderRewardTrack(container, title, stages, progress) {
    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track'; // You will need to style this class
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 20px;`;

    let stagesHTML = stages.map((stage, index) => `
        <div class="track-stage ${progress >= stage.threshold ? 'completed' : ''}" style="text-align: center;">
            <div class="stage-icon" style="font-size: 1.5em; opacity: ${progress >= stage.threshold ? '1' : '0.4'};">🎁</div>
            <div class="stage-label" style="font-size: 0.7em;">${index + 1}</div>
        </div>
    `).join('');

    const progressPercent = (progress / stages[stages.length - 1].threshold) * 100;

    trackDiv.innerHTML = `
        <div class="track-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">${title} Rewards</h4>
            <span class="track-timer" style="background: #333; padding: 2px 8px; border-radius: 8px; font-size: 0.8em;">03h:35m</span>
        </div>
        <div class="track-progress-bar" style="background: #333; border-radius: 5px; height: 8px; margin-bottom: 10px; overflow: hidden;">
            <div class="track-progress-fill" style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); border-radius: 5px;"></div>
        </div>
        <div class="track-stages-container" style="display: flex; justify-content: space-around;">
            ${stagesHTML}
        </div>
    `;

    container.appendChild(trackDiv);
}

export async function renderTasks() {
    if (!state.currentUser || !tasksContainer) return;

    await refreshPlayerState();
    
    // We need the UCP data to check for completion status of onboarding tasks
    const { data: ucpData } = await api.fetchUCPProtocol(state.currentUser.id);
    if (ucpData && !(state.ucp instanceof Map)) state.ucp = new Map();
    if (ucpData) {
        ucpData.forEach(entry => state.ucp.set(entry.section_key, entry.section_data));
    }

    const container = document.getElementById('daily-quests-container');
    if (!container) return;
    container.innerHTML = ''; // Clear everything

    // --- Render Reward Tracks First ---
    renderRewardTrack(container, 'Daily', DAILY_TRACK_STAGES, 1); // Placeholder progress
    renderRewardTrack(container, 'Weekly', WEEKLY_TRACK_STAGES, 0); // Placeholder progress

    // --- Render Onboarding/Milestone Tasks ---
    const onboardingTitle = document.createElement('h3');
    onboardingTitle.textContent = 'One-Time Tasks';
    container.appendChild(onboardingTitle);
    ONBOARDING_TASKS.forEach(task => renderTaskCard(container, task, 'onboarding'));
    
    // --- Render Daily Tasks ---
    const dailyTitle = document.createElement('h3');
    dailyTitle.textContent = 'Daily Quests';
    dailyTitle.style.marginTop = '20px';
    container.appendChild(dailyTitle);
    DAILY_TASKS.forEach(task => renderTaskCard(container, task, 'daily'));

    // --- Render Weekly Tasks ---
    const weeklyTitle = document.createElement('h3');
    weeklyTitle.textContent = 'Weekly Quests';
    weeklyTitle.style.marginTop = '20px';
    container.appendChild(weeklyTitle);
    WEEKLY_TASKS.forEach(task => renderTaskCard(container, task, 'weekly'));
}
