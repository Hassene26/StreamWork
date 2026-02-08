import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Employer } from './pages/Employer'
import { Employee } from './pages/Employee'
import { Withdrawal } from './pages/Withdrawal'
import { Settings } from './pages/Settings'

import { validateEnv, env } from './config/env'
import { circleService } from './services/circle'

// Validate environment on app load
validateEnv()

// Initialize Circle SDK globally to handle OAuth callbacks
// The SDK must be initialized on every page load to catch OAuth redirects
if (env.circleAppId) {
    console.log('🔐 Initializing Circle SDK globally...')
    circleService.init(env.circleAppId)
}

function App() {
    return (
        <BrowserRouter>
            <div className="app">

                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/employer" element={<Employer />} />
                        <Route path="/employee" element={<Employee />} />
                        <Route path="/withdrawal" element={<Withdrawal />} />
                        <Route path="/settings" element={<Settings />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}

export default App

