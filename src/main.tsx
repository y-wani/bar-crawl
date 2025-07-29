import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './theme/theme.css'
import { ThemeProvider } from './theme/context'
import { AuthProvider } from './context/AuthContext'
import ThreeBackground from './components/ThreeBackground'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ThreeBackground />
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
