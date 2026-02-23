document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const locBtn = document.getElementById('locBtn');

    // Función para agregar mensajes al chat
    function appendMessage(content, side) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${side}`;
        
        // side es 'user' o 'bot'
        // innerHTML es CLAVE para que el mapa y botones de WhatsApp funcionen
        msgDiv.innerHTML = content;
        
        chatContainer.appendChild(msgDiv);
        
        // Auto-scroll hacia abajo
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Función para enviar el mensaje al servidor
    async function handleSend() {
        const text = messageInput.value.trim();
        if (!text) return;

        // 1. Mostrar mensaje del usuario en pantalla
        appendMessage(text, 'user');
        messageInput.value = '';
        messageInput.style.height = 'auto'; // Resetear altura del textarea

        // 2. Mostrar indicador de carga "Escribiendo..."
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message bot loading';
        loadingDiv.innerText = '⌛ Buscando en Nelson...';
        chatContainer.appendChild(loadingDiv);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            const data = await response.json();
            
            // Quitar indicador de carga
            chatContainer.removeChild(loadingDiv);

            // 3. Mostrar respuesta del Bot (con mapa y botones)
            appendMessage(data.reply, 'bot');

        } catch (error) {
            console.error("Error al conectar con el servidor:", error);
            chatContainer.removeChild(loadingDiv);
            appendMessage("❌ Error de conexión. Intentá de nuevo.", 'bot');
        }
    }

    // Evento Click
    sendBtn.addEventListener('click', handleSend);

    // Evento Enter (sin Shift)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Auto-ajustar altura del textarea mientras escriben
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Botón de ubicación (solo decorativo en este caso)
    locBtn.addEventListener('click', () => {
        alert("Estás viendo resultados reales de Nelson, Santa Fe.");
    });
});