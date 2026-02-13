import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, HeartHandshake, Trash2 } from 'lucide-react';
import { sendAssistantMessage, sendOnboardingMessage } from '../services/chatbotService';
import '../styles/chatbot.css';

const PROFILE_KEY = 'nutribot_profile';
const CHAT_MESSAGES_KEY = 'nutribot_chat_messages';
const CHAT_HISTORY_KEY = 'nutribot_chat_history';
const CHAT_CONTEXT_KEY = 'nutribot_chat_context';

const parseStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const buildWelcomeMessage = (name) => ({
  id: Date.now(),
  role: 'bot',
  text: `Olá ${name}! Eu sou o NutriBot, pronto para te ajudar com alimentação e meal planning.`,
});

const toUiMessage = (item) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  role: item.role === 'user' ? 'user' : 'bot',
  text: item.content,
});

const buildInitialMessages = (welcomeName) => {
  const storedMessages = parseStorage(CHAT_MESSAGES_KEY, []);
  if (Array.isArray(storedMessages) && storedMessages.length > 0) {
    return storedMessages;
  }

  const storedHistory = parseStorage(CHAT_HISTORY_KEY, []);
  if (Array.isArray(storedHistory) && storedHistory.length > 0) {
    return storedHistory.map(toUiMessage);
  }

  return [buildWelcomeMessage(welcomeName)];
};

export default function ChatWidget() {
  const location = useLocation();
  const messagesEndRef = useRef(null);

  const storedProfile = useMemo(() => parseStorage(PROFILE_KEY, null), []);
  const welcomeName = storedProfile?.username || 'campeão';

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(() => buildInitialMessages(welcomeName));
  const [conversationHistory, setConversationHistory] = useState(() => parseStorage(CHAT_HISTORY_KEY, []));
  const [chatContext, setChatContext] = useState(() => parseStorage(CHAT_CONTEXT_KEY, { onboarding_complete: false }));

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  useEffect(() => {
    localStorage.setItem(CHAT_CONTEXT_KEY, JSON.stringify(chatContext));
  }, [chatContext]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const buildUserContext = () => {
    const preferences = chatContext?.preferences || {};

    return {
      ...(storedProfile || {}),
      ...preferences,
      is_first_time: !chatContext?.onboarding_complete,
      new_liked_ingredients: chatContext?.new_liked_ingredients || [],
      requested_extra_ingredients: chatContext?.requested_extra_ingredients || [],
    };
  };

  const handleClearChat = () => {
    setMessages([buildWelcomeMessage(welcomeName)]);
    setConversationHistory([]);
    setInput('');
    setError('');
    localStorage.removeItem(CHAT_MESSAGES_KEY);
    localStorage.removeItem(CHAT_HISTORY_KEY);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const content = input.trim();
    if (!content || isSending) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      text: content,
    };

    const nextHistory = [...conversationHistory, { role: 'user', content }];

    setInput('');
    setError('');
    setIsSending(true);
    setMessages((previous) => [...previous, userMessage]);
    setConversationHistory(nextHistory);

    try {
      const shouldUseOnboarding = !chatContext?.onboarding_complete;
      const userId = storedProfile?.username || 'anonymous';

      const response = shouldUseOnboarding
        ? await sendOnboardingMessage({
            message: content,
            userId,
            conversationHistory: nextHistory,
          })
        : await sendAssistantMessage({
            message: content,
            userId,
            conversationHistory: nextHistory,
            userContext: buildUserContext(),
          });

      const botText = response?.response || 'Não consegui gerar resposta agora.';
      const botMessage = {
        id: Date.now() + 1,
        role: 'bot',
        text: botText,
      };

      setMessages((previous) => [...previous, botMessage]);
      setConversationHistory((previous) => [...previous, { role: 'assistant', content: botText }]);

      if (shouldUseOnboarding && response?.onboarding_complete) {
        const updatedPreferences = response?.extracted_preferences || {};
        setChatContext((previous) => ({
          ...previous,
          onboarding_complete: true,
          preferences: updatedPreferences,
        }));
      }

      if (response?.meal_plan_draft) {
        setChatContext((previous) => ({
          ...previous,
          meal_plan_draft: response.meal_plan_draft,
        }));
      }
    } catch (apiError) {
      setError(apiError.message || 'Falha ao comunicar com o NutriBot.');
    } finally {
      setIsSending(false);
    }
  };

  if (location.pathname === '/welcome-bot' || location.pathname === '/login') {
    return null;
  }

  return (
    <div className="chat-widget">
      {isOpen && (
        <section
          className={`chat-panel ${!chatContext?.onboarding_complete ? 'onboarding' : ''}`}
          aria-label="Chat bot"
        >
          <header className="chat-header">
            <div>
              <h3>NutriBot</h3>
              <p>
                {!chatContext?.onboarding_complete
                  ? 'Modo onboarding ativo'
                  : 'Companheiro nutricional'}
              </p>
            </div>
            <div className="chat-header-actions">
              <button
                type="button"
                className="chat-clear"
                onClick={handleClearChat}
                aria-label="Limpar chat"
                title="Limpar chat"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                className="chat-close"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar chat"
              >
                <X size={16} />
              </button>
            </div>
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

            {isSending && <div className="chat-message bot is-typing">A escrever...</div>}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="chat-error">{error}</p>}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(inputEvent) => setInput(inputEvent.target.value)}
              placeholder="Escreve a tua mensagem..."
              disabled={isSending}
            />
            <button type="submit" disabled={!canSend} aria-label="Enviar mensagem">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

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
