import AppRouter from './routes/AppRouter'
import { ThemeProvider } from './theme/context'
import './App.css'
import './theme/theme.css'

function App() {
  return (
    <ThemeProvider defaultTheme="party">
      <AppRouter />
    </ThemeProvider>
  )
}

export default App
