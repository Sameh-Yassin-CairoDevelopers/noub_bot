
import { state } from '../state.js';
import { fetchPlayerCards } from '../api.js';

export async function renderProfile() {
    if (!state.playerProfile) return;
    
    document.getElementById('player-name').textContent = state.playerProfile.username;
    
    const { data: cards } = await fetchPlayerCards(state.currentUser.id);
    
    let totalPower = 0;
    if (cards) {
        totalPower = cards.reduce((sum, pc) => sum + (pc.cards ? pc.cards.power_score : 0), 0);
    }
    
    document.getElementById('player-power-score').textContent = totalPower;
    document.getElementById('stat-total-cards').textContent = cards ? cards.length : 0;
    document.getElementById('stat-contracts').textContent = 0; // Placeholder
}