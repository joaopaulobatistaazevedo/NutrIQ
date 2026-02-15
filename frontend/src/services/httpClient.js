import axios from 'axios';

const DEFAULT_JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

export function createJsonClient(baseURL, timeout = 15000) {
  return axios.create({
    baseURL,
    timeout,
    headers: DEFAULT_JSON_HEADERS,
  });
}

export function withDefaultHeaders(headers = {}) {
  return {
    ...DEFAULT_JSON_HEADERS,
    ...headers,
  };
}
