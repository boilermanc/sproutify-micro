import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import './SageChat.css';

const SageChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ text: string; sender: 'user' | 'sage' }>>([
    { text: "Hi! I'm Sage, your Sproutify assistant. How can I help you today?", sender: 'sage' }
  ]);
  const [inputValue, setInputValue] = useState('');

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setMessages([...messages, { text: userMessage, sender: 'user' }]);
    setInputValue('');

    try {
      // Call n8n webhook for Sage chat
      const response = await fetch('https://n8n.sproutify.app/webhook/sage-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      setMessages(prev => [...prev, {
        text: data.response || "I'm here to help! How can I assist you with your microgreen farm?",
        sender: 'sage'
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        text: "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        sender: 'sage'
      }]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <button className="sage-button" onClick={toggleChat} aria-label="Open Sage chat">
        <Sparkles className="sage-icon" size={24} color="white" />
      </button>

      {isOpen && (
        <div className="sage-chat-container">
          <div className="sage-chat-header">
            <div className="sage-header-content">
              <Sparkles className="sage-icon" size={20} color="white" />
              <div>
                <h3>Sage</h3>
                <p>Your Sproutify Assistant</p>
              </div>
            </div>
            <button className="close-button" onClick={toggleChat}>&times;</button>
          </div>

          <div className="sage-chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                <div className="message-bubble">{message.text}</div>
              </div>
            ))}
          </div>

          <div className="sage-chat-input">
            <input
              type="text"
              placeholder="Ask Sage anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button onClick={handleSend} disabled={!inputValue.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SageChat;
