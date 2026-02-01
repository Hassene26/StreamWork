import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { StreamCounter } from '../components/StreamCounter'
import './Employee.css'

interface Earning {
    employer: string
    rate: number
    accumulated: number
    lastClaim: Date
}

export function Employee() {
    const { isConnected } = useAccount()
    const [earnings] = useState<Earning[]>([
        {
            employer: 'nexus.eth',
            rate: 0.75,
            accumulated: 1847.32,
            lastClaim: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
    ])
    const [totalEarnings, setTotalEarnings] = useState(1847.32)

    // Simulate real-time streaming
    useEffect(() => {
        const interval = setInterval(() => {
            setTotalEarnings((prev) => {
                const increment = 0.75 / 60 // $0.75/min converted to per second
                return prev + increment
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    if (!isConnected) {
        return (
            <div className="employee-page">
                <div className="connect-prompt card">
                    <h2>Connect Wallet</h2>
                    <p className="text-secondary mt-md mb-lg">
                        Connect to view your streaming salary and withdraw earnings.
                    </p>
                    <ConnectButton />
                </div>
            </div>
        )
    }

    return (
        <div className="employee-page">
            <header className="page-header">
                <div>
                    <h1>Employee Dashboard</h1>
                    <p className="text-secondary">Your salary is streaming in real-time</p>
                </div>
            </header>

            <section className="earnings-overview">
                <div className="main-balance card">
                    <div className="balance-label">Available to Withdraw</div>
                    <StreamCounter amount={totalEarnings} />
                    <div className="stream-info">
                        <span className="status-dot active"></span>
                        <span>Streaming at $0.75/min from nexus.eth</span>
                    </div>
                    <div className="balance-actions">
                        <button className="btn btn-secondary btn-lg">
                            Withdraw to Wallet
                        </button>
                        <button className="btn btn-primary btn-lg">
                            Offramp to Bank
                        </button>
                    </div>
                </div>

                <div className="stats-grid">
                    <div className="stat-card card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-content">
                            <span className="stat-value">$4,523.80</span>
                            <span className="stat-label">Total Earned (All Time)</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">⚡</div>
                        <div className="stat-content">
                            <span className="stat-value">$0.75</span>
                            <span className="stat-label">Per Minute Rate</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">📅</div>
                        <div className="stat-content">
                            <span className="stat-value">7 days</span>
                            <span className="stat-label">Since Last Withdrawal</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="income-streams">
                <h3>Active Income Streams</h3>
                <div className="streams-list">
                    {earnings.map((earning, i) => (
                        <div key={i} className="stream-item card">
                            <div className="stream-header">
                                <div className="stream-employer">
                                    <span className="status-dot active"></span>
                                    <span className="employer-name">{earning.employer}</span>
                                </div>
                                <span className="stream-rate">${earning.rate}/min</span>
                            </div>
                            <div className="stream-details">
                                <div className="stream-stat">
                                    <span className="label">Accumulated</span>
                                    <span className="value">${earning.accumulated.toFixed(2)}</span>
                                </div>
                                <div className="stream-stat">
                                    <span className="label">Last Claim</span>
                                    <span className="value">{earning.lastClaim.toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div className="stream-progress">
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(earning.accumulated / 3000) * 100}%` }}
                                    />
                                </div>
                                <span className="progress-label">$3,000 channel capacity</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="recent-activity">
                <h3>Recent Activity</h3>
                <div className="activity-list card">
                    <div className="activity-item">
                        <div className="activity-icon">📤</div>
                        <div className="activity-content">
                            <span className="activity-title">Withdrawal to bank</span>
                            <span className="activity-meta">Jan 25, 2026 • $1,200.00</span>
                        </div>
                        <span className="activity-status success">Completed</span>
                    </div>
                    <div className="activity-item">
                        <div className="activity-icon">🔗</div>
                        <div className="activity-content">
                            <span className="activity-title">Channel opened by nexus.eth</span>
                            <span className="activity-meta">Jan 1, 2026 • $3,000.00 deposit</span>
                        </div>
                        <span className="activity-status success">Active</span>
                    </div>
                </div>
            </section>
        </div>
    )
}
