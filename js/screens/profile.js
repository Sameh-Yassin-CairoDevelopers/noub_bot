
/*
 * Filename: js/screens/profile.js
 * Version: 18.0 (Contracts UI)
 * Description: View Logic Module for the profile screen.
 * Updated to display the number of completed contracts.
*/

import { state } from './state.js';
import { supabaseClient } from './config.js'; // Need direct access for a quick count
import { fetchPlayerCards } from './api.js';

export async function renderProfile() {
    if (!state.playerProfile || !state.currentUser) return;
    
    // Update basic info from state
    document.getElementById('player-name').textContent = state.playerProfile.username;
    
    // Fetch card data to calculate power score
    const { data: cards } = await fetchPlayerCards(state.currentUser.id);
    
    let totalPower = 0;
    if (cards) {
        totalPower = cards.reduce((sum, pc) => sum + (pc.cards ? pc.cards.power_score : 0), 0);
    }
    
    document.getElementById('player-power-score').textContent = totalPower;
    document.getElementById('stat-total-cards').textContent = cards ? cards.length : 0;

    // NEW: Fetch and display the count of completed contracts
    const { count, error } = await supabaseClient
        .from('player_contracts')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', state.currentUser.id)
        .eq('status', 'completed');

    if (error) {
        console.error("Error counting completed contracts:", error);
        document.getElementById('stat-contracts').textContent = 'N/A';
    } else {
        document.getElementById('stat-contracts').textContent = count;
    }
}



