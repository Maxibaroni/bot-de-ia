const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const port = 3000;

// Reemplaza 'TU_API_KEY' con la clave que obtuviste en el Paso 1
const genAI = new GoogleGenerativeAI(' AIzaSyB603VTxXO_gO14j-_DjAjC85E72auX3pk');

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