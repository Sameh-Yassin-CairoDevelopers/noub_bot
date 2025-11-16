/*
 * Filename: js/screens/projects.js
 * Version: NOUB v1.3.0 (Great Projects UI & Logic)
 * Description: Implements the UI and logic for the Great Projects screen.
 * It handles rendering the list of available projects and showing active projects.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';
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
    card.className = 'project-card'; // Add styles for this class
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
        <div class="active-project-view">
            <h3>${project.name} (Active)</h3>
            <p>${project.description}</p>
            
            <div class="project-timer">
                <h4>Time Remaining</h4>
                <p id="project-countdown">Calculating...</p>
            </div>
            
            <div class="project-contribution">
                <h4>Your Contribution</h4>
                <div id="project-requirements-list">
                    <!-- Contribution progress will be rendered here -->
                </div>
            </div>
        </div>
    `;

    // TODO: Implement countdown timer and contribution logic
    document.getElementById('project-countdown').textContent = "Feature in development";
    document.getElementById('project-requirements-list').innerHTML = "<p>Contribution system coming soon.</p>";
}

/**
 * Main render function for the Great Projects screen.
 * It determines whether to show the list of projects or the player's active project.
 */
export async function renderProjects() {
    if (!state.currentUser || !projectsContainer) return;

    projectsContainer.innerHTML = '<p>Loading your project status...</p>';

    // Fetch both master projects and player's projects simultaneously
    const [{ data: allProjects, error: allProjectsError }, { data: playerProjects, error: playerProjectsError }] = await Promise.all([
        api.fetchAllGreatProjects(),
        api.fetchPlayerGreatProjects(state.currentUser.id)
    ]);

    if (allProjectsError || playerProjectsError) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading project data.</p>';
        return;
    }

    // Check if the player has an active project
    const activeProject = playerProjects.find(p => p.status === 'active');

    if (activeProject) {
        // If there's an active project, show its dedicated view
        renderActiveProjectView(activeProject);
    } else {
        // Otherwise, show the list of all available projects
        projectsContainer.innerHTML = '';
        if (allProjects.length === 0) {
            projectsContainer.innerHTML = '<p>No great projects have been decreed by the Pharaoh yet. Check back later!</p>';
            return;
        }
        allProjects.forEach(project => {
            renderProjectCard(project);
        });
    }
}


/**
 * Opens a modal with details to subscribe to a project.
 * @param {object} project - The master project data.
 */
function openProjectDetailsModal(project) {
    // This function will be expanded in the next step to show full details and subscribe button.
    showToast(`Opening details for ${project.name}. Subscription logic coming soon.`, 'info');
}
