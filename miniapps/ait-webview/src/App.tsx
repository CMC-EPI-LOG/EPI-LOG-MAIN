import './App.css'
import Home from './pages/Home'
import LoggerInit from './components/LoggerInit'
import { Toaster } from 'react-hot-toast'

function App() {
  return (
    <>
      <LoggerInit />
      <Home />
      <Toaster position="top-center" reverseOrder={false} />
    </>
  )
}

export default App
