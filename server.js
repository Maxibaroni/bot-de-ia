// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Validación API Key ---
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Falta GEMINI_API_KEY en .env o en las variables de entorno de Render.');
  process.exit(1);
}

// --- Inicialización Gemini ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Sesiones en memoria ---
const sessions = {};

// --- Middlewares ---
app.use(express.json({ limit: '50mb' })); // Permite imágenes base64 pesadas
app.use(express.static(path.join(__dirname, 'public'))); // Sirve el frontend

// --- Utilidad para imágenes ---
function fileToGenerativePart(base64Data) {
  if (!base64Data || !base64Data.includes(',')) return null;
  const [meta, data] = base64Data.split(',');
  const mimeType = meta.split(':')[1]?.split(';')[0] || 'image/png';
  return { inlineData: { data, mimeType } };
}

// --- Rutas utilitarias ---
app.get('/health', (_req, res) => {
  res.json({ ok: true, port: PORT, ts: Date.now() });
});

app.get('/start-session', (_req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = [];
  console.log(`🆕 Nueva sesión: ${sessionId}`);
  res.json({ sessionId });
});

// --- Chat principal (con auto-creación de sesión) ---
app.post('/chat', async (req, res) => {
  let { sessionId, message, imageData } = req.body || {};
  console.log(`📩 Mensaje recibido (sesión ${sessionId || 'n/a'}):`, message);

  // 1) Si falta o es inválida, crear una nueva y usarla
  if (!sessionId || !sessions[sessionId]) {
    sessionId = uuidv4();
    sessions[sessionId] = [];
    console.log(`⚠️ Sesión ausente/ inválida → creada: ${sessionId}`);
  }

  // 2) Evitar requests vacíos
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

    // Armar partes para Gemini
    const parts = [];
    if (hasText) parts.push({ text: String(message).trim() });
    if (hasImage) {
      const img = fileToGenerativePart(imageData);
      if (img) parts.push(img);
    }

    // Llamar a Gemini
    const result = await chat.sendMessage(parts);
    const botResponse = result.response.text();

    // Guardar historial (formato compatible con la SDK)
    history.push({ role: 'user', parts });
    history.push({ role: 'model', parts: [{ text: botResponse }] });

    // 3) Devolver también sessionId (para que el front lo guarde)
    res.json({ response: botResponse, sessionId });
  } catch (err) {
    console.error('❌ Error con Gemini:', err?.message || err);
    res.status(500).json({ response: 'Hubo un problema al procesar tu solicitud.', sessionId });
  }
});

// --- Inicio ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
