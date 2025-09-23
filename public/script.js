// ====== Config & refs ======
let sessionId = null;
let imageFile = null;

const chatEl    = document.getElementById('chat-messages');
const typingEl  = document.getElementById('typing');
const errorEl   = document.getElementById('error-banner');
const previewEl = document.getElementById('image-preview');
const previewImg= previewEl?.querySelector('img');

const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? (location.port ? `http://localhost:${location.port}` : 'http://localhost:3000')
  : `${location.origin}`;

// ====== Utils ======
function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 4000);
}

function setTyping(on) {
  if (!typingEl) return;
  typingEl.classList.toggle('hidden', !on);
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

  if (sender === 'user') { row.appendChild(bubble); row.appendChild(avatar); }
  else { row.appendChild(avatar); row.appendChild(bubble); }

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

  if (sender === 'user') { row.appendChild(bubble); row.appendChild(avatar); }
  else { row.appendChild(avatar); row.appendChild(bubble); }

  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// compresión opcional para fotos de móvil (reduce ancho y calidad)
async function compressImage(dataUrl, maxW = 1024, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

// ====== Sesión ======
async function ensureSession() {
  const saved = localStorage.getItem('bot-ia:sessionId');
  if (saved) { sessionId = saved; return; }
  const res = await fetch(`${API_URL}/start-session`);
  const data = await res.json();
  sessionId = data.sessionId;
  localStorage.setItem('bot-ia:sessionId', sessionId);
}

function setPreview(file) {
  imageFile = file || null;
  if (!previewEl || !previewImg) return;
  if (imageFile) {
    const r = new FileReader();
    r.onload = e => {
      previewImg.src = e.target.result;
      previewEl.classList.remove('hidden');
    };
    r.readAsDataURL(imageFile);
  } else {
    previewEl.classList.add('hidden');
    previewImg.src = '';
  }
}

// ====== Envío ======
async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();

  // 1) Capturar dataURL de la imagen ANTES de limpiar
  let imgDataUrl = null;
  if (imageFile) {
    imgDataUrl = await toBase64(imageFile);
    // compresión opcional (descomenta si querés)
    imgDataUrl = await compressImage(imgDataUrl, 1024, 0.8);
  }

  if (!text && !imgDataUrl) return;

  // pintar mensaje del usuario
  if (text) appendTextMessage('user', text);
  if (imgDataUrl) appendImageMessage('user', imgDataUrl);

  // 2) limpiar UI
  input.value = '';
  setPreview(null);

  try {
    await ensureSession();
    setTyping(true);

    const payload = {
      sessionId,
      message: text || '',
      imageData: imgDataUrl // ya capturada
    };

    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // leer como texto por si backend manda error plano
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { data = { response: raw }; }

    setTyping(false);

    if (!res.ok) {
      showError(data?.response || 'Error procesando tu solicitud.');
      // si el server devolvió sessionId nuevo, guardarlo
      if (data?.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem('bot-ia:sessionId', sessionId);
      }
      return;
    }

    if (data?.sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem('bot-ia:sessionId', sessionId);
    }

    appendTextMessage('bot', data.response || '(sin respuesta)');
  } catch (err) {
    setTyping(false);
    console.error(err);
    showError('No se pudo contactar al servidor. Verificá que esté encendido.');
  }
}

// ====== Eventos UI ======
document.getElementById('send-button')?.addEventListener('click', sendMessage);

document.getElementById('user-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('file-upload')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f && f.type.startsWith('image/')) setPreview(f);
});

document.getElementById('clear-image')?.addEventListener('click', () => setPreview(null));

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
if (dropZone) {
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover');
  }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) setPreview(file);
  });
}

// Tema claro/oscuro
const toggle = document.getElementById('theme-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('bot-ia:theme', next);
  });
  const storedTheme = localStorage.getItem('bot-ia:theme');
  if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);
}

// ====== Boot ======
ensureSession().catch(() => {});
