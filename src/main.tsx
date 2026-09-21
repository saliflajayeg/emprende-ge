import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './cloud/auth'
import { BusinessProvider } from './cloud/business'
import Root from './cloud/Root'
import InstallPrompt from './components/InstallPrompt'
import './index.css'

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
