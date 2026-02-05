import { useEffect, useState } from 'react'
import { useCircleWallet } from '../hooks/useCircleWallet'
import { useENSProfile } from '../hooks/useENS'
import { BridgeModal } from '../components/BridgeModal'
import { backendApi } from '../api/backend'
import './Employee.css'

export function Employee() {
    const {
        address: circleAddress,
        balance: circleBalance,
        login,
        logout: circleLogout,
        refreshBalance,
        isLoading: isCircleLoading,
        isRestoring: isCircleRestoring,
        isConnected: isCircleConnected,
        error: circleError,
        status: circleStatus,
    } = useCircleWallet()

    // ENS Profile lookup (using Circle address)
    const { profile: ensProfile, isLoading: isLoadingENS } = useENSProfile(circleAddress || null)

    // Transaction status tracking
    const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
    const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false)
    const [copiedAddress, setCopiedAddress] = useState(false)

    // Clear status after 5 seconds
    useEffect(() => {
        if (txStatus) {
            const timer = setTimeout(() => setTxStatus(null), 5000)
            return () => clearTimeout(timer)
        }
    }, [txStatus])

    // Copy address to clipboard
    const copyAddress = async () => {
        if (circleAddress) {
            await navigator.clipboard.writeText(circleAddress)
            setCopiedAddress(true)
            setTimeout(() => setCopiedAddress(false), 2000)
        }
    }

    const handleOpenBridgeModal = () => {
        if (!circleAddress) {
            setTxStatus({ type: 'error', message: 'No Circle Wallet to withdraw from!' })
            return
        }
        setIsBridgeModalOpen(true)
    }

    const handleWithdrawToWallet = async (chain: string, destinationAddress: string, amount: string) => {
        if (!circleAddress) throw new Error('No wallet connected')

        console.log('Withdrawing', amount, 'to', destinationAddress, 'on', chain)
        setTxStatus({ type: 'info', message: 'Registering destination address...' })

        try {
            // Step 1: Add recipient address
            const recipientResponse = await fetch('http://localhost:3000/api/withdraw/add-recipient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chain,
                    address: destinationAddress,
                    currency: 'USD',
                    description: 'StreamWork Withdrawal'
                })
            })

            if (!recipientResponse.ok) {
                const error = await recipientResponse.json()
                throw new Error(error.message || 'Failed to register address')
            }

            const recipient = await recipientResponse.json()
            console.log('Recipient registered:', recipient)

            setTxStatus({ type: 'info', message: 'Initiating transfer...' })

            // Step 2: Create transfer
            const transferResponse = await fetch('http://localhost:3000/api/withdraw/to-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    addressId: recipient.id,
                    amount: amount,
                    currency: 'USD'
                })
            })

            if (!transferResponse.ok) {
                const error = await transferResponse.json()
                throw new Error(error.message || 'Failed to create transfer')
            }

            const transfer = await transferResponse.json()
            console.log('Transfer created:', transfer)

            setTxStatus({ type: 'success', message: `Withdrawal submitted! Transaction ID: ${transfer.id}` })
            setTimeout(() => refreshBalance(), 5000)
        } catch (err: any) {
            console.error('Withdrawal error:', err)
            throw err
        }
    }

    const handleWithdrawToBank = async (amount: string) => {
        if (!circleAddress) throw new Error('No wallet connected')

        console.log('Withdrawing', amount, 'to bank account')
        setTxStatus({ type: 'info', message: 'Processing bank transfer...' })

        try {
            // For demo, use mock bank account ID
            const response = await fetch('http://localhost:3000/api/withdraw/to-bank', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bankAccountId: 'demo-bank-123', // In production, this would be a real bank ID
                    amount: amount,
                    currency: 'USD'
                })
            })

            if (!response.ok) {
                // Fallback to old payout API for demo
                await backendApi.payout(amount, 'bank-account')
            } else {
                const payout = await response.json()
                console.log('Payout created:', payout)
            }

            setTxStatus({ type: 'success', message: 'Bank transfer initiated! Funds will arrive in 1-3 business days.' })
            setTimeout(() => refreshBalance(), 3000)
        } catch (err: any) {
            console.error('Bank withdrawal error:', err)
            // Fallback
            await backendApi.payout(amount, 'bank-account')
            setTxStatus({ type: 'success', message: 'Bank transfer initiated! Funds will arrive in 1-3 business days.' })
        }
    }

    // Not logged in - show login prompt
    if (!isCircleConnected && !isCircleRestoring) {
        return (
            <div className="employee-page">
                <div className="connect-prompt card">
                    <h2>🎯 Employee Dashboard</h2>
                    <p className="text-secondary mt-md mb-lg">
                        Sign in with Google to create your crypto wallet and start receiving payments.
                    </p>
                    <p className="text-secondary mb-lg" style={{ fontSize: '0.9rem' }}>
                        <strong>No crypto knowledge required!</strong> You can withdraw directly to your bank account.
                    </p>

                    <button
                        className="btn btn-primary btn-lg google-btn"
                        onClick={login}
                        disabled={isCircleLoading}
                    >
                        {isCircleLoading ? 'Connecting...' : (
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

                    {circleError && <p className="error-text mt-md">{circleError}</p>}
                    {circleStatus && circleStatus !== 'Ready' && (
                        <p className="text-secondary mt-md" style={{ fontSize: '0.85rem' }}>{circleStatus}</p>
                    )}
                </div>
            </div>
        )
    }

    // Restoring session
    if (isCircleRestoring) {
        return (
            <div className="employee-page">
                <div className="connect-prompt card">
                    <div className="circle-loading">
                        <span className="spinner"></span>
                        <span>Restoring your session...</span>
                    </div>
                </div>
            </div>
        )
    }

    // Logged in - show dashboard
    const balance = parseFloat(circleBalance) || 0

    return (
        <div className="employee-page">
            <header className="page-header">
                <div>
                    <h1>Employee Dashboard</h1>
                    <p className="text-secondary">Receive payments from your employer</p>
                </div>
                <div className="circle-status">
                    <span className="status-dot active"></span>
                    <span>Circle Wallet</span>
                </div>
            </header>

            <section className="earnings-overview">
                <div className="main-balance card">
                    <div className="balance-label">Your Wallet Balance</div>
                    <div className="balance-amount">
                        <span className="currency">$</span>
                        <span className="value">{balance.toFixed(2)}</span>
                        <span className="token">USDC</span>
                    </div>

                    {/* Wallet Address - shareable with employer */}
                    <div className="wallet-address-section">
                        <span className="label">Your Wallet Address (share with employer):</span>
                        <div className="address-row">
                            <code className="address">{circleAddress}</code>
                            <button
                                className="btn btn-sm btn-ghost"
                                onClick={copyAddress}
                                title="Copy address"
                            >
                                {copiedAddress ? '✓ Copied!' : '📋 Copy'}
                            </button>
                        </div>
                    </div>

                    <div className="balance-actions">
                        <button
                            className="btn btn-success btn-lg"
                            onClick={handleOpenBridgeModal}
                            disabled={balance <= 0}
                        >
                            💸 Withdraw Funds
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={refreshBalance}
                        >
                            ↻ Refresh Balance
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={circleLogout}
                        >
                            Sign Out
                        </button>
                    </div>

                    {txStatus && (
                        <div className={`tx-status ${txStatus.type}`}>
                            {txStatus.type === 'info' && <span className="spinner-sm"></span>}
                            {txStatus.type === 'success' && <span>✓</span>}
                            {txStatus.type === 'error' && <span>✗</span>}
                            <span>{txStatus.message}</span>
                        </div>
                    )}
                </div>

                <div className="stats-grid">
                    <div className="stat-card card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-content">
                            <span className="stat-value">${balance.toFixed(2)}</span>
                            <span className="stat-label">Available Balance</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">🏦</div>
                        <div className="stat-content">
                            <span className="stat-value">Instant</span>
                            <span className="stat-label">Crypto Withdrawal</span>
                        </div>
                    </div>
                    <div className="stat-card card">
                        <div className="stat-icon">🏧</div>
                        <div className="stat-content">
                            <span className="stat-value">1-3 days</span>
                            <span className="stat-label">Bank Withdrawal</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="how-it-works card">
                <h3>📖 How It Works</h3>
                <div className="steps">
                    <div className="step">
                        <div className="step-number">1</div>
                        <div className="step-content">
                            <strong>Share your address</strong>
                            <p>Copy your wallet address above and send it to your employer</p>
                        </div>
                    </div>
                    <div className="step">
                        <div className="step-number">2</div>
                        <div className="step-content">
                            <strong>Receive payments</strong>
                            <p>Your employer streams payments directly to your wallet</p>
                        </div>
                    </div>
                    <div className="step">
                        <div className="step-number">3</div>
                        <div className="step-content">
                            <strong>Withdraw anytime</strong>
                            <p>Send funds to another wallet or directly to your bank</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ENS Profile Section */}
            <section className="ens-profile card">
                <h3>🔗 Your Profile</h3>
                {isLoadingENS ? (
                    <div className="ens-loading">
                        <span className="spinner"></span>
                        <span>Loading profile...</span>
                    </div>
                ) : (
                    <div className="ens-details">
                        <div className="ens-header">
                            {ensProfile?.avatar && (
                                <img
                                    src={ensProfile.avatar}
                                    alt="Avatar"
                                    className="ens-avatar"
                                />
                            )}
                            <div className="ens-name">
                                <span className="label">Display Name</span>
                                <span className="value">
                                    {ensProfile?.name || `${circleAddress?.slice(0, 10)}...${circleAddress?.slice(-8)}`}
                                </span>
                            </div>
                        </div>
                        <div className="ens-records">
                            <div className="record">
                                <span className="record-key">Wallet:</span>
                                <span className="record-value font-mono">
                                    {circleAddress?.slice(0, 10)}...{circleAddress?.slice(-8)}
                                </span>
                            </div>
                            {ensProfile?.preferredStablecoin && (
                                <div className="record">
                                    <span className="record-key">Preferred Token:</span>
                                    <span className="record-value">{ensProfile.preferredStablecoin}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Bridge/Withdraw Modal */}
            <BridgeModal
                isOpen={isBridgeModalOpen}
                onClose={() => setIsBridgeModalOpen(false)}
                balance={circleBalance}
                walletAddress={circleAddress}
                onWithdrawToWallet={handleWithdrawToWallet}
                onWithdrawToBank={handleWithdrawToBank}
            />
        </div>
    )
}
