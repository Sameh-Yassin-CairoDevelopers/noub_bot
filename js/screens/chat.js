/*
 * Filename: js/screens/chat.js
 * Version: NOUB 0.0.1 Eve Edition (CHAT RENDER FIX - Complete)
 * Description: Logic for the Eve Chat interface. FIXED: Ensures DOM elements are correctly loaded before use.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// Elements will be fetched inside renderChat to ensure they exist on navigation
let chatMessagesContainer; 
let chatInputField;
let chatSendButton;


// --- UCP QUESTIONS DATA (Simplified Master List) ---
const EVE_INVENTED_QUESTIONS_LIST = [
    { id: "sun_moon", question: "My creative friend, what do you love more: the sun's ☀️ warmth, or the moon's 🌙 serenity?", type: "mc", options: ["The Warm Sun ☀️", "The Enchanting Moon 🌙"] },
    { id: "future_vision", question: "If you look to the future, how do you imagine yourself in five years?", type: "textarea" },
    { id: "reading_writing", question: "Do you find yourself more inclined to read stories written by others 📚, or to write your own stories and ideas ✍️?", type: "mc", options: ["I adore reading 📚!", "I love writing ✍️!"] },
    { id: "learning_style", question: "When learning, do you prefer to dive into the details directly 🔬, or understand the big picture first 🗺️?", type: "mc", options: ["Details first 🔬", "The big picture 🗺️"] }
];

let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    // We now rely on chatMessagesContainer being set inside renderChat()
    if (!chatMessagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    messageDiv.innerHTML = text;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function renderInputArea(questionConfig) {
    // Render logic remains the same, relying on static input fields
    
    // We only need to control visibility and button binding here.
    if (questionConfig.type === 'mc' && questionConfig.options) {
        // Render buttons dynamically
        const optionsHTML = questionConfig.options.map((opt, index) => 
            `<button class="action-button small" style="width:auto; margin-right: 10px;" onclick="window.handleUCPChoice(${index}, '${opt.replace(/'/g, "\\'")}')">${opt}</button>`
        ).join('');
        
        // This is the area that needs attention (assuming index.html has an ID for the button container)
        const chatInputArea = document.getElementById('chat-input-area'); 
        if (chatInputArea) {
             chatInputArea.innerHTML = optionsHTML;
        }

        chatInputField.style.display = 'none';
        chatSendButton.style.display = 'none';

    } else {
        // Standard input/textarea
        const chatInputArea = document.getElementById('chat-input-area'); 
        if (chatInputArea) chatInputArea.innerHTML = ''; // Clear buttons if any
        
        chatInputField.style.display = 'block';
        chatSendButton.style.display = 'inline-block';
    }
}


function askNextUCPQuestion() {
    if (currentQuestionIndex >= EVE_INVENTED_QUESTIONS_LIST.length) {
        addMessage("Eve", "Wonderful! We've completed the initial cognitive profile. Your UCP data is safe.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Aligned Eve...";
        return;
    }
    
    const questionConfig = EVE_INVENTED_QUESTIONS_LIST[currentQuestionIndex];
    addMessage("Eve", `[UCP Question ${currentQuestionIndex + 1}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    renderInputArea(questionConfig);
}


// CRITICAL: Global function to handle MC button clicks
window.handleUCPChoice = function(choiceIndex, answerText) {
    if (!isAwaitingUCPAnswer) return;
    
    addMessage("User", `(Selected: ${answerText})`, 'user-bubble');
    processUCPAnswer(answerText);
}

function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = EVE_INVENTED_QUESTIONS_LIST[currentQuestionIndex];
    const sectionKey = questionConfig.id;

    const dataToSave = { 
        answer: answer, 
        type: questionConfig.type 
    };
    
    api.saveUCPSection(state.currentUser.id, sectionKey, dataToSave)
        .then(() => {
            showToast('Profile Updated!', 'success');
            currentQuestionIndex++;
            chatInputField.style.display = 'block';
            askNextUCPQuestion();
        })
        .catch(err => {
            showToast('Error saving answer!', 'error');
            console.error('UCP Save Error:', err);
        });
}


function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (!messageText) return;
    
    chatInputField.value = '';
    
    if (isAwaitingUCPAnswer) {
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else {
        addMessage("User", messageText, 'user-bubble');
        const lowerCaseMessage = messageText.toLowerCase();
        if (lowerCaseMessage.includes("start profile") || lowerCaseMessage.includes("start ucp")) {
             window.startUCPInterview();
        } else {
             addMessage("Eve", "I see. My primary focus is currently on completing your Cognitive Profile. Please use the 'Start UCP Questions' button to begin.", 'eve-bubble');
        }
    }
}


export async function renderChat() {
    if (!state.currentUser) return;
    
    // 1. Fetch DOM Elements safely (this resolves the 'null' error)
    chatMessagesContainer = document.getElementById('chat-messages'); 
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');

    // CRITICAL: Ensure the container exists before writing to it
    if (!chatMessagesContainer) {
        console.error("Chat messages container not found.");
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

    const protocol = state.ucp;
    const answeredCount = protocol ? protocol.size : 0;
    currentQuestionIndex = answeredCount;

    if (answeredCount >= EVE_INVENTED_QUESTIONS_LIST.length) {
        addMessage("Eve", "Welcome back. Your Cognitive Profile is complete! I am now aligned with you.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        if(chatInputField) chatInputField.placeholder = "Chat with Aligned Eve...";
    } else {
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Profile (UCP). Shall we start?", 'eve-bubble');
        addMessage("Eve", `<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions (Progress: ${answeredCount}/${EVE_INVENTED_QUESTIONS_LIST.length})</button>`, 'eve-bubble');
        isAwaitingUCPAnswer = false;
        if(chatInputField) chatInputField.placeholder = "Click 'Start UCP Questions' to begin.";
    }
    
    // Add the Export button
    addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
}

// CRITICAL: Global functions must be implemented (even if empty)
window.startUCPInterview = function() {
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = ''; 
    currentQuestionIndex = state.ucp.size; 
    askNextUCPQuestion();
}

window.generateAndExportProtocol = function() {
    showToast('Generating Protocol...', 'info');
    // NOTE: Full export logic is massive. This is a simplified client-side placeholder.
    const protocolData = state.ucp;
    let protocolText = "--- UCP-LLM FINAL PROTOCOL ---\n";
    protocolData.forEach((data, key) => {
        protocolText += `\n[Section: ${key.toUpperCase()}]\n`;
        protocolText += `Answer: ${data.answer}\n`;
    });

    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NOUB_UCP_Profile_${state.playerProfile.username || 'user'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Protocol exported successfully!', 'success');
}
