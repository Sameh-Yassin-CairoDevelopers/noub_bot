/*
 * Filename: js/screens/chat.js
 * Version: 22.0 (UCP-LLM Chat Interface - Complete)
 * Description: Logic for the Eve Chat screen. Presents UCP questions to the user
 * and stores the answers in the player_protocol_data table.
*/

import { state } from './state.js';
import * as api from './api.js';
import { showToast } from './ui.js';

const chatMessagesContainer = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const chatSendButton = document.getElementById('chat-send-button');

// --- UCP QUESTIONS DATA (Simplified Master List - Matches Analysis) ---
const MASTER_UCP_QUESTIONS = [
    { id: "sun_moon", question: "My creative friend, what do you love more: the sun's ☀️ warmth, or the moon's 🌙 serenity?", type: "mc", options: ["The Warm Sun ☀️", "The Enchanting Moon 🌙"] },
    { id: "future_vision", question: "If you look to the future, how do you imagine yourself in five years? (Tap Send to answer)", type: "textarea" },
    { id: "reading_writing", question: "Do you find yourself more inclined to read stories written by others 📚, or to write your own stories and ideas ✍️?", type: "mc", options: ["I adore reading 📚!", "I love writing ✍️!"] },
    { id: "learning_style", question: "When learning, do you prefer to dive into the details directly 🔬, or understand the big picture first 🗺️?", type: "mc", options: ["Details first 🔬", "The big picture 🗺️"] }
];

let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    if (type === 'eve-bubble') {
        text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    }
    
    messageDiv.innerHTML = text;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function askNextUCPQuestion() {
    if (currentQuestionIndex >= MASTER_UCP_QUESTIONS.length) {
        addMessage("Eve", "Wonderful! We've completed the initial cognitive profile. You can now chat or exit.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Eve...";
        return;
    }
    
    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    addMessage("Eve", `[UCP Question ${currentQuestionIndex + 1}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    chatInputField.placeholder = "Type your answer or select an option...";

    // Handle Multiple Choice Options (Render buttons dynamically)
    if (questionConfig.type === 'mc' && questionConfig.options) {
        // Render buttons directly into a separate bubble for easy interaction
        const optionsHTML = questionConfig.options.map((opt, index) => 
            `<button class="action-button small" style="width:auto; margin-right: 10px;" onclick="window.handleUCPChoice(${index})">${opt}</button>`
        ).join('');
        addMessage("Eve", optionsHTML, 'eve-bubble');
        chatInputField.style.display = 'none'; // Hide text input for MC questions
    } else {
        chatInputField.style.display = 'block';
    }
}

// CRITICAL: Global function to handle MC button clicks
window.handleUCPChoice = function(choiceIndex) {
    if (!isAwaitingUCPAnswer) return;
    
    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    const answer = questionConfig.options[choiceIndex];

    addMessage("User", `(Selected: ${answer})`, 'user-bubble');
    processUCPAnswer(answer);
}

function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    
    // Determine the section key (Simplification for now)
    const sectionKey = questionConfig.id; // Use question ID as section key

    // Prepare data structure to save (using JSONB)
    const dataToSave = { 
        answer: answer, 
        type: questionConfig.type 
    };
    
    // Save to the database
    api.saveUCPSection(state.currentUser.id, sectionKey, dataToSave)
        .then(() => {
            showToast('Profile Updated!', 'success');
            currentQuestionIndex++;
            chatInputField.style.display = 'block'; // Ensure input returns
            askNextUCPQuestion();
        })
        .catch(err => {
            showToast('Error saving answer!', 'error');
            console.error('UCP Save Error:', err);
        });
}


// --- Main Handlers ---

function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (!messageText) return;
    
    chatInputField.value = '';
    
    if (isAwaitingUCPAnswer) {
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else {
        // Standard chat response (basic placeholder)
        addMessage("User", messageText, 'user-bubble');
        addMessage("Eve", "I see. I'm ready for our UCP interview. Please click 'Start UCP Questions' if you want to update your profile.", 'eve-bubble');
    }
}


export async function renderChat() {
    // 1. Set up chat UI elements
    chatMessagesContainer.innerHTML = '';
    
    // 2. Attach Listeners
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter') handleChatSend();
    };

    // 3. Check Protocol Status and Start Conversation
    const { data: protocol } = await api.fetchUCPProtocol(state.currentUser.id);
    
    // Count how many questions have been answered
    const answeredCount = protocol ? protocol.length : 0;
    
    currentQuestionIndex = answeredCount; // Resume progress

    if (answeredCount >= MASTER_UCP_QUESTIONS.length) {
        addMessage("Eve", "Welcome back. Your Cognitive Profile is complete! I am now aligned with you.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Aligned Eve...";
    } else {
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Profile (UCP). Shall we start?", 'eve-bubble');
        addMessage("Eve", `<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions (Progress: ${answeredCount}/${MASTER_UCP_QUESTIONS.length})</button>`, 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Click 'Start UCP Questions' to begin.";
    }
}

// CRITICAL: Global function to start the interview
window.startUCPInterview = function() {
    chatMessagesContainer.innerHTML = ''; // Clear chat history
    currentQuestionIndex = currentQuestionIndex > 0 ? currentQuestionIndex : 0; // Ensure we don't restart from 0 if there's progress
    askNextUCPQuestion();
}

