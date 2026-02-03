import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { StreamCounter } from '../components/StreamCounter'
import { useSimulatedStream } from '../hooks/useSimulatedStream'
import { useYellowChannel } from '../hooks/useYellowChannel'
import './Employee.css'

interface IncomeStream {
    id: string
    employer: string
    rate: number
    accumulated: number
    channelCapacity: number
    lastClaim: Date
    isActive: boolean
}

export function Employee() {
    const { isConnected, address } = useAccount()
    // Connect to real Yellow Network
    const { channels, isConnected: isYellowConnected, balance: ledgerBalance } = useYellowChannel()

    // Map real channels to UI format
    // Note: In yellowService, 'employer' is always 'me', 'employee' is counterparty.
    // So for Employee view, 'employer' (Me) is the recipient, 'employee' (Counterparty) is the Payer.
    const realStreams: IncomeStream[] = channels.map(ch => ({
        id: ch.id,
        employer: ch.employee.slice(0, 10) + '...', // Counterparty is the payer
        rate: Number(ch.ratePerMinute) / 1_000_000,
        // Use total ledger balance as the accumulated amount for the demo (assuming single stream)
        // This reflects real-time L2 payments received via "bu" updates
        accumulated: Number(ledgerBalance) / 1_000_000,
        channelCapacity: Number(ch.totalDeposit) / 1_000_000,
        lastClaim: ch.lastUpdate,
        isActive: ch.status === 'open'
    }))

    // Fallback to demo streams if not connected or no channels
    const streams = (isConnected && realStreams.length > 0) ? realStreams : [
        {
            id: '1',
            employer: 'nexus.eth',
            rate: 0.75,
            accumulated: 1847.32,
            channelCapacity: 3000,
            lastClaim: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            isActive: true,
        },
    ]

    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const { start, pause, resume } = useSimulatedStream(0, 0) // Just helpers

    const mainStream = streams[0]
    const isRealStream = isConnected && realStreams.length > 0
    const balance = mainStream?.accumulated || 0
    const isStreaming = mainStream?.isActive

    // ... (rest of component) ...

    const handleWithdraw = async (type: 'wallet' | 'bank') => {
        setIsWithdrawing(true)
        // For real channels, we would call yellowService.closeChannel or partial withdraw
        if (isRealStream) {
            // Placeholder for partial withdraw logic
            console.log('Withdrawing from channel', mainStream.id)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))

        alert(`Withdrawal of $${balance.toFixed(2)} to ${type === 'wallet' ? 'your wallet' : 'your bank account'} initiated!`)
        setIsWithdrawing(false)
    }

    const totalEarned = balance // Simplified for now
    const daysSinceWithdrawal = 0 // Simplified

    if (!isConnected) {
        return (
            <div className="employee-page">
                <div className="connect-prompt card">
                    <h2>Connect Wallet</h2>
                    <p className="text-secondary mt-md mb-lg">
                        Connect to view your streaming salary and withdraw earnings.
                    </p>
                    <ConnectButton />

                    {/* Demo mode for non-connected users */}
                    <div className="demo-divider">
                        <span>or</span>
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick={() => {
                            // Navigate to demo view without wallet
                            window.location.hash = '#demo'
                            window.location.reload()
                        }}
                    >
                        View Demo
                    </button>
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
                <div className="yellow-status">
                    <span className="status-dot active"></span>
                    <span>Yellow Network</span>
                </div>
            </header>

            <section className="earnings-overview">
                <div className="main-balance card">
                    <div className="balance-label">Available to Withdraw</div>
                    <StreamCounter amount={balance} />
                    <div className="stream-info">
                        <span className={`status-dot ${isStreaming ? 'active' : 'inactive'}`}></span>
                        <span>
                            {isStreaming
                                ? `Streaming at $${streams[0]?.rate}/min from ${streams[0]?.employer}`
                                : 'Stream paused'
                            }
                        </span>
                    </div>
                    <div className="balance-actions">
                        <button
                            className="btn btn-secondary btn-lg"
                            onClick={() => handleWithdraw('wallet')}
                            disabled={isWithdrawing}
                        >
                            {isWithdrawing ? 'Processing...' : 'Withdraw to Wallet'}
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={() => handleWithdraw('bank')}
                            disabled={isWithdrawing}
                        >
                            {isWithdrawing ? 'Processing...' : 'Offramp to Bank'}
                        </button>
                    </div>
                    <p className="offramp-note">
                        Powered by Circle Arc Bridge Kit
                    </p>
                </div>

                <div className="stats-grid">
                    <div className="stat-card card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-content">
                            <span className="stat-value">${totalEarned.toFixed(2)}</span>
                            <span className="stat-label">Total Earned (All Time)</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">⚡</div>
                        <div className="stat-content">
                            <span className="stat-value">${streams[0]?.rate}/min</span>
                            <span className="stat-label">Current Rate</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">📅</div>
                        <div className="stat-content">
                            <span className="stat-value">{daysSinceWithdrawal} days</span>
                            <span className="stat-label">Since Last Withdrawal</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="income-streams">
                <h3>Active Income Streams</h3>
                <div className="streams-list">
                    {streams.map((stream) => (
                        <div key={stream.id} className="stream-item card">
                            <div className="stream-header">
                                <div className="stream-employer">
                                    <span className={`status-dot ${stream.isActive ? 'active' : 'inactive'}`}></span>
                                    <span className="employer-name">{stream.employer}</span>
                                </div>
                                <span className="stream-rate">${stream.rate}/min</span>
                            </div>
                            <div className="stream-details">
                                <div className="stream-stat">
                                    <span className="label">Accumulated</span>
                                    <span className="value">${stream.accumulated.toFixed(2)}</span>
                                </div>
                                <div className="stream-stat">
                                    <span className="label">Last Claim</span>
                                    <span className="value">{stream.lastClaim.toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div className="stream-progress">
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(stream.accumulated / stream.channelCapacity) * 100}%` }}
                                    />
                                </div>
                                <span className="progress-label">${stream.channelCapacity.toLocaleString()} channel capacity</span>
                            </div>
                            <div className="stream-actions">
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => isStreaming ? pause() : resume()}
                                >
                                    {isStreaming ? '⏸️ View Only' : '▶️ Resume View'}
                                </button>
                                <button className="btn btn-secondary btn-sm">
                                    Partial Withdraw
                                </button>
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
                            <span className="activity-title">Withdrawal to bank (via Circle)</span>
                            <span className="activity-meta">Jan 25, 2026 • $1,200.00 → Bank Account</span>
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
                    <div className="activity-item">
                        <div className="activity-icon">✅</div>
                        <div className="activity-content">
                            <span className="activity-title">ENS profile linked</span>
                            <span className="activity-meta">Dec 28, 2025 • maria.nexus.eth</span>
                        </div>
                        <span className="activity-status success">Verified</span>
                    </div>
                </div>
            </section>

            {/* ENS Profile Section */}
            <section className="ens-profile card mt-xl">
                <h3>🔗 Your ENS Profile</h3>
                <div className="ens-details">
                    <div className="ens-name">
                        <span className="label">Payment Address</span>
                        <span className="value">maria.nexus.eth</span>
                    </div>
                    <div className="ens-records">
                        <div className="record">
                            <span className="record-key">Preferred Asset:</span>
                            <span className="record-value">USDC</span>
                        </div>
                        <div className="record">
                            <span className="record-key">Payment Schedule:</span>
                            <span className="record-value">Per Minute</span>
                        </div>
                        <div className="record">
                            <span className="record-key">Wallet:</span>
                            <span className="record-value font-mono">{address?.slice(0, 10)}...{address?.slice(-8)}</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
