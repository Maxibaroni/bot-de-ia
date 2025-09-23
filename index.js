// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Validaciones iniciales ---
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Falta GEMINI_API_KEY en el .env o en las variables de entorno del servidor.');
  process.exit(1);
}

// --- IA (Gemini) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Estado en memoria de sesiones ---
const sessions = {}; // { sessionId: [{role:'user'|'model', parts:[...]}] }

// --- Middlewares ---
app.use(express.json({ limit: '50mb' })); // para imágenes base64
app.use(express.static(path.join(__dirname, 'public'))); // servir frontend

// (Opcional) CORS si algún día servís el front desde otro dominio
// const cors = require('cors');
// app.use(cors({ origin: true, credentials: true }));

// --- Utilidades ---
function fileToGenerativePart(base64Data) {
  // Espera "data:<mime>;base64,<data>"
  if (!base64Data || !base64Data.includes(',')) return null;
  const [meta, data] = base64Data.split(',');
  const mimeType = meta.split(':')[1]?.split(';')[0] || 'image/png';
  return { inlineData: { data, mimeType } };
}

// --- Rutas ---
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), envPort: process.env.PORT || null });
});

app.get('/start-session', (_req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = [];
  console.log(`🆕 Nueva sesión: ${sessionId}`);
  res.json({ sessionId });
});

app.post('/chat', async (req, res) => {
  const { sessionId, message, imageData } = req.body || {};
  console.log(`📩 Mensaje (sesión ${sessionId || 'sin-id'}):`, message);

  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ response: 'ID de sesión inválido o no encontrado.' });
  }

  const history = sessions[sessionId];

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction:
        'Eres un asistente experto en problemas del hogar en Argentina. Responde de forma concisa y útil, en lenguaje sencillo. Da una sola solución clara y concreta. No te salgas del tema del hogar.'
    });

    const chat = model.startChat({ history });

    const parts = [];
    if (message && message.trim()) parts.push({ text: message.trim() });
    if (imageData) {
      const img = fileToGenerativePart(imageData);
      if (img) parts.push(img);
    }

    if (parts.length === 0) {
      return res.status(400).json({ response: 'Enviá un mensaje o una imagen para empezar.' });
    }

    const result = await chat.sendMessage(parts);
    const botResponse = result.response.text();

    // Persistimos historial compatible con la SDK
    history.push({ role: 'user', parts });
    history.push({ role: 'model', parts: [{ text: botResponse }] });

    res.json({ response: botResponse });
  } catch (err) {
    console.error('❌ Error con Gemini:', err?.message || err);
    res.status(500).json({ response: 'Hubo un problema al procesar tu solicitud.' });
  }
});

// (Opcional) Fallback para single-page apps si alguna vez lo necesitás
// app.get('*', (_req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
