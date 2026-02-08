import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useCircleWallet } from '../hooks/useCircleWallet'
import { useENSProfile } from '../hooks/useENS'
import { backendApi } from '../api/backend'
import { BridgeModal } from '../components/BridgeModal'

function getLinkedENS(address: string | null): string | null {
    if (!address) return null
    return localStorage.getItem(`streamwork_ens_${address}`)
}

function setLinkedENSStorage(address: string, name: string): void {
    if (!address) return
    localStorage.setItem(`streamwork_ens_${address}`, name)
}

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
    const [linkedEns, setLinkedEns] = useState<string | null>(null)

    // Load linked ENS when address changes
    useEffect(() => {
        setLinkedEns(getLinkedENS(circleAddress))
    }, [circleAddress])

    // ENS registration
    const [ensRegInput, setEnsRegInput] = useState('')
    const [ensAvailability, setEnsAvailability] = useState<{ available: boolean; price: string } | null>(null)
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
    const [ensRegStatus, setEnsRegStatus] = useState<'idle' | 'committing' | 'waiting' | 'registering' | 'complete' | 'error'>('idle')
    const [ensRegError, setEnsRegError] = useState<string | null>(null)
    const [ensCountdown, setEnsCountdown] = useState(0)

    const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ENS Profile lookup (prefer linked ENS over Circle address)
    const { profile: ensProfile } = useENSProfile(linkedEns || circleAddress || null)

    // Determine display name: Real ENS > Linked (Mock) > null
    const displayName = ensProfile?.name || linkedEns || null

    // Transaction status tracking
    const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
    const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false)

    // Simulated live earnings (for demo effect)
    const [liveEarnings, setLiveEarnings] = useState(0)
    const [microSettlements, setMicroSettlements] = useState<{ time: string; amount: string }[]>([])

    // Simulate live earnings counter
    useEffect(() => {
        if (!isCircleConnected) return
        const interval = setInterval(() => {
            setLiveEarnings(prev => prev + 0.0125) // $0.75/min = $0.0125/sec
            const now = new Date()
            setMicroSettlements(prev => [
                { time: now.toLocaleTimeString(), amount: '+$0.0125' },
                ...prev.slice(0, 9)
            ])
        }, 1000)
        return () => clearInterval(interval)
    }, [isCircleConnected])

    // Clear status after 5 seconds
    useEffect(() => {
        if (txStatus) {
            const timer = setTimeout(() => setTxStatus(null), 5000)
            return () => clearTimeout(timer)
        }
    }, [txStatus])

    // Debounced availability check
    const checkAvailability = useCallback((label: string) => {
        if (availabilityTimer.current) clearTimeout(availabilityTimer.current)
        setEnsAvailability(null)
        setEnsRegError(null)

        if (!label) return

        setIsCheckingAvailability(true)
        availabilityTimer.current = setTimeout(async () => {
            try {
                // Use backend API to check availability and price
                const result = await backendApi.checkENSAvailability(label)

                if (result.available) {
                    setEnsAvailability({
                        available: true,
                        price: `${result.price.base} + ${result.price.premium}`
                    })
                } else {
                    setEnsAvailability({ available: false, price: '' })
                    setEnsRegError(`'${label}.eth' is already registered`)
                }
            } catch (err: any) {
                setEnsRegError(err.message || 'Failed to check availability')
            } finally {
                setIsCheckingAvailability(false)
            }
        }, 500)
    }, [])

    const handleEnsRegInputChange = (value: string) => {
        const label = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
        setEnsRegInput(label)
        checkAvailability(label)
    }

    const handleRegisterENS = async () => {
        if (!ensRegInput || !ensAvailability?.available || !circleAddress) return

        setEnsRegStatus('committing')
        setEnsRegError(null)

        try {
            // Start registration process via backend (Sponsor-payed)
            const { jobId } = await backendApi.registerENS(ensRegInput, circleAddress)

            setEnsRegStatus('waiting')

            const poll = async () => {
                try {
                    const status = await backendApi.getENSRegistrationStatus(jobId)

                    if (status.status === 'error') {
                        throw new Error(status.error || 'Registration failed')
                    }

                    if (status.status === 'complete') {
                        setEnsRegStatus('complete')
                        const fullName = `${ensRegInput}.eth`
                        setLinkedEns(fullName)
                        if (circleAddress) {
                            setLinkedENSStorage(circleAddress, fullName)
                        }
                        setEnsRegInput('')
                        return
                    }

                    // Update status and keep polling
                    setEnsRegStatus(status.status)
                    pollTimer.current = setTimeout(poll, 3000)
                } catch (err: any) {
                    setEnsRegError(err.message || 'Registration failed')
                    setEnsRegStatus('error')
                }
            }

            // Start countdown for UX
            setEnsCountdown(65)
            // Start polling
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

    // Not logged in - show login prompt (kept similar to before but with darker styling to match new theme)
    if (!isCircleConnected && !isCircleRestoring) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 bg-background-dark">
                <div className="bg-[#1a2e1e] border border-[#28392c] rounded-xl p-8 text-center max-w-md">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="material-symbols-outlined text-primary text-3xl">person</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Employee Dashboard</h2>
                    <p className="text-slate-400 mb-6">
                        Sign in with Google to create your crypto wallet and start receiving payments.
                    </p>
                    <p className="text-slate-500 text-sm mb-6">
                        <strong className="text-white">No crypto knowledge required!</strong> You can withdraw directly to your bank account.
                    </p>

                    <button
                        className="w-full py-3 bg-white text-slate-900 rounded-lg font-bold flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        onClick={login}
                        disabled={isCircleLoading}
                    >
                        {isCircleLoading ? 'Connecting...' : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.032-3.716H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                                    <path d="M3.968 10.705A5.366 5.366 0 0 1 3.682 9c0-.593.102-1.17.286-1.705V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.011-2.332z" fill="#FBBC05" />
                                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963l3.011 2.332C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                                </svg>
                                Sign in with Google
                            </>
                        )}
                    </button>

                    {circleError && <p className="mt-4 text-red-400 text-sm">{circleError}</p>}
                    {circleStatus && circleStatus !== 'Ready' && (
                        <p className="mt-4 text-slate-500 text-sm">{circleStatus}</p>
                    )}
                </div>
            </div>
        )
    }

    const currentBalance = parseFloat(circleBalance || '0')
    const totalEarnings = (currentBalance + liveEarnings).toFixed(4)
    const [mainPart, decimalPart] = totalEarnings.split('.')

    return (
        <div className="bg-background-dark text-slate-100 min-h-screen">
            <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden">
                {/* Navigation */}
                <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#28392c] px-10 py-3 bg-background-dark sticky top-0 z-50">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4 text-primary">
                            <div className="size-6">
                                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M42.4379 44C42.4379 44 36.0744 33.9038 41.1692 24C46.8624 12.9336 42.2078 4 42.2078 4L7.01134 4C7.01134 4 11.6577 12.932 5.96912 23.9969C0.876273 33.9029 7.27094 44 7.27094 44L42.4379 44Z" fill="currentColor"></path>
                                </svg>
                            </div>
                            <h2 className="text-white text-xl font-bold leading-tight tracking-[-0.015em]">StreamWork</h2>
                        </div>
                        <div className="hidden md:flex items-center gap-6">
                            <Link className="text-slate-400 hover:text-primary text-sm font-medium transition-colors" to="/employee">Dashboard</Link>
                            <Link className="text-slate-400 hover:text-primary text-sm font-medium transition-colors" to="/settings">Settings</Link>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                            <button className="flex items-center justify-center rounded-lg h-10 w-10 bg-[#28392c] text-white hover:bg-primary/20 transition-all">
                                <span className="material-symbols-outlined text-[20px]">notifications</span>
                            </button>
                            <Link to="/settings" className="flex items-center justify-center rounded-lg h-10 w-10 bg-[#28392c] text-white hover:bg-primary/20 transition-all">
                                <span className="material-symbols-outlined text-[20px]">settings</span>
                            </Link>
                        </div>
                        <div
                            className="flex items-center gap-3 pl-4 border-l border-[#28392c] cursor-pointer hover:bg-slate-100 dark:hover:bg-emerald-900/30 rounded-lg px-3 py-1.5 border border-transparent hover:border-slate-200 dark:hover:border-emerald-800/50 transition-colors"
                            onClick={circleLogout}
                        >
                            <div className="text-right hidden sm:block">
                                <p className="text-xs text-slate-400 font-medium">
                                    {displayName || (circleAddress ? `${circleAddress.slice(0, 6)}...${circleAddress.slice(-4)}` : 'Connecting...')}
                                </p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-emerald-500 to-primary flex items-center justify-center text-sm font-bold text-white shadow-sm border-2 border-primary/30">
                                {displayName
                                    ? displayName.slice(0, 2).toUpperCase()
                                    : (circleAddress ? circleAddress.slice(2, 4).toUpperCase() : '??')
                                }
                            </div>
                        </div>
                    </div>
                </header>
                <main className="flex-1 max-w-[1280px] mx-auto w-full px-4 sm:px-10 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left Column: Main Dashboard */}
                        <div className="lg:col-span-8 flex flex-col gap-8">
                            {/* Earnings Hero Section */}
                            <section className="bg-[#1a2e1e] border border-[#28392c] rounded-xl p-8 flex flex-col items-center justify-center relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50"></div>
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <span className="text-primary text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <span className="size-2 rounded-full bg-primary active-pulse"></span>
                                        Live Real-time Earnings
                                    </span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-white text-5xl md:text-7xl font-extrabold tracking-tighter ticker-font glow-green">${mainPart}.</span>
                                        <span className="text-primary text-4xl md:text-5xl font-bold ticker-font glow-green">{decimalPart}</span>
                                    </div>
                                    <p className="text-slate-400 text-sm mt-4 font-medium">
                                        Secured by <span className="text-white">Circle's Arc</span> via Ethereum Layer 2
                                    </p>
                                    <div className="mt-6 flex gap-3">
                                        <span className="bg-[#28392c] text-primary text-[10px] px-3 py-1 rounded-full border border-primary/20 font-bold uppercase">USD-C Stream</span>
                                        <span className="bg-[#28392c] text-white/60 text-[10px] px-3 py-1 rounded-full border border-white/10 font-bold uppercase">0.0000412 / sec</span>
                                    </div>
                                </div>
                            </section>
                            {/* Active StreamWork Stream Card */}
                            <section>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-white text-xl font-bold">Active StreamWork Stream</h2>
                                    <button className="text-primary text-sm font-semibold hover:underline">View Contract Details</button>
                                </div>
                                <div className="bg-[#1a2e1e] border border-[#28392c] rounded-xl p-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="size-14 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
                                                <span className="material-symbols-outlined text-primary text-3xl">hub</span>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-bold text-lg">Global Web Design </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="size-2 rounded-full bg-primary active-pulse"></span>
                                                    <p className="text-primary text-xs font-bold">STREAM STATUS: ACTIVE</p>
                                                    <span className="text-slate-500 text-xs px-2 border-l border-slate-700 ml-1">State Channel #912</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-slate-400 text-xs font-medium uppercase mb-1">Total Monthly Budget</span>
                                            <span className="text-white text-2xl font-bold">$5,000.00</span>
                                        </div>
                                    </div>
                                    <div className="mt-8">
                                        <div className="flex justify-between items-end mb-2">
                                            <div>
                                                <p className="text-slate-400 text-sm">Earned So Far (Cycle)</p>
                                                <p className="text-white text-xl font-bold">${totalEarnings}</p>
                                            </div>
                                        </div>
                                        <div className="w-full h-3 bg-[#28392c] rounded-full overflow-hidden">
                                            <div className="bg-primary h-full rounded-full shadow-[0_0_10px_rgba(19,236,73,0.4)]" style={{ width: '42.4%' }}></div>
                                        </div>
                                    </div>
                                    <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="bg-[#28392c]/40 p-4 rounded-lg border border-white/5">
                                            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Start Date</p>
                                            <p className="text-white text-sm font-bold">Feb 08, 2026</p>
                                        </div>
                                        <div className="bg-[#28392c]/40 p-4 rounded-lg border border-white/5">
                                            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">End Date</p>
                                            <p className="text-white text-sm font-bold">Mar 08, 2026</p>
                                        </div>

                                    </div>
                                </div>
                            </section>
                            {/* Recent Settlements */}
                            <section>
                                <h2 className="text-white text-lg font-bold mb-4">Live Micro-Settlements</h2>
                                <div className="space-y-3">
                                    {microSettlements.length === 0 ? (
                                        <p className="text-slate-500 text-sm">Waiting for real-time payments...</p>
                                    ) : (
                                        microSettlements.map((item, idx) => (
                                            <div key={idx} className={`flex items-center justify-between p-4 bg-background-dark border border-[#28392c] rounded-lg ${idx > 0 ? 'opacity-70' : ''}`}>
                                                <div className="flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                                                    <div>
                                                        <p className="text-white text-sm font-medium">Batch Settlement #{88219 - idx}</p>
                                                        <p className="text-slate-500 text-[10px]">{item.time} • Tx: 0x4f...a29</p>
                                                    </div>
                                                </div>
                                                <p className="text-primary text-sm font-bold">{item.amount}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </div>
                        {/* Right Column: Quick Action Sidebar */}
                        <aside className="lg:col-span-4 flex flex-col gap-6">
                            {/* Wallet & Actions */}
                            <section className="bg-[#1a2e1e] border border-primary/20 rounded-xl p-6">
                                <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                                    Wallet Operations
                                </h3>
                                <div className="mb-8">
                                    <label className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2 block">Linked Payout Account</label>
                                    <div className="flex items-center justify-between bg-black/30 p-4 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-[10px]">MP</div>
                                            <div>
                                                <p className="text-white text-sm font-bold">Mercado Pago</p>
                                                <p className="text-slate-500 text-xs">... 9292 (BRL)</p>
                                            </div>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-500">more_vert</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleOpenBridgeModal}
                                        className="w-full bg-primary hover:bg-primary/90 text-background-dark font-bold py-4 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">payments</span>
                                        Withdraw
                                    </button>

                                </div>
                                <p className="text-center text-slate-500 text-[10px] mt-6">
                                    Estimated time to bank: <span className="text-primary">Instant </span>
                                </p>
                            </section>

                            {/* ENS Registration Section */}
                            {!displayName && (
                                <section className="bg-[#1a2e1e] border border-primary/20 rounded-xl p-6">
                                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">id_card</span>
                                        Register ENS Name
                                    </h3>

                                    {ensRegStatus === 'idle' || ensRegStatus === 'error' ? (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2 block">Choose your Web3 Username</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        className={`w-full bg-black/30 border rounded-lg px-4 py-3 text-white text-sm focus:outline-none ${ensRegInput && (ensAvailability?.available ? 'border-primary' : 'border-red-500/50') || 'border-white/10'}`}
                                                        placeholder="username"
                                                        value={ensRegInput}
                                                        onChange={(e) => handleEnsRegInputChange(e.target.value)}
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">.eth</span>
                                                </div>
                                                {isCheckingAvailability && <p className="text-slate-400 text-[10px] mt-2">Checking availability...</p>}
                                                {ensRegError && <p className="text-red-400 text-[10px] mt-2">{ensRegError}</p>}
                                                {ensAvailability?.available && (
                                                    <p className="text-primary text-[10px] mt-2 font-bold flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        Available! Est. Cost: {ensAvailability.price}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                className="w-full bg-white text-slate-900 font-bold py-3 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                onClick={handleRegisterENS}
                                                disabled={!ensAvailability?.available}
                                            >
                                                Register Name
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-6">
                                            <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary border-t-transparent animate-spin mx-auto mb-4"></div>
                                            <h4 className="text-white font-bold text-sm mb-1">
                                                {ensRegStatus === 'committing' && 'Committing...'}
                                                {ensRegStatus === 'waiting' && 'Waiting...'}
                                                {ensRegStatus === 'registering' && 'Registering...'}
                                                {ensRegStatus === 'complete' && 'Success!'}
                                            </h4>
                                            <p className="text-slate-400 text-xs">
                                                {ensRegStatus === 'waiting' && `${ensCountdown}s remaining`}
                                                {ensRegStatus !== 'waiting' && 'Confirming on-chain'}
                                            </p>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* Exchange Rate/Info Card */}
                            <section className="bg-background-dark border border-[#28392c] rounded-xl p-6">
                                <h4 className="text-white font-bold text-sm mb-4">Network Insights</h4>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-xs">Gas Price (L2)</span>
                                        <span className="text-white text-xs font-bold">&lt; $0.001</span>
                                    </div>
                                </div>
                            </section>
                            {/* Support Card */}

                        </aside>
                    </div>
                </main>
                {/* Bottom Live Bar (Mobile Only) */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a2e1e] border-t border-primary/20 p-4 flex justify-between items-center z-50">
                    <div>
                        <p className="text-slate-400 text-[10px] uppercase font-bold">Live Total</p>
                        <p className="text-white font-bold text-xl ticker-font">${mainPart}.<span className="text-primary">{decimalPart}</span></p>
                    </div>
                    <button
                        onClick={handleOpenBridgeModal}
                        className="bg-primary px-6 py-2 rounded-lg text-background-dark font-bold text-sm"
                    >
                        Withdraw
                    </button>
                </div>
            </div>

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
