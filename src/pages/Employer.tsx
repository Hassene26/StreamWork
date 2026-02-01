import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '../components/ConnectButton'
import './Employer.css'

interface Employee {
    id: string
    name: string
    address: string
    rate: number
    status: 'active' | 'paused'
    totalPaid: number
    currentBalance: number
}

export function Employer() {
    const { isConnected } = useAccount()
    const [employees, setEmployees] = useState<Employee[]>([
        {
            id: '1',
            name: 'maria.design.eth',
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE2D',
            rate: 0.75, // USDC per minute
            status: 'active',
            totalPaid: 1847.32,
            currentBalance: 2500,
        },
    ])
    const [newEmployee, setNewEmployee] = useState('')
    const [depositAmount, setDepositAmount] = useState('')

    const handleAddEmployee = () => {
        if (!newEmployee) return
        const newEmp: Employee = {
            id: Date.now().toString(),
            name: newEmployee.includes('.eth') ? newEmployee : `${newEmployee.slice(0, 8)}...`,
            address: newEmployee.includes('.eth') ? '0x...' : newEmployee,
            rate: 0.75,
            status: 'active',
            totalPaid: 0,
            currentBalance: parseFloat(depositAmount) || 1000,
        }
        setEmployees([...employees, newEmp])
        setNewEmployee('')
        setDepositAmount('')
    }

    if (!isConnected) {
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
                    <p className="text-secondary">Stream salaries to your remote team in real-time</p>
                </div>
                <div className="header-stats">
                    <div className="stat-box">
                        <span className="stat-label">Total Deposited</span>
                        <span className="stat-value">$5,000.00</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Active Streams</span>
                        <span className="stat-value text-success">{employees.filter(e => e.status === 'active').length}</span>
                    </div>
                </div>
            </header>

            <section className="add-employee-section card">
                <h3>Add New Employee</h3>
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
                        <label className="label">Initial Deposit (USDC)</label>
                        <input
                            type="number"
                            className="input"
                            placeholder="1000"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={handleAddEmployee}>
                        Open Payment Channel
                    </button>
                </div>
            </section>

            <section className="employees-section">
                <h3>Active Payment Channels</h3>
                <div className="employees-grid">
                    {employees.map((emp) => (
                        <div key={emp.id} className="employee-card card">
                            <div className="employee-header">
                                <div className="employee-info">
                                    <span className="status-dot active"></span>
                                    <span className="employee-name">{emp.name}</span>
                                </div>
                                <span className={`status-badge ${emp.status}`}>
                                    {emp.status}
                                </span>
                            </div>

                            <div className="employee-stats">
                                <div className="employee-stat">
                                    <span className="label">Rate</span>
                                    <span className="value">${emp.rate}/min</span>
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
                                <button className="btn btn-outline btn-sm">
                                    {emp.status === 'active' ? 'Pause' : 'Resume'}
                                </button>
                                <button className="btn btn-outline btn-sm" style={{ color: '#ef4444' }}>
                                    Close Channel
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
