// public/script.js

let sessionId = null;
let imageFile = null;

const chatEl    = document.getElementById('chat-messages');
const typingEl  = document.getElementById('typing');
const errorEl   = document.getElementById('error-banner');
const previewEl = document.getElementById('image-preview');
const previewImg= previewEl?.querySelector('img');

const API_URL = location.origin;

/* ===== Utilidades ===== */
function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 5000);
}
function setTyping(on) {
  typingEl?.classList.toggle('hidden', !on);
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
async function compressImage(dataUrl, maxW = 1280, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cvs.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

/* ===== Sesión ===== */
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

/* ===== GEO ===== */
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
async function findNearbyPlacesByTypes({ types = 'ferreteria,pintureria,corralon,electricidad', lat, lng, radius = 3000 }) {
  const url = new URL(`${API_URL}/places`);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lng', lng);
  url.searchParams.set('types', types);
  url.searchParams.set('radius', String(radius));
  const r = await fetch(url.toString());
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'Error en /places');
  return data;
}
function appendPlacesMessageMulti(placesData) {
  const row = document.createElement('div');
  row.className = 'msg bot';
  const avatar = document.createElement('div');
  avatar.className = 'avatar'; avatar.textContent = '🗺️';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (!placesData?.results?.length) {
    bubble.textContent = 'No encontré comercios en este radio. Probá ampliar el rango o buscar en Google Maps.';
  } else {
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    title.textContent = `Encontré ${placesData.count} lugares cerca:`;
    bubble.appendChild(title);

    placesData.results.forEach((p, i) => {
      const item = document.createElement('div');
      item.style.margin = '6px 0';
      const cat = p.category ? ` · ${p.category}` : '';
      item.innerHTML = `
        <div>${i+1}. <strong>${p.name}</strong>${cat}</div>
        <div style="color:#a9afc1">${p.address || ''} ${p.distance_km ? `· ${p.distance_km.toFixed(1)} km` : ''}</div>
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

/* ===== Envío ===== */
let sending = false;
async function sendMessage() {
  if (sending) return;
  sending = true;

  const input = document.getElementById('user-input');
  const text = input.value.trim();

  let imgDataUrl = null;
  if (imageFile) {
    imgDataUrl = await toBase64(imageFile);
    imgDataUrl = await compressImage(imgDataUrl, 1280, 0.7);
  }

  if (!text && !imgDataUrl) { sending = false; return; }

  if (text) appendTextMessage('user', text);
  if (imgDataUrl) appendImageMessage('user', imgDataUrl);

  input.value = '';
  setPreview(null);

  try {
    await ensureSession();

    // Heurística simple: si pide lugares, mostrar lista (incluye electricidad)
    const t = (text || '').toLowerCase();
    const buscaLugares =
      /(ferreter[ií]a|pinturer[ií]a|corral[oó]n|electricidad)/.test(t) &&
      /(abiert[oa]|cerca|d[óo]nde|encontrar)/.test(t);

    if (buscaLugares) {
      try {
        setTyping(true);
        const geo = await getUserLocation();
        const data = await findNearbyPlacesByTypes({
          types: 'ferreteria,pintureria,corralon,electricidad',
          lat: geo.lat,
          lng: geo.lng,
          radius: 3000
        });
        setTyping(false);
        appendPlacesMessageMulti(data);
      } catch (e) {
        setTyping(false);
        showError('No pude obtener tu ubicación. Activá permisos o probá en Google Maps.');
      }
      // igual seguimos con IA
    }

    setTyping(true);

    const payload = { sessionId, message: text || '', imageData: imgDataUrl };
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
      if (res.status === 429 && data) {
        const btn = document.getElementById('send-button');
        const origTxt = btn.textContent;

        if (data.exhausted) {
          showError('Llegaste al límite diario gratuito. Probá mañana o habilitá billing.');
          btn.disabled = true;
          btn.textContent = 'Límite diario alcanzado';
          localStorage.setItem('bot-ia:daily-exhausted', '1');
          sending = false;
          return;
        }
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
    showError('No se pudo contactar al servidor.');
  } finally {
    sending = false;
  }
}

/* ===== Eventos UI ===== */
document.getElementById('send-button')?.addEventListener('click', sendMessage);
document.getElementById('user-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById('file-upload-camera')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f && f.type.startsWith('image/')) setPreview(f);
});

// Botón ubicación del header (muestra ciudad y lista por rubros)
document.getElementById('nearby-button')?.addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  try {
    setTyping(true);
    const geo = await getUserLocation();

    // Mostrar ciudad/barrio en el botón
    try {
      const url = new URL(`${API_URL}/geocode/reverse`);
      url.searchParams.set('lat', geo.lat);
      url.searchParams.set('lng', geo.lng);
      const r1 = await fetch(url);
      const d1 = await r1.json();
      const cityLabel = d1?.city || '';
      if (cityLabel) btn.textContent = `📍 ${cityLabel}`;
    } catch {}

    // Buscar múltiples rubros (incluye electricidad)
    const data = await findNearbyPlacesByTypes({
      types: 'ferreteria,pintureria,corralon,electricidad',
      lat: geo.lat,
      lng: geo.lng,
      radius: 3000
    });
    setTyping(false);
    appendPlacesMessageMulti(data);
  } catch (e) {
    setTyping(false);
    showError('No pude obtener tu ubicación. Activá permisos del navegador.');
  }
});

/* ===== Tema claro/oscuro ===== */
(function themeBoot(){
  const storedTheme = localStorage.getItem('bot-ia:theme');
  if (storedTheme) {
    document.documentElement.setAttribute('data-theme', storedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const t = prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('bot-ia:theme', t);
  }
})();
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('bot-ia:theme', next);
});

/* ===== Lock si agotó límite diario ===== */
(function lockIfDailyExhausted(){
  const exhausted = localStorage.getItem('bot-ia:daily-exhausted') === '1';
  if (!exhausted) return;
  const btn = document.getElementById('send-button');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Límite diario alcanzado';
  }
})();

/* ===== PWA (si tenés sw.js) ===== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

/* ===== Fix teclado móvil + --vh ===== */
(function mobileKeyboardFix() {
  const html = document.documentElement;
  const messages = document.getElementById('chat-messages');
  const composer = document.querySelector('.composer');
  const input = document.getElementById('user-input');

  function applyVH() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    html.style.setProperty('--vh', `${vh}px`);
  }
  applyVH();

  window.visualViewport?.addEventListener('resize', applyVH);
  window.addEventListener('orientationchange', () => setTimeout(applyVH, 150));

  ['focus', 'click'].forEach(ev => {
    input?.addEventListener(ev, () => {
      setTimeout(() => {
        composer?.scrollIntoView({ block: 'end', behavior: 'smooth' });
        messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
      }, 50);
    });
  });
})();

/* ===== Drop zone básica ===== */
(function dropzone(){
  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e)=>{
    e.preventDefault(); dz.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) setPreview(f);
  });
})();

/* ===== Boot ===== */
ensureSession().catch(()=>{});
document.getElementById('clear-image')?.addEventListener('click', () => setPreview(null));
