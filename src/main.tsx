import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SquircleNoScript } from '@squircle-js/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SquircleNoScript />
    <App />
  </StrictMode>,
)
