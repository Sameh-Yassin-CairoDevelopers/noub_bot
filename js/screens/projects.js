/*
 * Filename: js/screens/projects.js
 * Version: NOUB v1.7.3 (Definitive Event Binding Fix)
 * Description: View Logic Module for the Great Projects screen. This version provides
 * the definitive fix for the unresponsive "Deliver" buttons by ensuring correct and
 * robust event listener binding immediately after element creation.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- Module-level State ---
const projectsContainer = document.getElementById('projects-container');
let projectCountdownInterval = null;

// --- Helper Functions ---
function formatTime(ms) {
    if (ms <= 0) return "Finished";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// --- Core Logic: Project Interaction ---
async function handleSubscribe(project) {
    const playerProfile = state.playerProfile;
    if ((playerProfile.noub_score || 0) < project.cost_noub) return showToast(`Not enough NOUB. Required: ${project.cost_noub}`, 'error');
    if ((playerProfile.prestige || 0) < project.cost_prestige) return showToast(`Not enough Prestige. Required: ${project.cost_prestige}`, 'error');
    if (project.required_specialization_id && !state.specializations.has(project.required_specialization_id)) return showToast("This project requires a specialization you do not have.", 'error');
    showToast("Subscribing to project...", 'info');
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, { noub_score: playerProfile.noub_score - project.cost_noub, prestige: playerProfile.prestige - project.cost_prestige });
    if (profileError) return showToast("Failed to deduct subscription costs.", 'error');
    const { error: subscribeError } = await api.subscribeToProject(state.currentUser.id, project.id);
    if (subscribeError) return showToast("An error occurred during subscription.", 'error');
    showToast(`Successfully subscribed to "${project.name}"!`, 'success');
    await refreshPlayerState();
    window.closeModal('project-detail-modal');
    renderProjects();
}

async function handleDeliver(activeProject, itemId, amount) {
    if (isNaN(amount) || amount <= 0) return showToast("Please enter a valid amount.", 'error');
    const playerItem = state.inventory.get(parseInt(itemId));
    if (!playerItem || playerItem.qty < amount) return showToast("Not enough resources in your inventory.", 'error');
    
    const masterProject = activeProject.master_great_projects;
    const requirement = masterProject.requirements.item_requirements.find(r => r.item_id == itemId);
    const deliveredAmount = activeProject.progress[itemId] || 0;
    const neededAmount = requirement.quantity - deliveredAmount;

    if (amount > neededAmount) return showToast(`You only need to deliver ${neededAmount} more.`, 'error');

    showToast("Delivering resources...", 'info');
    const updatedProgress = { ...activeProject.progress };
    updatedProgress[itemId] = (updatedProgress[itemId] || 0) + amount;

    const [{ error: deliverError }, { error: inventoryError }] = await Promise.all([
        api.deliverToProject(activeProject.id, updatedProgress),
        api.updateItemQuantity(state.currentUser.id, parseInt(itemId), playerItem.qty - amount)
    ]);

    if (deliverError || inventoryError) return showToast("Failed to deliver resources.", 'error');

    showToast("Resources delivered successfully!", 'success');
    
    // Check for completion immediately after the state update
    const wasCompleted = await checkForCompletionAndFinalize(activeProject, updatedProgress);

    // Re-render the screen to show the updated progress
    await refreshPlayerState();
    renderProjects();
}

async function checkForCompletionAndFinalize(projectInstance, currentProgress) {
    if (projectInstance.status === 'completed') return false;
    const masterProject = projectInstance.master_great_projects;
    let allRequirementsMet = true;
    if (!masterProject.requirements || !masterProject.requirements.item_requirements) {
        allRequirementsMet = false;
    } else {
        for (const req of masterProject.requirements.item_requirements) {
            if ((currentProgress[req.item_id] || 0) < req.quantity) {
                allRequirementsMet = false;
                break;
            }
        }
    }

    if (allRequirementsMet) {
        playSound('reward_grand');
        triggerNotificationHaptic('success');
        showToast(`Project Completed: "${masterProject.name}"! Claiming final rewards...`, 'success');
        
        const { error: completionError } = await api.completeGreatProject(projectInstance.id, masterProject.rewards);
        
        if (completionError) {
            showToast("Error finalizing project completion!", 'error');
        } else {
            const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 500); 
            if (leveledUp) showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
        }
        return true;
    }
    return false;
}

// --- UI Rendering Functions ---

function renderActiveProjectView(container, projectInstance) {
    const masterProject = projectInstance.master_great_projects;
    const projectView = document.createElement('div');
    projectView.className = 'active-project-view';
    projectView.style.cssText = `background: var(--surface-dark); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 3px solid var(--primary-accent);`;
    
    projectView.innerHTML = `
        <h3>${masterProject.name} (Active)</h3>
        <div class="project-timer"><h4>Time Remaining</h4><p class="project-countdown" data-start-time="${projectInstance.start_time}" data-duration-days="${masterProject.duration_days}">Calculating...</p></div>
        <div class="project-contribution"><h4>Your Contribution</h4><div class="project-requirements-list"></div></div>`;
    
    const requirementsList = projectView.querySelector('.project-requirements-list');
    (masterProject.requirements?.item_requirements || []).forEach(req => {
        const deliveredAmount = projectInstance.progress[req.item_id] || 0;
        const progressPercent = Math.min(100, (deliveredAmount / req.quantity) * 100);
        const itemName = state.masterItems.get(req.item_id)?.name || `Item ID ${req.item_id}`;
        
        const reqElement = document.createElement('div');
        reqElement.className = 'requirement-item';
        reqElement.innerHTML = `
            <p><span>${itemName}</span><strong>${deliveredAmount} / ${req.quantity}</strong></p>
            <div class="progress-bar"><div class="progress-bar-inner" style="width: ${progressPercent}%;"></div></div>
            <div class="delivery-controls">
                <input type="number" class="delivery-input" placeholder="Amount">
                <button class="action-button small deliver-btn">Deliver</button>
            </div>`;
        if (progressPercent >= 100) {
            reqElement.querySelector('.delivery-input').disabled = true;
            reqElement.querySelector('.deliver-btn').disabled = true;
            reqElement.querySelector('.deliver-btn').textContent = 'Fulfilled';
        }

        // --- DEFINITIVE FIX: Bind the event listener directly after creating the button ---
        const deliverBtn = reqElement.querySelector('.deliver-btn');
        if (!deliverBtn.disabled) {
            const inputEl = reqElement.querySelector('.delivery-input');
            deliverBtn.onclick = () => {
                const amount = parseInt(inputEl.value);
                handleDeliver(projectInstance, req.item_id, amount);
            };
        }
        // --- END OF FIX ---
        
        requirementsList.appendChild(reqElement);
    });

    container.appendChild(projectView);
}

function renderCompletedProjectView(container, projectInstance) {
    const masterProject = projectInstance.master_great_projects;
    const projectView = document.createElement('div');
    projectView.className = 'completed-project-view';
    projectView.innerHTML = `<div><h4>${masterProject.name}</h4><span>✔ Completed</span></div>`;
    container.appendChild(projectView);
}

function renderAvailableProjectCard(container, project) {
    const playerLevel = state.playerProfile.level || 1;
    const canSubscribe = playerLevel >= project.min_player_level;
    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.opacity = canSubscribe ? '1' : '0.6';
    
    card.innerHTML = `
        <div><h4>${project.name}</h4><span>Lvl ${project.min_player_level}+</span></div>
        <p>${project.description}</p>
        <button class="action-button small" ${!canSubscribe ? 'disabled' : ''}>${canSubscribe ? 'View Details' : 'Locked'}</button>`;

    if (canSubscribe) card.querySelector('button').onclick = () => openProjectDetailsModal(project);
    container.appendChild(card);
}

function openProjectDetailsModal(project) {
    const modal = document.getElementById('project-detail-modal');
    const requirements = project.requirements?.item_requirements || [];
    const rewards = project.rewards || {};
    
    const rewardsHTML = rewards ? Object.entries(rewards).map(([key, value]) => `<li>${value} ${key.replace("_", " ").toUpperCase()}</li>`).join('') : '<li>None</li>';
    const requirementsHTML = requirements.map(req => `<li>${req.quantity} x ${state.masterItems.get(req.item_id)?.name || `Item #${req.item_id}`}</li>`).join('') || '<li>None</li>';
    
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('project-detail-modal')">&times;</button>
            <h2>${project.name}</h2>
            <p>${project.description}</p>
            <div><strong>Duration:</strong> ${project.duration_days} days</div>
            <div><strong>Min. Level:</strong> ${project.min_player_level}</div>
            <div><h4>Subscription Cost</h4><ul><li>${project.cost_noub} 🪙 NOUB</li><li>${project.cost_prestige} 🐞 Prestige</li></ul></div>
            <div><h4>Final Rewards</h4><ul>${rewardsHTML}</ul></div>
            <div><h4>Required Materials</h4><ul>${requirementsHTML}</ul></div>
            <button id="subscribe-btn" class="action-button">Subscribe & Begin</button>
        </div>`;
    modal.querySelector('#subscribe-btn').onclick = () => handleSubscribe(project);
    openModal('project-detail-modal');
}

function startProjectTimers() {
    if (projectCountdownInterval) clearInterval(projectCountdownInterval);
    const update = () => {
        document.querySelectorAll('.project-countdown').forEach(timerEl => {
            const startTime = new Date(timerEl.dataset.startTime).getTime();
            const durationDays = parseInt(timerEl.dataset.durationDays);
            const endTime = startTime + (durationDays * 24 * 60 * 60 * 1000);
            timerEl.textContent = formatTime(endTime - Date.now());
        });
    };
    update();
    projectCountdownInterval = setInterval(update, 60000);
}

export async function renderProjects() {
    if (!state.currentUser || !projectsContainer) return;
    projectsContainer.innerHTML = '<p>Auditing and loading project status...</p>';

    if (!state.masterItems || state.masterItems.size === 0) {
        state.masterItems = new Map();
        const { data: allItems } = await api.fetchAllItems(); 
        if(allItems) allItems.forEach(item => state.masterItems.set(item.id, item));
    }

    let { data: playerProjects, error: playerProjectsError } = await api.fetchPlayerGreatProjects(state.currentUser.id);
    if (playerProjectsError) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading project data.</p>';
        return;
    }
    
    let correctionNeeded = false;
    for (const project of playerProjects) {
        if (project.status === 'active') {
            const wasCompleted = await checkForCompletionAndFinalize(project, project.progress);
            if (wasCompleted) {
                correctionNeeded = true;
            }
        }
    }
    
    if (correctionNeeded) {
        showToast("Correcting completed project states...", "info");
        const { data: correctedProjects } = await api.fetchPlayerGreatProjects(state.currentUser.id);
        playerProjects = correctedProjects;
        await refreshPlayerState();
    }

    projectsContainer.innerHTML = '';
    
    const { data: allProjects, error: allProjectsError } = await api.fetchAllGreatProjects();
    if (allProjectsError) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading master project list.</p>';
        return;
    }

    const activeProjects = playerProjects.filter(p => p.status === 'active');
    const completedProjects = playerProjects.filter(p => p.status === 'completed');
    const playerInvolvedProjectIds = new Set(playerProjects.map(p => p.project_id));
    const availableProjects = allProjects.filter(p => !playerInvolvedProjectIds.has(p.id));

    if (activeProjects.length > 0) {
        const title = document.createElement('h3');
        title.textContent = "Your Active Projects";
        projectsContainer.appendChild(title);
        activeProjects.forEach(p => renderActiveProjectView(projectsContainer, p));
    }

    if (availableProjects.length > 0) {
        const title = document.createElement('h3');
        title.textContent = "Available Projects";
        title.style.marginTop = '30px';
        projectsContainer.appendChild(title);
        availableProjects.forEach(p => renderAvailableProjectCard(projectsContainer, p));
    }

    if (completedProjects.length > 0) {
        const title = document.createElement('h3');
        title.textContent = "Completed Projects";
        title.style.marginTop = '30px';
        projectsContainer.appendChild(title);
        completedProjects.forEach(p => renderCompletedProjectView(projectsContainer, p));
    }

    if (projectsContainer.innerHTML === '') {
        projectsContainer.innerHTML = '<p>No great projects are available right now. Level up to unlock more!</p>';
    }

    startProjectTimers();
}
