/*
 * Filename: js/screens/chat.js
 * Version: NOUB 0.0.3 (EVE UCP PROTOCOL - FINAL CODE)
 * Description: Logic for the Eve Chat interface. Implements the full 21-section UCP-LLM protocol
 * and creative question system for data collection.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// Global references 
let chatMessagesContainer; 
let chatInputField;
let chatSendButton;
let chatActionArea; 

// --- UCP PROTOCOL DATA (Full 21 Sections + Invented Questions) ---
// Note: This list is highly simplified for a quick chat flow, covering the 21 main concepts.
const EVE_UCP_QUESTIONS_LIST = [
    // Direct Protocol Questions (Simplified for chat flow)
    { id: "preferredName", question: "First, what is your preferred name for interaction?", type: "text", jsonKey: "preferredName", sectionTitle: "Personal Data" },
    { id: "languages", question: "What are your key languages and proficiency levels (e.g., Arabic (Native), English (Fluent))?", type: "textarea", jsonKey: "languagesProficiency", sectionTitle: "Personal Data" },
    { id: "social_details", question: "Could you share key details about your social or family status?", type: "textarea", jsonKey: "socialFamilyDetails", sectionTitle: "Social Status" },
    { id: "education_background", question: "Briefly, what is your educational background (Key fields, degrees)?", type: "textarea", jsonKey: "educationalBackground", sectionTitle: "Educational & Professional Background" },
    { id: "thinking_reference_desc", question: "Describe your core thinking reference (e.g., Rationalism, Platonism).", type: "textarea", jsonKey: "coreThinkingReferenceDescription", sectionTitle: "Core Thinking Reference" },
    { id: "passion_name", question: "What is the name of a key cognitive passion or research area for you?", type: "text", jsonKey: "cognitivePassionName", sectionTitle: "Cognitive Passion" },
    { id: "ethical_value", question: "What is a major ethical value that guides you (e.g., Honesty, Justice)?", type: "text", jsonKey: "ethicalValueName", sectionTitle: "Ethical Values" },
    { id: "core_concept", question: "What is your perspective on a core concept (e.g., Chaos, Ambiguity)?", type: "textarea", jsonKey: "coreConceptPerspective", sectionTitle: "Perspective on Core Concepts" },
    { id: "llm_role_primary", question: "What is the primary functional persona you require from me (the LLM)?", type: "text", jsonKey: "llmPrimaryRole", sectionTitle: "LLM Functional Persona" },
    { id: "preferred_style", question: "Describe your preferred LLM response style (e.g., Analytical, Concise, Detailed)?", type: "textarea", jsonKey: "preferredResponseStyle", sectionTitle: "Preferred Interaction Style" },
    { id: "intervention_select", question: "What is your chosen Model Intervention Level?", type: "select", options: ["High", "Medium", "Low"], jsonKey: "chosenInterventionLevel", sectionTitle: "Model Intervention Level" },
    { id: "alignment_select", question: "What is your desired Intellectual Alignment Level (1-5)?", type: "select", options: ["5 (Very High)", "4 (High)", "3 (Medium)", "2 (Low)", "1 (Basic)"], jsonKey: "desiredAlignmentLevel", sectionTitle: "Desired Alignment Level" },
    { id: "critique_preference", question: "What are your preferences for receiving constructive critique (when and how)?", type: "textarea", jsonKey: "critiquePreferences", sectionTitle: "Critique Mechanism" },
    { id: "constraint_item", question: "What is a key prohibition or warning for the LLM to respect (e.g., Do not provide medical advice)?", type: "text", jsonKey: "constraintItem", sectionTitle: "Prohibitions and Warnings" },
    { id: "memory_directive", question: "Do you have a directive to help maintain context effectively?", type: "textarea", jsonKey: "contextMaintenanceDirective", sectionTitle: "Memory Management Directives" },
    { id: "cognitive_preference", question: "Describe an important cognitive or behavioral preference.", type: "textarea", jsonKey: "cognitiveBehavioralPreference", sectionTitle: "Cognitive Preferences" },
    
    // Invented/Creative Questions (To populate 'Additional General Notes')
    { id: "sun_moon", question: "My creative friend, what do you love more: the sun's ☀️ warmth, or the moon's 🌙 serenity?", type: "mc", options: ["The Warm Sun ☀️", "The Enchanting Moon 🌙", "Both have their own special magic ✨"], sectionTitle: "Additional General Notes" },
    { id: "future_vision", question: "If you look to the future, how do you imagine yourself in five years? And what role might AI play? 🚀", type: "textarea", sectionTitle: "Additional General Notes" },
    { id: "reading_writing", question: "Do you prefer to read stories by others 📚, or write your own stories and ideas ✍️?", type: "mc", options: ["I adore reading 📚!", "I love writing ✍️!"], sectionTitle: "Additional General Notes" },
    { id: "biggest_challenge", question: "What is the most significant intellectual or creative challenge you are currently striving to overcome? 💪", type: "textarea", sectionTitle: "Additional General Notes" },
    { id: "ideal_day", question: "If you could design a perfect day, what would your routine look like and what activities would fill it? 🌟", type: "textarea", sectionTitle: "Additional General Notes" },
];

let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    if (!chatMessagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    // Basic Markdown Simulation
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    messageDiv.innerHTML = text;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

/**
 * Renders the input area dynamically based on question type (mc, select, text, textarea).
 */
function renderInputArea(questionConfig) {
    if (!chatInputField || !chatSendButton || !chatActionArea) return;
    
    // Clear dynamic buttons and reset input field
    const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
    dynamicElements.forEach(el => el.remove());
    chatInputField.style.display = 'none';
    chatSendButton.style.display = 'none';

    if (questionConfig.type === 'mc' && questionConfig.options) {
        // Multiple Choice Buttons
        questionConfig.options.forEach((opt) => {
            const btn = document.createElement('button');
            btn.className = 'action-button small ucp-dynamic-element';
            btn.style.width = '100%';
            btn.style.marginTop = '10px';
            btn.textContent = opt;
            btn.onclick = () => window.handleUCPChoice(opt);
            chatActionArea.appendChild(btn);
        });

    } else if (questionConfig.type === 'select' && questionConfig.options) {
        // Select Dropdown
        const select = document.createElement('select');
        select.className = 'ucp-dynamic-element';
        select.id = 'ucp-select-field';
        select.style.marginBottom = '10px';
        
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "-- Select an option --";
        select.appendChild(defaultOpt);

        questionConfig.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        chatActionArea.appendChild(select);
        
        // Add a send button for selects
        chatSendButton.style.display = 'inline-block';
        chatSendButton.onclick = () => {
            const value = document.getElementById('ucp-select-field').value;
            if (value) window.handleUCPChoice(value);
            else showToast("Please select an option.", 'error');
        };


    } else {
        // Standard input/textarea
        
        let targetElement;
        
        if (questionConfig.type === 'textarea') {
             // Use textarea for long answers
             targetElement = document.createElement('textarea');
             targetElement.id = 'ucp-textarea-field';
             targetElement.className = 'ucp-dynamic-element';
             targetElement.rows = 4;
             targetElement.placeholder = "Type your detailed answer here...";
             chatActionArea.insertBefore(targetElement, chatSendButton);
             chatInputField.style.display = 'none'; // Hide default input
        } else {
            // Use default input for short answers
            targetElement = chatInputField;
            targetElement.style.display = 'block';
            targetElement.type = questionConfig.type;
            targetElement.placeholder = "Type your answer here...";
        }

        chatSendButton.style.display = 'inline-block';
        chatSendButton.onclick = handleChatSend; 
    }
}


function askNextUCPQuestion() {
    if (currentQuestionIndex >= EVE_UCP_QUESTIONS_LIST.length) {
        addMessage("Eve", "Wonderful! We've completed your comprehensive Cognitive Protocol. Your data is safe and ready for use.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        if(chatInputField) chatInputField.placeholder = "Protocol Complete. Chat freely or export.";
        // Show Export button again
        addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
        return;
    }
    
    const questionConfig = EVE_UCP_QUESTIONS_LIST[currentQuestionIndex];
    addMessage("Eve", `[UCP Section: ${questionConfig.sectionTitle}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    renderInputArea(questionConfig);
}


window.handleUCPChoice = function(answerText) {
    if (!isAwaitingUCPAnswer) return;
    
    addMessage("User", `(Selected: ${answerText})`, 'user-bubble');
    processUCPAnswer(answerText);
}

/**
 * Processes the answer, saves it to Supabase, and advances the question index.
 */
function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = EVE_UCP_QUESTIONS_LIST[currentQuestionIndex];
    const sectionKey = questionConfig.sectionTitle.replace(/[\s\&\.\/]+/g, '_').toLowerCase(); 
    const dataKey = questionConfig.jsonKey; 

    const dataToSave = { 
        [dataKey]: answer, 
        question: questionConfig.question 
    };
    
    api.saveUCPSection(state.currentUser.id, sectionKey, dataToSave)
        .then(() => {
            showToast('Protocol Updated!', 'success');
            currentQuestionIndex++;
            askNextUCPQuestion();
        })
        .catch(err => {
            showToast('Error saving answer!', 'error');
            console.error('UCP Save Error:', err);
        });
}


function handleChatSend() {
    let messageText = chatInputField.value.trim();
    
    // Check for textarea if present
    const textareaEl = document.getElementById('ucp-textarea-field');
    if (textareaEl) {
        messageText = textareaEl.value.trim();
        textareaEl.value = ''; 
    }
    
    if (chatInputField && chatInputField.style.display !== 'none') {
        messageText = chatInputField.value.trim();
        chatInputField.value = ''; 
    }

    if (!messageText) return;
    
    if (isAwaitingUCPAnswer) {
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else {
        // Standard chat response simulation
        addMessage("User", messageText, 'user-bubble');
        const lowerCaseMessage = messageText.toLowerCase();
        
        if (lowerCaseMessage.includes("start profile") || lowerCaseMessage.includes("start ucp")) {
             window.startUCPInterview();
        } else if (lowerCaseMessage.includes("export")) {
            addMessage("Eve", "Certainly! Click the button to generate and view your protocol.", 'eve-bubble');
            addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
        } else if (lowerCaseMessage.includes("hello") || lowerCaseMessage.includes("hi")) {
            addMessage("Eve", `Hello! My focus is on helping you build your Cognitive Protocol. Type 'Start UCP' to begin or click the button.`, 'eve-bubble');
        } else {
             addMessage("Eve", "My primary focus is currently on completing your Cognitive Protocol. Type 'Start UCP' to continue.", 'eve-bubble');
        }
    }
}


export async function renderChat() {
    if (!state.currentUser) return;
    
    // 1. Fetch DOM Elements safely 
    chatMessagesContainer = document.getElementById('chat-messages'); 
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');
    chatActionArea = chatInputField ? chatInputField.parentNode : null;

    if (!chatMessagesContainer || !chatInputField || !chatSendButton || !chatActionArea) {
        console.error("Chat interface elements not found."); 
        return; 
    }
    
    // 2. Clear and attach listeners
    chatMessagesContainer.innerHTML = '';
    if (chatSendButton) chatSendButton.onclick = handleChatSend;
    if (chatInputField) chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter') handleChatSend();
    };

    // 3. Check Protocol Status and Start Conversation
    await refreshPlayerState();

    let lastAnsweredIndex = -1;
    for (let i = 0; i < EVE_UCP_QUESTIONS_LIST.length; i++) {
        const q = EVE_UCP_QUESTIONS_LIST[i];
        const sectionKey = q.sectionTitle.replace(/[\s\&\.\/]+/g, '_').toLowerCase();
        if (state.ucp.has(sectionKey)) {
             lastAnsweredIndex = i; 
        }
    }
    
    currentQuestionIndex = lastAnsweredIndex + 1;
    
    if (currentQuestionIndex >= EVE_UCP_QUESTIONS_LIST.length) {
        addMessage("Eve", "Welcome back. Your Cognitive Protocol is complete! I am now aligned with you.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Protocol Complete. Chat freely or export.";
    } else {
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Protocol (UCP). Shall we continue?", 'eve-bubble');
        addMessage("Eve", `<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions (Progress: ${currentQuestionIndex}/${EVE_UCP_QUESTIONS_LIST.length})</button>`, 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Click 'Start UCP Questions' to begin or continue.";
    }
    
    // Add the Export button permanently
    addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
}

// CRITICAL: Global functions must be implemented 
window.startUCPInterview = function() {
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = ''; 
    askNextUCPQuestion();
}

/**
 * Generates the full protocol text (mimicking the UCP_LLM_Generator logic) and initiates export.
 */
window.generateAndExportProtocol = function() {
    showToast('Generating Protocol...', 'info');
    
    // NOTE: This generation logic is a SIMPLIFIED MOCK of the full UCP_LLM_Generator.
    const protocolData = state.ucp;
    const username = state.playerProfile.username || 'Explorer';
    let protocolText = `--- UCP-LLM FINAL PROTOCOL for ${username} ---\n`;
    protocolText += `Version: NOUB 0.0.3 - Eve Edition\n`;
    protocolText += `Generation Date: ${new Date().toLocaleDateString()}\n\n`;
    
    if (protocolData.size === 0) {
        protocolText += "Profile is empty. Please answer Eve's questions first.\n";
    } else {
        protocolData.forEach((sectionData, sectionKey) => {
            protocolText += `\n[Section: ${sectionKey.toUpperCase().replace(/_/g, ' ')}]\n`;
            
            Object.keys(sectionData).forEach(dataKey => {
                if (dataKey === 'question') return; 
                
                const questionText = sectionData.question || 'N/A';
                const answerText = sectionData[dataKey];
                
                protocolText += `Question: ${questionText}\n`;
                protocolText += `Answer (${dataKey}): ${answerText}\n`;
            });
        });
    }
    
    // --- Export Logic ---
    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NOUB_UCP_Profile_${username}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Protocol exported successfully! Check your downloads.', 'success');
}
