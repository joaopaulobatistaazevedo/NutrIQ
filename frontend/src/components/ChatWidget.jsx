import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, Sparkles, HeartHandshake } from 'lucide-react';
import '../styles/chatbot.css';

const PROFILE_KEY = 'nutribot_profile';

export default function ChatWidget() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  const storedProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const welcomeName = storedProfile?.username || 'campeão';

  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'bot',
      text: `Olá ${welcomeName}! Eu sou o NutriBot, o teu companheiro de evolução alimentar.`,
    },
  ]);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const content = input.trim();
    if (!content) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      text: content,
    };

    const botMessage = {
      id: Date.now() + 1,
      role: 'bot',
      text: 'Recebi a tua mensagem. Quando o backend for ligado, respondo com personalização total.',
    };

    setMessages((previous) => [...previous, userMessage, botMessage]);
    setInput('');
  };

  if (location.pathname === '/welcome-bot') {
    return null;
  }

  return (
    <div className="chat-widget">
      {isOpen && (
        <section className="chat-panel" aria-label="Chat bot">
          <header className="chat-header">
            <div>
              <h3>NutriBot</h3>
              <p>Companheiro nutricional</p>
            </div>
            <button
              type="button"
              className="chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar chat"
            >
              <X size={16} />
            </button>
          </header>

          <div className="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message ${message.role === 'user' ? 'user' : 'bot'}`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escreve a tua mensagem..."
            />
            <button type="submit" disabled={!canSend} aria-label="Enviar mensagem">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <div className="chat-priority-badge" role="status" aria-live="polite">
        <Sparkles size={14} />
        <span>NutriBot é o teu companheiro</span>
      </div>

      <button
        type="button"
        className="chat-toggle"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label={isOpen ? 'Fechar chat' : 'Abrir chat'}
      >
        {isOpen ? <X size={20} /> : <HeartHandshake size={20} />}
      </button>
    </div>
  );
}
