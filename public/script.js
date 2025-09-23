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
  setTimeout(() => errorEl.classList.add('hidden'), 5000);
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
// compresión para fotos móviles (reduce ancho y peso)
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

// ====== GEO & PLACES ======
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('Geolocalización no soportada');
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err?.message || 'No se pudo obtener la ubicación'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  });
}
async function findNearbyPlaces({ q = 'ferreteria', lat, lng }) {
  const url = new URL(`${API_URL}/places`);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lng', lng);
  url.searchParams.set('q', q);
  url.searchParams.set('openNow', '1');
  url.searchParams.set('radius', '2500');
  const r = await fetch(url.toString());
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'Error en /places');
  return data;
}
function appendPlacesMessage(placesData, queryLabel = 'ferreterías abiertas cerca') {
  const row = document.createElement('div');
  row.className = 'msg bot';
  const avatar = document.createElement('div');
  avatar.className = 'avatar'; avatar.textContent = '🗺️';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (!placesData?.results?.length) {
    bubble.textContent = `No encontré ${queryLabel} en este radio. Probá ampliar el rango o buscar en Google Maps.`;
  } else {
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    title.textContent = `Encontré ${placesData.count} ${queryLabel}:`;
    bubble.appendChild(title);

    placesData.results.forEach((p, i) => {
      const item = document.createElement('div');
      item.style.margin = '6px 0';
      item.innerHTML = `
        <div>${i+1}. <strong>${p.name}</strong> ${p.rating ? `⭐ ${p.rating}` : ''} ${p.open_now === true ? '• Abierto' : p.open_now === false ? '• Cerrado' : ''}</div>
        <div style="color:#a9afc1">${p.address || ''}</div>
        <div><a href="${p.link}" target="_blank" rel="noopener">Ver en Google Maps</a></div>
      `;
      bubble.appendChild(item);
    });
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ====== Envío ======
let sending = false; // debounce
async function sendMessage() {
  if (sending) return;
  sending = true;

  const input = document.getElementById('user-input');
  const text = input.value.trim();

  // 1) Capturar dataURL de la imagen ANTES de limpiar
  let imgDataUrl = null;
  if (imageFile) {
    imgDataUrl = await toBase64(imageFile);
    imgDataUrl = await compressImage(imgDataUrl, 1024, 0.8);
  }

  if (!text && !imgDataUrl) { sending = false; return; }

  // pintar mensaje del usuario
  if (text) appendTextMessage('user', text);
  if (imgDataUrl) appendImageMessage('user', imgDataUrl);

  // 2) limpiar UI
  input.value = '';
  setPreview(null);

  try {
    await ensureSession();

    // Si pide ferretería abierta cerca, usamos ubicación y devolvemos lista
    const textLower = (text || '').toLowerCase();
    const wantsFerreteria =
      /ferreter[ií]a|herrajer[ií]a/.test(textLower) &&
      /abiert(a|o)|ahora|cerca/.test(textLower);

    if (wantsFerreteria) {
      try {
        setTyping(true);
        const geo = await getUserLocation();
        const data = await findNearbyPlaces({ q: 'ferreteria', lat: geo.lat, lng: geo.lng });
        setTyping(false);
        appendPlacesMessage(data, 'ferreterías abiertas cerca');
      } catch (e) {
        setTyping(false);
        showError('No pude obtener tu ubicación. Activá permisos o probá en Google Maps.');
      }
      // seguimos con IA igual (por si quiere consejos extra)
    }

    setTyping(true);

    const payload = {
      sessionId,
      message: text || '',
      imageData: imgDataUrl
    };

    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { data = { response: raw }; }

    setTyping(false);

    if (!res.ok) {
      // 429 con Plan B (límite diario vs momentáneo)
      if (res.status === 429 && data) {
        const btn = document.getElementById('send-button');
        const origTxt = btn.textContent;

        // Límite diario agotado (free tier)
        if (data.exhausted) {
          showError('Llegaste al límite diario gratuito. Probá mañana o habilitá billing.');
          btn.disabled = true;
          btn.textContent = 'Límite diario alcanzado';
          localStorage.setItem('bot-ia:daily-exhausted', '1');
          sending = false;
          return;
        }

        // Límite momentáneo (ráfaga)
        if (data.retryAfter) {
          let left = data.retryAfter;
          btn.disabled = true;
          const id = setInterval(() => {
            btn.textContent = `Esperá ${left}s`;
            left--;
            if (left <= 0) {
              clearInterval(id);
              btn.disabled = false;
              btn.textContent = origTxt;
            }
          }, 1000);
        }
      }

      showError(data?.response || 'Error procesando tu solicitud.');
      if (data?.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem('bot-ia:sessionId', sessionId);
      }
      sending = false;
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
  } finally {
    sending = false;
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

// Cámara (móvil)
document.getElementById('file-upload-camera')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f && f.type.startsWith('image/')) setPreview(f);
});

// Clip (galería/archivos)
document.getElementById('file-upload-clip')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f && f.type.startsWith('image/')) setPreview(f);
});

// Botón ubicación directa
document.getElementById('geo-button')?.addEventListener('click', async () => {
  try {
    setTyping(true);
    const geo = await getUserLocation();
    const data = await findNearbyPlaces({ q: 'ferreteria', lat: geo.lat, lng: geo.lng });
    setTyping(false);
    appendPlacesMessage(data, 'ferreterías abiertas cerca');
  } catch (e) {
    setTyping(false);
    showError('No pude obtener tu ubicación. Activá permisos del navegador.');
  }
});

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

// Deshabilitar “Enviar” si marcamos límite diario en esta sesión
(function lockIfDailyExhausted(){
  const exhausted = localStorage.getItem('bot-ia:daily-exhausted') === '1';
  if (!exhausted) return;
  const btn = document.getElementById('send-button');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Límite diario alcanzado';
  }
})();

// ====== Service Worker (PWA) ======
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('✅ Service Worker registrado'))
    .catch(err => console.error('❌ Error registrando SW:', err));
}

// ====== Boot ======
ensureSession().catch(() => {});
document.getElementById('clear-image')?.addEventListener('click', () => setPreview(null));
