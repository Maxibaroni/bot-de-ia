document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userMessage = userInput.value.trim();
        if (userMessage === '') return;
        appendMessage(userMessage, 'user');
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: userMessage })
        });
        const data = await response.json();
        const botResponse = data.response;
        appendMessage(botResponse, 'bot');
        userInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    function appendMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        const p = document.createElement('p');
        p.textContent = message;
        messageDiv.appendChild(p);
        chatMessages.appendChild(messageDiv);
    }
});