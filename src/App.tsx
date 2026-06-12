import { MotionConfig } from 'framer-motion'
import AppRouter from './routes/AppRouter'
import { Toaster } from './components/Toaster'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppRouter />
      <Toaster />
    </MotionConfig>
  )
}

export default App
