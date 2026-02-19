require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = 4000;

// Aumentamos el límite de tamaño para recibir imágenes en Base64
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/chat', async (req, res) => {
    try {
        const { message, image } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) throw new Error("Falta la API Key de Groq");

        console.log(`[${new Date().toLocaleTimeString()}] 📩 Consulta recibida... ${image ? '(Con imagen)' : '(Solo texto)'}`);

        // Preparamos el contenido del mensaje según si hay imagen o no
        let userContent = [];
        
        if (image) {
            // Si hay imagen, usamos el formato de bloques de Groq Vision
            userContent = [
                { type: "text", text: message || "Analizá esta imagen y decime qué problema de reparación del hogar ves y cómo solucionarlo." },
                { type: "image_url", image_url: { url: image } }
            ];
        } else {
            userContent = message;
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
               model:"llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: "Sos un experto en reparaciones del hogar en Argentina. Si recibís una imagen, analizala con precisión técnica. Usá terminología local (cuerito, termofusión, membrana, etc.). Respondé con pasos claros y resaltá herramientas en negrita." 
                    },
                    { role: "user", content: userContent }
                ],
                temperature: 0.5,
                max_tokens: 1000
            })
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);

        const reply = data.choices[0].message.content.trim();
        res.json({ reply });

    } catch (error) {
        console.error("❌ ERROR:", error.message);
        res.status(500).json({ reply: "Perdón, me dio un error el diagnóstico. ¿Probamos de nuevo?" });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 ASISTENTE HOGAR VISION ON`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});