import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, HeartHandshake, Trash2 } from 'lucide-react';
import { sendAssistantMessage, sendOnboardingMessage } from '../services/chatbotService';
import {
  CHAT_CONTEXT_KEY,
  CHAT_HISTORY_KEY,
  CHAT_MESSAGES_KEY,
  PROFILE_KEY,
  WEEKLY_PLAN_KEY,
} from '../constants/storageKeys';
import '../styles/chatbot.css';

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

const normalizeSex = (sex) => String(sex || '').trim().toLowerCase();

const getWelcomeText = (name, sex) => {
  const normalizedSex = normalizeSex(sex);

  if (normalizedSex === 'masculino') {
    return `Olá ${name}! Bem-vindo. Eu sou o NutriBot, pronto para te ajudar com alimentação e meal planning.`;
  }

  if (normalizedSex === 'feminino') {
    return `Olá ${name}! Bem-vinda. Eu sou o NutriBot, pronto para te ajudar com alimentação e meal planning.`;
  }

  if (normalizedSex === 'outro') {
    return `Olá ${name}! Boas-vindas. Eu sou o NutriBot, pronto para te ajudar com alimentação e meal planning.`;
  }

  return `Olá ${name}! Eu sou o NutriBot, pronto para te ajudar com alimentação e meal planning.`;
};

const buildWelcomeMessage = (name, sex) => ({
  id: Date.now(),
  role: 'bot',
  text: getWelcomeText(name, sex),
});

const toUiMessage = (item) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  role: item.role === 'user' ? 'user' : 'bot',
  text: item.content,
});

const resolveAccountId = (profile) => {
  const username = String(profile?.username || '').trim().toLowerCase();
  if (!username) {
    return 'anonymous';
  }
  return username.replace(/\s+/g, '_');
};

const scopedKey = (base, accountId) => `${base}:${accountId}`;

const buildInitialMessages = ({ welcomeName, welcomeSex, accountId }) => {
  const storedMessages = parseStorage(scopedKey(CHAT_MESSAGES_KEY, accountId), []);
  if (Array.isArray(storedMessages) && storedMessages.length > 0) {
    return storedMessages;
  }

  const storedHistory = parseStorage(scopedKey(CHAT_HISTORY_KEY, accountId), []);
  if (Array.isArray(storedHistory) && storedHistory.length > 0) {
    return storedHistory.map(toUiMessage);
  }

  return [buildWelcomeMessage(welcomeName, welcomeSex)];
};

const mapAddressStyle = (sex) => {
  const normalizedSex = normalizeSex(sex);
  if (normalizedSex === 'masculino') {
    return 'masculino';
  }
  if (normalizedSex === 'feminino') {
    return 'feminino';
  }
  if (normalizedSex === 'outro') {
    return 'neutro';
  }
  return null;
};

export default function ChatWidget() {
  const location = useLocation();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [activeProfile, setActiveProfile] = useState(() => parseStorage(PROFILE_KEY, null));

  useEffect(() => {
    setActiveProfile(parseStorage(PROFILE_KEY, null));
  }, [location.pathname]);

  const accountId = useMemo(() => resolveAccountId(activeProfile), [activeProfile]);
  const welcomeName = activeProfile?.username || 'campeão';
  const welcomeSex = activeProfile?.sex || '';

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(() =>
    buildInitialMessages({ welcomeName, welcomeSex, accountId })
  );
  const [conversationHistory, setConversationHistory] = useState(() =>
    parseStorage(scopedKey(CHAT_HISTORY_KEY, accountId), [])
  );
  const [chatContext, setChatContext] = useState(() =>
    parseStorage(scopedKey(CHAT_CONTEXT_KEY, accountId), { onboarding_complete: false })
  );

  useEffect(() => {
    setMessages(buildInitialMessages({ welcomeName, welcomeSex, accountId }));
    setConversationHistory(parseStorage(scopedKey(CHAT_HISTORY_KEY, accountId), []));
    setChatContext(parseStorage(scopedKey(CHAT_CONTEXT_KEY, accountId), { onboarding_complete: false }));
    setInput('');
    setError('');
    setIsSending(false);
  }, [accountId, welcomeName, welcomeSex]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    localStorage.setItem(scopedKey(CHAT_MESSAGES_KEY, accountId), JSON.stringify(messages));
  }, [messages, accountId]);

  useEffect(() => {
    localStorage.setItem(scopedKey(CHAT_HISTORY_KEY, accountId), JSON.stringify(conversationHistory));
  }, [conversationHistory, accountId]);

  useEffect(() => {
    localStorage.setItem(scopedKey(CHAT_CONTEXT_KEY, accountId), JSON.stringify(chatContext));
  }, [chatContext, accountId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const onMealEditRequest = (event) => {
      const detail = event?.detail || {};
      if (detail.accountId && detail.accountId !== accountId) {
        return;
      }

      const contextNote = detail.day_label && detail.slot
        ? ` (${detail.day_label} • ${detail.slot})`
        : '';

      setIsOpen(true);
      setError('');
      setInput('');
      setChatContext((previous) => ({
        ...previous,
        pending_edit_request: detail,
      }));
      setMessages((previous) => ([
        ...previous,
        {
          id: Date.now(),
          role: 'bot',
          text: `O que pretende editar no Plano Alimentar?${contextNote}`,
        },
      ]));

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    };

    window.addEventListener('nutribot:meal-edit-request', onMealEditRequest);
    return () => window.removeEventListener('nutribot:meal-edit-request', onMealEditRequest);
  }, [accountId]);

  const buildUserContext = () => {
    const preferences = chatContext?.preferences || {};
    const weeklyPlan = parseStorage(scopedKey(WEEKLY_PLAN_KEY, accountId), null);

    return {
      ...(activeProfile || {}),
      ...preferences,
      address_style: mapAddressStyle(activeProfile?.sex),
      is_first_time: !chatContext?.onboarding_complete,
      new_liked_ingredients: chatContext?.new_liked_ingredients || [],
      requested_extra_ingredients: chatContext?.requested_extra_ingredients || [],
      pending_edit_request: chatContext?.pending_edit_request || null,
      weekly_plan: weeklyPlan,
    };
  };

  const handleClearChat = () => {
    setMessages([buildWelcomeMessage(welcomeName, welcomeSex)]);
    setConversationHistory([]);
    setChatContext({ onboarding_complete: false });
    setInput('');
    setError('');
    localStorage.removeItem(scopedKey(CHAT_MESSAGES_KEY, accountId));
    localStorage.removeItem(scopedKey(CHAT_HISTORY_KEY, accountId));
    localStorage.removeItem(scopedKey(CHAT_CONTEXT_KEY, accountId));
    localStorage.removeItem(scopedKey(WEEKLY_PLAN_KEY, accountId));
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
      const userId = activeProfile?.username || accountId || 'anonymous';

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

      if (response?.meal_plan) {
        localStorage.setItem(scopedKey(WEEKLY_PLAN_KEY, accountId), JSON.stringify(response.meal_plan));
        window.dispatchEvent(
          new CustomEvent('nutribot:weekly-plan-updated', { detail: { accountId } })
        );
      }

      setChatContext((previous) => ({
        ...previous,
        pending_edit_request: null,
      }));
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
              ref={inputRef}
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
