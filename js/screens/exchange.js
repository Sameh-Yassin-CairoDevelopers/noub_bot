/*
 * Filename: js/screens/exchange.js
 * Version: NOUB 0.0.3 (EXCHANGE HUB - FINAL CODE)
 * Description: View Logic Module for the Internal Currency Exchange Hub.
 * Allows players to convert between Ankh, Prestige, Blessing, and Spin Tickets.
 * Includes Activity Log integration.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const exchangeContainer = document.getElementById('exchange-screen');

// --- EXCHANGE RATES (Based on Economic Plan) ---
const RATES = {
    // 1 Prestige (🐞) = 1000 Ankh (☥)
    ANKH_TO_PRESTIGE: 1000, 
    PRESTIGE_TO_ANKH: 1000, // Conversion cost is 1000 Ankh
    
    // 1 Spin Ticket = 100 Ankh (☥)
    ANKH_TO_TICKET: 100, 
    TICKET_TO_ANKH: 100, // Conversion cost is 100 Ankh
    
    // 1 Blessing (🗡️) = 500 Ankh (☥)
    ANKH_TO_BLESSING: 500,
    BLESSING_TO_ANKH: 500
};
const MIN_CONVERSION_AMOUNT = 1;

/**
 * Renders the Exchange Hub UI.
 */
export async function renderExchange() {
    if (!state.currentUser) return;

    if (!exchangeContainer) {
        console.error("Exchange container not found in DOM.");
        return;
    }
    
    await refreshPlayerState(); // Ensure latest balances are shown

    exchangeContainer.innerHTML = `
        <h2>Internal Exchange Hub</h2>
        <p style="color: var(--text-secondary); text-align: center;">Convert between Ankh, Prestige, Blessing, and Spin Tickets.</p>

        <div class="exchange-grid">
            <!-- Exchange Card 1: ANKH ↔ PRESTIGE (1000 Ankh) -->
            <div class="exchange-card">
                <h4>Ankh (☥) ↔ Prestige (🐞)</h4>
                <p>Cost: ${RATES.ANKH_TO_PRESTIGE} Ankh per Prestige</p>
                <div class="exchange-input-group">
                    <input type="number" id="input-ankh-prestige" placeholder="Enter Ankh amount" min="${RATES.ANKH_TO_PRESTIGE}" step="${RATES.ANKH_TO_PRESTIGE}">
                    <button class="action-button small" onclick="window.convertCurrency('ankh', 'prestige')">Convert to 🐞</button>
                </div>
                <div class="exchange-input-group">
                    <input type="number" id="input-prestige-ankh" placeholder="Enter Prestige amount" min="${MIN_CONVERSION_AMOUNT}" step="1">
                    <button class="action-button small" onclick="window.convertCurrency('prestige', 'ankh')">Convert to ☥</button>
                </div>
            </div>

            <!-- Exchange Card 2: ANKH ↔ TICKET (100 Ankh) -->
            <div class="exchange-card">
                <h4>Ankh (☥) ↔ Spin Tickets (🎟️)</h4>
                <p>Cost: ${RATES.ANKH_TO_TICKET} Ankh per Ticket</p>
                <div class="exchange-input-group">
                    <input type="number" id="input-ankh-ticket" placeholder="Enter Ankh amount" min="${RATES.ANKH_TO_TICKET}" step="${RATES.ANKH_TO_TICKET}">
                    <button class="action-button small" onclick="window.convertCurrency('ankh', 'ticket')">Convert to 🎟️</button>
                </div>
                <div class="exchange-input-group">
                    <input type="number" id="input-ticket-ankh" placeholder="Enter Ticket amount" min="${MIN_CONVERSION_AMOUNT}" step="1">
                    <button class="action-button small" onclick="window.convertCurrency('ticket', 'ankh')">Convert to ☥</button>
                </div>
            </div>

            <!-- Exchange Card 3: ANKH ↔ BLESSING (500 Ankh) -->
            <div class="exchange-card">
                <h4>Ankh (☥) ↔ Blessing (🗡️)</h4>
                <p>Cost: ${RATES.ANKH_TO_BLESSING} Ankh per Blessing</p>
                <div class="exchange-input-group">
                    <input type="number" id="input-ankh-blessing" placeholder="Enter Ankh amount" min="${RATES.ANKH_TO_BLESSING}" step="${RATES.ANKH_TO_BLESSING}">
                    <button class="action-button small" onclick="window.convertCurrency('ankh', 'blessing')">Convert to 🗡️</button>
                </div>
                <div class="exchange-input-group">
                    <input type="number" id="input-blessing-ankh" placeholder="Enter Blessing amount" min="${MIN_CONVERSION_AMOUNT}" step="1">
                    <button class="action-button small" onclick="window.convertCurrency('blessing', 'ankh')">Convert to ☥</button>
                </div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 30px;">
            <h3>Your Balances:</h3>
            <p>Ankh (☥): ${state.playerProfile.score || 0}</p>
            <p>Prestige (🐞): ${state.playerProfile.prestige || 0}</p>
            <p>Blessing (🗡️): ${state.playerProfile.blessing || 0}</p>
            <p>Spin Tickets (🎟️): ${state.playerProfile.spin_tickets || 0}</p>
        </div>
    `;
    
    // NOTE: CSS is expected to be in style.css, but this ensures functionality
    // for demonstration purposes if external CSS is delayed.
}

/**
 * Handles the core conversion logic and updates the database.
 */
window.convertCurrency = async function(fromCurrency, toCurrency) {
    if (!state.currentUser) return;
    
    const inputElementId = `input-${fromCurrency}-${toCurrency}`;
    const inputElement = document.getElementById(inputElementId);
    
    if (!inputElement) return;
    
    const inputAmount = parseInt(inputElement.value);
    if (isNaN(inputAmount) || inputAmount <= 0) {
        showToast("Please enter a valid amount.", 'error');
        return;
    }
    
    const isForwardConversion = fromCurrency === 'ankh'; // e.g., Ankh -> Prestige
    const costPerUnitKey = `${fromCurrency.toUpperCase()}_TO_${toCurrency.toUpperCase()}`;
    const rateKey = isForwardConversion ? costPerUnitKey : `${toCurrency.toUpperCase()}_TO_${fromCurrency.toUpperCase()}`;
    
    const costPerUnit = RATES[costPerUnitKey] || RATES[rateKey];
    
    let amountToDeduct = 0;
    let amountToReceive = 0;
    
    if (isForwardConversion) { // Ankh -> X (Input is Ankh, Deduct Ankh)
        if (inputAmount % costPerUnit !== 0) {
            showToast(`Amount must be a multiple of ${costPerUnit}.`, 'error');
            return;
        }
        amountToDeduct = inputAmount;
        amountToReceive = inputAmount / costPerUnit;
    } else { // X -> Ankh (Input is X, Deduct X)
        amountToDeduct = inputAmount; // Deduct X units
        amountToReceive = inputAmount * costPerUnit; // Receive X * Rate Ankh
    }
    
    // Determine current balance of the source currency
    let requiredBalance = 0;
    switch (fromCurrency) {
        case 'ankh': requiredBalance = state.playerProfile.score || 0; break;
        case 'prestige': requiredBalance = state.playerProfile.prestige || 0; break;
        case 'blessing': requiredBalance = state.playerProfile.blessing || 0; break;
        case 'ticket': requiredBalance = state.playerProfile.spin_tickets || 0; break;
    }

    // 2. Perform validation
    if (requiredBalance < amountToDeduct) {
        showToast(`Not enough ${fromCurrency} to convert ${amountToDeduct}.`, 'error');
        return;
    }
    
    // 3. Prepare database update object
    const updateObject = {};
    
    // Deduct from source (Always the 'fromCurrency')
    switch (fromCurrency) {
        case 'ankh': updateObject.score = (state.playerProfile.score || 0) - amountToDeduct; break;
        case 'prestige': updateObject.prestige = (state.playerProfile.prestige || 0) - amountToDeduct; break;
        case 'blessing': updateObject.blessing = (state.playerProfile.blessing || 0) - amountToDeduct; break;
        case 'ticket': updateObject.spin_tickets = (state.playerProfile.spin_tickets || 0) - amountToDeduct; break;
    }
    
    // Add to destination (Always the 'toCurrency')
    switch (toCurrency) {
        case 'ankh': 
            // If converting to Ankh, ensure the updated score is used.
            updateObject.score = (updateObject.score || state.playerProfile.score || 0) + amountToReceive; 
            break;
        case 'prestige': 
            updateObject.prestige = (updateObject.prestige || state.playerProfile.prestige || 0) + amountToReceive; 
            break;
        case 'blessing': 
            updateObject.blessing = (state.playerProfile.blessing || 0) + amountToReceive; 
            break;
        case 'ticket': 
            updateObject.spin_tickets = (state.playerProfile.spin_tickets || 0) + amountToReceive; 
            break;
    }
    
    // 4. Execute transaction and update log
    const { error } = await api.updatePlayerProfile(state.currentUser.id, updateObject);
    
    if (!error) {
        const description = `Exchange: ${amountToDeduct} ${fromCurrency} → ${amountToReceive} ${toCurrency}.`;
        await api.logActivity(state.currentUser.id, 'EXCHANGE', description);
        
        showToast(`Success! Converted ${amountToDeduct} ${fromCurrency} to ${amountToReceive} ${toCurrency}.`, 'success');
        inputElement.value = ''; // Clear input
        await refreshPlayerState();
        renderExchange(); 
    } else {
        showToast('Error processing conversion!', 'error');
    }
}
// Export renderExchange for ui.js
export { renderExchange };