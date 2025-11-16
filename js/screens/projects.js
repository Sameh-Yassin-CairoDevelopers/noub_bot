/*
 * Filename: js/screens/projects.js
 * Version: NOUB v1.3.1 (Project Subscription Logic)
 * Description: Implements the UI and logic for the Great Projects screen,
 * including a detailed project modal and the ability to subscribe to projects.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, closeModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const projectsContainer = document.getElementById('projects-container');

/**
 * Renders a card for a single available project.
 * @param {object} project - The master project data from the database.
 */
function renderProjectCard(project) {
    const playerLevel = state.playerProfile.level || 1;
    const canSubscribe = playerLevel >= project.min_player_level;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cssText = `
        background: ${canSubscribe ? 'var(--surface-dark)' : '#2d2d2d'};
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 10px;
        border-left: 3px solid ${canSubscribe ? 'var(--primary-accent)' : '#555'};
        opacity: ${canSubscribe ? '1' : '0.6'};
    `;

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0;">${project.name}</h4>
            <span style="font-size: 0.8em; color: #aaa;">Lvl ${project.min_player_level}+</span>
        </div>
        <p style="font-size: 0.9em; color: #ccc; margin: 10px 0;">${project.description}</p>
        <button class="action-button small" data-project-id="${project.id}" ${!canSubscribe ? 'disabled' : ''}>
            ${canSubscribe ? 'View Details' : 'Locked'}
        </button>
    `;

    if (canSubscribe) {
        card.querySelector('button').onclick = () => openProjectDetailsModal(project);
    }

    projectsContainer.appendChild(card);
}

/**
 * Renders the view for a player's currently active project.
 * @param {object} activeProject - The player's project data, including master project details.
 */
function renderActiveProjectView(activeProject) {
    const project = activeProject.master_great_projects;
    projectsContainer.innerHTML = `
        <div class="active-project-view" style="background: var(--surface-dark); padding: 15px; border-radius: 8px;">
            <h3>${project.name} (Active)</h3>
            <p>${project.description}</p>
            
            <div class="project-timer" style="margin: 20px 0;">
                <h4 style="color: var(--primary-accent);">Time Remaining</h4>
                <p id="project-countdown" style="font-size: 1.5em; font-weight: bold;">Calculating...</p>
            </div>
            
            <div class="project-contribution">
                <h4>Your Contribution</h4>
                <div id="project-requirements-list">
                    <!-- Contribution progress will be rendered here -->
                </div>
            </div>
        </div>
    `;

    const requirementsList = document.getElementById('project-requirements-list');
    const projectRequirements = project.requirements?.item_requirements || [];
    const playerProgress = activeProject.progress || {};

    projectRequirements.forEach(req => {
        const deliveredAmount = playerProgress[req.item_id] || 0;
        const progressPercent = Math.min(100, (deliveredAmount / req.quantity) * 100);
        
        // Find the item name from the state (inventory or a future master item list)
        const itemName = state.inventory.get(req.item_id)?.details.name || `Item ID ${req.item_id}`;

        const reqElement = document.createElement('div');
        reqElement.className = 'requirement-item';
        reqElement.style.marginBottom = '10px';
        reqElement.innerHTML = `
            <p>${itemName}: ${deliveredAmount} / ${req.quantity}</p>
            <div class="progress-bar">
                <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="delivery-controls" style="display: flex; gap: 10px; margin-top: 5px;">
                <input type="number" class="delivery-input" data-item-id="${req.item_id}" placeholder="Amount" style="width: 100px;">
                <button class="action-button small deliver-btn" data-item-id="${req.item_id}">Deliver</button>
            </div>
        `;
        requirementsList.appendChild(reqElement);
    });

    // TODO: Implement countdown timer and "Deliver" button logic
}

/**
 * Handles the process of subscribing a player to a project.
 * @param {object} project - The master project data.
 */
async function handleSubscribe(project) {
    const playerProfile = state.playerProfile;

    // Check costs
    if ((playerProfile.noub_score || 0) < project.cost_noub) {
        return showToast(`Not enough NOUB. Required: ${project.cost_noub}`, 'error');
    }
    if ((playerProfile.prestige || 0) < project.cost_prestige) {
        return showToast(`Not enough Prestige. Required: ${project.cost_prestige}`, 'error');
    }
    // TODO: Add check for specialization if project.required_specialization_id is not null

    showToast("Subscribing to project...", 'info');

    // Deduct costs
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: playerProfile.noub_score - project.cost_noub,
        prestige: playerProfile.prestige - project.cost_prestige
    });

    if (profileError) {
        return showToast("Failed to deduct subscription costs.", 'error');
    }

    // Subscribe the player
    const { error: subscribeError } = await api.subscribeToProject(state.currentUser.id, project.id);
    if (subscribeError) {
        // TODO: In a real scenario, we should refund the costs if this step fails.
        return showToast("An error occurred during subscription.", 'error');
    }

    showToast(`Successfully subscribed to "${project.name}"!`, 'success');
    await refreshPlayerState();
    closeModal('project-detail-modal');
    renderProjects(); // Re-render the screen to show the active project view
}

/**
 * Opens a modal with details to subscribe to a project.
 * @param {object} project - The master project data.
 */
function openProjectDetailsModal(project) {
    const modal = document.getElementById('project-detail-modal');

    // Parse requirements to display them
    const requirements = project.requirements?.item_requirements || [];
    let requirementsHTML = requirements.map(req => {
        // Find item name from state. This assumes the item is in the player's inventory at least once.
        // A better approach for the future is to have a master list of all items in the state.
        const itemName = state.inventory.get(req.item_id)?.details.name || `[Item ID: ${req.item_id}]`;
        return `<li>${req.quantity} x ${itemName}</li>`;
    }).join('');
    if (!requirementsHTML) requirementsHTML = '<li>None</li>';

    // Parse rewards
    const rewards = project.rewards || {};
    let rewardsHTML = Object.keys(rewards).map(key => `<li>${rewards[key]} ${key.toUpperCase()}</li>`).join('');
    if (!rewardsHTML) rewardsHTML = '<li>None</li>';

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('project-detail-modal')">&times;</button>
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
                    <ul style="list-style: none; padding: 0;">
                        ${rewardsHTML}
                    </ul>
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
 * Main render function for the Great Projects screen.
 */
export async function renderProjects() {
    if (!state.currentUser || !projectsContainer) return;
    projectsContainer.innerHTML = '<p>Loading your project status...</p>';

    const [{ data: allProjects, error: allProjectsError }, { data: playerProjects, error: playerProjectsError }] = await Promise.all([
        api.fetchAllGreatProjects(),
        api.fetchPlayerGreatProjects(state.currentUser.id)
    ]);

    if (allProjectsError || playerProjectsError) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading project data.</p>';
        console.error('Project Load Error:', allProjectsError || playerProjectsError);
        return;
    }

    const activeProject = playerProjects.find(p => p.status === 'active');

    if (activeProject) {
        renderActiveProjectView(activeProject);
    } else {
        projectsContainer.innerHTML = '';
        if (!allProjects || allProjects.length === 0) {
            projectsContainer.innerHTML = '<p>No great projects have been decreed by the Pharaoh yet. Check back later!</p>';
            return;
        }
        allProjects.forEach(renderProjectCard);
    }
}
