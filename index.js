require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));

// --- PROFESIONALES REALES ---
const profesionalesNelson = {
    plomeria: [{ nombre: "Juan el Plomero", tel: "3421234567", nota: "Especialista en termofusión" }],
    electricidad: [{ nombre: "Cacho Electricista", tel: "3420001122", nota: "Instalaciones y térmicas" }]
};

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = process.env.GROQ_API_KEY;
        const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
        const latLong = "-31.2674,-60.7622"; 

        // 1. IA ULTRA-RESTRINGIDA (No puede decir NADA de direcciones)
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ 
                    role: "system", 
                    content: "Sos un ferretero técnico de Nelson. LIMITATE a dar un consejo técnico de 15 palabras. PROHIBIDO dar nombres de locales, calles o teléfonos. Si te preguntan dónde comprar, respondé solo: 'Aquí abajo te dejo el mapa con los locales reales de Nelson:'" 
                }, { role: "user", content: message }],
                temperature: 0.0 
            })
        });

        const data = await response.json();
        let aiReply = data.choices?.[0]?.message?.content || "";
        aiReply = aiReply.replace(/\*/g, '').trim();

        let infoExtra = "";

        // 2. BÚSQUEDA DINÁMICA (Aquí es donde aparece la magia interactiva)
        const rubros = ["ferreteria", "canilla", "caño", "arena", "cal", "corralon", "gomeria", "farmacia", "panaderia"];
        const busquedaDetectada = rubros.find(r => new RegExp(r, 'i').test(message));

        if (busquedaDetectada) {
            const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latLong}&radius=3000&keyword=${busquedaDetectada}&key=${mapsKey}`;
            const pRes = await fetch(placesUrl);
            const pData = await pRes.json();

            if (pData.results && pData.results.length > 0) {
                const localesHtml = pData.results.slice(0, 3).map(l => {
                    const linkLocal = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name)}&query_place_id=${l.place_id}`;
                    return `
                    <div style="margin-bottom: 12px; border-left: 4px solid #007bff; padding: 10px; background: #f9f9f9; border-radius: 0 8px 8px 0;">
                        <b style="font-size: 14px; color: #333;">${l.name}</b><br>
                        <small style="color: #666;">${l.vicinity}</small><br>
                        <a href="${linkLocal}" target="_blank" style="color: #007bff; font-size: 12px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 5px;">
                            🌐 VER EN MAPA / CÓMO LLEGAR →
                        </a>
                    </div>`;
                }).join('');

                const urlMapaGeneral = `https://www.google.com/maps/search/${encodeURIComponent(busquedaDetectada)}+Nelson+Santa+Fe/`;

                infoExtra += `
                <div style="margin-top: 20px; border: 1px solid #ddd; border-radius: 15px; overflow: hidden; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <a href="${urlMapaGeneral}" target="_blank" style="display: block; position: relative; text-decoration: none;">
                        <img src="https://maps.googleapis.com/maps/api/staticmap?center=${latLong}&zoom=15&size=600x250&markers=color:red%7C${latLong}&key=${mapsKey}" style="width: 100%; display: block;">
                        <div style="position: absolute; bottom: 10px; right: 10px; background: white; padding: 5px 10px; border-radius: 5px; font-size: 11px; color: #333; font-weight: bold; border: 1px solid #ccc;">AMPLIAR 🔍</div>
                    </a>
                    <div style="padding: 15px;">
                        <strong style="color: #007bff; display: block; margin-bottom: 12px;">📍 Negocios en Nelson (Datos Reales):</strong>
                        ${localesHtml}
                    </div>
                </div>`;
            }
        }

        // 3. PROFESIONALES (WhatsApp)
        if (/canilla|agua|baño|plomero/i.test(message)) {
            infoExtra += `
            <div style="margin-top: 15px; border: 1px solid #28a745; border-radius: 12px; background: #fcfcfc; padding: 15px;">
                <strong style="color: #333; display: block; margin-bottom: 10px;">👷 Plomeros sugeridos:</strong>
                ${profesionalesNelson.plomeria.map(p => `
                    <div>
                        <b>${p.nombre}</b> - <small>${p.nota}</small><br>
                        <a href="https://wa.me/${p.tel}" target="_blank" style="display: inline-block; margin-top: 8px; color: white; background: #25d366; padding: 6px 15px; border-radius: 20px; text-decoration: none; font-size: 13px; font-weight: bold;">💬 WhatsApp</a>
                    </div>
                `).join('')}
            </div>`;
        }

        res.json({ reply: `<div>${aiReply}</div>${infoExtra}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Error de conexión." });
    }
});

app.get('/', (req, res) => { res.sendFile(path.resolve(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => console.log(`🚀 NelsonBot Corregido en puerto ${PORT}`));