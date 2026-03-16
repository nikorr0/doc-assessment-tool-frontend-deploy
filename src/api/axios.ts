import axios from "axios";

// Определяем API base URL
// Если VITE_API_BASE установлен при сборке - используем его
// Иначе определяем автоматически: в продакшене используем текущий домен:8060, в разработке localhost:8060
function getApiBase(): string {
  // Если переменная установлена при сборке - используем её
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  
  // В продакшене используем текущий домен с портом 8060
  if (import.meta.env.PROD) {
    // Используем текущий протокол и хост, но меняем порт на 8060
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:8060`;
  }
  
  // В разработке используем localhost
  return "http://localhost:8060";
}

const API_BASE = getApiBase();

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add response/error interceptors here if needed (auth, refresh, logging)