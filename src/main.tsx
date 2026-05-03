import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { InterfaceKit } from 'interface-kit/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && <InterfaceKit />}
  </StrictMode>,
)
