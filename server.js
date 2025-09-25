// server.js
// ---------------------------
// Asistente Hogar - API (Express 5)
// ---------------------------
require('dotenv').config();

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== CORS básico (ajustá a tu dominio si querés) ===== */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ===== Gemini ===== */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ Falta GEMINI_API_KEY en .env');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/* ===== Memoria por sesión (en RAM) ===== */
const sessions = {}; // { [sessionId]: [ { role, parts } ] }

/* ===== Helpers ===== */
function fileToGenerativePart(base64Data) {
  const [meta, data] = (base64Data || '').split(',');
  const mimeType = meta?.split(':')[1]?.split(';')[0] || 'image/jpeg';
  return { inlineData: { data, mimeType } };
}
function normalizeGemini429(err) {
  try {
    const msg = String(err?.message || '');
    const raw = err?.response ? JSON.stringify(err.response) : msg;
    const exhausted =
      /GenerateRequestsPerDayPerProjectPerModel|quota.*per.*day/i.test(raw);
    let retryAfter = null;
    const m = raw.match(/retry.*?(\d+(\.\d+)?)s/i);
    if (m) retryAfter = Math.ceil(parseFloat(m[1]));
    return { retryAfter, exhausted };
  } catch {
    return { retryAfter: null, exhausted: false };
  }
}

/* ===== Rutas API ===== */
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/start-session', (_req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = [];
  console.log(`🆕 Nueva sesión: ${sessionId}`);
  res.json({ sessionId });
});

app.post('/chat', async (req, res) => {
  const { sessionId, message, imageData } = req.body || {};
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ response: 'ID de sesión inválido o no encontrado.' });
  }
  const history = sessions[sessionId];

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction:
        'Sos un asistente experto en problemas del hogar en Argentina. Respondé con pasos claros y concretos. Si el usuario sube una imagen, describí lo que ves y cómo proceder. No des diagnósticos eléctricos ni de gas; recomendá profesionales ante riesgo.'
    });

    const chat = model.startChat({ history });

    const parts = [];
    if (message) parts.push({ text: message });
    if (imageData) parts.push(fileToGenerativePart(imageData));

    console.log(`💬 [${sessionId}] Usuario:`, (message || '').slice(0, 160));

    const result = await chat.sendMessage(parts);
    const botResponse = result.response.text();

    history.push({ role: 'user', parts });
    history.push({ role: 'model', parts: [{ text: botResponse }] });

    res.json({ sessionId, response: botResponse });
  } catch (err) {
    console.error('❌ Error Gemini:', err?.message || err);
    if (String(err?.message || '').includes('429')) {
      const { retryAfter, exhausted } = normalizeGemini429(err);
      return res.status(429).json({
        response: exhausted
          ? 'Límite diario gratuito alcanzado.'
          : 'Muchas solicitudes seguidas. Probá de nuevo en unos segundos.',
        retryAfter: retryAfter ?? 30,
        exhausted: !!exhausted,
        sessionId
      });
    }
    res.status(500).json({ response: 'Lo siento, hubo un problema al procesar tu solicitud.' });
  }
});

/* ===== GEO (OSM Overpass + Nominatim) ===== */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// /places: múltiples rubros (ferretería, pinturería, corralón, electricidad)
app.get('/places', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = Math.min(parseInt(req.query.radius || '2500', 10), 10000);

    // types=ferreteria,pintureria,corralon,electricidad
    const typesRaw = (req.query.types || 'ferreteria,pintureria,corralon,electricidad')
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Parámetros lat/lng inválidos' });
    }

    // Mapeo de rubros -> filtros OSM
    const RUBROS = {
      ferreteria: [
        'node["shop"="hardware"]',
        'way["shop"="hardware"]',
        'node["shop"="doityourself"]',
        'way["shop"="doityourself"]'
      ],
      pintureria: [
        'node["shop"="paint"]',
        'way["shop"="paint"]'
      ],
      corralon: [
        'node["shop"="trade"]["trade"~"building_materials|construction",i]',
        'way["shop"="trade"]["trade"~"building_materials|construction",i]',
        'node["shop"="builder_supply"]',
        'way["shop"="builder_supply"]',
        'node["shop"="building_materials"]',
        'way["shop"="building_materials"]'
      ],
      // electricidad del hogar (materiales eléctricos)
      electricidad: [
        'node["shop"="electrical"]',
        'way["shop"="electrical"]'
      ]
    };

    const clauses = [];
    for (const t of typesRaw) {
      if (RUBROS[t]) clauses.push(...RUBROS[t]);
    }
    if (clauses.length === 0) {
      Object.values(RUBROS).forEach(arr => clauses.push(...arr));
    }

    const union = clauses.map(c => `${c}(around:${radius},${lat},${lng});`).join('\n');

    const overpass = `
      [out:json][timeout:25];
      (
        ${union}
      );
      out center tags;
    `.trim();

    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: overpass })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'Overpass API error', detail: text });
    }

    const data = await r.json();
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const results = elements
      .map(el => {
        const center = el.center || (el.type === 'node' ? { lat: el.lat, lon: el.lon } : null);
        const lat2 = center?.lat ?? null;
        const lon2 = center?.lon ?? null;

        const tags = el.tags || {};
        const name = tags.name || 'Comercio';
        const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
          .filter(Boolean).join(' ');

        let category = 'comercio';
        if (tags.shop === 'hardware' || tags.shop === 'doityourself') category = 'ferretería';
        else if (tags.shop === 'paint') category = 'pinturería';
        else if (tags.shop === 'electrical') category = 'electricidad';
        else if (tags.shop === 'trade' || tags.shop === 'builder_supply' || tags.shop === 'building_materials')
          category = 'corralón';

        const distance_km = lat2 && lon2 ? haversineKm(lat, lng, lat2, lon2) : null;

        const gmapsLink = lat2 && lon2
          ? `https://www.google.com/maps/search/?api=1&query=${lat2},${lon2}`
          : null;
        const osmLink = lat2 && lon2
          ? `https://www.openstreetmap.org/?mlat=${lat2}&mlon=${lon2}#map=18/${lat2}/${lon2}`
          : null;

        return {
          name,
          category,
          address: address || tags['addr:full'] || '',
          lat: lat2,
          lng: lon2,
          distance_km,
          open_now: null,
          rating: null,
          link: gmapsLink || osmLink
        };
      })
      .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
      .slice(0, 18);

    res.json({ count: results.length, results });
  } catch (err) {
    console.error('Error /places:', err);
    res.status(500).json({ error: 'Error interno en /places' });
  }
});

// /geocode/reverse: barrio/ciudad legible
app.get('/geocode/reverse', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Parámetros lat/lng inválidos' });
    }

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lng);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');

    const r = await fetch(url, {
      headers: { 'User-Agent': 'bot-de-ia/1.0 (contact: you@example.com)' }
    });
    const data = await r.json();

    const addr = data?.address || {};
    const city =
      addr.city || addr.town || addr.village || addr.suburb || addr.neighbourhood || '';
    const display = data?.display_name || city || 'Ubicación';

    res.json({ city, display });
  } catch (err) {
    console.error('Error /geocode/reverse:', err);
    res.status(500).json({ error: 'Error interno en /geocode/reverse' });
  }
});

/* ===== Catch-all (Express 5) =====
   Sirve index.html para rutas que NO empiecen por /chat /places /geocode /health */
app.get(/^(?!\/(chat|places|geocode|health)).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ===== Start ===== */
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
