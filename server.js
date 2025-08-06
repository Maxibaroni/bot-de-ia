const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const port = 3000;

// Reemplazamos la clave hardcodeada por la variable de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware para servir archivos estáticos (HTML, CSS, JS)
app.use(express.static('public'));

// Middleware para procesar JSON en el cuerpo de las solicitudes
app.use(express.json());

// Nueva ruta para la comunicación con el bot de IA
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    console.log(`Mensaje del usuario: ${userMessage}`);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Añadimos un prompt inicial para darle contexto a la IA
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: "Eres un asistente experto en problemas y reparaciones sencillas del hogar en Argentina. Responde de forma concisa y útil. No te salgas de este tema."
                },
                {
                    role: "model",
                    parts: "¡Hola! Soy tu asistente de IA para problemas del hogar. ¿En qué puedo ayudarte?"
                }
            ]
        });

        const result = await chat.sendMessage(userMessage);
        const botResponse = result.response.text();

        // Envía la respuesta del bot de IA al cliente
        res.json({ response: botResponse });
    } catch (error) {
        console.error('Error al comunicarse con la API de Gemini:', error);
        res.status(500).json({ response: 'Lo siento, hubo un problema al procesar tu solicitud.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});