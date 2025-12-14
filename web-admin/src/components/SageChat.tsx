import { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { aiChatService } from '../services/aiChatService';
import type { ChatServiceResponse } from '../types/chat';
import TowerCard from './ai-chat/TowerCard';
import type { SproutifySession } from '../utils/session';
import './SageChat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards?: any[];
  timestamp: string;
}

const SageChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSmallWindow, setShowSmallWindow] = useState(false);
  const [showLargeModal, setShowLargeModal] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [session, setSession] = useState<SproutifySession | null>(null);
  const scrollViewRef = useRef<HTMLDivElement>(null);

  // Load session data
  useEffect(() => {
    const loadSession = () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (sessionData) {
          const parsed = JSON.parse(sessionData) as SproutifySession;
          setSession(parsed);
        }
      } catch (error) {
        console.error('Error loading session:', error);
      }
    };
    loadSession();
  }, []);

  const toggleChat = () => {
    if (!isOpen) {
      setIsOpen(true);
      setShowSmallWindow(true);
    } else {
      setIsOpen(false);
      setShowSmallWindow(false);
      setShowLargeModal(false);
      setMessages([]);
    }
  };

  const handleSmallWindowSubmit = () => {
    if (!inputValue.trim() || loading) return;
    
    const question = inputValue.trim();
    setCurrentQuestion(question);
    setInputValue('');
    setShowSmallWindow(false);
    setShowLargeModal(true);
    
    // Send message
    sendMessage(question);
  };

  const sendMessage = async (message: string) => {
    setLoading(true);
    
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response: ChatServiceResponse = await aiChatService.sendMessage(
        message,
        session?.farmUuid,
        session?.farmName,
        session?.email || undefined
      );
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        cards: response.cards,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = () => {
    if (!inputValue.trim() || loading) return;
    sendMessage(inputValue.trim());
    setInputValue('');
  };

  const closeLargeModal = () => {
    setShowLargeModal(false);
    setShowSmallWindow(false);
    setIsOpen(false);
    setMessages([]);
  };

  useEffect(() => {
    if (showLargeModal && messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          top: scrollViewRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [messages, showLargeModal]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        className="sage-button"
        onClick={toggleChat}
        aria-label="Open Sage chat"
      >
        <Sparkles className="sage-icon" size={24} color="white" />
      </button>

      {/* Small Chat Window */}
      <AnimatePresence>
        {showSmallWindow && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="sage-small-window"
          >
            <div className="sage-small-window-header">
              <div>
                <h3>Sage</h3>
                <p>Describe what you need and let Sage help you.</p>
              </div>
              <button className="close-small-button" onClick={toggleChat}>
                ×
              </button>
            </div>
            <div className="sage-small-window-input">
              <input
                type="text"
                placeholder="e.g., 'Show my towers'"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSmallWindowSubmit();
                  }
                }}
              />
              <button
                onClick={handleSmallWindowSubmit}
                disabled={!inputValue.trim() || loading}
                className="ask-button"
              >
                Ask
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large Response Modal */}
      <AnimatePresence>
        {showLargeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sage-modal-backdrop"
            onClick={closeLargeModal}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{
                type: 'spring',
                stiffness: 100,
                damping: 15,
                duration: 0.6,
              }}
              className="sage-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sage-modal-header">
                <div>
                  <h2>Sage</h2>
                  {currentQuestion && (
                    <p className="sage-modal-question">{currentQuestion}</p>
                  )}
                </div>
                <button className="close-modal-button" onClick={closeLargeModal}>
                  ×
                </button>
              </div>

              <div className="sage-modal-body">
                <div ref={scrollViewRef} className="sage-messages-scroll">
                  <div className="sage-messages-content">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`sage-message-wrapper ${
                          message.role === 'user' ? 'sage-user-message' : 'sage-assistant-message'
                        }`}
                      >
                        <div className="sage-message-content">
                          <div
                            className={`sage-message-bubble ${
                              message.role === 'user' ? 'sage-user-bubble' : 'sage-assistant-bubble'
                            }`}
                          >
                            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                          </div>
                          {message.role === 'assistant' && message.cards && message.cards.length > 0 && (
                            <div className="sage-cards-container">
                              {message.cards.map((card, index) => (
                                <TowerCard key={index} data={card} index={index} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="sage-assistant-message">
                        <div className="sage-message-bubble sage-assistant-bubble">
                          <div className="sage-loading-container">
                            <div className="sage-spinner"></div>
                            <span>Sage is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="sage-modal-input-container">
                  <input
                    type="text"
                    placeholder="Ask a follow-up question..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFollowUp();
                      }
                    }}
                    disabled={loading}
                  />
                  <button
                    onClick={handleFollowUp}
                    disabled={!inputValue.trim() || loading}
                    className="sage-send-button"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SageChat;
