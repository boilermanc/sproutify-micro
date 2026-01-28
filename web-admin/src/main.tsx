import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const shouldUseStrictMode = import.meta.env.MODE === 'production'

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('[SW] Registered:', registration.scope);
      },
      (error) => {
        console.log('[SW] Registration failed:', error);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  shouldUseStrictMode ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
)
