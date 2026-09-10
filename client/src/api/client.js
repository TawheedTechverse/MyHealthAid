import axios from 'axios';

const TOKEN_KEY = 'myhealthaid.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Pull a human-readable string out of an axios error.
 *
 * The value is always a string — callers render it directly as JSX, so we must
 * never hand back an object. Some responses (our own validation errors, and
 * platform-level 404s from Vercel which look like `{ error: { code, message } }`)
 * put an object where we'd expect a string, which previously crashed React with
 * "Objects are not valid as a React child" (minified error #31).
 */
export function errorMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data;
  const candidate =
    (typeof data === 'string' && data) ||
    data?.error?.message ||
    data?.error ||
    data?.message ||
    err?.message ||
    fallback;
  return typeof candidate === 'string' ? candidate : fallback;
}
