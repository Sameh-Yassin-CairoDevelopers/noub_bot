/*
 * Filename: js/screens/projects.js
 * Version: Pharaoh's Legacy 'NOUB' v0.1 (Initial Implementation)
 * Description: Implements the Great Projects screen, allowing players to view, subscribe to,
 * and contribute to large-scale projects.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal } from '../ui.js';

const projectsContainer = document.getElementById('projects-container');

// --- Function to Render the List of Available Great Projects ---
async function renderProjects() {
    if (!state.currentUser || !projectsContainer) return;

    projectsContainer.innerHTML = 'Loading projects...';

    const { data: projects, error } = await api.fetchAllGreatProjects();

    if (error || !projects) {
        projectsContainer.innerHTML = '<p class="error-message">Error loading projects.</p>';
        return;
    }

    if (projects.length === 0) {
        projectsContainer.innerHTML = '<p>No projects available at this time.</p>';
        return;
    }

    projectsContainer.innerHTML = '';
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <h4>${project.name}</h4>
            <p>${project.description}</p>
            <button class="action-button small" data-project-id="${project.id}">View Details</button>
        `;
        card.querySelector('button').addEventListener('click', () => {
            openProjectDetailsModal(project);
        });
        projectsContainer.appendChild(card);
    });
}

/**
 * Opens a modal with the details of a project
 * @param {Object} project - Data for the specific project
 */
async function openProjectDetailsModal(project) {
    let modal = document.getElementById('project-detail-modal');
    if (!modal) {
        // Create the modal structure if it doesn't exist
        modal = document.createElement('div');
        modal.id = 'project-detail-modal';
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    // Fill in the content into the modal
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeModal('project-detail-modal')">&times;</button>
            <h2>${project.name}</h2>
            <p>${project.description}</p>
            <p>Duration: ${project.duration_days} days</p>
            <p>Minimum Level: ${project.min_player_level}</p>
            
            <div class="requirements">
                <h3>Requirements</h3>
                <!-- To be populated dynamically -->
            </div>
            
            <div class="rewards">
                <h3>Rewards</h3>
                <!-- To be populated dynamically -->
            </div>

            <button id="subscribe-btn" class="action-button">Subscribe</button>
        </div>
    `;
    
    // Close button
    const closeBtn = modal.querySelector('.modal-close-btn');
    closeBtn.onclick = () => closeModal('project-detail-modal');
        
    // Render Requirements
    const reqContainer = modal.querySelector('.requirements');
    reqContainer.innerHTML = ''; // Clear existing requirements
    
    // ... (Requirements parsing and rendering logic using JSON) ...
    if (project.requirements && Array.isArray(JSON.parse(project.requirements))) {
        JSON.parse(project.requirements).forEach(req => {
            reqContainer.innerHTML += `<p>${req.quantity} x [Item ID ${req.item_id}]</p>`; // Replace with actual item name later
        });
    } else {
        reqContainer.innerHTML = '<p>No requirements defined.</p>';
    }

    // Render Rewards
    const rewardContainer = modal.querySelector('.rewards');
    rewardContainer.innerHTML = ''; // Clear existing requirements

    if (project.rewards && typeof project.rewards === 'object') {
        // Display simple key-value pairs in the rewards section
        for (const key in project.rewards) {
            rewardContainer.innerHTML += `<p>${key}: ${project.rewards[key]}</p>`;
        }
    } else {
        rewardContainer.innerHTML = '<p>No rewards defined.</p>';
    }

    // Set up subscription logic
    const subscribeButton = document.getElementById('subscribe-btn');
    subscribeButton.addEventListener('click', async () => {
        const projectId = project.id;
        const { error } = await api.subscribeToProject(state.currentUser.id, projectId);
        if (error) {
            showToast("Subscription error!", 'error');
        } else {
            showToast("Successfully subscribed to project!", 'success');
            closeModal('project-detail-modal');
        }
    });

    openModal('project-detail-modal');
}

document.addEventListener('DOMContentLoaded', () => {
    // Make utility functions globally available for onclick attributes in HTML
    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    window.showToast = showToast;
});

// Export the render function to display the view
export async function renderProjects() {
    if (!state.currentUser) return;

    // Initialize by loading all available projects
    await renderProjects();
}