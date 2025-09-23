let sessionId = null;
let imageFile = null;
const chatEl = document.getElementById('chat-messages');
const typingEl = document.getElementById('typing');
const errorEl = document.getElementById('error-banner');
const previewEl = document.getElementById('image-preview');
const previewImg = previewEl.querySelector('img');

// Detecta API en local o Render
const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? (location.port ? `http://localhost:${location.port}` : 'http://localhost:3000')
  : `${location.origin}`;

// Persistir sesión
function loadSession() {
  const saved = localStorage.getItem('bot-ia:sessionId');
  if (saved) sessionId = saved;
}
function saveSession(id) {
  sessionId = id;
  localStorage.setItem('bot-ia:sessionId', id);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 4000);
}

function appendTextMessage(sender, text) {
  const row = document.createElement('div');
  row.className = `msg ${sender}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = sender === 'user' ? '🧑' : '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  if (sender === 'user') {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function appendImageMessage(sender, dataUrl) {
  const row = document.createElement('div');
  row.className = `msg ${sender}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = sender === 'user' ? '🧑' : '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.maxWidth = '180px';
  img.style.borderRadius = '8px';
  bubble.appendChild(img);

  if (sender === 'user') {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function toBase64(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ensureSession() {
  loadSession();
  if (sessionId) return;

  const res = await fetch(`${API_URL}/start-session`);
  const data = await res.json();
  saveSession(data.sessionId);
  console.log('Sesión:', sessionId);
}

function setTyping(on) {
  typingEl.classList.toggle('hidden', !on);
}

function setPreview(file) {
  imageFile = file || null;
  if (imageFile) {
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      previewEl.classList.remove('hidden');
    };
    reader.readAsDataURL(imageFile);
  } else {
    previewEl.classList.add('hidden');
    previewImg.src = '';
  }
}

// Envío principal
async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();
  if (!message && !imageFile) return;

  // pinta el mensaje del usuario
  if (message) appendTextMessage('user', message);
  if (imageFile) {
    const dataUrl = await toBase64(imageFile);
    appendImageMessage('user', dataUrl);
  }

  input.value = '';
  setPreview(null);

  try {
    await ensureSession();
    setTyping(true);

    const payload = {
      sessionId,
      message: message || '',
      imageData: imageFile ? await toBase64(imageFile) : null
    };

    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setTyping(false);

    if (!res.ok) {
      showError(data?.response || 'Error procesando tu solicitud.');
      return;
    }
    appendTextMessage('bot', data.response);
  } catch (err) {
    setTyping(false);
    console.error(err);
    showError('No se pudo contactar al servidor. Revisá que esté encendido.');
  }
}

// Eventos UI
document.getElementById('send-button').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('file-upload').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) setPreview(f);
});

document.getElementById('clear-image').addEventListener('click', () => setPreview(null));

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.add('dragover');
}));
['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file && file.type.startsWith('image/')) setPreview(file);
});

// Tema claro/oscuro
const toggle = document.getElementById('theme-toggle');
toggle.addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('bot-ia:theme', next);
});
const storedTheme = localStorage.getItem('bot-ia:theme');
if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);

// Inicio
ensureSession().catch(() => {});
