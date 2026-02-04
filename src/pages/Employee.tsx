import { useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { StreamCounter } from '../components/StreamCounter'
import { useSimulatedStream } from '../hooks/useSimulatedStream'
import { useYellowChannel } from '../hooks/useYellowChannel'
import { useCircleWallet } from '../hooks/useCircleWallet'
import { bridgeService } from '../services/bridge'
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
    const { data: walletClient } = useWalletClient()
    const { isConnected, address } = useAccount()
    // Connect to real Yellow Network
    const { channels, balance: ledgerBalance, closeChannel } = useYellowChannel()
    const {
        walletId,
        address: circleAddress,
        balance: circleBalance,
        login,
        isLoading: isCircleLoading
    } = useCircleWallet()

    // Initialize Bridge
    useEffect(() => {
        if (walletClient) {
            bridgeService.init(walletClient)
        }
    }, [walletClient])

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

    const { pause, resume } = useSimulatedStream(0, 0) // Just helpers

    const mainStream = streams[0]
    const isRealStream = isConnected && realStreams.length > 0
    const balance = mainStream?.accumulated || 0
    const isStreaming = mainStream?.isActive

    // ... (rest of component) ...

    const handleCircleWithdraw = async () => {
        if (!circleAddress) {
            alert('No Circle Wallet connected!')
            return
        }
        if (streams.length === 0) {
            alert('No active stream to withdraw from.')
            return
        }
        if (!isRealStream) {
            alert('Currently in demo mode. Connect Yellow Network to withdraw real funds.')
            return
        }

        const confirm = window.confirm(`Withdraw full balance to Circle Wallet (${circleAddress})?`)
        if (!confirm) return

        // Close channel to Circle Wallet Address
        const mainChannelId = streams[0].id
        const result = await closeChannel(mainChannelId, circleAddress)

        if (result) {
            alert('Withdrawal initiated! Funds will arrive in your Circle Wallet shortly.')
        }
    }

    const handleBridge = async () => {
        if (!circleAddress) {
            alert('No Circle Wallet to bridge from!')
            return
        }
        try {
            // Bridge 10 USDC from Sepolia to Arc
            // Using Circle Wallet Address as destination on Arc (it's the same address for EVM)
            await bridgeService.transferToArc('10', circleAddress)
            alert('Bridge transaction submitted! Funds moving to Arc Testnet.')
        } catch (e: any) {
            console.error(e)
            alert('Bridge failed: ' + e.message)
        }
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
                        {!walletId ? (
                            <button
                                className="btn btn-primary btn-lg google-btn"
                                onClick={login}
                                disabled={isCircleLoading}
                            >
                                {isCircleLoading ? 'Creating...' : (
                                    <span className="flex-center gap-sm">
                                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.032-3.716H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                                            <path d="M3.968 10.705A5.366 5.366 0 0 1 3.682 9c0-.593.102-1.17.286-1.705V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.011-2.332z" fill="#FBBC05" />
                                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963l3.011 2.332C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                                        </svg>
                                        Sign in with Google
                                    </span>
                                )}
                            </button>
                        ) : (
                            <div className="wallet-connected-actions">
                                <div className="circle-balance">
                                    <span className="label">Circle Wallet Balance:</span>
                                    <span className="value">${circleBalance} USDC</span>
                                </div>
                                <button
                                    className="btn btn-success btn-lg"
                                    onClick={handleCircleWithdraw}
                                    disabled={Number(ledgerBalance) === 0}
                                >
                                    Withdraw to Circle
                                </button>
                                <button className="btn btn-secondary" onClick={handleBridge}>
                                    Bridge to Arc
                                </button>
                            </div>
                        )}
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
            </section >

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
        </div >
    )
}
