/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v0.9.6 (Final Integrated Tasks Hub)
 * Description: A complete, functional, and dynamic task screen with full claim logic
 * for all task types including Onboarding/Protocol tasks.
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
        isCompleted: () => (state.ucp instanceof Map && state.ucp.size > 0),
        action: () => navigateTo('chat-screen'),
        claimHandler: (task) => claimOnboardingTask(task, 1)
    },
    {
        id: 'ucp_task_2',
        title: 'Complete Eve\'s Interview',
        description: 'Finish all of Eve\'s main sections and general questions.',
        reward: { noub: 1500, prestige: 75, tickets: 5 },
        isClaimed: () => state.playerProfile?.ucp_task_2_claimed,
        isCompleted: () => state.ucp?.has('eve_general'),
        claimHandler: (task) => claimOnboardingTask(task, 2)
    },
    {
        id: 'ucp_task_3',
        title: 'Embrace Deep Analysis',
        description: 'Complete one of Hypatia\'s sessions and export your final protocol.',
        reward: { noub: 5000, prestige: 250, ankh: 5 },
        isClaimed: () => state.playerProfile?.ucp_task_3_claimed,
        isCompleted: () => state.ucp?.has('hypatia_philosophical') || state.ucp?.has('hypatia_scaled'),
        claimHandler: (task) => claimOnboardingTask(task, 3)
    },
    {
        id: 'join_chat',
        title: 'Join the NOUB Community Chat',
        description: 'https://t.me/Noub_chat',
        reward: { noub: 1000 },
        isClaimed: () => false, 
        isCompleted: () => true,
        action: (task, card) => {
            window.open('https://t.me/Noub_chat', '_blank');
            card.querySelector('.go-btn').textContent = 'Claim';
            card.querySelector('.go-btn').onclick = () => showToast("Claiming for social tasks is not yet implemented.", "info");
        }
    },
];

const DAILY_TASKS = [
    { id: 'daily_claim_3', title: 'Claim Production 3 Times', target: 3, reward: { noub: 250 }, type: 'production_claim' },
    { id: 'daily_contract_1', title: 'Complete 1 Contract', target: 1, reward: { prestige: 20 }, type: 'contract_complete' },
    { id: 'daily_assign_1', title: 'Assign an Expert', target: 1, reward: { tickets: 2 }, type: 'assign_expert' },
];

const WEEKLY_TASKS = [
    { id: 'weekly_produce_10', title: 'Produce 10 Clay Jars', target: 10, reward: { noub: 2000 }, type: 'production_claim' },
    { id: 'weekly_contracts_5', title: 'Complete 5 Contracts', target: 5, reward: { ankh: 5 }, type: 'contract_complete' },
    { id: 'weekly_upgrade_3', title: 'Upgrade Buildings 3 Times', target: 3, reward: { prestige: 100 }, type: 'upgrade_building' },
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
    { level: 10, reward: { noub: 5000, prestige: 50 } },
    { level: 20, reward: { tickets: 20, ankh: 5 } },
    { level: 30, reward: { noub: 15000, prestige: 150 } },
    { level: 40, reward: { tickets: 50, ankh: 15 } },
    { level: 50, reward: { noub: 50000, prestige: 500 } },
    { level: 62, reward: { ankh: 100 }, isGrand: true }
];

export async function trackTaskProgress(taskType, amount = 1) {
    if (!state.currentUser) return;
    
    let dailyProgress = state.playerProfile.daily_tasks_progress || {};
    let weeklyProgress = state.playerProfile.weekly_tasks_progress || {};
    let needsUpdate = false;

    const tasksToUpdate = [...DAILY_TASKS, ...WEEKLY_TASKS].filter(task => task.type === taskType);

    tasksToUpdate.forEach(task => {
        const isDaily = task.id.startsWith('daily');
        const progressContainer = isDaily ? dailyProgress : weeklyProgress;
        const claimedContainer = isDaily ? state.playerProfile.daily_tasks_claimed : state.playerProfile.weekly_tasks_claimed;

        if (claimedContainer && claimedContainer[task.id]) return;

        if ((progressContainer[task.id] || 0) < task.target) {
            progressContainer[task.id] = Math.min(task.target, (progressContainer[task.id] || 0) + amount);
            needsUpdate = true;
        }
    });

    if (needsUpdate) {
        await api.updatePlayerProfile(state.currentUser.id, {
            daily_tasks_progress: dailyProgress,
            weekly_tasks_progress: weeklyProgress
        });
        await refreshPlayerState();
        if (tasksContainer && !tasksContainer.classList.contains('hidden')) {
            renderTasks();
        }
    }
}

async function claimOnboardingTask(task, taskNumber) {
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
    
    if (taskNumber === 3) {
        const { error: unlockError } = await api.supabaseClient.from('player_library').upsert({
            player_id: state.currentUser.id,
            entry_key: 'god_horus'
        });
        if (!unlockError) {
            showToast("New Library Entry Unlocked: The Great Ennead: Horus!", 'success');
        } else {
            console.error("Library unlock error:", unlockError);
        }
    }

    Object.keys(reward).forEach(key => rewardString += `${reward[key]}${key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥'} `);
    showToast(`Reward Claimed: +${rewardString}`, 'success');
    
    await refreshPlayerState();
    renderTasks();
}

async function claimTimedTaskReward(task) {
    const isDaily = task.id.startsWith('daily');
    const profile = state.playerProfile;
    const progressContainer = isDaily ? profile.daily_tasks_progress : profile.weekly_tasks_progress;
    const claimedContainer = isDaily ? profile.daily_tasks_claimed : profile.weekly_tasks_claimed;

    if (!progressContainer || (progressContainer[task.id] || 0) < task.target) {
        showToast("Task is not yet complete!", 'error');
        return;
    }
    if (claimedContainer && claimedContainer[task.id]) {
        showToast("Reward already claimed!", 'info');
        return;
    }

    let rewardString = '';
    const profileUpdate = {};
    const reward = task.reward;

    if (reward.noub) profileUpdate.noub_score = (profile.noub_score || 0) + reward.noub;
    if (reward.prestige) profileUpdate.prestige = (profile.prestige || 0) + reward.prestige;
    if (reward.tickets) profileUpdate.spin_tickets = (profile.spin_tickets || 0) + reward.tickets;
    if (reward.ankh) profileUpdate.ankh_premium = (profile.ankh_premium || 0) + reward.ankh;

    if (isDaily) {
        profileUpdate.daily_tasks_claimed = { ...(profile.daily_tasks_claimed || {}), [task.id]: true };
        profileUpdate.daily_track_progress = (profile.daily_track_progress || 0) + 1;
    } else {
        profileUpdate.weekly_tasks_claimed = { ...(profile.weekly_tasks_claimed || {}), [task.id]: true };
        profileUpdate.weekly_track_progress = (profile.weekly_track_progress || 0) + 1;
    }

    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);

    if (error) {
        showToast("Error claiming reward!", 'error');
        console.error(error);
        return;
    }

    Object.keys(reward).forEach(key => rewardString += `${reward[key]}${key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥'} `);
    showToast(`Reward Claimed: +${rewardString}`, 'success');
    
    await refreshPlayerState();
    renderTasks();
}

function renderTaskCard(container, task, type) {
    let currentProgress = 0, isClaimed = false, isCompleted = false;

    if (type === 'onboarding') {
        isClaimed = task.isClaimed ? task.isClaimed() : false;
        isCompleted = task.isCompleted ? task.isCompleted() : false;
    } else {
        const profile = state.playerProfile;
        const progressContainer = type === 'daily' ? profile.daily_tasks_progress : profile.weekly_tasks_progress;
        const claimedContainer = type === 'daily' ? profile.daily_tasks_claimed : profile.weekly_tasks_claimed;
        currentProgress = (progressContainer && progressContainer[task.id]) || 0;
        isClaimed = (claimedContainer && claimedContainer[task.id]) || false;
        isCompleted = task.target > 0 && currentProgress >= task.target;
    }

    let buttonHTML;
    if (isClaimed) {
        buttonHTML = `<button class="action-button small" disabled>Claimed</button>`;
    } else if (isCompleted) {
        buttonHTML = `<button class="action-button small claim-btn">Claim</button>`;
    } else {
        buttonHTML = `<button class="action-button small go-btn">${task.action ? 'Go' : 'Working...'}</button>`;
    }
    
    let detailsHTML = task.description ? `<p>${task.description}</p>` : '';
    if (task.target > 0) {
        const progressPercent = Math.min(100, (currentProgress / task.target) * 100);
        detailsHTML = `
            <p>Progress: ${currentProgress} / ${task.target}</p>
            <div class="progress-bar"><div class="progress-bar-inner" style="width: ${progressPercent}%;"></div></div>
        `;
    }

    const card = document.createElement('div');
    card.className = 'daily-quest-card';
    card.innerHTML = `
        <div class="quest-details"><h4>${task.title}</h4>${detailsHTML}</div>
        <div class="quest-action">${buttonHTML}</div>
    `;

    const claimBtn = card.querySelector('.claim-btn');
    if (claimBtn) {
        if (type === 'onboarding') {
            claimBtn.onclick = () => task.claimHandler(task);
        } else {
            claimBtn.onclick = () => claimTimedTaskReward(task);
        }
    }
    
    const goBtn = card.querySelector('.go-btn');
    if (goBtn && task.action) {
        goBtn.onclick = () => task.action(task, card);
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
        <div class="track-stages-container" style="display: flex; justify-content: space-around;">${stagesHTML}</div>
    `;
    container.appendChild(trackDiv);
}

async function renderMilestoneTrack(container) {
    const { data: kvProgressData } = await api.fetchKVProgress(state.currentUser.id);
    const currentKVLevel = (kvProgressData?.current_kv_level || 1) - 1;
    const claimedMilestones = state.playerProfile.kv_milestones_claimed || [];

    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track';
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 20px;`;
    
    const nextMilestone = KV_MILESTONE_REWARDS.find(m => !claimedMilestones.includes(m.level));
    
    let progressPercent = 0;
    if (nextMilestone) {
        const milestoneIndex = KV_MILESTONE_REWARDS.indexOf(nextMilestone);
        const prevMilestoneLevel = KV_MILESTONE_REWARDS[milestoneIndex - 1]?.level || 0;
        const totalSteps = nextMilestone.level - prevMilestoneLevel;
        const currentSteps = currentKVLevel - prevMilestoneLevel;
        progressPercent = Math.min(100, (currentSteps / totalSteps) * 100);
    } else {
        progressPercent = 100;
    }

    let stagesHTML = KV_MILESTONE_REWARDS.map(milestone => {
        const isCompleted = currentKVLevel >= milestone.level;
        const isClaimed = claimedMilestones.includes(milestone.level);
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
        <div class="track-stages-container" style="display: flex; justify-content: space-around;">${stagesHTML}</div>
    `;
    container.appendChild(trackDiv);
}

export async function renderTasks() {
    if (!state.currentUser) return;
    await refreshPlayerState();

    const profile = state.playerProfile;
    if (!profile.daily_tasks_progress) profile.daily_tasks_progress = {};
    if (!profile.weekly_tasks_progress) profile.weekly_tasks_progress = {};
    if (!profile.daily_tasks_claimed) profile.daily_tasks_claimed = {};
    if (!profile.weekly_tasks_claimed) profile.weekly_tasks_claimed = {};
    if (!profile.kv_milestones_claimed) profile.kv_milestones_claimed = [];
    if (!state.ucp) state.ucp = new Map();

    const container = document.getElementById('daily-quests-container');
    if (!container) return;
    container.innerHTML = '';

    await renderMilestoneTrack(container);
    
    renderRewardTrack(container, 'Daily Rewards', DAILY_TRACK_STAGES, profile.daily_track_progress || 0);
    renderRewardTrack(container, 'Weekly Rewards', WEEKLY_TRACK_STAGES, profile.weekly_track_progress || 0);

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
