/*
 * Filename: js/screens/chat.js
 * Version: Pharaoh's Legacy 'NOUB' v0.5 (English, Rewards Decoupled)
 * Description: UCP protocol journey is now fully in English.
 * Reward logic has been removed and is now handled by tasks.js.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

let protocolData = null;
let eveGeneralQuestions = null;
let hypatiaPhilosophicalQuestions = null;
let hypatiaScaledQuestions = null;
let likertScaleLabels = null;
let eveMentalStatePhrases = null;
let protocolPreamble = '';
let protocolPostamble = '';

let chatMessagesContainer, chatInputField, chatSendButton, chatActionArea;

let sessionState = {};
let localUcpData = {};

function resetSessionState() {
    sessionState = {
        currentStage: 'AWAITING_MENTAL_STATE',
        mainSectionIndex: 0,
        mainFieldIndex: 0,
        eveGeneralIndex: 0,
        hypatiaPhilosophicalIndex: 0,
        hypatiaScaledIndex: 0,
        isAwaitingAnswer: false,
        currentPersonality: 'eve',
        selectedMentalState: 'not_specified'
    };
    localUcpData = {};
}

const personalities = {
    eve: { name: 'Eve 🧚', avatar: 'images/eve_avatar.png' },
    hypatia: { name: 'Hypatia 🦉', avatar: 'images/hypatia_avatar.png' }
};

async function loadAllProtocolData() {
    try {
        if (protocolData) return true;
        const [protocolRes, eveGeneralRes, hypatiaPhilRes, hypatiaScaledRes, likertRes, mentalStateRes, preambleRes, postambleRes] = await Promise.all([
            fetch('section_type_data.json'), fetch('eve_general_questions.json'), fetch('hypatia_philosophical_questions.json'),
            fetch('scaled_questions.json'), fetch('likert_scale_labels.json'), fetch('eve_mental_state_phrases.json'),
            fetch('protocol_preamble.txt'), fetch('protocol_postamble.txt')
        ]);
        const checkOk = (res, file) => { if (!res.ok) throw new Error(`Failed to load ${file}: ${res.statusText}`); return res; };
        protocolData = await checkOk(protocolRes, 'section_type_data.json').json();
        eveGeneralQuestions = await checkOk(eveGeneralRes, 'eve_general_questions.json').json();
        hypatiaPhilosophicalQuestions = await checkOk(hypatiaPhilRes, 'hypatia_philosophical_questions.json').json();
        hypatiaScaledQuestions = await checkOk(hypatiaScaledRes, 'scaled_questions.json').json();
        likertScaleLabels = await checkOk(likertRes, 'likert_scale_labels.json').json();
        eveMentalStatePhrases = await checkOk(mentalStateRes, 'eve_mental_state_phrases.json').json();
        protocolPreamble = await checkOk(preambleRes, 'protocol_preamble.txt').text();
        protocolPostamble = await checkOk(postambleRes, 'protocol_postamble.txt').text();
        console.log("All protocol data loaded successfully.");
        return true;
    } catch (error) {
        console.error("Fatal Error: Could not load required protocol data.", error);
        showToast("Fatal Error: Could not load protocol data!", 'error');
        return false;
    }
}

function addMessage(senderName, text, type = 'eve-bubble') {
    if (!chatMessagesContainer) return;
    const personality = personalities[sessionState.currentPersonality];
    const sender = (type === 'user-bubble') ? (state.playerProfile?.username || 'You') : personality.name;
    const avatar = (type === 'user-bubble') ? (state.playerProfile?.avatar_url || 'images/user_avatar.png') : personality.avatar;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    messageDiv.innerHTML = `<p>${text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>')}</p>`;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function renderInputArea(questionConfig) {
    const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
    dynamicElements.forEach(el => el.remove());
    chatInputField.style.display = 'none';
    chatSendButton.style.display = 'none';
    chatInputField.value = '';
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'ucp-dynamic-element ucp-options-container';

    switch (questionConfig.type) {
        case 'mc':
            questionConfig.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt;
                btn.onclick = () => processUserAnswer(opt);
                optionsDiv.appendChild(btn);
            });
            break;
        case 'scaled':
            Object.keys(likertScaleLabels).forEach(scaleKey => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = `${scaleKey} - ${likertScaleLabels[scaleKey]}`;
                btn.onclick = () => processUserAnswer(scaleKey);
                optionsDiv.appendChild(btn);
            });
            break;
        case 'tf':
            ['Yes', 'No'].forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt;
                btn.onclick = () => processUserAnswer(opt);
                optionsDiv.appendChild(btn);
            });
            break;
        case 'text':
        case 'textarea':
            chatInputField.style.display = 'block';
            chatSendButton.style.display = 'block';
            chatInputField.placeholder = questionConfig.placeholder || "Type your answer here...";
            chatInputField.focus();
            break;
        default: // custom_choice
            questionConfig.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt.text;
                btn.onclick = () => processUserAnswer(opt.value);
                optionsDiv.appendChild(btn);
            });
            break;
    }
    if (optionsDiv.hasChildNodes()) {
        chatActionArea.insertBefore(optionsDiv, chatActionArea.firstChild);
    }
}

function askNextQuestion() {
    sessionState.isAwaitingAnswer = true;
    let currentQuestion;
    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            currentQuestion = { question: "Welcome! Before we begin, how would you describe your current mental state?", type: 'custom_choice', options: [{ text: "Good / Focused 😊", value: 'good' }, { text: "Average / A bit distracted 😐", value: 'average' }, { text: "Poor / Unfocused 😟", value: 'bad' }] };
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'MAIN_SECTIONS':
            const sectionKeys = Object.keys(protocolData);
            if (sessionState.mainSectionIndex >= sectionKeys.length) {
                sessionState.currentStage = 'EVE_GENERAL';
                askNextQuestion();
                return;
            }
            const sectionKey = sectionKeys[sessionState.mainSectionIndex];
            const section = protocolData[sectionKey];
            if (sessionState.mainFieldIndex >= section.fields.length) {
                sessionState.mainSectionIndex++;
                sessionState.mainFieldIndex = 0;
                askNextQuestion();
                return;
            }
            currentQuestion = section.fields[sessionState.mainFieldIndex];
            addMessage(personalities.eve.name, `[Section: ${section.title}]<br>${currentQuestion.label}`);
            renderInputArea(currentQuestion);
            break;
        case 'EVE_GENERAL':
            if (sessionState.eveGeneralIndex >= eveGeneralQuestions.length) {
                sessionState.currentStage = 'HYPATIA_CHOICE';
                askNextQuestion();
                return;
            }
            currentQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'HYPATIA_CHOICE':
            sessionState.currentPersonality = 'hypatia';
            currentQuestion = { question: "You have completed the foundational stage with Eve. I am Hypatia 🦉. I will help you with a deeper exploration. Which path do you choose?", type: 'custom_choice', options: [{ text: "Intellectual Exploration (Philosophical Questions)", value: 'HYPATIA_PHILOSOPHICAL' }, { text: "Behavioral Analysis (Scaled Questions)", value: 'HYPATIA_SCALED' }, { text: "Finish data collection for now", value: 'SESSION_COMPLETE' }] };
            addMessage(personalities.hypatia.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'HYPATIA_PHILOSOPHICAL':
            if (sessionState.hypatiaPhilosophicalIndex >= hypatiaPhilosophicalQuestions.length) {
                sessionState.currentStage = 'SESSION_COMPLETE';
                askNextQuestion();
                return;
            }
            currentQuestion = hypatiaPhilosophicalQuestions[sessionState.hypatiaPhilosophicalIndex];
            addMessage(personalities.hypatia.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'HYPATIA_SCALED':
            if (sessionState.hypatiaScaledIndex >= hypatiaScaledQuestions.length) {
                sessionState.currentStage = 'SESSION_COMPLETE';
                askNextQuestion();
                return;
            }
            currentQuestion = { ...hypatiaScaledQuestions[sessionState.hypatiaScaledIndex], type: 'scaled' };
            addMessage(personalities.hypatia.name, `On a scale of 1 to 5, to what extent does the following statement apply to you?<br><b>"${currentQuestion.text}"</b>`);
            renderInputArea(currentQuestion);
            break;
        case 'SESSION_COMPLETE':
            sessionState.isAwaitingAnswer = false;
            const finalMessage = "Excellent! We have completed your protocol-building journey. Your cognitive fingerprint is now ready.";
            addMessage(personalities[sessionState.currentPersonality].name, finalMessage);
            addMessage(personalities[sessionState.currentPersonality].name, `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Final Protocol</button>`);
            const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
            dynamicElements.forEach(el => el.remove());
            break;
    }
}

function processUserAnswer(answer) {
    if (!sessionState.isAwaitingAnswer) return;
    sessionState.isAwaitingAnswer = false;
    addMessage(state.playerProfile?.username, answer, 'user-bubble');

    let sectionKeyForSave, dataToSave;

    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            sessionState.selectedMentalState = answer;
            const greeting = eveMentalStatePhrases[answer].greetings[Math.floor(Math.random() * eveMentalStatePhrases[answer].greetings.length)];
            addMessage(personalities.eve.name, greeting.replace('{name}', state.playerProfile?.username || 'my friend'));
            sessionState.currentStage = 'MAIN_SECTIONS';
            break;

        case 'MAIN_SECTIONS':
            const sectionKey = Object.keys(protocolData)[sessionState.mainSectionIndex];
            const field = protocolData[sectionKey].fields[sessionState.mainFieldIndex];
            sectionKeyForSave = `main_${sectionKey}`;
            dataToSave = { [field.jsonKey || field.name]: { question: field.label, answer: answer } };
            sessionState.mainFieldIndex++;
            break;
        
        case 'EVE_GENERAL':
            const eveQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            sectionKeyForSave = 'eve_general';
            dataToSave = { [eveQuestion.id]: { question: eveQuestion.question, answer: answer } };
            sessionState.eveGeneralIndex++;
            break;
        
        case 'HYPATIA_CHOICE':
            sessionState.currentStage = answer;
            break;

        case 'HYPATIA_PHILOSOPHICAL':
            const philQuestion = hypatiaPhilosophicalQuestions[sessionState.hypatiaPhilosophicalIndex];
            sectionKeyForSave = 'hypatia_philosophical';
            dataToSave = { [philQuestion.id]: { question: philQuestion.question, answer: answer } };
            sessionState.hypatiaPhilosophicalIndex++;
            break;

        case 'HYPATIA_SCALED':
            const scaledQuestion = hypatiaScaledQuestions[sessionState.hypatiaScaledIndex];
            sectionKeyForSave = 'hypatia_scaled';
            dataToSave = { [scaledQuestion.id]: { question: scaledQuestion.text, answer: answer, axis: scaledQuestion.axis } };
            sessionState.hypatiaScaledIndex++;
            break;
    }

    if (sectionKeyForSave && dataToSave) {
        if (!localUcpData[sectionKeyForSave]) {
            localUcpData[sectionKeyForSave] = {};
        }
        Object.assign(localUcpData[sectionKeyForSave], dataToSave);
        
        if (!(state.ucp instanceof Map)) state.ucp = new Map();
        state.ucp.set(sectionKeyForSave, localUcpData[sectionKeyForSave]);

        api.saveUCPSection(state.currentUser.id, sectionKeyForSave, localUcpData[sectionKeyForSave]);
        
        showToast('Protocol updated', 'success');
    }

    setTimeout(askNextQuestion, 300);
}

function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (messageText) {
        processUserAnswer(messageText);
    }
}

function fastForwardSessionState() {
    const mainSectionsKeys = Object.keys(protocolData);
    const completedMainSections = mainSectionsKeys.every(key => localUcpData[`main_${key}`] && Object.keys(localUcpData[`main_${key}`]).length >= protocolData[key].fields.length);
    
    if (!completedMainSections) {
        for (let i = 0; i < mainSectionsKeys.length; i++) {
            const sectionKey = `main_${mainSectionsKeys[i]}`;
            if (!localUcpData[sectionKey]) {
                sessionState.mainSectionIndex = i;
                sessionState.mainFieldIndex = 0;
                sessionState.currentStage = 'MAIN_SECTIONS';
                return;
            }
            const numFields = protocolData[mainSectionsKeys[i]].fields.length;
            const numAnswered = Object.keys(localUcpData[sectionKey]).length;
            if (numAnswered < numFields) {
                sessionState.mainSectionIndex = i;
                sessionState.mainFieldIndex = numAnswered;
                sessionState.currentStage = 'MAIN_SECTIONS';
                return;
            }
        }
    }

    const completedEveGeneral = localUcpData['eve_general'] && Object.keys(localUcpData['eve_general']).length >= eveGeneralQuestions.length;
    if (!completedEveGeneral) {
        sessionState.eveGeneralIndex = localUcpData['eve_general'] ? Object.keys(localUcpData['eve_general']).length : 0;
        sessionState.currentStage = 'EVE_GENERAL';
        return;
    }

    const hasChosenHypatia = localUcpData['hypatia_philosophical'] || localUcpData['hypatia_scaled'];
    if (!hasChosenHypatia) {
        sessionState.currentStage = 'HYPATIA_CHOICE';
        return;
    }
    
    const completedHypatiaPhil = localUcpData['hypatia_philosophical'] && Object.keys(localUcpData['hypatia_philosophical']).length >= hypatiaPhilosophicalQuestions.length;
    if (localUcpData['hypatia_philosophical'] && !completedHypatiaPhil) {
        sessionState.hypatiaPhilosophicalIndex = Object.keys(localUcpData['hypatia_philosophical']).length;
        sessionState.currentStage = 'HYPATIA_PHILOSOPHICAL';
        sessionState.currentPersonality = 'hypatia';
        return;
    }

    const completedHypatiaScaled = localUcpData['hypatia_scaled'] && Object.keys(localUcpData['hypatia_scaled']).length >= hypatiaScaledQuestions.length;
     if (localUcpData['hypatia_scaled'] && !completedHypatiaScaled) {
        sessionState.hypatiaScaledIndex = Object.keys(localUcpData['hypatia_scaled']).length;
        sessionState.currentStage = 'HYPATIA_SCALED';
        sessionState.currentPersonality = 'hypatia';
        return;
    }

    sessionState.currentStage = 'SESSION_COMPLETE';
}

export async function renderChat() {
    chatMessagesContainer = document.getElementById('chat-messages');
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');
    chatActionArea = document.getElementById('chat-input-area');

    if (!chatMessagesContainer || !chatInputField || !chatSendButton || !chatActionArea) {
        console.error("Chat interface elements not found."); return;
    }

    chatMessagesContainer.innerHTML = '';
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => { if (e.key === 'Enter' && !chatInputField.disabled) handleChatSend(); };

    const loaded = await loadAllProtocolData();
    if (!loaded) return;
    
    resetSessionState();
    await refreshPlayerState(); 
    
    if (state.ucp instanceof Map && state.ucp.size > 0) {
        state.ucp.forEach((value, key) => {
            localUcpData[key] = value;
        });
        console.log("Chat session initialized with previously saved user data.");
        fastForwardSessionState();
        addMessage(personalities.eve.name, `Welcome back, ${state.playerProfile?.username}! Let's continue where we left off.`);
    } else {
        console.log("Starting a fresh chat session.");
    }
    
    askNextQuestion();
}

window.generateAndExportProtocol = function() {
    showToast('Generating Protocol...', 'info');
    const username = state.playerProfile.username || 'Explorer';
    let protocolText = protocolPreamble.replace(/{اسم_المستخدم_المفضل}/g, username) + '\n\n';
    
    protocolText += "--- Main Data Sections ---\n\n";
    const mainSectionKeys = Object.keys(protocolData);
    mainSectionKeys.forEach(sectionKey => {
        const ucpKey = `main_${sectionKey}`;
        if (localUcpData[ucpKey]) {
            protocolText += `[Section: ${protocolData[sectionKey].title}]\n`;
            const sectionData = localUcpData[ucpKey];
            for (const dataKey in sectionData) {
                const item = sectionData[dataKey];
                protocolText += `- ${item.question}: ${item.answer}\n`;
            }
            protocolText += '\n';
        }
    });

    if (localUcpData['eve_general']) {
        protocolText += "--- Eve's Creative Questions ---\n\n";
        Object.values(localUcpData['eve_general']).forEach(item => {
            protocolText += `- ${item.question}: ${item.answer}\n`;
        });
        protocolText += '\n';
    }

    if (localUcpData['hypatia_philosophical'] || localUcpData['hypatia_scaled']) {
        protocolText += "--- Hypatia's Deep Analysis ---\n\n";
        if (localUcpData['hypatia_philosophical']) {
            protocolText += "[Philosophical Session]\n";
            Object.values(localUcpData['hypatia_philosophical']).forEach(item => {
                protocolText += `- ${item.question}: ${item.answer}\n`;
            });
            protocolText += '\n';
        }
        if (localUcpData['hypatia_scaled']) {
            protocolText += "[Behavioral Analysis Session]\n";
            Object.values(localUcpData['hypatia_scaled']).forEach(item => {
                protocolText += `- "${item.question}": ${item.answer}/5 (${likertScaleLabels[item.answer]})\n`;
            });
            protocolText += '\n';
        }
    }

    protocolText += protocolPostamble.replace(/{اسم_المستخدم_المفضل}/g, username);

    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `UCP_Protocol_${username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Protocol exported successfully!', 'success');
}
