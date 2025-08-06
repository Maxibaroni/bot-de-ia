const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid'); // Importamos la librería uuid
const app = express();
const port = 3000;

// Objeto para almacenar el historial de chat de cada sesión
const sessions = {};

// Reemplazamos la clave hardcodeada por la variable de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware para servir archivos estáticos (HTML, CSS, JS)
app.use(express.static('public'));

// Middleware para procesar JSON en el cuerpo de las solicitudes
app.use(express.json());

// Nueva ruta para iniciar una sesión de chat y obtener un ID
app.get('/start-session', (req, res) => {
    const sessionId = uuidv4();
    sessions[sessionId] = []; // Inicializamos el historial para esta nueva sesión
    console.log(`Nueva sesión iniciada: ${sessionId}`);
    res.json({ sessionId: sessionId });
});

// Ruta para la comunicación con el bot de IA
app.post('/chat', async (req, res) => {
    const { sessionId, message } = req.body;
    console.log(`Mensaje del usuario en sesión ${sessionId}: ${message}`);

    if (!sessionId || !sessions[sessionId]) {
        return res.status(400).json({ response: 'ID de sesión inválido o no encontrado.' });
    }

    // Obtenemos el historial de la sesión actual
    const history = sessions[sessionId];

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: "Eres un asistente experto en problemas del hogar en Argentina. Responde de forma extremadamente concisa y útil, usando un lenguaje sencillo. Tu objetivo es dar una sola solución clara sin añadir información extra. No te salgas de este tema."
        });

        // Agregamos el mensaje del usuario al historial
        history.push({ role: 'user', parts: message });

        const chat = model.startChat({ history: history });
        const result = await chat.sendMessage(message);
        const botResponse = result.response.text();

        // Agregamos la respuesta del bot al historial
        history.push({ role: 'model', parts: botResponse });

        res.json({ response: botResponse });
    } catch (error) {
        console.error('Error al comunicarse con la API de Gemini:', error);
        res.status(500).json({ response: 'Lo siento, hubo un problema al procesar tu solicitud.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});