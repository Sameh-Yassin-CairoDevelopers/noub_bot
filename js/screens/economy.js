
import { state } from '../state.js';
import * as api from '../api.js';
// ... other imports remain the same

// ... (other functions in the file like formatTime, handleClaim, etc., remain the same)

/**
 * REFACTORED: This function now uses two simple queries instead of one complex one.
 * This is more reliable and directly mirrors our successful test.
 * @param {HTMLElement} container - The container element to render into.
 * @param {string} type - The type of factory to filter for ('RESOURCE' or 'FACTORY').
 */
async function renderFactories(container, type) {
    if (!state.currentUser) return;
    container.innerHTML = 'Loading buildings...';

    // Step 1: Fetch the player's specific factory data (e.g., id, level)
    const { data: playerFactories, error: playerError } = await api.fetchPlayerFactories(state.currentUser.id);
    if (playerError) {
        container.innerHTML = `Error loading your buildings: ${playerError.message}`;
        return;
    }

    if (playerFactories.length === 0) {
        container.innerHTML = `<p>You don't own any buildings yet.</p>`;
        return;
    }

    // Step 2: Fetch the master data for ALL factories (e.g., name, image)
    const { data: masterFactories, error: masterError } = await api.fetchAllMasterFactories();
    if (masterError) {
        container.innerHTML = 'Error loading factory definitions.';
        return;
    }

    // Now, combine the data on the client-side
    container.innerHTML = '';
    playerFactories.forEach(pf => {
        // Find the matching master data for this player factory
        const factoryInfo = masterFactories.find(f => f.id === pf.factory_id);
        
        // This check is important, although it should always pass
        if (factoryInfo /*&& factoryInfo.type === type*/) { // We can add the type filter later
            const card = document.createElement('div');
            card.className = 'building-card';
            card.innerHTML = `
                <img src="${factoryInfo.image_url || 'images/default_building.png'}" alt="${factoryInfo.name}">
                <h4>${factoryInfo.name}</h4>
                <span class="level">Level ${pf.level}</span>
                <div class="status">${pf.production_start_time ? 'Producing...' : 'Idle'}</div>
            `;
            // card.onclick = () => openProductionModal(...); // We will reconnect this next
            container.appendChild(card);
        }
    });
}

export function renderResources() { renderFactories(resourcesContainer, 'RESOURCE'); }
export function renderWorkshops() { workshopsContainer.innerHTML = 'Workshops coming soon!'; }
export function renderStock() { /* ... same as before ... */ }
