require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = 4000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = process.env.GROQ_API_KEY;
        const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos un ferretero experto de Nelson, Santa Fe. 
                        INSTRUCCIONES DE FORMATO:
                        1. NO uses asteriscos (**). 
                        2. Separa las ideas con párrafos claros.
                        3. NO menciones tiendas grandes (Carrefour, Walmart, etc). 
                        4. Da solo consejos técnicos breves sobre el producto.` 
                    },
                    { role: "user", content: message }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        let aiReply = data.choices?.[0]?.message?.content || "";

        // Limpieza de asteriscos para que no ensucien el texto
        aiReply = aiReply.replace(/\*/g, '').trim();

        let infoMapa = "";
        const pideNegocio = /ferreteria|comprar|donde|venden|canilla|cable|caño|precio|local/i.test(message);

        if (pideNegocio) {
            const latLong = "-31.2674,-60.7622"; // Coordenadas de Nelson
            // Link real para que el mapa sea interactivo
            const urlGoogleMaps = `https://www.google.com/maps/search/ferreteria+nelson+santa+fe/@${latLong},15z`;
            
            infoMapa = `
            <div style="margin-top: 25px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <a href="${urlGoogleMaps}" target="_blank" style="text-decoration: none; display: block; border-radius: 15px; overflow: hidden; border: 1px solid #ddd; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <img src="https://maps.googleapis.com/maps/api/staticmap?center=${latLong}&zoom=15&size=600x300&markers=color:red%7C${latLong}&key=${mapsKey}" 
                         style="width: 100%; display: block;" 
                         alt="Mapa Nelson">
                    <div style="padding: 15px; text-align: center; background: #007bff; color: white; font-weight: bold; font-size: 16px;">
                        📍 ABRIR MAPA INTERACTIVO
                    </div>
                </a>
                <div style="padding: 15px; background: #fdfdfd; border-radius: 0 0 15px 15px; border: 1px solid #eee; border-top: none;">
                    <p style="margin: 0 0 8px 0; color: #333;"><strong>Ferreterías en Nelson:</strong></p>
                    <p style="margin: 4px 0; color: #666; font-size: 14px;">• Ferrehogar (Sarmiento 290)</p>
                    <p style="margin: 4px 0; color: #666; font-size: 14px;">• Ferretería JF (Juan de Garay 967)</p>
                </div>
            </div>`;
        }

        // Estilo con line-height y margin para que las palabras NO estén encimadas
        const respuestaFinal = `
            <div style="line-height: 1.8; color: #333; font-size: 16px; white-space: pre-wrap; margin-bottom: 10px;">
                ${aiReply}
            </div>
            ${infoMapa}`;
        
        res.json({ reply: respuestaFinal });

    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Error de conexión." });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Servidor prolijo en http://localhost:${PORT}`));