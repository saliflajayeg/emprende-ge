import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './cloud/auth'
import { BusinessProvider } from './cloud/business'
import Root from './cloud/Root'
import InstallPrompt from './components/InstallPrompt'
// Tipografías incluidas en la app (funcionan sin internet)
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'

// Pide al navegador que NO borre los datos guardados en el teléfono aunque falte
// espacio (sin esto, Android puede limpiar el almacenamiento de webs poco usadas).
try { navigator.storage?.persist?.().catch(() => {}) } catch { /* */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <BusinessProvider>
          <Root />
          <InstallPrompt />
        </BusinessProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
