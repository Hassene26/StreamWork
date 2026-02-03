import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import { useYellowChannel } from '../hooks/useYellowChannel'
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
        error
    } = useYellowChannel()

    const [employees, setEmployees] = useState<EmployeeDisplay[]>([])
    const [newEmployee, setNewEmployee] = useState('')
    const [depositAmount, setDepositAmount] = useState('1000')
    const [ratePerMinute, setRatePerMinute] = useState('0.75')
    const [isOpening, setIsOpening] = useState(false)

    const [pausedEmployees, setPausedEmployees] = useState<Record<string, boolean>>({})

    // Sync channels to employee display (preserve demo employees)
    useEffect(() => {
        const channelEmployees: EmployeeDisplay[] = channels.map((ch) => {
            const isPaused = pausedEmployees[ch.id]
            return {
                id: ch.id,
                name: ch.employeeEns || `${ch.employee.slice(0, 8)}...${ch.employee.slice(-6)}`,
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

    // Off-chain streaming loop
    useEffect(() => {
        if (!yellowConnected) return

        const interval = setInterval(async () => {
            const activeEmployees = employees.filter(e => e.status === 'active' && !e.id.startsWith('demo_'))

            for (const emp of activeEmployees) {
                try {
                    // Calculate amount for 5 seconds: (Rate per min / 60) * 5
                    // Rate is in USDC (e.g. 0.75)
                    const amountUSDC = (emp.rate / 60) * 5
                    // Convert to units (6 decimals)
                    const amountUnits = BigInt(Math.floor(amountUSDC * 1_000_000))

                    if (amountUnits > 0n) {
                        console.log(`Streaming ${amountUnits} units to ${emp.name}`)
                        await sendPayment(amountUnits, emp.address)
                    }
                } catch (err) {
                    console.error('Streaming failed for', emp.name, err)
                }
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [employees, yellowConnected, sendPayment])

    const handleAddEmployee = async () => {
        console.log("calling handleAddEmployee")
        if (!newEmployee || !depositAmount) return

        setIsOpening(true)
        try {
            // Determine if it's an ENS name
            const isEns = newEmployee.includes('.eth')
            const address = isEns
                ? '0x' + '0'.repeat(40) // Placeholder
                : newEmployee

            // Convert to 6 decimals
            const depositUnits = BigInt(Math.floor(Number(depositAmount) * 1_000_000))
            const rateUnits = BigInt(Math.floor(Number(ratePerMinute) * 1_000_000))

            // Create channel via Yellow SDK (Off-Chain setup + On-Chain fund)
            await createChannel(address, depositUnits, rateUnits)

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

    const totalDeposited = employees.reduce((sum, e) => sum + e.currentBalance + e.totalPaid, 0)
    const activeStreams = employees.filter(e => e.status === 'active').length

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

            <section className="add-employee-section card">
                <h3>Open Payment Channel</h3>
                <p className="text-secondary mb-lg">
                    Deposit USDC once, then stream payments gaslessly every minute.
                </p>
                <div className="add-employee-form">
                    <div className="form-group">
                        <label className="label">Employee Address or ENS</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="maria.company.eth or 0x..."
                            value={newEmployee}
                            onChange={(e) => setNewEmployee(e.target.value)}
                        />
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
                        disabled={isOpening || !yellowConnected}
                    >
                        {isOpening ? 'Opening...' : 'Open Channel'}
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
