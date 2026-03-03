import './App.css'
import Home from './pages/Home'
import LoggerInit from './components/LoggerInit'
import { Toaster } from 'react-hot-toast'
import AnalyticsBootstrap from './components/AnalyticsBootstrap'

function App() {
  return (
    <>
      <AnalyticsBootstrap />
      <LoggerInit />
      <Home />
      <Toaster position="top-center" reverseOrder={false} />
    </>
  )
}

export default App
