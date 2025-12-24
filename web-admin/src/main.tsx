import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const shouldUseStrictMode = import.meta.env.MODE === 'production'

createRoot(document.getElementById('root')!).render(
  shouldUseStrictMode ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
)
