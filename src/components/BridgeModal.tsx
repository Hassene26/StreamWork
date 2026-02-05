import { useState } from 'react'
import './BridgeModal.css'

interface BridgeModalProps {
    isOpen: boolean
    onClose: () => void
    balance: string
    walletAddress: string | null
    onBridgeToArc: (amount: string) => Promise<void>
    onBridgeToBank: (amount: string) => Promise<void>
}

type Destination = 'arc' | 'bank'
type Status = 'idle' | 'processing' | 'success' | 'error'

export function BridgeModal({
    isOpen,
    onClose,
    balance,
    walletAddress,
    onBridgeToArc,
    onBridgeToBank,
}: BridgeModalProps) {
    const [destination, setDestination] = useState<Destination>('arc')
    const [amount, setAmount] = useState('')
    const [status, setStatus] = useState<Status>('idle')
    const [statusMessage, setStatusMessage] = useState('')

    if (!isOpen) return null

    const maxAmount = parseFloat(balance) || 0
    const amountNum = parseFloat(amount) || 0
    const isValidAmount = amountNum > 0 && amountNum <= maxAmount

    // Simulated FX rate (for demo)
    const fxRates: Record<string, number> = {
        USD: 1,
        EUR: 0.92,
        ARS: 890,
        BRL: 4.97,
    }

    const handleSubmit = async () => {
        if (!isValidAmount) return

        setStatus('processing')
        setStatusMessage(destination === 'arc'
            ? 'Bridging to Arc Testnet...'
            : 'Processing withdrawal to bank...'
        )

        try {
            if (destination === 'arc') {
                await onBridgeToArc(amount)
            } else {
                await onBridgeToBank(amount)
            }
            setStatus('success')
            setStatusMessage(destination === 'arc'
                ? 'Bridge successful! Funds arriving on Arc.'
                : 'Withdrawal submitted! Funds arriving in 1-3 minutes.'
            )
        } catch (e: any) {
            setStatus('error')
            setStatusMessage(e.message || 'Transaction failed')
        }
    }

    const handleClose = () => {
        setAmount('')
        setStatus('idle')
        setStatusMessage('')
        onClose()
    }

    const setMaxAmount = () => {
        setAmount(balance)
    }

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Bridge / Withdraw</h2>
                    <button className="modal-close" onClick={handleClose}>×</button>
                </div>

                <div className="modal-body">
                    {/* Source */}
                    <div className="bridge-source">
                        <span className="label">From</span>
                        <div className="source-info">
                            <div className="source-icon">◉</div>
                            <div className="source-details">
                                <span className="source-name">Circle Wallet</span>
                                <span className="source-address">
                                    {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}
                                </span>
                            </div>
                            <span className="source-balance">${balance} USDC</span>
                        </div>
                    </div>

                    {/* Destination Selection */}
                    <div className="bridge-destination">
                        <span className="label">To</span>
                        <div className="destination-options">
                            <button
                                className={`dest-option ${destination === 'arc' ? 'active' : ''}`}
                                onClick={() => setDestination('arc')}
                            >
                                <span className="dest-icon">🔗</span>
                                <span className="dest-name">Arc Testnet</span>
                                <span className="dest-desc">Cross-chain bridge</span>
                            </button>
                            <button
                                className={`dest-option ${destination === 'bank' ? 'active' : ''}`}
                                onClick={() => setDestination('bank')}
                            >
                                <span className="dest-icon">🏦</span>
                                <span className="dest-name">Bank Account</span>
                                <span className="dest-desc">Fiat off-ramp</span>
                            </button>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div className="bridge-amount">
                        <span className="label">Amount</span>
                        <div className="amount-input-wrapper">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                max={maxAmount}
                                step="0.01"
                                disabled={status === 'processing'}
                            />
                            <span className="currency">USDC</span>
                            <button className="max-btn" onClick={setMaxAmount}>MAX</button>
                        </div>
                    </div>

                    {/* Fiat Preview (for bank destination) */}
                    {destination === 'bank' && amountNum > 0 && (
                        <div className="fiat-preview">
                            <span className="label">You'll receive (approx.)</span>
                            <div className="fiat-amounts">
                                <div className="fiat-row">
                                    <span className="fiat-currency">USD</span>
                                    <span className="fiat-value">
                                        ${(amountNum * fxRates.USD).toFixed(2)}
                                    </span>
                                </div>
                                <div className="fiat-row">
                                    <span className="fiat-currency">EUR</span>
                                    <span className="fiat-value">
                                        €{(amountNum * fxRates.EUR).toFixed(2)}
                                    </span>
                                </div>
                                <div className="fiat-row">
                                    <span className="fiat-currency">ARS</span>
                                    <span className="fiat-value">
                                        ${(amountNum * fxRates.ARS).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <p className="fiat-note">
                                Rates via Circle. 0% fee. Settlement: ~3 minutes.
                            </p>
                        </div>
                    )}

                    {/* Status */}
                    {status !== 'idle' && (
                        <div className={`bridge-status ${status}`}>
                            {status === 'processing' && <span className="spinner-sm"></span>}
                            {status === 'success' && <span>✓</span>}
                            {status === 'error' && <span>✗</span>}
                            <span>{statusMessage}</span>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {status === 'success' ? (
                        <button className="btn btn-primary btn-lg" onClick={handleClose}>
                            Done
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleSubmit}
                            disabled={!isValidAmount || status === 'processing'}
                        >
                            {status === 'processing' ? 'Processing...' : (
                                destination === 'arc' ? 'Bridge to Arc' : 'Withdraw to Bank'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
