import { Link, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectButton } from './ConnectButton'

export function Header() {
    const { isConnected } = useAccount()
    const location = useLocation()

    const isActive = (path: string) => location.pathname === path

    return (
        <header className="bg-background-dark/80 backdrop-blur-md border-b border-border-dark sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 group">
                    <div className="w-8 h-8 text-primary group-hover:scale-110 transition-transform">
                        <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <path d="M42.4379 44C42.4379 44 36.0744 33.9038 41.1692 24C46.8624 12.9336 42.2078 4 42.2078 4L7.01134 4C7.01134 4 11.6577 12.932 5.96912 23.9969C0.876273 33.9029 7.27094 44 7.27094 44L42.4379 44Z" fill="currentColor"></path>
                        </svg>
                    </div>
                    <span className="text-xl font-extrabold text-white tracking-tight">StreamWork</span>
                </Link>

                {/* Navigation */}
                <nav className="hidden md:flex items-center gap-1">
                    <Link
                        to="/employer"
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive('/employer')
                                ? 'text-primary bg-primary/10'
                                : 'text-slate-400 hover:text-white hover:bg-border-dark'
                            }`}
                    >
                        Employer
                    </Link>
                    <Link
                        to="/employee"
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive('/employee')
                                ? 'text-primary bg-primary/10'
                                : 'text-slate-400 hover:text-white hover:bg-border-dark'
                            }`}
                    >
                        Employee
                    </Link>
                    <Link
                        to="/settings"
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive('/settings')
                                ? 'text-primary bg-primary/10'
                                : 'text-slate-400 hover:text-white hover:bg-border-dark'
                            }`}
                    >
                        Settings
                    </Link>
                </nav>

                {/* Right Section */}
                <div className="flex items-center gap-4">
                    {isConnected && (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                            <span className="text-xs font-bold text-primary">Connected</span>
                        </div>
                    )}
                    <ConnectButton />
                </div>
            </div>
        </header>
    )
}
