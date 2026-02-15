import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, HeartHandshake, Trash2, Camera, ImagePlus } from 'lucide-react';
import { analyzeFoodImage, sendAssistantMessage, sendOnboardingMessage } from '../services/chatbotService';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import {
  CART_GENERATE_REQUEST_KEY,
  CHAT_CONTEXT_KEY,
  CHAT_HISTORY_KEY,
  CHAT_MESSAGES_KEY,
  PROFILE_KEY,
  WEEKLY_PLAN_KEY,
} from '../constants/storageKeys';
import { resolveAccountId, scopedKey } from '../utils/accountScope';
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

const QUICK_PROMPTS = [
  'Gera o meu plano semanal com o que já sabes sobre mim.',
  'Sugere 3 refeições saudáveis e económicas para hoje.',
  'Analisa as minhas calorias de hoje e diz como melhorar.',
];

const looksLikeOnboardingInput = (text) => {
  const lower = String(text || '').toLowerCase();

  const onboardingTokens = [
    'gosto', 'não gosto', 'nao gosto', 'ingrediente', 'prefer', 'alerg', 'restri',
    'orçamento', 'orcamento', 'euros', 'dias', 'planear',
  ];

  const broadQuestionTokens = [
    'calorias', 'macros', 'proteína', 'proteina', 'hidratos', 'gordura',
    'sono', 'hidratação', 'hidratacao', 'treino', 'saúde', 'saude',
    'plano', 'histórico', 'historico',
  ];

  if (broadQuestionTokens.some((token) => lower.includes(token))) {
    return false;
  }

  const hasOnboardingSignals = onboardingTokens.some((token) => lower.includes(token));
  const hasQuestionShape = lower.includes('?') || lower.startsWith('como ') || lower.startsWith('o que ');

  return hasOnboardingSignals && !hasQuestionShape;
};

export default function ChatWidget() {
  const location = useLocation();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

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
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
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

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending && !isAnalyzingImage,
    [input, isSending, isAnalyzingImage]
  );

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      reader.readAsDataURL(file);
    });

  const resizeImage = (file, maxSize = 1280, quality = 0.82) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem.'));
          return;
        }

        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Não foi possível comprimir a imagem.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          quality,
        );
      };
      image.onerror = () => reject(new Error('Falha ao preparar a imagem para análise.'));
      image.src = URL.createObjectURL(file);
    });

  const formatFoodAnalysisMessage = (payload) => {
    const dish = payload?.dish_name || 'Prato identificado';
    const kcal = Number.isFinite(Number(payload?.estimated_kcal))
      ? `${Math.round(Number(payload.estimated_kcal))} kcal`
      : 'kcal não disponível';
    const rangeMin = Number(payload?.kcal_range?.min);
    const rangeMax = Number(payload?.kcal_range?.max);
    const kcalRange = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
      ? `${Math.round(rangeMin)}–${Math.round(rangeMax)} kcal`
      : null;
    const protein = Number.isFinite(Number(payload?.macros?.protein_g))
      ? Number(payload.macros.protein_g).toFixed(1)
      : '0.0';
    const carbs = Number.isFinite(Number(payload?.macros?.carbs_g))
      ? Number(payload.macros.carbs_g).toFixed(1)
      : '0.0';
    const fat = Number.isFinite(Number(payload?.macros?.fat_g))
      ? Number(payload.macros.fat_g).toFixed(1)
      : '0.0';

    const warnings = Array.isArray(payload?.warnings) && payload.warnings.length
      ? `\n⚠️ ${payload.warnings[0]}`
      : '';
    const confidence = String(payload?.confidence || '').trim();
    const confidenceLabel = confidence
      ? `${confidence === 'high' ? 'alta' : confidence === 'medium' ? 'média' : 'baixa'}`
      : '';
    const portion = String(payload?.portion_description || '').trim();
    const firstTip = Array.isArray(payload?.tips) && payload.tips.length ? payload.tips[0] : '';

    return [
      `📸 ${dish}`,
      `Porção estimada: ${portion || '1 prato médio'}`,
      `Calorias: ${kcal}${kcalRange ? ` (faixa ${kcalRange})` : ''}`,
      `Macros: proteína ${protein}g • hidratos ${carbs}g • gordura ${fat}g`,
      confidenceLabel ? `Confiança: ${confidenceLabel}` : '',
      firstTip ? `Dica: ${firstTip}` : '',
      warnings.replace(/^\n/, ''),
    ].filter(Boolean).join('\n');
  };

  const analyzeImageFile = async (file, source = 'foto') => {
    if (!file || isSending || isAnalyzingImage) {
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setError('Seleciona uma imagem válida de comida.');
      return;
    }

    setError('');
    setIsAnalyzingImage(true);

    const userContextMessage = {
      id: Date.now(),
      role: 'user',
      text: `📷 Enviei uma ${source} de comida para análise nutricional.`,
    };
    setMessages((previous) => [...previous, userContextMessage]);
    setConversationHistory((previous) => [
      ...previous,
      { role: 'user', content: `Enviei uma ${source} de comida para análise nutricional.` },
    ]);

    try {
      const resizedBlob = await resizeImage(file);
      const base64 = await fileToBase64(resizedBlob);
      const response = await analyzeFoodImage({
        imageBase64: base64,
        mimeType: 'image/jpeg',
        userMessage: 'Analisa este prato e estima calorias e macros.',
      });

      const botText = response?.status === 'ok'
        ? formatFoodAnalysisMessage(response)
        : response?.message || 'Não consegui analisar a imagem de forma fiável.';

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: 'bot',
          text: botText,
        },
      ]);
      setConversationHistory((previous) => [
        ...previous,
        { role: 'assistant', content: botText },
      ]);
    } catch (analysisError) {
      setError(analysisError.message || 'Falha ao analisar imagem.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleImageAnalysis = async (event) => {
    const file = event.target?.files?.[0];
    event.target.value = '';
    await analyzeImageFile(file, 'foto');
  };

  const stopCamera = () => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const openCamera = async () => {
    if (isSending || isAnalyzingImage) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não suporta acesso direto à câmara.');
      return;
    }

    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setError('Não foi possível aceder à câmara. Verifica permissões do navegador.');
    }
  };

  const captureFromCamera = async () => {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setCameraError('A câmara ainda não está pronta. Tenta novamente.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('Não foi possível capturar a imagem da câmara.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) {
      setCameraError('Não foi possível converter a captura da câmara.');
      return;
    }

    stopCamera();
    setIsCameraOpen(false);
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await analyzeImageFile(file, 'captura da câmara');
  };

  const closeCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setCameraError('');
  };

  useEffect(() => {
    if (!isCameraOpen) {
      return;
    }
    const video = cameraVideoRef.current;
    if (video && cameraStreamRef.current) {
      video.srcObject = cameraStreamRef.current;
      void video.play().catch(() => {
        setCameraError('Não foi possível iniciar o preview da câmara.');
      });
    }
  }, [isCameraOpen]);

  useEffect(() => {
    if (!isOpen && isCameraOpen) {
      closeCamera();
    }
  }, [isOpen, isCameraOpen]);

  useEffect(() => () => {
    stopCamera();
  }, []);

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
    if (!isOpen || isSending || isAnalyzingImage || isCameraOpen) {
      return;
    }

    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(id);
  }, [isOpen, isSending, isAnalyzingImage, isCameraOpen, messages.length]);

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


  useEffect(() => {
    const onOpenChat = (event) => {
      const detail = event?.detail || {};
      if (detail.accountId && detail.accountId !== accountId) {
        return;
      }

      setIsOpen(true);
      setError('');

      if (typeof detail.seedMessage === 'string' && detail.seedMessage.trim()) {
        setInput(detail.seedMessage.trim());
      }

      requestAnimationFrame(() => {
        if (detail.focusInput !== false) {
          inputRef.current?.focus();
        }
      });
    };

    window.addEventListener('nutribot:open-chat', onOpenChat);
    return () => window.removeEventListener('nutribot:open-chat', onOpenChat);
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

  const sendMessageContent = async (content) => {
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent || isSending || isAnalyzingImage) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      text: normalizedContent,
    };

    const nextHistory = [...conversationHistory, { role: 'user', content: normalizedContent }];

    setInput('');
    setError('');
    setIsSending(true);
    setMessages((previous) => [...previous, userMessage]);
    setConversationHistory(nextHistory);

    try {
      const persistShoppingCart = (cartPayload) => {
        if (!cartPayload || typeof cartPayload !== 'object') {
          return;
        }

        localStorage.setItem(CART_GENERATE_REQUEST_KEY, String(Date.now()));
        window.dispatchEvent(
          new CustomEvent('nutribot:shopping-cart-updated', {
            detail: {
              accountId,
              shoppingCart: cartPayload,
            },
          }),
        );
      };

      const persistPlan = async (planPayload) => {
        if (!planPayload) {
          return;
        }

        let planToStore = planPayload;

        try {
          const backendPlan = await fetchActiveMealPlan();
          if (backendPlan) {
            planToStore = backendPlan;
          }
        } catch {
        }

        localStorage.setItem(scopedKey(WEEKLY_PLAN_KEY, accountId), JSON.stringify(planToStore));
        window.dispatchEvent(
          new CustomEvent('nutribot:weekly-plan-updated', { detail: { accountId } })
        );
      };

      const shouldUseOnboarding =
        !chatContext?.onboarding_complete
        && conversationHistory.length < 6
        && looksLikeOnboardingInput(normalizedContent);
      const userId = activeProfile?.username || accountId || 'anonymous';

      const response = shouldUseOnboarding
        ? await sendOnboardingMessage({
            message: normalizedContent,
            userId,
            conversationHistory: nextHistory,
          })
        : await sendAssistantMessage({
            message: normalizedContent,
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

      if (
        shouldUseOnboarding
        && response?.onboarding_complete
        && response?.meal_plan_persisted !== true
      ) {
        const updatedPreferences = response?.extracted_preferences || {};

        setChatContext((previous) => ({
          ...previous,
          onboarding_complete: true,
          preferences: updatedPreferences,
        }));

        const autoPlanPrompt =
          'Com base no meu onboarding, gera agora o meu plano semanal de refeições.';
        const autoHistory = [
          ...nextHistory,
          { role: 'assistant', content: botText },
          { role: 'user', content: autoPlanPrompt },
        ];

        const autoPlanResponse = await sendAssistantMessage({
          message: autoPlanPrompt,
          userId,
          conversationHistory: autoHistory,
          userContext: {
            ...buildUserContext(),
            ...updatedPreferences,
            is_first_time: false,
          },
        });

        const autoBotText = autoPlanResponse?.response || '';
        if (autoBotText) {
          setMessages((previous) => [
            ...previous,
            {
              id: Date.now() + 2,
              role: 'bot',
              text: autoBotText,
            },
          ]);
          setConversationHistory((previous) => [
            ...previous,
            { role: 'user', content: autoPlanPrompt },
            { role: 'assistant', content: autoBotText },
          ]);
        }

        if (autoPlanResponse?.meal_plan_draft) {
          setChatContext((previous) => ({
            ...previous,
            meal_plan_draft: autoPlanResponse.meal_plan_draft,
          }));
        }

        if (autoPlanResponse?.meal_plan_persisted !== false) {
          await persistPlan(autoPlanResponse?.meal_plan);
        }
        persistShoppingCart(autoPlanResponse?.shopping_cart);
      }

      if (response?.meal_plan_draft) {
        setChatContext((previous) => ({
          ...previous,
          meal_plan_draft: response.meal_plan_draft,
        }));
      }

      if (response?.meal_plan_persisted !== false) {
        await persistPlan(response?.meal_plan);
      }
      persistShoppingCart(response?.shopping_cart);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessageContent(input);
  };

  const handleQuickPrompt = async (prompt) => {
    await sendMessageContent(prompt);
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

          {!chatContext?.onboarding_complete && conversationHistory.length === 0 && (
            <div className="chat-helper-banner">
              <strong>Começa por aqui:</strong> diz-me o que gostas de comer e quantos dias queres planear.
            </div>
          )}

          <div className="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message ${message.role === 'user' ? 'user' : 'bot'}`}
              >
                {message.text}
              </div>
            ))}

            {(isSending || isAnalyzingImage) && (
              <div className="chat-message bot is-typing">
                {isAnalyzingImage ? 'A analisar imagem...' : 'A escrever...'}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="chat-error">{error}</p>}

          <div className="chat-quick-prompts" aria-label="Sugestões rápidas">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chat-quick-prompt-btn"
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isSending || isAnalyzingImage}
              >
                {prompt}
              </button>
            ))}
          </div>

          {isCameraOpen && (
            <div className="chat-camera-overlay" role="dialog" aria-label="Captura de câmara">
              <div className="chat-camera-card">
                <video ref={cameraVideoRef} className="chat-camera-video" autoPlay playsInline muted />
                {cameraError ? <p className="chat-camera-error">{cameraError}</p> : null}
                <div className="chat-camera-actions">
                  <button type="button" className="chat-camera-cancel" onClick={closeCamera}>
                    Cancelar
                  </button>
                  <button type="button" className="chat-camera-capture" onClick={captureFromCamera}>
                    Capturar
                  </button>
                </div>
              </div>
            </div>
          )}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageAnalysis}
              className="chat-image-input"
              aria-label="Enviar imagem de comida"
            />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(inputEvent) => setInput(inputEvent.target.value)}
              placeholder="Escreve a tua mensagem..."
              disabled={isSending || isAnalyzingImage}
            />
            <button
              type="button"
              className="chat-upload-btn"
              onClick={() => imageInputRef.current?.click()}
              disabled={isSending || isAnalyzingImage}
              aria-label="Enviar imagem"
              title="Escolher imagem para análise nutricional"
            >
              <ImagePlus size={16} />
            </button>
            <button
              type="button"
              className="chat-upload-btn"
              onClick={openCamera}
              disabled={isSending || isAnalyzingImage}
              aria-label="Abrir câmara"
              title="Abrir câmara para análise nutricional"
            >
              <Camera size={16} />
            </button>
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
