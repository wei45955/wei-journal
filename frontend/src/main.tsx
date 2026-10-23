import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import './styles/app.css'
import './i18n'
import App from './App'
import { preventPageZoom } from './lib/gestures'
import { followSystemTheme } from './lib/theme'

const container = document.getElementById('root')
if (!container) throw new Error('the root element is missing')

preventPageZoom()
followSystemTheme()

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
