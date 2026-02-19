const chatContainer = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachInput = document.getElementById('attachInput');
const cameraInput = document.getElementById('cameraInput');

let selectedImageBase64 = null;

// Función para procesar la imagen seleccionada
function handleImage(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedImageBase64 = e.target.result;
        addMessage("📸 Imagen cargada. ¡Listo para analizar!", 'info');
    };
    reader.readAsDataURL(file);
}

// Listeners para los botones de imagen
attachInput.addEventListener('change', (e) => handleImage(e.target.files[0]));
cameraInput.addEventListener('change', (e) => handleImage(e.target.files[0]));

// Función para añadir mensajes a la UI
function addMessage(text, role) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `${role}-msg`;

    const textDiv = document.createElement('div');
    textDiv.className = 'msg-text';
    
    if (role === 'assistant' || role === 'info') {
        // Renderizamos negritas de Markdown a HTML
        const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        textDiv.innerHTML = formatted;
    } else {
        textDiv.textContent = text;
    }

    msgDiv.appendChild(textDiv);
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Función de envío
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message && !selectedImageBase64) return;

    // Mostrar mensaje del usuario
    addMessage(message || "Analizando imagen...", 'user');
    
    // Reset inputs
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Crear indicador de carga
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'assistant-msg';
    loadingDiv.innerHTML = '<div class="msg-text">🧐 Analizando...</div>';
    chatContainer.appendChild(loadingDiv);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: message,
                image: selectedImageBase64 
            })
        });

        const data = await response.json();
        chatContainer.removeChild(loadingDiv);
        
        addMessage(data.reply, 'assistant');
        selectedImageBase64 = null; // Limpiar imagen después de enviar

    } catch (error) {
        if (loadingDiv.parentNode) chatContainer.removeChild(loadingDiv);
        addMessage("Hubo un problema. ¿Tenés el server prendido?", 'assistant');
    }
}

// Eventos de teclado y click
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-expandir el textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});