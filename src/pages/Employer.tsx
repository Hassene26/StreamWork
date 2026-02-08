import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { useYellowChannel } from '../hooks/useYellowChannel'
import { useResolveInput, useENSName } from '../hooks/useENS'
import { yellowService } from '../services/yellow'

interface EmployeeDisplay {
    id: string
    name: string
    address: string
    rate: number
    status: 'active' | 'paused'
    totalPaid: number
    currentBalance: number
    channelId?: string
}

export function Employer() {
    const { isConnected: walletConnected, address } = useAccount()
    const { disconnect } = useDisconnect()
    const { name: ensName } = useENSName(address || null)
    const {
        isConnected: yellowConnected,
        isConnecting,
        channels,
        createChannel,
        closeChannel,
        sendPayment,
        depositToCustody,
        withdrawFromCustody,
        mintToken,
        balance: yellowBalance,
        walletBalance,
        error
    } = useYellowChannel()

    const [employees, setEmployees] = useState<EmployeeDisplay[]>([])
    const [newEmployee, setNewEmployee] = useState('')
    const [depositAmount, setDepositAmount] = useState('1000')
    const [ratePerMinute, setRatePerMinute] = useState('0.75')
    const [isOpening, setIsOpening] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [showTreasuryModal, setShowTreasuryModal] = useState(false) // New modal for Treasury ops
    const [searchTerm, setSearchTerm] = useState('')

    const [pausedEmployees, setPausedEmployees] = useState<Record<string, boolean>>({})
    const [custodyDepositAmount, setCustodyDepositAmount] = useState('100')
    const [isDepositing, setIsDepositing] = useState(false)
    const [custodyWithdrawAmount, setCustodyWithdrawAmount] = useState('')
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [isMinting, setIsMinting] = useState(false)

    // ENS resolution for new employee input
    const {
        address: resolvedAddress,
        ensName: resolvedEnsName,
        isValid: isAddressValid,
        isLoading: isResolvingENS
    } = useResolveInput(newEmployee)

    // ENS resolution for search term
    const { address: searchResolvedAddress } = useResolveInput(searchTerm)

    // Debug helper: Expose checkCustodyBalance to window
    useEffect(() => {
        // @ts-ignore
        window.checkCustodyBalance = async (address: string) => {
            console.log(`🔍 Checking custody balance for ${address}...`)
            try {
                // @ts-ignore
                const balance = await yellowService.getCustodyBalanceForAddress(address)
                console.log(`💰 Balance: ${(Number(balance) / 1e6).toFixed(6)} ytest.usd`)
                return Number(balance) / 1e6
            } catch (e) {
                console.error('Failed to check balance:', e)
            }
        }

        // @ts-ignore
        window.checkChannelBalance = async (channelId: string) => {
            console.log(`🔍 Checking channel balance for ${channelId}...`)
            try {
                // @ts-ignore
                const balance = await yellowService.getChannelBalance(channelId)
                console.log(`💰 Channel Balance: ${(Number(balance) / 1e6).toFixed(6)} ytest.usd`)
                return Number(balance) / 1e6
            } catch (e) {
                console.error('Failed to check channel balance:', e)
            }
        }

        // @ts-ignore
        window.checkLocalChannelState = (channelId: string) => {
            console.log(`🔍 Checking OFF-CHAIN state for ${channelId}...`)
            // @ts-ignore
            const channel = yellowService.getChannel(channelId)
            if (channel) {
                console.log('📊 Local State:', channel)
                console.log(`💰 Employer Balance: ${(Number(channel.employerBalance) / 1e6).toFixed(6)}`)
                console.log(`💰 Employee Balance: ${(Number(channel.employeeBalance) / 1e6).toFixed(6)}`)
            } else {
                console.log('❌ Channel not found in local state')
            }
        }

        console.log('🛠️ Debug tools ready:')
        console.log('   await checkCustodyBalance(\'0x...\') - On-Chain Custody')
        console.log('   await checkChannelBalance(\'0x...\') - On-Chain Channel (Locked)')
        console.log('   checkLocalChannelState(\'0x...\')    - Off-Chain State (Streaming)')
    }, [])

    // Sync channels to employee display (preserve demo employees)
    useEffect(() => {
        const channelEmployees: EmployeeDisplay[] = channels.map((ch) => {
            const isPaused = pausedEmployees[ch.id]
            // Try to resolve ENS from local storage
            const storedEns = localStorage.getItem(`ens_${ch.employee.toLowerCase()}`)
            const displayName = ch.employeeEns || storedEns || `${ch.employee.slice(0, 8)}...${ch.employee.slice(-6)}`

            return {
                id: ch.id,
                name: displayName,
                address: ch.employee,
                rate: Number(ch.ratePerMinute) / 1e6, // Convert from USDC decimals
                status: (ch.status === 'streaming' || ch.status === 'open') && !isPaused ? 'active' : 'paused',
                totalPaid: Number(ch.employeeBalance) / 1e6,
                currentBalance: Number(ch.employerBalance) / 1e6,
                channelId: ch.id,
            }
        })

        // Preserve demo employees (those with id starting with 'demo_')
        setEmployees(prev => {
            const demoEmployees = prev.filter(emp => emp.id.startsWith('demo_'))
            const updatedDemoEmployees = demoEmployees.map(emp => ({
                ...emp,
                status: pausedEmployees[emp.id] ? 'paused' : 'active' as const
            }))
            return [...channelEmployees, ...updatedDemoEmployees] as EmployeeDisplay[]
        })
    }, [channels, pausedEmployees])

    // Keep a ref of employees for the interval to access without resetting
    const employeesRef = useRef<EmployeeDisplay[]>([])
    useEffect(() => {
        employeesRef.current = employees
    }, [employees])

    const handleAddEmployee = async () => {
        console.log("calling handleAddEmployee")
        if (!newEmployee || !depositAmount || !isAddressValid || !resolvedAddress) {
            console.warn('Invalid input or address not resolved')
            return
        }

        setIsOpening(true)
        try {
            // Convert to 6 decimals
            const depositUnits = BigInt(Math.floor(Number(depositAmount) * 1_000_000))
            const rateUnits = BigInt(Math.floor(Number(ratePerMinute) * 1_000_000))

            console.log(`Open Channel: Input=${depositAmount}, Units=${depositUnits}`)

            // Create channel via Yellow SDK using resolved address
            await createChannel(resolvedAddress, depositUnits, rateUnits, resolvedEnsName || undefined)

            // Clear form
            setNewEmployee('')
            setDepositAmount('1000')
            setRatePerMinute('0.75')
            setShowAddModal(false)
        } catch (err) {
            console.error('Failed to create channel:', err)
        } finally {
            setIsOpening(false)
        }
    }

    const handlePauseResume = (employeeId: string, currentStatus: 'active' | 'paused') => {
        setPausedEmployees(prev => ({
            ...prev,
            [employeeId]: currentStatus === 'active' // If currently active, we are pausing (true)
        }))
    }

    const handleCloseChannel = async (channelId: string) => {
        if (!channelId) return
        try {
            await closeChannel(channelId)
        } catch (err) {
            console.error('Failed to close channel:', err)
        }
    }

    const handleDeposit = async () => {
        const amount = parseFloat(custodyDepositAmount)
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid deposit amount')
            return
        }

        setIsDepositing(true)
        try {
            const amountInUnits = BigInt(Math.floor(amount * 1e6)) // USDC has 6 decimals
            const txHash = await depositToCustody(amountInUnits)
            if (txHash) {
                alert(`Deposit successful! TX: ${txHash}`)
                setCustodyDepositAmount('')
            }
        } catch (err) {
            console.error('Failed to deposit:', err)
        } finally {
            setIsDepositing(false)
        }
    }

    const handleWithdraw = async () => {
        const amount = parseFloat(custodyWithdrawAmount)
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid withdraw amount')
            return
        }
        if (amount > custodyBalance) {
            alert('Insufficient custody balance')
            return
        }

        setIsWithdrawing(true)
        try {
            const amountInUnits = BigInt(Math.floor(amount * 1e6)) // USDC has 6 decimals
            const txHash = await withdrawFromCustody(amountInUnits)
            if (txHash) {
                alert(`Withdrawal successful! TX: ${txHash}`)
                setCustodyWithdrawAmount('')
            }
        } catch (err) {
            console.error('Failed to withdraw:', err)
        } finally {
            setIsWithdrawing(false)
        }
    }

    const handleMint = async () => {
        setIsMinting(true)
        try {
            // Mint 1000 tokens
            const amountInUnits = BigInt(10 * 1e6)
            const txHash = await mintToken(amountInUnits)
            if (txHash) {
                alert(`Mint successful! You received 1,000 TEST USDC. TX: ${txHash}`)
            }
        } catch (err) {
            console.error('Failed to mint:', err)
        } finally {
            setIsMinting(false)
        }
    }

    // Off-chain streaming loop (Moved here to access handleCloseChannel)
    useEffect(() => {
        if (!yellowConnected) {
            return
        }

        const intervalId = setInterval(async () => {
            const currentEmployees = employeesRef.current
            const activeEmployees = currentEmployees.filter(e => e.status === 'active' && !e.id.startsWith('demo_'))

            for (const emp of activeEmployees) {
                try {
                    const amountUSDC = (emp.rate / 60) * 5
                    const amountUnits = BigInt(Math.floor(amountUSDC * 1_000_000))

                    if (amountUnits > 0n) {
                        await sendPayment(amountUnits, emp.address)
                    }
                } catch (err: any) {
                    // Handle "App Session not ready" - this is expected during channel setup
                    // Just skip this cycle, payment will retry on next interval
                    if (err.name === 'AppSessionNotReady') {
                        console.log(`⏳ Skipping payment for ${emp.name} - App Session initializing...`)
                        continue
                    }

                    console.error('Streaming failed for', emp.name, err)

                    // Auto-close on insufficient funds or generic "execution reverted" which might be funds
                    // The error message might be "insufficient funds" or "transfer failed"
                    if (err.message && (
                        err.message.includes('Insufficient funds') ||
                        err.message.includes('insufficient funds') ||
                        err.message.includes('Insufficient channel balance') ||
                        err.message.includes('exceeds balance') ||
                        err.message.includes('execution reverted') // Catch-all for contract errors often due to funds
                    )) {
                        console.log(`⚠️ Auto-closing channel for ${emp.name} due to insufficient funds`)
                        // Pause locally first to stop loop immediately
                        setPausedEmployees(prev => ({ ...prev, [emp.id]: true }))
                        // Then close on-chain
                        if (emp.channelId) {
                            handleCloseChannel(emp.channelId)
                        }
                    }
                }
            }
        }, 5000)

        return () => clearInterval(intervalId)
    }, [yellowConnected, sendPayment])

    const totalDeposited = employees.reduce((sum, e) => sum + e.currentBalance + e.totalPaid, 0)
    const activeStreams = employees.filter(e => e.status === 'active').length
    const custodyBalance = Number(yellowBalance) / 1e6 // Convert from USDC units

    // Calculate balance percentage for progress bar
    const getBalancePercent = (emp: EmployeeDisplay) => {
        const total = emp.currentBalance + emp.totalPaid
        if (total === 0) return 0
        return Math.min(100, (emp.currentBalance / total) * 100)
    }

    const isLowBalance = (emp: EmployeeDisplay) => {
        return getBalancePercent(emp) < 30
    }

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (searchResolvedAddress && emp.address.toLowerCase() === searchResolvedAddress.toLowerCase())
    )

    if (!walletConnected) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 bg-background-dark">
                <div className="bg-[#1a2e1e] border border-[#28392c] rounded-xl p-8 text-center max-w-md">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="material-symbols-outlined text-primary text-3xl">account_balance_wallet</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Connect Wallet</h2>
                    <p className="text-slate-400 mb-6">
                        Connect your wallet to start streaming salaries to your team.
                    </p>
                    <ConnectButton />
                </div>
            </div>
        )
    }

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen font-display">
            {/* Main Container */}
            <div className="flex flex-col min-h-screen">
                {/* Navigation Bar */}
                <header className="border-b border-slate-200 dark:border-emerald-900/50 bg-white/50 dark:bg-background-dark/50 backdrop-blur-md sticky top-0 z-50">
                    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2 text-primary">
                                <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">Nexus</h1>
                            </div>
                            <nav className="hidden md:flex items-center gap-6">
                                <Link className="text-sm font-semibold text-primary" to="/employer">Dashboard</Link>
                                <Link className="text-sm font-medium text-slate-500 hover:text-primary transition-colors" to="#" onClick={() => setShowTreasuryModal(true)}>Deposit to Channel</Link>
                            </nav>
                        </div>
                        <div className="flex items-center gap-4 flex-1 justify-end">
                            <div className="hidden lg:flex items-center bg-slate-100 dark:bg-emerald-950/30 rounded-lg px-3 py-1.5 border border-slate-200 dark:border-emerald-800/50">
                                <span className="material-symbols-outlined text-sm text-slate-400">search</span>
                                <input
                                    className="bg-transparent border-none focus:ring-0 text-sm w-48 placeholder:text-slate-500"
                                    placeholder="Search employees or ENS..."
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    className="bg-primary text-background-dark px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all"
                                    onClick={() => setShowTreasuryModal(true)}
                                >
                                    <span className="material-symbols-outlined text-lg">add_circle</span>
                                    Deposit USDC
                                </button>
                                <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors">
                                    <span className="material-symbols-outlined">notifications</span>
                                </button>
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-emerald-900/30 rounded-lg border border-slate-200 dark:border-emerald-800/50 cursor-pointer hover:bg-slate-200 dark:hover:bg-emerald-900/50 transition-colors"
                                    onClick={() => disconnect()}
                                >
                                    <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-emerald-500 to-primary flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                        {ensName ? ensName.slice(0, 2).toUpperCase() : (address ? address.slice(2, 4).toUpperCase() : '??')}
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:block">
                                        {ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 py-8 w-full flex-1">
                    {/* Dashboard Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`flex h-2 w-2 rounded-full ${yellowConnected ? 'bg-primary status-pulse' : 'bg-amber-500'}`}></span>
                                <span className="text-xs font-bold uppercase tracking-widest text-primary/80">
                                    {isConnecting ? 'Network Connecting...' : yellowConnected ? 'Real-time Stream Active' : 'Connecting to Yellow...'}
                                </span>
                            </div>
                            <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Employer Dashboard</h2>
                            <p className="text-slate-500 dark:text-emerald-500/60 mt-2 max-w-xl">
                                Managing global payroll via Circle's Arc and Yellow state channels. Zero-gas micro-transactions enabled.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 md:flex-none px-6 py-2.5 bg-slate-900 dark:bg-primary text-white dark:text-background-dark rounded-lg font-bold text-sm hover:opacity-90 transition-all"
                                onClick={() => setShowAddModal(true)}
                            >
                                Add New Employee
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 animate-slideUp ${error.message?.includes('App Session not ready')
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                            : 'bg-red-500/10 border-red-500/20 text-red-500'
                            }`}>
                            <span className={`material-symbols-outlined ${error.message?.includes('App Session not ready') ? 'animate-spin' : ''
                                }`}>
                                {error.message?.includes('App Session not ready') ? 'sync' : 'error'}
                            </span>
                            <div>
                                <h4 className="font-bold text-sm">
                                    {error.message?.includes('App Session not ready') ? 'Initializing Channel' : 'Action Failed'}
                                </h4>
                                <p className="text-xs opacity-90">{error.message}</p>
                            </div>
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                        <div className="bg-white dark:bg-emerald-950/20 border border-slate-200 dark:border-emerald-800/40 p-6 rounded-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl">payments</span>
                            </div>
                            <p className="text-slate-500 dark:text-emerald-500/70 text-sm font-semibold mb-1">Total Monthly Payroll</p>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">${totalDeposited.toFixed(2)}</h3>
                            <div className="flex items-center gap-1 mt-2 text-primary text-sm font-bold">
                                <span className="material-symbols-outlined text-sm">trending_up</span>
                                <span>+12.4% vs last month (Mock)</span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-emerald-950/20 border border-slate-200 dark:border-emerald-800/40 p-6 rounded-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl">ev_station</span>
                            </div>
                            <p className="text-slate-500 dark:text-emerald-500/70 text-sm font-semibold mb-1">Total Gas Saved (Mock)</p>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">2.41 ETH</h3>
                            <div className="flex items-center gap-1 mt-2 text-primary text-sm font-bold">
                                <span className="material-symbols-outlined text-sm">energy_savings_leaf</span>
                                <span>85% efficiency gain</span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-emerald-950/20 border border-slate-200 dark:border-emerald-800/40 p-6 rounded-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="material-symbols-outlined text-6xl">group</span>
                            </div>
                            <p className="text-slate-500 dark:text-emerald-500/70 text-sm font-semibold mb-1">Active Streams</p>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{activeStreams} Freelancers</h3>
                            <div className="flex items-center gap-1 mt-2 text-slate-400 text-sm font-medium">
                                <span>{employees.length - activeStreams} pending/paused</span>
                            </div>
                        </div>
                    </div>
                    {/* Table Section */}
                    <div className="bg-white dark:bg-emerald-950/10 border border-slate-200 dark:border-emerald-900/40 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-emerald-900/40 flex items-center justify-between bg-slate-50/50 dark:bg-emerald-900/10">
                            <h3 className="font-bold text-lg">Active Employee Streams</h3>
                            <div className="flex gap-2">
                                <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-emerald-800/30 rounded">
                                    <span className="material-symbols-outlined text-xl">filter_list</span>
                                </button>
                                <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-emerald-800/30 rounded">
                                    <span className="material-symbols-outlined text-xl">download</span>
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            {filteredEmployees.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">
                                    No active streams found. Click "Add New Employee" to start.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-slate-500 dark:text-emerald-500/50 text-xs font-bold uppercase tracking-widest border-b border-slate-100 dark:border-emerald-900/20">
                                            <th className="px-6 py-4">Employee</th>
                                            <th className="px-6 py-4">ENS Handle</th>
                                            <th className="px-6 py-4 text-center">Stream Rate</th>
                                            <th className="px-6 py-4">Yellow Channel Balance</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/20">
                                        {filteredEmployees.map((emp) => (
                                            <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-emerald-900/5 transition-colors">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${emp.status === 'active' ? 'border-primary/20 bg-primary/10' : 'border-slate-600 bg-slate-800'}`}>
                                                            <span className="material-symbols-outlined text-sm">{emp.status === 'active' ? 'person' : 'pause'}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                                                            <p className="text-xs text-slate-400">{emp.status === 'active' ? 'Streaming' : 'Paused'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="font-mono text-sm text-primary/80 bg-primary/5 px-2 py-1 rounded">
                                                        {emp.name.includes('.') ? emp.name : `${emp.address.slice(0, 6)}...`}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <span className="font-bold text-slate-900 dark:text-slate-200">${emp.rate.toFixed(2)}/min</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="max-w-[200px]">
                                                        <div className="flex justify-between text-xs mb-1.5">
                                                            <span className={isLowBalance(emp) ? 'text-amber-500 flex items-center gap-1' : 'text-slate-400'}>
                                                                {isLowBalance(emp) && <span className="material-symbols-outlined text-xs">warning</span>}
                                                                {getBalancePercent(emp).toFixed(0)}% remaining
                                                            </span>
                                                            <span className="font-bold text-white">${emp.currentBalance.toFixed(0)} USDC</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-200 dark:bg-emerald-950 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${isLowBalance(emp) ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${getBalancePercent(emp)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                                                            onClick={() => handlePauseResume(emp.id, emp.status)}
                                                        >
                                                            {emp.status === 'active' ? 'Pause' : 'Resume'}
                                                        </button>
                                                        <button
                                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                                                            onClick={() => emp.channelId && handleCloseChannel(emp.channelId)}
                                                        >
                                                            Close
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-emerald-900/20 bg-slate-50/30 dark:bg-emerald-900/5 flex items-center justify-between">
                            <p className="text-xs text-slate-500 font-medium">Showing {filteredEmployees.length} streams</p>
                            <div className="flex gap-2">
                                <button className="px-3 py-1 text-xs font-bold border border-slate-200 dark:border-emerald-800 rounded disabled:opacity-50" disabled>Previous</button>
                                <button className="px-3 py-1 text-xs font-bold border border-slate-200 dark:border-emerald-800 rounded">Next</button>
                            </div>
                        </div>
                    </div>
                    {/* Quick Actions & Help */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                        <div className="bg-gradient-to-br from-[#102215] to-[#1a3a22] p-1 rounded-xl">
                            <div className="bg-background-dark p-6 rounded-[0.65rem] h-full">
                                <h4 className="font-bold text-xl mb-4 flex items-center gap-2 text-white">
                                    <span className="material-symbols-outlined text-primary">hub</span>
                                    Network Health
                                </h4>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-400">Yellow State Channel</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${yellowConnected ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-500'}`}>
                                            {yellowConnected ? 'Optimized' : 'Connecting...'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-400">Circle Arc Gateway</span>
                                        <span className="text-xs font-bold px-2 py-0.5 bg-primary/20 text-primary rounded-full">Connected</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-emerald-950/20 border border-primary/20 p-6 rounded-xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="relative z-10">
                                <h4 className="font-bold text-xl mb-4 text-slate-900 dark:text-white">Smart Top-up (Mock)</h4>
                                <p className="text-sm text-slate-600 dark:text-emerald-500/70 mb-6">
                                    Automatically replenish state channel balances from your treasury when they fall below 10 hours of remaining work.
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="relative inline-block w-12 h-6 rounded-full bg-slate-200 dark:bg-emerald-900/50 cursor-pointer">
                                        <div className="absolute left-1 top-1 bg-white dark:bg-primary w-4 h-4 rounded-full transition-all translate-x-6"></div>
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Enable Automation</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
                {/* Footer */}
                <footer className="mt-12 border-t border-slate-200 dark:border-emerald-900/50 py-8 bg-white dark:bg-background-dark">
                    <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 opacity-50">
                                <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
                                <span className="text-sm font-bold uppercase tracking-tight">Nexus Dashboard</span>
                            </div>
                            <p className="text-xs text-slate-400">© 2026 StreamWork Protocol. All rights reserved.</p>
                        </div>
                        <div className="flex gap-6">
                            <Link className="text-xs text-slate-400 hover:text-primary transition-colors" to="#">Documentation</Link>
                            <Link className="text-xs text-slate-400 hover:text-primary transition-colors" to="#">API Keys</Link>
                            <Link className="text-xs text-slate-400 hover:text-primary transition-colors" to="#">Status</Link>
                        </div>
                    </div>
                </footer >
            </div >

            {/* Treasury Modal (New) */}
            {
                showTreasuryModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-card-dark border border-border-dark rounded-xl p-6 w-full max-w-2xl text-white">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">account_balance</span>
                                    Yellow Network Treasury
                                </h3>
                                <button
                                    className="text-slate-400 hover:text-white"
                                    onClick={() => setShowTreasuryModal(false)}
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="p-4 bg-background-dark/50 rounded-lg border border-border-dark">
                                        <p className="text-slate-400 text-sm mb-1">Custody Balance</p>
                                        <p className="text-2xl font-bold text-primary">${custodyBalance.toFixed(2)}</p>
                                        <p className="text-xs text-slate-500 mt-1">Available for new channels</p>
                                    </div>
                                    <div className="p-4 bg-background-dark/50 rounded-lg border border-border-dark">
                                        <p className="text-slate-400 text-sm mb-1">Wallet Balance</p>
                                        <p className="text-2xl font-bold text-white">${(Number(walletBalance) / 1e6).toFixed(2)}</p>
                                        <p className="text-xs text-slate-500 mt-1">ytest.usd in MetaMask</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Deposit */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Deposit to Treasury</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                                placeholder="Amount"
                                                value={custodyDepositAmount}
                                                onChange={(e) => setCustodyDepositAmount(e.target.value)}
                                            />
                                            <button
                                                className="px-3 py-2 bg-primary text-background-dark rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
                                                onClick={handleDeposit}
                                                disabled={isDepositing || !yellowConnected}
                                            >
                                                {isDepositing ? '...' : 'Deposit'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Withdraw */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Withdraw to Wallet</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                                placeholder="Amount"
                                                value={custodyWithdrawAmount}
                                                onChange={(e) => setCustodyWithdrawAmount(e.target.value)}
                                            />
                                            <button
                                                className="px-3 py-2 bg-transparent border border-border-dark text-white rounded-lg text-sm font-bold hover:border-primary disabled:opacity-50"
                                                onClick={handleWithdraw}
                                                disabled={isWithdrawing || !yellowConnected}
                                            >
                                                {isWithdrawing ? '...' : 'Withdraw'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Faucet */}
                                    <div className="pt-4 border-t border-border-dark">
                                        <button
                                            className="w-full py-2 bg-transparent border border-dashed border-slate-600 text-slate-400 rounded-lg text-sm hover:text-white hover:border-slate-400 flex items-center justify-center gap-2"
                                            onClick={handleMint}
                                            disabled={isMinting || !walletConnected}
                                        >
                                            <span className="material-symbols-outlined text-sm">water_drop</span>
                                            {isMinting ? 'Minting...' : 'Mint Test Tokens (Faucet)'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Employee Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-card-dark border border-border-dark rounded-xl p-6 w-full max-w-md text-white">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold">Open Payment Channel</h3>
                                <button
                                    className="text-slate-400 hover:text-white"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-slate-400 text-sm font-semibold block mb-2">Employee Address or ENS</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className={`w-full bg-background-dark border rounded-lg px-4 py-3 text-white focus:outline-none ${newEmployee && (isAddressValid ? 'border-primary' : 'border-red-500')}`}
                                            placeholder="maria.company.eth or 0x..."
                                            value={newEmployee}
                                            onChange={(e) => setNewEmployee(e.target.value)}
                                        />
                                        {isResolvingENS && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Resolving...</span>
                                        )}
                                        {!isResolvingENS && newEmployee && isAddressValid && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary">✓</span>
                                        )}
                                    </div>
                                    {resolvedAddress && resolvedEnsName && (
                                        <div className="mt-2 text-sm">
                                            <span className="text-primary">{resolvedEnsName}</span>
                                            <span className="text-slate-500 mx-2">→</span>
                                            <span className="text-slate-400 font-mono">{resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}</span>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-slate-400 text-sm font-semibold block mb-2">Initial Deposit (USDC)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                        placeholder="1000"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-slate-400 text-sm font-semibold block mb-2">Rate ($/min)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                        placeholder="0.75"
                                        value={ratePerMinute}
                                        onChange={(e) => setRatePerMinute(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="w-full mt-4 py-3 bg-primary text-background-dark rounded-lg font-bold hover:opacity-90 transition-all disabled:opacity-50"
                                    onClick={handleAddEmployee}
                                    disabled={isOpening || !yellowConnected || !isAddressValid || isResolvingENS}
                                >
                                    {isOpening ? 'Opening Channel...' : isResolvingENS ? 'Resolving...' : 'Open Channel'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
