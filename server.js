// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- Validaciones env -------------------- */
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Falta GEMINI_API_KEY en .env o en el entorno.');
  process.exit(1);
}

/* -------------------- IA (Gemini) -------------------- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* -------------------- Estado en memoria -------------------- */
const sessions = {};   // historial por sessionId
const rate = new Map(); // rate-limit por sessionId

/* -------------------- Middlewares -------------------- */
app.use(express.json({ limit: '75mb' }));                 // imágenes grandes desde móvil
app.use(express.static(path.join(__dirname, 'public')));  // servir frontend

/* -------------------- Utils -------------------- */
function fileToGenerativePart(base64Data) {
  if (!base64Data || !base64Data.includes(',')) return null;
  const [meta, data] = base64Data.split(',');
  const mimeType = meta.split(':')[1]?.split(';')[0] || 'image/jpeg';
  return { inlineData: { data, mimeType } };
}

// Token bucket simple: 5 req / ~30s por sesión (1 token cada 6s)
function checkSessionRate(sessionId) {
  const now = Date.now();
  const bucket = rate.get(sessionId) || { tokens: 5, ts: now };
  const elapsed = (now - bucket.ts) / 1000;
  bucket.tokens = Math.min(5, bucket.tokens + elapsed / 6);
  bucket.ts = now;

  if (bucket.tokens < 1) {
    rate.set(sessionId, bucket);
    return { allowed: false, retryAfter: 10 };
  }
  bucket.tokens -= 1;
  rate.set(sessionId, bucket);
  return { allowed: true };
}

/* -------------------- Rutas utilitarias -------------------- */
app.get('/health', (_req, res) => {
  res.json({ ok: true, port: PORT, ts: Date.now() });
});

app.get('/start-session', (_req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = [];
  console.log(`🆕 Nueva sesión: ${sessionId}`);
  res.json({ sessionId });
});

/* -------------------- Google Places: /places -------------------- */
/* Requiere MAPS_API_KEY habilitada en Google Cloud (Places API activada) */
function buildNearbyUrl({ lat, lng, keyword = 'ferretería', radius = 2500, openNow = true }) {
  const base = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    keyword,
    key: process.env.MAPS_API_KEY || ''
  });
  if (openNow) params.set('opennow', 'true');
  return `${base}?${params.toString()}`;
}
const placeLink = (placeId) => `https://www.google.com/maps/place/?q=place_id:${placeId}`;

app.get('/places', async (req, res) => {
  try {
    if (!process.env.MAPS_API_KEY) {
      return res.status(500).json({ error: 'Falta MAPS_API_KEY en el servidor' });
    }
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!lat || !lng) return res.status(400).json({ error: 'Parámetros lat y lng son requeridos' });

    const keyword = String(req.query.q || 'ferretería');
    const radius = parseInt(req.query.radius || '2500', 10);
    const openNow = req.query.openNow !== '0';

    const url = buildNearbyUrl({ lat, lng, keyword, radius, openNow });
    const resp = await fetch(url);
    const json = await resp.json();

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      console.error('Places API error:', json.status, json.error_message);
      return res.status(502).json({ error: 'Error consultando Google Places', status: json.status, detail: json.error_message });
    }

    const results = (json.results || []).slice(0, 5).map(r => ({
      name: r.name,
      address: r.vicinity || r.formatted_address || '',
      rating: r.rating ?? null,
      open_now: r.opening_hours?.open_now ?? null,
      link: placeLink(r.place_id)
    }));

    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error('❌ /places error:', err);
    res.status(500).json({ error: 'Falló la búsqueda de lugares' });
  }
});

/* -------------------- Chat principal (con sesión + rate limit + manejo 429) -------------------- */
app.post('/chat', async (req, res) => {
  let { sessionId, message, imageData } = req.body || {};
  console.log(`📩 Mensaje recibido (sesión ${sessionId || 'n/a'}):`, message);

  // 1) Sesión: crear si falta o es inválida
  if (!sessionId || !sessions[sessionId]) {
    sessionId = uuidv4();
    sessions[sessionId] = [];
    console.log(`⚠️ Sesión ausente/ inválida → creada: ${sessionId}`);
  }

  // 2) Rate limit por sesión (suave)
  const rateCheck = checkSessionRate(sessionId);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      response: 'Estás enviando muy rápido. Probá en unos segundos.',
      retryAfter: rateCheck.retryAfter,
      sessionId
    });
  }

  // 3) Request vacío
  const hasText = !!(message && String(message).trim());
  const hasImage = !!imageData;
  if (!hasText && !hasImage) {
    return res.status(400).json({ response: 'Enviá un mensaje o una imagen.', sessionId });
  }

  const history = sessions[sessionId];

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction:
        'Eres un asistente experto en problemas del hogar en Argentina. Responde de forma concisa y útil, en lenguaje sencillo. Da una sola solución clara y concreta. No te salgas del tema del hogar.'
    });

    const chat = model.startChat({ history });

    // 4) Armar parts para Gemini
    const parts = [];
    if (hasText) parts.push({ text: String(message).trim() });
    if (hasImage) {
      const img = fileToGenerativePart(imageData);
      if (img) parts.push(img);
    }

    // 5) Llamada a Gemini
    const result = await chat.sendMessage(parts);
    const botResponse = result.response.text();

    // 6) Guardar historial
    history.push({ role: 'user', parts });
    history.push({ role: 'model', parts: [{ text: botResponse }] });

    // 7) Responder (incluye sessionId)
    res.json({ response: botResponse, sessionId });
  } catch (err) {
    // Manejo específico de 429 (cuota/ráfagas de la API) + “Plan B” (límite diario)
    const msg = String(err?.message || '');

    let retryAfter = 0;
    const m1 = msg.match(/"retryDelay":"(\d+)s"/);
    const m2 = msg.match(/Please retry in (\d+(\.\d+)?)s/);
    if (m1) retryAfter = parseInt(m1[1], 10);
    else if (m2) retryAfter = Math.ceil(parseFloat(m2[1]));

    // Heurística para detectar límite diario del free tier
    const exhaustedDaily =
      msg.includes('GenerateRequestsPerDayPerProjectPerModel-FreeTier') ||
      /per\s*day/i.test(msg);

    const is429 = msg.includes('[429') || retryAfter > 0;

    console.error('❌ Error con Gemini:', msg);

    if (is429) {
      return res.status(429).json({
        response: exhaustedDaily
          ? 'Se alcanzó el límite diario gratuito de la API.'
          : `Se alcanzó el límite momentáneo. Probá de nuevo en ${retryAfter || 60} segundos.`,
        retryAfter: retryAfter || 60,
        exhausted: exhaustedDaily,                     // flag para el front
        resetHintUtc: new Date(Date.now() + (retryAfter || 60) * 1000).toISOString(),
        sessionId
      });
    }

    return res.status(500).json({
      response: 'Hubo un problema al procesar tu solicitud.',
      sessionId
    });
  }
});

/* -------------------- Start -------------------- */
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
