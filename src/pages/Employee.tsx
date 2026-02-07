import { useEffect, useState, useRef, useCallback } from 'react'
import { useCircleWallet } from '../hooks/useCircleWallet'
import { useENSProfile } from '../hooks/useENS'
import { resolveENSName, isENSName } from '../services/ens'
import { backendApi } from '../api/backend'
import { BridgeModal } from '../components/BridgeModal'
import './Employee.css'

const ENS_LINK_KEY = 'streamwork_linked_ens'
function getLinkedENS(): string | null { return localStorage.getItem(ENS_LINK_KEY) }
function setLinkedENSStorage(name: string): void { localStorage.setItem(ENS_LINK_KEY, name) }
function clearLinkedENSStorage(): void { localStorage.removeItem(ENS_LINK_KEY) }

export function Employee() {
    const {
        address: circleAddress,
        balance: circleBalance,
        login,
        logout: circleLogout,
        refreshBalance,
        withdrawToWallet,
        isLoading: isCircleLoading,
        isRestoring: isCircleRestoring,
        isConnected: isCircleConnected,
        error: circleError,
        status: circleStatus,
    } = useCircleWallet()

    // ENS linking
    const [linkedEns, setLinkedEns] = useState<string | null>(getLinkedENS())
    const [ensInput, setEnsInput] = useState('')
    const [isLinkingEns, setIsLinkingEns] = useState(false)
    const [ensLinkError, setEnsLinkError] = useState<string | null>(null)

    // ENS registration
    const [ensRegInput, setEnsRegInput] = useState('')
    const [ensAvailability, setEnsAvailability] = useState<{ available: boolean; price: string } | null>(null)
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
    const [ensRegStatus, setEnsRegStatus] = useState<'idle' | 'committing' | 'waiting' | 'registering' | 'complete' | 'error'>('idle')
    const [ensRegError, setEnsRegError] = useState<string | null>(null)
    const [ensCountdown, setEnsCountdown] = useState(0)
    const [showLinkExisting, setShowLinkExisting] = useState(false)
    const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ENS Profile lookup (prefer linked ENS over Circle address)
    const { profile: ensProfile, isLoading: isLoadingENS } = useENSProfile(linkedEns || circleAddress || null)

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

    // Copy address/ENS to clipboard
    const copyAddress = async () => {
        const textToCopy = linkedEns || circleAddress
        if (textToCopy) {
            await navigator.clipboard.writeText(textToCopy)
            setCopiedAddress(true)
            setTimeout(() => setCopiedAddress(false), 2000)
        }
    }

    const handleLinkENS = async () => {
        if (!ensInput) return
        setIsLinkingEns(true)
        setEnsLinkError(null)

        try {
            if (!isENSName(ensInput)) {
                setEnsLinkError('Please enter a valid ENS name (e.g. name.eth)')
                return
            }

            const resolved = await resolveENSName(ensInput)
            if (!resolved) {
                setEnsLinkError('ENS name could not be resolved')
                return
            }

            setLinkedENSStorage(ensInput)
            setLinkedEns(ensInput)
            setEnsInput('')
        } catch {
            setEnsLinkError('Failed to verify ENS name')
        } finally {
            setIsLinkingEns(false)
        }
    }

    const handleUnlinkENS = () => {
        clearLinkedENSStorage()
        setLinkedEns(null)
    }

    // Debounced availability check
    const checkAvailability = useCallback((label: string) => {
        if (availabilityTimer.current) clearTimeout(availabilityTimer.current)
        setEnsAvailability(null)
        setEnsRegError(null)

        if (!label || label.length < 3) {
            setIsCheckingAvailability(false)
            return
        }

        setIsCheckingAvailability(true)
        availabilityTimer.current = setTimeout(async () => {
            try {
                const result = await backendApi.checkENSAvailability(label)
                const priceWei = BigInt(result.price.base) + BigInt(result.price.premium)
                const priceEth = Number(priceWei) / 1e18
                setEnsAvailability({
                    available: result.available,
                    price: priceEth.toFixed(6),
                })
            } catch (err: any) {
                setEnsRegError(err.message || 'Failed to check availability')
            } finally {
                setIsCheckingAvailability(false)
            }
        }, 500)
    }, [])

    const handleEnsRegInputChange = (value: string) => {
        // Only allow lowercase alphanumeric and hyphens
        const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
        setEnsRegInput(cleaned)
        setEnsRegStatus('idle')
        checkAvailability(cleaned)
    }

    const handleRegisterENS = async () => {
        if (!ensRegInput || !circleAddress || !ensAvailability?.available) return

        setEnsRegError(null)
        setEnsRegStatus('committing')

        try {
            const { jobId } = await backendApi.registerENS(ensRegInput, circleAddress)

            // Poll for status
            const poll = async () => {
                try {
                    const status = await backendApi.getENSRegistrationStatus(jobId)
                    setEnsRegStatus(status.status)

                    if (status.status === 'waiting') {
                        setEnsCountdown(prev => prev > 0 ? prev - 1 : 65)
                    }

                    if (status.status === 'complete') {
                        // Auto-link the newly registered name
                        const fullName = `${ensRegInput}.eth`
                        setLinkedENSStorage(fullName)
                        setLinkedEns(fullName)
                        setEnsRegInput('')
                        setEnsAvailability(null)
                        return // Stop polling
                    }

                    if (status.status === 'error') {
                        setEnsRegError(status.error || 'Registration failed')
                        return // Stop polling
                    }

                    // Continue polling
                    pollTimer.current = setTimeout(poll, 2000)
                } catch (err: any) {
                    setEnsRegError(err.message || 'Failed to check status')
                    setEnsRegStatus('error')
                }
            }

            // Start countdown
            setEnsCountdown(65)
            // Start polling after a brief delay
            pollTimer.current = setTimeout(poll, 3000)
        } catch (err: any) {
            setEnsRegError(err.message || 'Failed to start registration')
            setEnsRegStatus('error')
        }
    }

    // Countdown timer for waiting phase
    useEffect(() => {
        if (ensRegStatus === 'waiting' && ensCountdown > 0) {
            const timer = setTimeout(() => setEnsCountdown(c => c - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [ensRegStatus, ensCountdown])

    // Cleanup poll timer on unmount
    useEffect(() => {
        return () => {
            if (pollTimer.current) clearTimeout(pollTimer.current)
            if (availabilityTimer.current) clearTimeout(availabilityTimer.current)
        }
    }, [])

    const handleOpenBridgeModal = () => {
        if (!circleAddress) {
            setTxStatus({ type: 'error', message: 'No Circle Wallet to withdraw from!' })
            return
        }
        setIsBridgeModalOpen(true)
    }

    const handleWithdrawToWallet = async (_chain: string, destinationAddress: string, amount: string) => {
        if (!circleAddress) throw new Error('No wallet connected')

        console.log('Withdrawing', amount, 'to', destinationAddress)
        setTxStatus({ type: 'info', message: 'Creating transfer...' })

        try {
            await withdrawToWallet(destinationAddress, amount)
            setTxStatus({ type: 'success', message: 'Withdrawal submitted! Check your wallet in a few minutes.' })
            setTimeout(() => refreshBalance(), 5000)
        } catch (err: any) {
            console.error('Withdrawal error:', err)
            throw err
        }
    }

    const handleWithdrawToBank = async (amount: string) => {
        if (!circleAddress) throw new Error('No wallet connected')

        console.log('Withdrawing', amount, 'to bank account')

        // Staged mock flow simulating Circle Mint off-ramp:
        // In production this would be: user wallet → platform wallet (challenge) → bank payout (businessAccount API)
        setTxStatus({ type: 'info', message: 'Transferring USDC to off-ramp provider...' })
        await new Promise(r => setTimeout(r, 1500))

        setTxStatus({ type: 'info', message: 'Converting USDC to USD...' })
        await new Promise(r => setTimeout(r, 1200))

        setTxStatus({ type: 'info', message: 'Initiating wire transfer to bank ****1234...' })
        await new Promise(r => setTimeout(r, 1000))

        setTxStatus({ type: 'success', message: `$${parseFloat(amount).toFixed(2)} USD sent to bank ****1234. Arrives in 1-3 business days.` })
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

                    {/* Wallet Address / ENS - shareable with employer */}
                    <div className="wallet-address-section">
                        {linkedEns ? (
                            <>
                                <span className="label">Your ENS Identity (share with employer):</span>
                                <div className="address-row">
                                    <code className="address ens-linked">{linkedEns}</code>
                                    <button className="btn btn-sm btn-ghost" onClick={copyAddress} title="Copy ENS name">
                                        {copiedAddress ? '✓ Copied!' : '📋 Copy'}
                                    </button>
                                    <button className="btn btn-sm btn-ghost" onClick={handleUnlinkENS} title="Unlink ENS">
                                        Unlink
                                    </button>
                                </div>
                                <div className="address-sub">
                                    Wallet: <code>{circleAddress?.slice(0, 10)}...{circleAddress?.slice(-8)}</code>
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="label">Your Wallet Address (share with employer):</span>
                                <div className="address-row">
                                    <code className="address">{circleAddress}</code>
                                    <button className="btn btn-sm btn-ghost" onClick={copyAddress} title="Copy address">
                                        {copiedAddress ? '✓ Copied!' : '📋 Copy'}
                                    </button>
                                </div>

                                {/* ENS Registration */}
                                <div className="ens-register-section">
                                    <span className="label">Register an ENS name for your wallet:</span>
                                    <div className="ens-input-group">
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="yourname"
                                            value={ensRegInput}
                                            onChange={(e) => handleEnsRegInputChange(e.target.value)}
                                            disabled={ensRegStatus !== 'idle' && ensRegStatus !== 'error'}
                                        />
                                        <span className="ens-suffix">.eth</span>
                                    </div>

                                    {/* Availability status */}
                                    {isCheckingAvailability && (
                                        <div className="ens-availability checking">
                                            <span className="spinner-sm"></span>
                                            <span>Checking availability...</span>
                                        </div>
                                    )}
                                    {!isCheckingAvailability && ensAvailability && ensRegInput && (
                                        <div className={`ens-availability ${ensAvailability.available ? 'available' : 'taken'}`}>
                                            {ensAvailability.available ? (
                                                <>
                                                    <span>&#10003; {ensRegInput}.eth is available!</span>
                                                    <span className="ens-price">Cost: {ensAvailability.price} ETH/year</span>
                                                </>
                                            ) : (
                                                <span>&#10007; {ensRegInput}.eth is taken</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Register button */}
                                    {ensAvailability?.available && ensRegStatus === 'idle' && (
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleRegisterENS}
                                        >
                                            Register {ensRegInput}.eth
                                        </button>
                                    )}

                                    {/* Registration progress */}
                                    {ensRegStatus !== 'idle' && ensRegStatus !== 'error' && (
                                        <div className="ens-progress">
                                            <div className={`ens-step ${ensRegStatus === 'committing' ? 'active' : 'done'}`}>
                                                <span className="step-icon">
                                                    {ensRegStatus === 'committing' ? <span className="spinner-sm"></span> : '&#10003;'}
                                                </span>
                                                <span>Submitting commitment...</span>
                                            </div>
                                            {(ensRegStatus === 'waiting' || ensRegStatus === 'registering' || ensRegStatus === 'complete') && (
                                                <div className={`ens-step ${ensRegStatus === 'waiting' ? 'active' : 'done'}`}>
                                                    <span className="step-icon">
                                                        {ensRegStatus === 'waiting' ? <span className="spinner-sm"></span> : '&#10003;'}
                                                    </span>
                                                    <span>
                                                        {ensRegStatus === 'waiting'
                                                            ? `Waiting for confirmation... ${ensCountdown > 0 ? `(~${ensCountdown}s)` : ''}`
                                                            : 'Commitment confirmed'}
                                                    </span>
                                                </div>
                                            )}
                                            {(ensRegStatus === 'registering' || ensRegStatus === 'complete') && (
                                                <div className={`ens-step ${ensRegStatus === 'registering' ? 'active' : 'done'}`}>
                                                    <span className="step-icon">
                                                        {ensRegStatus === 'registering' ? <span className="spinner-sm"></span> : '&#10003;'}
                                                    </span>
                                                    <span>
                                                        {ensRegStatus === 'registering'
                                                            ? `Registering ${ensRegInput}.eth...`
                                                            : `${ensRegInput}.eth is yours!`}
                                                    </span>
                                                </div>
                                            )}
                                            {ensRegStatus === 'complete' && (
                                                <div className="ens-success">
                                                    &#127881; {ensRegInput}.eth has been registered and linked to your wallet!
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Error */}
                                    {ensRegError && (
                                        <p className="error-text">{ensRegError}</p>
                                    )}

                                    {/* Link existing (secondary option) */}
                                    <div className="ens-link-toggle">
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setShowLinkExisting(!showLinkExisting)}
                                        >
                                            {showLinkExisting ? 'Hide' : 'Already have an ENS name? Link it'}
                                        </button>
                                    </div>
                                    {showLinkExisting && (
                                        <div className="ens-link-section">
                                            <div className="ens-link-form">
                                                <input
                                                    type="text"
                                                    className="input"
                                                    placeholder="yourname.eth"
                                                    value={ensInput}
                                                    onChange={(e) => setEnsInput(e.target.value)}
                                                />
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={handleLinkENS}
                                                    disabled={isLinkingEns || !ensInput}
                                                >
                                                    {isLinkingEns ? 'Verifying...' : 'Link ENS'}
                                                </button>
                                            </div>
                                            {ensLinkError && <p className="error-text">{ensLinkError}</p>}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
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
                ensName={linkedEns || undefined}
                onWithdrawToWallet={handleWithdrawToWallet}
                onWithdrawToBank={handleWithdrawToBank}
            />
        </div>
    )
}
