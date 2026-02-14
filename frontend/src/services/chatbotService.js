import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const mapHistory = (messages = []) =>
  messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }));

const normalizeError = (error) => {
  if (error?.response?.data?.detail) {
    return error.response.data.detail;
  }

  if (error?.message) {
    return error.message;
  }

  return 'Não foi possível contactar o NutriBot agora.';
};

export async function sendOnboardingMessage({ message, userId, conversationHistory = [] }) {
  try {
    const { data } = await client.post('/chat/onboarding', {
      message,
      user_id: userId,
      conversation_history: mapHistory(conversationHistory),
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
    const { data } = await client.post('/chat/assistant', {
      message,
      user_id: userId,
      conversation_history: mapHistory(conversationHistory),
      user_context: userContext,
    });

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
