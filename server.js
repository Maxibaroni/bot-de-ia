const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3000;

// Objeto para almacenar el historial de chat de cada sesión
const sessions = {};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.static('public'));
app.use(express.json());

app.get('/start-session', (req, res) => {
    const sessionId = uuidv4();
    sessions[sessionId] = [];
    console.log(`Nueva sesión iniciada: ${sessionId}`);
    res.json({ sessionId: sessionId });
});

app.post('/chat', async (req, res) => {
    const { sessionId, message } = req.body;
    console.log(`Mensaje del usuario en sesión ${sessionId}: ${message}`);

    if (!sessionId || !sessions[sessionId]) {
        return res.status(400).json({ response: 'ID de sesión inválido o no encontrado.' });
    }

    const history = sessions[sessionId];

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: "Eres un asistente experto en problemas del hogar en Argentina. Responde de forma extremadamente concisa y útil, usando un lenguaje sencillo. Tu objetivo es dar una sola solución clara sin añadir información extra. No te salgas de este tema."
        });

        // Corregido: La API espera un array de objetos para 'parts'
        history.push({ role: 'user', parts: [{ text: message }] });

        const chat = model.startChat({ history: history });
        const result = await chat.sendMessageStream(message);

        let botResponse = '';
        for await (const chunk of result.stream) {
            botResponse += chunk.text;
        }

        // Corregido: La API espera un array de objetos para 'parts'
        history.push({ role: 'model', parts: [{ text: botResponse }] });

        res.json({ response: botResponse });
    } catch (error) {
        console.error('Error al comunicarse con la API de Gemini:', error);
        res.status(500).json({ response: 'Lo siento, hubo un problema al procesar tu solicitud.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});