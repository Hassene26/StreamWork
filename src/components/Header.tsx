import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectButton } from './ConnectButton'
import './Header.css'

export function Header() {
    const { isConnected } = useAccount()

    return (
        <header className="header">
            <div className="header-content">
                <Link to="/" className="logo">
                    <span className="logo-icon">⚡</span>
                    <span className="logo-text">StreamWork</span>
                </Link>

                <nav className="nav">
                    <Link to="/employer" className="nav-link">Employer</Link>
                    <Link to="/employee" className="nav-link">Employee</Link>
                </nav>

                <div className="header-actions">
                    {isConnected && (
                        <div className="connection-status">
                            <span className="status-dot active"></span>
                            <span className="status-text">Connected</span>
                        </div>
                    )}
                    <ConnectButton />
                </div>
            </div>
        </header>
    )
}
