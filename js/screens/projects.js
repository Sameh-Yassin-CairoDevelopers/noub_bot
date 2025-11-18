/*
 * Filename: js/screens/projects.js
 * Version: NOUB v1.5.3 (Final Project Screen Fix)
 * Description: View Logic Module for the Great Projects screen. This is a complete
 * overhaul to fix critical bugs related to project filtering and the UI state of
 * completed projects, ensuring a smooth and logical user experience.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- Module-level State ---
const projectsContainer = document.getElementById('projects-container');
let projectCountdownInterval = null;

// --- Helper Functions ---

/**
 * Formats milliseconds into a human-readable string (Xd Yh Zm).
 * @param {number} ms - The duration in milliseconds.
 * @returns {string} - The formatted time string.
 */
function formatTime(ms) {
    if (ms <= 0) return "Finished";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// --- Core Logic: Project Interaction ---

/**
 * Handles the process of subscribing a player to a new project.
 * @param {object} project - The master project data from the database.
 */
async function handleSubscribe(project) {
    const playerProfile = state.playerProfile;

    if ((playerProfile.noub_score || 0) < project.cost_noub) {
        return showToast(`Not enough NOUB. Required: ${project.cost_noub}`, 'error');
    }
    if ((playerProfile.prestige || 0) < project.cost_prestige) {
        return showToast(`Not enough Prestige. Required: ${project.cost_prestige}`, 'error');
    }
    if (project.required_specialization_id && !state.specializations.has(project.required_specialization_id)) {
        return showToast("This project requires a specialization you do not have.", 'error');
    }

    showToast("Subscribing to project...", 'info');

    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: playerProfile.noub_score - project.cost_noub,
        prestige: playerProfile.prestige - project.cost_prestige
    });

    if (profileError) {
        return showToast("Failed to deduct subscription costs.", 'error');
    }

    const { error: subscribeError } = await api.subscribeToProject(state.currentUser.id, project.id);
    if (subscribeError) {
        return showToast("An error occurred during subscription.", 'error');
    }

    showToast(`Successfully subscribed to "${project.name}"!`, 'success');
    
    await refreshPlayerState();
    window.closeModal('project-detail-modal');
    renderProjects();
}

/**
 * Handles the delivery of resources to an active project.
 * @param {object} activeProject - The player's active project instance from the database.
 * @param {string} itemId - The ID of the item being delivered.
 * @param {number} amount - The quantity of the item to deliver.
 */
async function handleDeliver(activeProject, itemId, amount) {
    if (isNaN(amount) || amount <= 0) {
        return showToast("Please enter a valid amount.", 'error');
    }
    
    const playerItem = state.inventory.get(parseInt(itemId));
    if (!playerItem || playerItem.qty < amount) {
        return showToast("Not enough resources in your inventory.", 'error');
    }

    const masterProject = activeProject.master_great_projects;
    const requirement = masterProject.requirements.item_requirements.find(r => r.item_id == itemId);
    const deliveredAmount = activeProject.progress[itemId] || 0;
    const neededAmount = requirement.quantity - deliveredAmount;

    if (neededAmount <= 0) {
        return showToast("This requirement has already been fulfilled.", 'info');
    }
    if (amount > neededAmount) {
        return showToast(`You only need to deliver ${neededAmount} more of this item.`, 'error');
    }

    showToast("Delivering resources...", 'info');

    const newProgress = { ...activeProject.progress };
    newProgress[itemId] = (newProgress[itemId] || 0) + amount;

    const [{ error: deliverError }, { error: inventoryError }] = await Promise.all([
        api.deliverToProject(activeProject.id, newProgress),
        api.updateItemQuantity(state.currentUser.id, parseInt(itemId), playerItem.qty - amount)
    ]);

    if (deliverError || inventoryError) {
        return showToast("Failed to deliver resources.", 'error');
    }

    showToast("Resources delivered successfully!", 'success');
    
    let allRequirementsMet = true;
    for (const req of masterProject.requirements.item_requirements) {
        if ((newProgress[req.item_id] || 0) < req.quantity) {
            allRequirementsMet = false;
            break;
        }
    }

    if (allRequirementsMet) {
        playSound('reward_grand');
        triggerNotificationHaptic('success');
        showToast(`AMAZING! You have completed "${masterProject.name}"! Claiming final rewards...`, 'success');
        
        const { error: completionError } = await api.completeGreatProject(activeProject.id, masterProject.rewards);
        
        if (completionError) {
            showToast("Error finalizing project completion!", 'error');
        } else {
            const { leveledUp, newLevel } = await api.addXp(state.currentUser.id, 500); 
            if (leveledUp) {
                showToast(`LEVEL UP! You have reached Level ${newLevel}!`, 'success');
            }
        }
    }

    await refreshPlayerState();
    renderProjects();
}

// --- UI Rendering Functions ---

/**
 * Renders a card for a single available project.
 * @param {HTMLElement} container - The DOM element to append the card to.
 * @param {object} project - The master project data.
 */
function renderProjectCard(container, project) {
    const playerLevel = state.playerProfile.level || 1;
    const canSubscribe = playerLevel >= project.min_player_level;
    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cssText = `background: ${canSubscribe ? 'var(--surface-dark)' : '#2d2d2d'}; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid ${canSubscribe ? 'var(--primary-accent)' : '#555'}; opacity: ${canSubscribe ? '1' : '0.6'};`;
    
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0;">${project.name}</h4>
            <span style="font-size: 0.8em; color: #aaa;">Lvl ${project.min_player_level}+</span>
        </div>
        <p style="font-size: 0.9em; color: #ccc; margin: 10px 0;">${project.description}</p>
        <button class="action-button small" ${!canSubscribe ? 'disabled' : ''}>
            ${canSubscribe ? 'View Details' : 'Locked'}
        </button>
    `;

    if (canSubscribe) {
        card.querySelector('button').onclick = () => openProjectDetailsModal(project);
    }
    
    container.appendChild(card);
}

/**
 * Renders the detailed view for a player's currently active or completed project.
 * @param {HTMLElement} container - The DOM element to append the view to.
 * @param {object} activeProject - The player's project data.
 */
function renderActiveProjectView(container, activeProject) {
    const project = activeProject.master_great_projects;
    const projectView = document.createElement('div');
    const isCompleted = activeProject.status === 'completed';

    projectView.className = 'active-project-view';
    projectView.style.cssText = `background: var(--surface-dark); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 3px solid ${isCompleted ? 'var(--success-color)' : 'var(--primary-accent)'};`;
    
    let timerHTML = isCompleted 
        ? `<p style="font-size: 1.5em; font-weight: bold; color: var(--success-color);">COMPLETED</p>`
        : `<p class="project-countdown" data-start-time="${activeProject.start_time}" data-duration-days="${project.duration_days}" style="font-size: 1.5em; font-weight: bold;">Calculating...</p>`;

    projectView.innerHTML = `
        <h3>${project.name} (${isCompleted ? 'Completed' : 'Active'})</h3>
        <div class="project-timer" style="margin: 15px 0; text-align: center;">
            <h4 style="color: ${isCompleted ? 'var(--success-color)' : 'var(--primary-accent)'};">${isCompleted ? 'Status' : 'Time Remaining'}</h4>
            ${timerHTML}
        </div>
        <div class="project-contribution">
            <h4>Your Contribution</h4>
            <div class="project-requirements-list"></div>
        </div>
    `;
    container.appendChild(projectView);

    const requirementsList = projectView.querySelector('.project-requirements-list');
    const projectRequirements = project.requirements?.item_requirements || [];
    const playerProgress = activeProject.progress || {};

    projectRequirements.forEach(req => {
        const deliveredAmount = playerProgress[req.item_id] || 0;
        const progressPercent = Math.min(100, (deliveredAmount / req.quantity) * 100);
        const itemName = state.masterItems.get(req.item_id)?.name || `Item ID ${req.item_id}`;
        
        const reqElement = document.createElement('div');
        reqElement.className = 'requirement-item';
        reqElement.style.marginBottom = '15px';
        reqElement.innerHTML = `
            <p style="display: flex; justify-content: space-between;">
                <span>${itemName}</span>
                <strong>${deliveredAmount} / ${req.quantity}</strong>
            </p>
            <div class="progress-bar" style="background: #333; border-radius: 4px; overflow: hidden; height: 6px;">
                <div class="progress-bar-inner" style="width: ${progressPercent}%; height: 100%; background-color: ${progressPercent >= 100 ? 'var(--success-color)' : 'var(--primary-accent)'};"></div>
            </div>
            ${!isCompleted ? `
            <div class="delivery-controls" style="display: flex; gap: 10px; margin-top: 5px;">
                <input type="number" class="delivery-input" data-item-id="${req.item_id}" placeholder="Amount" style="width: 100px; background: #222; border-color: #444;">
                <button class="action-button small deliver-btn" data-item-id="${req.item_id}">Deliver</button>
            </div>
            ` : ''}
        `;
        requirementsList.appendChild(reqElement);
    });

    if (!isCompleted) {
        projectView.querySelectorAll('.deliver-btn').forEach(button => {
            const itemId = button.dataset.itemId;
            const input = projectView.querySelector(`.delivery-input[data-item-id="${itemId}"]`);
            button.onclick = () => {
                const amount = parseInt(input.value);
                handleDeliver(activeProject, itemId, amount);
            };
        });
    }
}

/**
 * Opens a modal with details to subscribe to a project.
 * @param {object} project - The master project data.
 */
function openProjectDetailsModal(project) {
    const modal = document.getElementById('project-detail-modal');

    const requirements = project.requirements?.item_requirements || [];
    let requirementsHTML = requirements.map(req => {
        const itemName = state.masterItems.get(req.item_id)?.name || `[Item ID: ${req.item_id}]`;
        return `<li>${req.quantity} x ${itemName}</li>`;
    }).join('') || '<li>None</li>';

    const rewards = project.rewards || {};
    let rewardsHTML = Object.entries(rewards).map(([key, value]) => `<li>${value} ${key.toUpperCase()}</li>`).join('') || '<li>None</li>';

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('project-detail-modal')">&times;</button>
            <h2>${project.name}</h2>
            <p style="color: #aaa; font-size: 0.9em;">${project.description}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0;">
                <div><strong>Duration:</strong> ${project.duration_days} days</div>
                <div><strong>Min. Level:</strong> ${project.min_player_level}</div>
            </div>
            <div class="project-details-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                    <h4 style="color: var(--primary-accent);">Subscription Cost</h4>
                    <ul style="list-style: none; padding: 0;">
                        <li>${project.cost_noub} 🪙 NOUB</li>
                        <li>${project.cost_prestige} 🐞 Prestige</li>
                    </ul>
                </div>
                <div>
                    <h4 style="color: var(--primary-accent);">Final Rewards</h4>
                    <ul style="list-style: none; padding: 0;">${rewardsHTML}</ul>
                </div>
            </div>
            <div>
                <h4 style="color: var(--primary-accent);">Required Materials</h4>
                <ul style="list-style: none; padding: 0;">${requirementsHTML}</ul>
            </div>
            <button id="subscribe-btn" class="action-button" style="margin-top: 20px;">Subscribe & Begin</button>
        </div>
    `;
    
    modal.querySelector('#subscribe-btn').onclick = () => handleSubscribe(project);
    openModal('project-detail-modal');
}

/**
 * Starts and manages the countdown timers for all active projects.
 */
function startProjectTimers() {
    if (projectCountdownInterval) clearInterval(projectCountdownInterval);
    function update() {
        document.querySelectorAll('.project-countdown').forEach(timerEl => {
            const startTime = new Date(timerEl.dataset.startTime).getTime();
            const durationDays = parseInt(timerEl.dataset.durationDays);
            const endTime = startTime + (durationDays * 24 * 60 * 60 * 1000);
            const remaining = endTime - Date.now();
            timerEl.textContent = formatTime(remaining);
        });
    }
    update();
    projectCountdownInterval = setInterval(update, 60000);
}

/**
 * Main render function for the Great Projects screen.
 * It fetches all necessary data and intelligently decides which view to display.
 */
export async function renderProjects() {
    if (!state.currentUser || !projectsContainer) return;
    projectsContainer.innerHTML = '<p>Loading project status...</p>';

    if (!state.masterItems || state.masterItems.size === 0) {
        state.masterItems = new Map();
        const { data: allItems } = await api.fetchAllItems(); 
        if(allItems) {
            allItems.forEach(item => state.masterItems.set(item.id, item));
        }
    }

    const [{ data: allProjects, error: allProjectsError }, { data: playerProjects, error: playerProjectsError }] = await Promise.all([
        api.fetchAllGreatProjects(),
        api.fetchPlayerGreatProjects(state.currentUser.id)
    ]);

    if (allProjectsError || playerProjectsError) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading project data.</p>';
        return;
    }
    
    state.playerProjects = playerProjects;
    projectsContainer.innerHTML = '';

    const activeAndCompletedProjects = playerProjects.filter(p => p.status === 'active' || p.status === 'completed');
    if (activeAndCompletedProjects.length > 0) {
        const activeTitle = document.createElement('h3');
        activeTitle.textContent = "Your Great Projects";
        activeTitle.style.marginBottom = '15px';
        projectsContainer.appendChild(activeTitle);
        activeAndCompletedProjects.sort((a, b) => (a.status === 'active' ? -1 : 1));
        activeAndCompletedProjects.forEach(project => renderActiveProjectView(projectsContainer, project));
    }
    
    // --- CORRECTED FILTERING LOGIC ---
    // Create a set of master project IDs that the player is already involved with.
    const playerProjectMasterIds = new Set(playerProjects.map(p => p.master_great_projects.id));
    // Filter the master list to only show projects the player has NOT interacted with.
    const availableProjects = allProjects.filter(masterProj => !playerProjectMasterIds.has(masterProj.id));

    if (availableProjects.length > 0) {
        const availableTitle = document.createElement('h3');
        availableTitle.textContent = "Available Projects";
        availableTitle.style.marginTop = '30px';
        availableTitle.style.marginBottom = '15px';
        projectsContainer.appendChild(availableTitle);
        availableProjects.forEach(project => renderProjectCard(projectsContainer, project));
    }

    if (activeAndCompletedProjects.length === 0 && availableProjects.length === 0) {
        projectsContainer.innerHTML = '<p>No great projects are available right now. Level up to unlock more!</p>';
    }

    startProjectTimers();
}
