let sessionId = null;
let imageFile = null;

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
    const imageData = imageFile;

    if (message.trim() === '' && !imageData) return;

    if (message.trim() !== '') {
        appendMessage('user', message);
    }
    if (imageData) {
        // Muestra una imagen miniatura en el chat
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '100px';
            img.style.borderRadius = '8px';
            const chatMessages = document.getElementById('chat-messages');
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', 'user-message');
            messageDiv.appendChild(img);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };
        reader.readAsDataURL(imageData);
    }

    inputElement.value = '';
    document.getElementById('file-upload').value = '';
    imageFile = null;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId, message, imageData: imageData ? await toBase64(imageData) : null }),
        });

        const data = await response.json();
        appendMessage('bot', data.response);
    } catch (error) {
        console.error('Error:', error);
        appendMessage('bot', 'Lo siento, hubo un problema al procesar tu solicitud.');
    }
}

// Convierte el archivo a Base64 para enviarlo al servidor
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

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

document.getElementById('send-button').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

document.getElementById('file-upload').addEventListener('change', (e) => {
    imageFile = e.target.files[0];
});

fetchSessionId();