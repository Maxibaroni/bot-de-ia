let sessionId = null; // Variable para guardar el ID de sesión

// Función para mostrar mensajes en la interfaz
function appendMessage(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.innerText = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Función para enviar el mensaje del usuario
async function sendMessage() {
    const inputElement = document.getElementById('user-input');
    const message = inputElement.value;
    if (message.trim() === '') return;

    appendMessage('user', message);
    inputElement.value = '';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId, message }), // Enviamos el ID de sesión y el mensaje
        });

        const data = await response.json();
        appendMessage('bot', data.response);
    } catch (error) {
        console.error('Error:', error);
        appendMessage('bot', 'Lo siento, hubo un problema al procesar tu solicitud.');
    }
}

// Función para iniciar la sesión
async function fetchSessionId() {
    try {
        const response = await fetch('/start-session');
        const data = await response.json();
        sessionId = data.sessionId;
        console.log(`Sesión iniciada con ID: ${sessionId}`);
    } catch (error) {
        console.error('Error al iniciar la sesión:', error);
    }
}

// Asignar el evento al botón de enviar
document.getElementById('send-button').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Iniciar una nueva sesión cuando la página carga
fetchSessionId();