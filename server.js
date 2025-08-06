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
        // Usamos systemInstruction para darle un rol a la IA de forma más estable
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: "Eres un asistente experto en problemas del hogar en Argentina. Responde de forma extremadamente concisa y útil, usando un lenguaje sencillo. Tu objetivo es dar una sola solución clara sin añadir información extra. No te salgas de este tema."
        });

        // La llamada ahora es más simple
        const result = await model.generateContent(userMessage);
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