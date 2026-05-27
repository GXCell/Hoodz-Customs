const chatLog = document.querySelector('#chat-log');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatClear = document.querySelector('#chat-clear');
const promptButtons = document.querySelectorAll('.prompt-chip');

const defaultAssistantMarkup = `
  <article class="chat-bubble chat-bubble-assistant">
    <p>I’m the Hoodz Customs mechanic assistant. Ask about maintenance, upgrades, warning signs, detailing, or what to bring to your consult.</p>
  </article>
`;

let conversationHistory = [];
let sessionId = window.localStorage.getItem('hoodz-chat-session-id') || '';

function addMessage(text, sender) {
  const bubble = document.createElement('article');
  bubble.className = `chat-bubble chat-bubble-${sender}`;

  const paragraph = document.createElement('p');
  paragraph.textContent = text;

  bubble.appendChild(paragraph);
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;

  return bubble;
}

function setFormBusy(isBusy) {
  chatInput.disabled = isBusy;
  chatClear.disabled = isBusy;

  promptButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

async function submitQuestion(message) {
  const trimmed = message.trim();

  if (!trimmed) {
    return;
  }

  addMessage(trimmed, 'user');
  conversationHistory.push({ role: 'user', content: trimmed });
  setFormBusy(true);

  const pendingBubble = addMessage('Thinking through that now...', 'assistant');
  pendingBubble.classList.add('chat-bubble-pending');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ messages: conversationHistory })
    });

    const payload = await response.json();
    const returnedSessionId = response.headers.get('X-Session-Id');

    if (returnedSessionId) {
      sessionId = returnedSessionId;
      window.localStorage.setItem('hoodz-chat-session-id', sessionId);
    }

    if (!response.ok) {
      throw new Error(payload.error || 'The assistant could not answer right now.');
    }

    pendingBubble.classList.remove('chat-bubble-pending');
    pendingBubble.querySelector('p').textContent = payload.reply;
    conversationHistory.push({ role: 'assistant', content: payload.reply });
  } catch (error) {
    pendingBubble.classList.remove('chat-bubble-pending');
    pendingBubble.querySelector('p').textContent =
      error instanceof Error
        ? error.message
        : 'The assistant could not answer right now.';
  } finally {
    setFormBusy(false);
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitQuestion(chatInput.value);
  chatInput.value = '';
  chatInput.focus();
});

chatClear.addEventListener('click', () => {
  conversationHistory = [];
  sessionId = window.crypto.randomUUID().replace(/-/g, '');
  window.localStorage.setItem('hoodz-chat-session-id', sessionId);
  chatLog.innerHTML = defaultAssistantMarkup;
  chatInput.focus();
});

if (!sessionId) {
  sessionId = window.crypto.randomUUID().replace(/-/g, '');
  window.localStorage.setItem('hoodz-chat-session-id', sessionId);
}

promptButtons.forEach((button) => {
  button.addEventListener('click', () => {
    chatInput.value = button.textContent;
    submitQuestion(button.textContent);
    chatInput.value = '';
    chatInput.focus();
  });
});