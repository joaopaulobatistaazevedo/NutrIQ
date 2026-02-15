import { getAuthSession } from '../utils/authSession';
import { createJsonClient } from './httpClient';

const API_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:8000';
const BOT_COOKIE_KEY = 'nutriq_bot_uid';
const BOT_COOKIE_TTL_DAYS = 365;

const client = createJsonClient(API_BASE_URL, 20000);

const mapHistory = (messages = []) =>
  messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }));

const buildAuthHeaders = () => {
  const token = String(getAuthSession()?.token || '').trim();
  if (!token) {
    throw new Error('Sessão inválida ou expirada. Inicia sessão novamente para gerar e guardar o plano.');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

const normalizeError = (error) => {
  if (error?.response?.data?.detail) {
    return error.response.data.detail;
  }

  if (error?.message) {
    return error.message;
  }

  return 'Não foi possível contactar o NutriBot agora.';
};

const randomSegment = () => Math.random().toString(36).slice(2, 10);

const getCookie = (name) => {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  const key = `${name}=`;
  const found = cookies.find((cookie) => cookie.startsWith(key));
  return found ? decodeURIComponent(found.slice(key.length)) : '';
};

const setCookie = (name, value, days) => {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
};

const resolveDurableUserId = (userId) => {
  const fromParam = String(userId || '').trim();
  if (fromParam) {
    setCookie(BOT_COOKIE_KEY, fromParam, BOT_COOKIE_TTL_DAYS);
    return fromParam;
  }

  const fromCookie = String(getCookie(BOT_COOKIE_KEY) || '').trim();
  if (fromCookie) {
    return fromCookie;
  }

  const generated = `guest_${Date.now()}_${randomSegment()}`;
  setCookie(BOT_COOKIE_KEY, generated, BOT_COOKIE_TTL_DAYS);
  return generated;
};

export async function sendOnboardingMessage({ message, userId, conversationHistory = [] }) {
  try {
    const durableUserId = resolveDurableUserId(userId);
    const { data } = await client.post('/chat/onboarding', {
      message,
      user_id: durableUserId,
      conversation_history: mapHistory(conversationHistory),
    }, {
      headers: buildAuthHeaders(),
    });

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function sendAssistantMessage({
  message,
  userId,
  conversationHistory = [],
  userContext = null,
}) {
  try {
    const durableUserId = resolveDurableUserId(userId);
    const { data } = await client.post('/chat/assistant', {
      message,
      user_id: durableUserId,
      conversation_history: mapHistory(conversationHistory),
      user_context: userContext,
    }, {
      headers: buildAuthHeaders(),
    });

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function generateShoppingCartFromMealPlan(mealPlan = null) {
  const payload = mealPlan && typeof mealPlan === 'object'
    ? { meal_plan: mealPlan }
    : {};

  const requestConfig = {
    headers: buildAuthHeaders(),
    timeout: 600000,
  };

  try {
    const { data } = await client.post('/chat/shopping-cart/generate', payload, requestConfig);
    return data;
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 404 || status === 405) {
      try {
        const { data } = await client.post('/shopping-cart/generate', payload, requestConfig);
        return data;
      } catch (fallbackError) {
        throw new Error(normalizeError(fallbackError));
      }
    }

    throw new Error(normalizeError(error));
  }
}

export async function analyzeFoodImage({ imageBase64, mimeType = 'image/jpeg', userMessage = '' }) {
  try {
    const { data } = await client.post('/chat/analyze-food-image', {
      image_base64: imageBase64,
      mime_type: mimeType,
      user_message: userMessage,
    }, {
      headers: buildAuthHeaders(),
    });

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
