import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { useYellowChannel } from '../hooks/useYellowChannel'
import { useResolveInput } from '../hooks/useENS'
import { yellowService } from '../services/yellow'
import './Employer.css'

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
    const { isConnected: walletConnected } = useAccount()
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
                status: pausedEmployees[emp.id] ? 'paused' : 'active'
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

    if (!walletConnected) {
        return (
            <div className="employer-page">
                <div className="connect-prompt card">
                    <h2>Connect Wallet</h2>
                    <p className="text-secondary mt-md mb-lg">
                        Connect your wallet to start streaming salaries to your team.
                    </p>
                    <ConnectButton />
                </div>
            </div>
        )
    }

    return (
        <div className="employer-page">
            <header className="page-header">
                <div>
                    <h1>Employer Dashboard</h1>
                    <p className="text-secondary">
                        Stream salaries via Yellow Network state channels
                    </p>
                </div>
                <div className="header-stats">
                    <div className="stat-box">
                        <span className="stat-label">Yellow Network</span>
                        <span className={`stat-value ${yellowConnected ? 'text-success' : 'text-warning'}`}>
                            {isConnecting ? 'Connecting...' : yellowConnected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Total Deposited</span>
                        <span className="stat-value">${totalDeposited.toFixed(2)}</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Active Streams</span>
                        <span className="stat-value text-success">{activeStreams}</span>
                    </div>
                </div>
            </header>

            {error && (
                <div className="error-banner">
                    ⚠️ {error.message}
                </div>
            )}

            {/* Deposit to Yellow Network Section */}
            <section className="deposit-section card">
                <h3>💰 Deposit to Yellow Network</h3>
                <p className="text-secondary mb-md">
                    Deposit USDC from your wallet to Yellow Network custody. These funds can then be allocated to payment channels.
                </p>
                <div className="deposit-info">
                    <div className="balance-display">
                        <span className="label">Wallet Balance:</span>
                        <span className="value">${(Number(walletBalance) / 1e6).toFixed(2)} ytest.usd</span>
                    </div>
                    <div className="balance-display">
                        <span className="label">Custody Balance:</span>
                        <span className="value">${custodyBalance.toFixed(2)} ytest.usd</span>
                        <span className="text-secondary text-sm ml-sm">(Sandbox)</span>
                    </div>
                </div>
                <div className="deposit-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label className="label">Amount (ytest.usd)</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="100"
                                value={custodyDepositAmount}
                                onChange={(e) => setCustodyDepositAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleDeposit}
                            disabled={isDepositing || !yellowConnected}
                        >
                            {isDepositing ? 'Depositing...' : 'Deposit ytest.usd'}
                        </button>
                    </div>
                    <p className="text-secondary text-sm mt-sm">
                        ⚠️ Deposits use <b>ytest.usd</b> in Sandbox. In production, this will use <b>USDC</b> on Mainnet.
                    </p>
                </div>

                <div className="deposit-form mt-lg pt-md border-top">
                    <h4>Withdraw Funds</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="label">Amount (ytest.usd)</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="100"
                                value={custodyWithdrawAmount}
                                onChange={(e) => setCustodyWithdrawAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={handleWithdraw}
                            disabled={isWithdrawing || !yellowConnected}
                        >
                            {isWithdrawing ? 'Withdrawing...' : 'Withdraw ytest.usd'}
                        </button>
                    </div>
                </div>

                <div className="deposit-form mt-lg pt-md border-top">
                    <h4>🚰 Faucet (Testnet Only)</h4>
                    <p className="text-secondary mb-sm">
                        Need test tokens? Mint 1,000 <b>ytest.usd</b> for free to test the deposit flow.
                    </p>
                    <button
                        className="btn btn-outline"
                        onClick={handleMint}
                        disabled={isMinting || !walletConnected}
                    >
                        {isMinting ? 'Minting...' : 'Mint 1,000 TEST USDC'}
                    </button>
                </div>
            </section>

            <section className="add-employee-section card">
                <h3>Open Payment Channel</h3>
                <p className="text-secondary mb-lg">
                    Deposit USDC once, then stream payments gaslessly every minute.
                </p>
                <div className="add-employee-form">
                    <div className="form-group">
                        <label className="label">Employee Address or ENS</label>
                        <div className="input-with-status">
                            <input
                                type="text"
                                className={`input ${newEmployee && (isAddressValid ? 'valid' : 'invalid')}`}
                                placeholder="maria.company.eth or 0x..."
                                value={newEmployee}
                                onChange={(e) => setNewEmployee(e.target.value)}
                            />
                            {isResolvingENS && (
                                <span className="input-status resolving">Resolving...</span>
                            )}
                            {!isResolvingENS && newEmployee && isAddressValid && (
                                <span className="input-status valid">✓</span>
                            )}
                            {!isResolvingENS && newEmployee && !isAddressValid && (
                                <span className="input-status invalid">✗</span>
                            )}
                        </div>
                        {resolvedAddress && resolvedEnsName && (
                            <div className="resolved-address">
                                <span className="ens-badge">{resolvedEnsName}</span>
                                <span className="arrow">→</span>
                                <span className="address">{resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}</span>
                            </div>
                        )}
                        {resolvedAddress && !resolvedEnsName && newEmployee.includes('.') && (
                            <div className="resolved-address">
                                <span className="address">{resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}</span>
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label className="label">Deposit (USDC)</label>
                        <input
                            type="number"
                            className="input"
                            placeholder="1000"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">Rate ($/min)</label>
                        <input
                            type="number"
                            step="0.01"
                            className="input"
                            placeholder="0.75"
                            value={ratePerMinute}
                            onChange={(e) => setRatePerMinute(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleAddEmployee}
                        disabled={isOpening || !yellowConnected || !isAddressValid || isResolvingENS}
                    >
                        {isOpening ? 'Opening...' : isResolvingENS ? 'Resolving...' : 'Open Channel'}
                    </button>
                </div>
            </section>

            <section className="employees-section">
                <h3>Active Payment Channels</h3>
                {employees.length === 0 ? (
                    <div className="empty-state card">
                        <p className="text-secondary">
                            No active channels yet. Open a payment channel to start streaming salaries.
                        </p>
                    </div>
                ) : (
                    <div className="employees-grid">
                        {employees.map((emp) => (
                            <div key={emp.id} className="employee-card card">
                                <div className="employee-header">
                                    <div className="employee-info">
                                        <span className={`status-dot ${emp.status === 'active' ? 'active' : 'inactive'}`}></span>
                                        <span className="employee-name">{emp.name}</span>
                                    </div>
                                    <span className={`status-badge ${emp.status}`}>
                                        {emp.status}
                                    </span>
                                </div>

                                <div className="employee-stats">
                                    <div className="employee-stat">
                                        <span className="label">Rate</span>
                                        <span className="value">${emp.rate.toFixed(2)}/min</span>
                                    </div>
                                    <div className="employee-stat">
                                        <span className="label">Channel Balance</span>
                                        <span className="value">${emp.currentBalance.toFixed(2)}</span>
                                    </div>
                                    <div className="employee-stat">
                                        <span className="label">Total Streamed</span>
                                        <span className="value stream-counter-small">${emp.totalPaid.toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="employee-actions">
                                    <button className="btn btn-outline btn-sm">Top Up</button>
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => handlePauseResume(emp.id, emp.status)}
                                    >
                                        {emp.status === 'active' ? 'Pause' : 'Resume'}
                                    </button>
                                    <button
                                        className="btn btn-outline btn-sm"
                                        style={{ color: '#ef4444' }}
                                        onClick={() => handleCloseChannel(emp.channelId!)}
                                    >
                                        Settle & Close
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Demo Section - for testing without wallet */}
            <section className="demo-section card mt-xl">
                <h3>🧪 Demo Mode</h3>
                <p className="text-secondary mb-md">
                    Test the UI with simulated channel (no wallet required)
                </p>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        setEmployees([...employees, {
                            id: `demo_${Date.now()}`,
                            name: 'demo.worker.eth',
                            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE2D',
                            rate: 0.75,
                            status: 'active',
                            totalPaid: 1847.32,
                            currentBalance: 1152.68,
                        }])
                    }}
                >
                    Add Demo Employee
                </button>
            </section>
        </div>
    )
}
