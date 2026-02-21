document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat');
    const userInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const locBtn = document.getElementById('locBtn');

    let userLocation = null; // Guardamos la ubicación aquí

    function appendMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('bubble');
        contentDiv.innerHTML = text; // Permite ver el mapa
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        appendMessage('user', message);
        userInput.value = '';

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ✅ ENVIAMOS LA UBICACIÓN AL SERVIDOR
                body: JSON.stringify({ 
                    message, 
                    lat: userLocation ? userLocation.lat : null, 
                    lng: userLocation ? userLocation.lng : null 
                })
            });

            const data = await response.json();
            // ✅ CAMBIADO: Usamos data.reply porque así lo definiste en index.js
            appendMessage('assistant', data.reply);

        } catch (error) {
            appendMessage('assistant', '❌ Error de conexión.');
        }
    }

    locBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            appendMessage('assistant', '⌛ Obteniendo ubicación...');
            navigator.geolocation.getCurrentPosition((pos) => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                appendMessage('assistant', '✅ Ubicación fijada. Ahora buscá lo que necesites.');
                locBtn.style.background = "#28a745"; // Color verde de éxito
                locBtn.innerText = "📍 Ubicado";
            });
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});