import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { preventPageZoom } from './lib/gestures'
import './i18n'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('the root element is missing')

preventPageZoom()

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
