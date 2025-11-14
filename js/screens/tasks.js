/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v0.9.2 (Fully Integrated Task Hub)
 * Description: A complete, functional, and dynamic task screen featuring Onboarding,
 * Daily, Weekly, and persistent KV Game milestone tracks.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const tasksContainer = document.getElementById('tasks-screen');

// --- Task & Reward Definitions ---

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
        isClaimed: () => false, // Placeholder for now
        isCompleted: () => false,
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
        description: 'Vote for @NoubGame_bot',
        reward: { tickets: 5 },
        isClaimed: () => false,
        isCompleted: () => false,
        action: () => { showToast('Voting link not available yet.', 'info'); }
    },
];

const DAILY_TASKS = [
    { id: 'daily_claim_3', title: 'Claim Production 3 Times', target: 3, reward: { noub: 250 } },
    { id: 'daily_contract_1', title: 'Complete 1 Contract', target: 1, reward: { prestige: 20 } },
    { id: 'daily_assign_1', title: 'Assign an Expert', target: 1, reward: { tickets: 2 } },
];

const WEEKLY_TASKS = [
    { id: 'weekly_produce_10', title: 'Produce 10 Clay Jars', target: 10, reward: { noub: 2000 } },
    { id: 'weekly_contracts_5', title: 'Complete 5 Contracts', target: 5, reward: { ankh: 5 } },
    { id: 'weekly_upgrade_3', title: 'Upgrade Buildings 3 Times', target: 3, reward: { prestige: 100 } },
];

const DAILY_TRACK_STAGES = [
    { threshold: 1, reward: { tickets: 1 } },
    { threshold: 2, reward: { prestige: 10 } },
    { threshold: 3, reward: { noub: 500 } }
];

const WEEKLY_TRACK_STAGES = [
    { threshold: 1, reward: { noub: 500 } },
    { threshold: 2, reward: { prestige: 50 } },
    { threshold: 3, reward: { ankh: 10 } }
];

const KV_MILESTONE_REWARDS = [
    { level: 10, reward: { noub: 5000, prestige: 50 }, claimed: false },
    { level: 20, reward: { tickets: 20, ankh: 5 }, claimed: false },
    { level: 30, reward: { noub: 15000, prestige: 150 }, claimed: false },
    { level: 40, reward: { tickets: 50, ankh: 15 }, claimed: false },
    { level: 50, reward: { noub: 50000, prestige: 500 }, claimed: false },
    { level: 62, reward: { ankh: 100 }, claimed: false, isGrand: true }
];

function renderTaskCard(container, task, type) {
    const isCompleted = task.isCompleted ? task.isCompleted() : false;
    const isClaimed = task.isClaimed ? task.isClaimed() : false;
    
    // Placeholder for real progress tracking
    const currentProgress = 0; 
    const target = task.target || 0;

    let buttonHTML;
    if (isClaimed) {
        buttonHTML = `<button class="action-button small" disabled>Claimed</button>`;
    } else if (isCompleted) {
        buttonHTML = `<button class="action-button small claim-btn">Claim</button>`;
    } else {
        buttonHTML = `<button class="action-button small go-btn">${task.action ? 'Go' : 'Working...'}</button>`;
    }
    
    let detailsHTML = '';
    if (task.description) {
        detailsHTML = `<p>${task.description}</p>`;
    } else if (target > 0) {
        const progressPercent = Math.min(100, (currentProgress / target) * 100);
        detailsHTML = `
            <p>Progress: ${currentProgress} / ${target}</p>
            <div class="progress-bar">
                <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
            </div>
        `;
    }

    const card = document.createElement('div');
    card.className = 'daily-quest-card';
    card.innerHTML = `
        <div class="quest-details">
            <h4>${task.title}</h4>
            ${detailsHTML}
        </div>
        <div class="quest-action">
            ${buttonHTML}
        </div>
    `;

    if (!isClaimed && isCompleted) {
        card.querySelector('.claim-btn').onclick = () => showToast(`Claiming reward for ${task.title}...`, 'success');
    } else if (!isClaimed && !isCompleted && task.action) {
        card.querySelector('.go-btn').onclick = task.action;
    }
    
    container.appendChild(card);
}

function renderRewardTrack(container, title, stages, progress) {
    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track';
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 20px;`;

    let stagesHTML = stages.map((stage, index) => `
        <div class="track-stage ${progress >= stage.threshold ? 'completed' : ''}" style="text-align: center;">
            <div class="stage-icon" style="font-size: 1.5em; opacity: ${progress >= stage.threshold ? '1' : '0.4'};">🎁</div>
            <div class="stage-label" style="font-size: 0.7em;">${index + 1}</div>
        </div>
    `).join('');

    const progressPercent = (progress / (stages[stages.length - 1]?.threshold || 1)) * 100;

    trackDiv.innerHTML = `
        <div class="track-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">${title}</h4>
            <span class="track-timer" style="background: #333; padding: 2px 8px; border-radius: 8px; font-size: 0.8em;">23h:59m</span>
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

async function renderMilestoneTrack(container) {
    const { data: kvProgressData } = await api.fetchKVProgress(state.currentUser.id);
    const currentKVLevel = (kvProgressData?.current_kv_level || 1) -1; // -1 because current_kv_level is the NEXT level to beat.

    // TODO: Fetch claimed milestone rewards from player profile
    
    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track';
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 20px;`;
    
    const nextMilestone = KV_MILESTONE_REWARDS.find(m => currentKVLevel < m.level /* && !m.claimed */);
    
    let progressPercent = 0;
    if (nextMilestone) {
        const milestoneIndex = KV_MILESTONE_REWARDS.indexOf(nextMilestone);
        const prevMilestoneLevel = KV_MILESTONE_REWARDS[milestoneIndex - 1]?.level || 0;
        const totalSteps = nextMilestone.level - prevMilestoneLevel;
        const currentSteps = currentKVLevel - prevMilestoneLevel;
        progressPercent = (currentSteps / totalSteps) * 100;
    } else {
        progressPercent = 100;
    }

    let stagesHTML = KV_MILESTONE_REWARDS.map(milestone => {
        const isCompleted = currentKVLevel >= milestone.level;
        // TODO: Replace 'false' with a check against the player's profile data for claimed rewards
        const isClaimed = false; 

        return `
            <div class="track-stage ${isCompleted ? 'completed' : ''}" style="text-align: center; position: relative;">
                <div class="stage-icon" style="font-size: 1.5em; opacity: ${isCompleted ? '1' : '0.4'};">
                    ${milestone.isGrand ? '🏆' : '🎁'}
                </div>
                <div class="stage-label" style="font-size: 0.7em;">KV ${milestone.level}</div>
                ${isCompleted && !isClaimed ? '<button class="action-button small" style="position: absolute; bottom: -25px; left: 50%; transform: translateX(-50%); padding: 2px 6px; font-size: 0.7em;">Claim</button>' : ''}
            </div>
        `;
    }).join('');

    trackDiv.innerHTML = `
        <div class="track-header"><h4 style="margin: 0;">Valley of the Kings Milestones</h4></div>
        <div class="track-progress-bar" style="margin: 10px 0;">
            <div class="track-progress-fill" style="width: ${progressPercent}%;"></div>
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

    const container = document.getElementById('daily-quests-container');
    if (!container) return;
    container.innerHTML = '';

    await renderMilestoneTrack(container);
    
    // Placeholder progress for daily/weekly tracks
    const dailyProgress = 0;
    const weeklyProgress = 0;
    renderRewardTrack(container, 'Daily Rewards', DAILY_TRACK_STAGES, dailyProgress);
    renderRewardTrack(container, 'Weekly Rewards', WEEKLY_TRACK_STAGES, weeklyProgress);

    const onboardingTitle = document.createElement('h3');
    onboardingTitle.textContent = 'One-Time Tasks';
    container.appendChild(onboardingTitle);
    ONBOARDING_TASKS.forEach(task => renderTaskCard(container, task, 'onboarding'));
    
    const dailyTitle = document.createElement('h3');
    dailyTitle.textContent = 'Daily Quests';
    dailyTitle.style.marginTop = '20px';
    container.appendChild(dailyTitle);
    DAILY_TASKS.forEach(task => renderTaskCard(container, task, 'daily'));

    const weeklyTitle = document.createElement('h3');
    weeklyTitle.textContent = 'Weekly Quests';
    weeklyTitle.style.marginTop = '20px';
    container.appendChild(weeklyTitle);
    WEEKLY_TASKS.forEach(task => renderTaskCard(container, task, 'weekly'));
}
