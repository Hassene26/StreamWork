import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Employer } from './pages/Employer'
import { Employee } from './pages/Employee'
import { Header } from './components/Header'
import { validateEnv } from './config/env'

// Validate environment on app load
validateEnv()

function App() {
    return (
        <BrowserRouter>
            <div className="app">
                <Header />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/employer" element={<Employer />} />
                        <Route path="/employee" element={<Employee />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}

export default App
