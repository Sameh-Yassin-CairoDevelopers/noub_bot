/*
 * Filename: js/screens/exchange.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (OVERHAUL: Full Currency Swap Logic)
 * Description: Implements a single-page swap interface (like a DEX) for currency conversion.
 * FIXED: Uses the unified CURRENCY_MAP and dynamically calculates all conversion rates.
*/


import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { TOKEN_RATES, CURRENCY_MAP } from '../config.js'; // Import new constants

const exchangeContainer = document.getElementById('exchange-screen');

// --- EXCHANGE RATES (Base rates are NOUB-centric) ---
const RATES = {
    // NOUB to other currencies (Cost in NOUB to BUY 1 unit)
    NOUB_PER_PRESTIGE: TOKEN_RATES.NOUB_PER_PRESTIGE,
    NOUB_PER_TICKET: TOKEN_RATES.NOUB_PER_TICKET,
    NOUB_PER_ANKH: TOKEN_RATES.NOUB_PER_ANKH_PREMIUM, 
    
    // Cross-Currency Rates (These are defined for logic clarity, not config)
    ANKH_TO_PRESTIGE: 0.005, // Arbitrary base rate
    PRESTIGE_TO_ANKH: 200,   // Arbitrary base rate
};
const MIN_CONVERSION_AMOUNT = 1;

let fromToken = 'ANKH';
let toToken = 'PRESTIGE';

/**
 * Gets player balance based on token name.
 */
function getBalance(tokenName) {
    const map = CURRENCY_MAP[tokenName.toUpperCase()];
    // SECURITY FIX: Ensure state.playerProfile exists before accessing
    if (map && state.playerProfile) { 
        return state.playerProfile[map.key] || 0;
    }
    return 0;
}

/**
 * Calculates the amount received and required based on current conversion.
 */
function calculateConversion(inputAmount, fromToken, toToken) {
    // Normalize tokens
    fromToken = fromToken.toUpperCase();
    toToken = toToken.toUpperCase();
    
    if (fromToken === toToken || isNaN(inputAmount) || inputAmount <= 0) {
        return { received: 0, required: 0 };
    }

    // --- Core Logic: All conversions route through NOUB first for simplicity ---
    let received = 0;
    let required = inputAmount;

    // 1. Conversion to NOUB (Selling the FROM token)
    if (toToken === 'NOUB') {
        const rate = RATES[`NOUB_PER_${fromToken}`]; // Cost to buy 1 unit of FROM is the sale price of FROM to NOUB
        if (!rate) return { received: 0, required: inputAmount, error: 'Conversion rate not defined.' };

        // Selling 1 unit of FROM gives 1 unit of NOUB at the cost rate
        // Sell FROM for NOUB (e.g., sell 1 Prestige for 1000 NOUB)
        received = inputAmount * rate;
    
    // 2. Conversion from NOUB (Buying the TO token)
    } else if (fromToken === 'NOUB') {
        const costPerUnit = RATES[`NOUB_PER_${toToken}`];
        if (!costPerUnit) return { received: 0, required: inputAmount, error: 'Conversion rate not defined.' };
        
        // Buying TO with NOUB (e.g., buy Prestige with 1000 NOUB)
        if (inputAmount % costPerUnit !== 0) {
            return { received: 0, required: inputAmount, error: `Must be a multiple of ${costPerUnit}.` };
        }
        received = inputAmount / costPerUnit;

    // 3. Cross-Conversion (FROM -> NOUB -> TO)
    } else {
         // This is complex and usually requires a fixed market rate for Cross-currency.
         // For stability, we'll use a hardcoded internal rate (e.g., Ankh/Prestige) if defined
         const rateKey = `${fromToken}_TO_${toToken}`;
         let fixedRate = RATES[rateKey];
         
         if (fixedRate) {
              // Direct fixed cross-rate exists
              received = inputAmount * fixedRate;
         } else {
              // No direct rate: Block or use NOUB as intermediate (more complex)
              return { received: 0, required: inputAmount, error: 'Cross-conversion not directly supported.' };
         }
    }
    
    return { received: Math.floor(received), required: required };
}


/**
 * Renders the Exchange Hub UI.
 */
export async function renderExchange() {
    if (!state.currentUser) return;

    if (!exchangeContainer) return;
    
    await refreshPlayerState();

    // Get Conversion Details for display
    const rateKey = `${fromToken.toUpperCase()}_PER_${toToken.toUpperCase()}`;
    const directRate = RATES[rateKey] || 'N/A';
    
    // Determine the exchange direction and display rate clearly
    let displayRate = 'N/A';
    if (fromToken === 'NOUB') {
        displayRate = `1 ${CURRENCY_MAP[toToken].icon} = ${RATES[`NOUB_PER_${toToken}`]} 🪙`;
    } else if (toToken === 'NOUB') {
        displayRate = `1 ${CURRENCY_MAP[fromToken].icon} = ${RATES[`NOUB_PER_${fromToken}`]} 🪙`;
    } else {
        // Fallback for cross-conversion to display an estimate if possible
        const directRateValue = RATES[`${fromToken}_TO_${toToken}`];
        if (directRateValue) {
             displayRate = `1 ${CURRENCY_MAP[fromToken].icon} ≈ ${directRateValue} ${CURRENCY_MAP[toToken].icon}`;
        } else {
             displayRate = "Cross-Conversion is rate-locked.";
        }
    }
    

    exchangeContainer.innerHTML = `
        <h2 style="text-align: center;">Currency Swap (DEX Style)</h2>
        
        <div style="text-align: center; margin-bottom: 15px;">
            <p id="conversion-display-rate" style="color: var(--primary-accent); font-weight: bold; font-size: 1.1em;">${displayRate}</p>
        </div>
        
        <!-- FROM BOX -->
        <div class="swap-box">
            <div class="swap-header">
                <span>From</span>
                <span class="swap-balance">Balance: ${getBalance(fromToken)} ${CURRENCY_MAP[fromToken].icon}</span>
            </div>
            <div class="swap-input-row">
                <input type="number" id="swap-input-from" placeholder="0.0" oninput="window.updateSwapOutput()" min="${MIN_CONVERSION_AMOUNT}">
                <select id="select-from-token" onchange="window.selectToken('from', this.value)">
                    <!-- Options populated dynamically -->
                </select>
            </div>
            <div class="swap-percent-row">
                <button class="action-button small" onclick="window.setSwapPercentage(0.25)">25%</button>
                <button class="action-button small" onclick="window.setSwapPercentage(0.50)">50%</button>
                <button class="action-button small" onclick="window.setSwapPercentage(1.0)">MAX</button>
            </div>
        </div>

        <!-- SWAP BUTTON -->
        <div class="swap-icon-container">
            <button id="swap-icon-btn" class="action-button small" onclick="window.swapTokens()">
                <div style="font-size: 20px;">⇅</div>
            </button>
        </div>

        <!-- TO BOX -->
        <div class="swap-box">
            <div class="swap-header">
                <span>To</span>
                <span class="swap-balance">Balance: ${getBalance(toToken)} ${CURRENCY_MAP[toToken].icon}</span>
            </div>
            <div class="swap-input-row">
                <input type="number" id="swap-input-to" placeholder="0.0" readonly>
                <select id="select-to-token" onchange="window.selectToken('to', this.value)">
                    <!-- Options populated dynamically -->
                </select>
            </div>
        </div>

        <!-- CONTINUE BUTTON -->
        <button id="continue-swap-btn" class="action-button" onclick="window.executeSwap()">Continue Swap</button>

        <div style="text-align: center; margin-top: 20px;">
            <p id="conversion-details" style="color: var(--text-secondary);"></p>
        </div>
    `;

    // 1. Populate token dropdowns and select current tokens
    const fromSelect = document.getElementById('select-from-token');
    const toSelect = document.getElementById('select-to-token');

    Object.keys(CURRENCY_MAP).forEach(token => {
        const fromOption = document.createElement('option');
        fromOption.value = token;
        fromOption.textContent = `${CURRENCY_MAP[token].name} (${CURRENCY_MAP[token].icon})`;
        if (token.toUpperCase() === fromToken.toUpperCase()) fromOption.selected = true;
        fromSelect.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = token;
        toOption.textContent = `${CURRENCY_MAP[token].name} (${CURRENCY_MAP[token].icon})`;
        if (token.toUpperCase() === toToken.toUpperCase()) toOption.selected = true;
        toSelect.appendChild(toOption);
    });
    
    // 2. Initial UI update
    window.updateSwapOutput();
}

/**
 * Updates the output field and conversion details based on input.
 */
window.updateSwapOutput = function() {
    const inputElement = document.getElementById('swap-input-from');
    const outputElement = document.getElementById('swap-input-to');
    const detailsElement = document.getElementById('conversion-details');
    const rateDisplayElement = document.getElementById('conversion-display-rate');
    const continueBtn = document.getElementById('continue-swap-btn');
    const inputAmount = parseInt(inputElement.value);
    
    // Update balances and rates first
    document.querySelector('.swap-box:first-child .swap-balance').textContent = `Balance: ${getBalance(fromToken)} ${CURRENCY_MAP[fromToken].icon}`;
    document.querySelector('.swap-box:last-child .swap-balance').textContent = `Balance: ${getBalance(toToken)} ${CURRENCY_MAP[toToken].icon}`;
    
    // Update rate display in the middle (re-render for rate logic)
    const newRate = calculateConversion(1, fromToken, toToken); // Calculate rate for 1 unit
    
    let displayRate = 'N/A';
    if (fromToken === 'NOUB') {
        displayRate = `1 ${CURRENCY_MAP[toToken].icon} = ${RATES[`NOUB_PER_${toToken}`]} 🪙`;
    } else if (toToken === 'NOUB') {
        displayRate = `1 ${CURRENCY_MAP[fromToken].icon} = ${RATES[`NOUB_PER_${fromToken}`]} 🪙`;
    } else {
         const rateValue = RATES[`${fromToken}_TO_${toToken}`];
         const inverseRateValue = RATES[`${toToken}_TO_${fromToken}`];
         if(rateValue) {
            displayRate = `1 ${CURRENCY_MAP[fromToken].icon} ≈ ${rateValue} ${CURRENCY_MAP[toToken].icon}`;
         } else if (inverseRateValue) {
            displayRate = `1 ${CURRENCY_MAP[toToken].icon} ≈ ${inverseRateValue} ${CURRENCY_MAP[fromToken].icon}`;
         } else {
             displayRate = "Cross-Conversion Rate Missing.";
         }
    }
    rateDisplayElement.textContent = displayRate;


    if (isNaN(inputAmount) || inputAmount <= 0) {
        outputElement.value = '0.0';
        detailsElement.textContent = 'Enter an amount to see details.';
        continueBtn.disabled = true;
        return;
    }
    
    const result = calculateConversion(inputAmount, fromToken, toToken);
    
    if (result.error) {
        outputElement.value = '0.0';
        detailsElement.textContent = `Error: ${result.error}`;
        continueBtn.disabled = true;
    } else if (result.required > getBalance(fromToken)) {
        outputElement.value = '0.0';
        detailsElement.innerHTML = `Insufficient Balance. Need <span style="color: var(--danger-color);">${result.required} ${CURRENCY_MAP[fromToken].icon}</span>.`;
        continueBtn.disabled = true;
    } else {
        outputElement.value = result.received.toString();
        const fromIcon = CURRENCY_MAP[fromToken].icon;
        const toIcon = CURRENCY_MAP[toToken].icon;
        
        detailsElement.innerHTML = `You will receive ${result.received} ${toIcon} for ${result.required} ${fromIcon}.`;
        continueBtn.disabled = result.received === 0;
    }
}

/**
 * Sets the token for a specific swap box and updates the UI.
 */
window.selectToken = function(box, newToken) {
    if (box === 'from') {
        fromToken = newToken;
        if (fromToken === toToken) window.swapTokens(); 
    } else {
        toToken = newToken;
        if (fromToken === toToken) window.swapTokens();
    }
    renderExchange(); 
}

/**
 * Swaps the From and To tokens.
 */
window.swapTokens = function() {
    const temp = fromToken;
    fromToken = toToken;
    toToken = temp;
    renderExchange(); 
}

/**
 * Sets the input amount to a percentage of the max balance.
 */
window.setSwapPercentage = function(percentage) {
    const maxBalance = getBalance(fromToken);
    let amount = Math.floor(maxBalance * percentage);
    
    // Enforce divisibility for NOUB conversions (buying non-NOUB items)
    if (fromToken === 'NOUB' && toToken !== 'NOUB') {
        const costPerUnit = RATES[`NOUB_PER_${toToken}`];
        if (costPerUnit) {
            amount = Math.floor(amount / costPerUnit) * costPerUnit;
        }
    } 
    
    document.getElementById('swap-input-from').value = amount;
    
    window.updateSwapOutput();
}

/**
 * Executes the final swap transaction.
 */
window.executeSwap = async function() {
    const inputElement = document.getElementById('swap-input-from');
    const amountDeducted = parseInt(inputElement.value);
    
    if (isNaN(amountDeducted) || amountDeducted <= 0) return;
    
    const result = calculateConversion(amountDeducted, fromToken, toToken);
    if (result.required > getBalance(fromToken) || result.received === 0) {
        showToast("Transaction failed: Invalid amount or insufficient balance.", 'error');
        return;
    }

    const updateObject = {};
    
    // Deduct from source
    const deductedKey = CURRENCY_MAP[fromToken].key;
    updateObject[deductedKey] = getBalance(fromToken) - amountDeducted;
    
    // Add to destination
    const receivedKey = CURRENCY_MAP[toToken].key;
    const currentReceivedBalance = getBalance(toToken);
    
    updateObject[receivedKey] = currentReceivedBalance + result.received;

    
    // 1. Execute database update
    const { error } = await api.updatePlayerProfile(state.currentUser.id, updateObject);
    
    if (!error) {
        // 2. Log the activity
        const description = `Swap: ${amountDeducted} ${fromToken} → ${result.received} ${toToken}.`;
        await api.logActivity(state.currentUser.id, 'EXCHANGE', description);
        
        showToast(`Swap Complete! You received ${result.received} ${toToken}.`, 'success');
        
        // 3. Update UI
        await refreshPlayerState();
        renderExchange(); 
    } else {
        showToast('Error processing swap!', 'error');
    }
}

