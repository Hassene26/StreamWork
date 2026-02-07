import { useState, useEffect } from 'react'
import './BridgeModal.css'

interface WithdrawModalProps {
    isOpen: boolean
    onClose: () => void
    balance: string
    walletAddress: string | null
    ensName?: string
    onWithdrawToWallet: (chain: string, address: string, amount: string) => Promise<void>
    onWithdrawToBank: (amount: string) => Promise<void>
}

type Destination = 'wallet' | 'bank'
type Status = 'idle' | 'processing' | 'success' | 'error'

// Supported chains for withdrawal
const SUPPORTED_CHAINS = [
    { id: 'ETH', name: 'Ethereum', icon: '⟠' },
    { id: 'ETH-SEPOLIA', name: 'Ethereum Sepolia', icon: '⟠' },
    { id: 'MATIC', name: 'Polygon', icon: '⬡' },
    { id: 'ARB', name: 'Arbitrum', icon: '🔵' },
    { id: 'AVAX', name: 'Avalanche', icon: '🔺' },
    { id: 'SOL', name: 'Solana', icon: '◎' },
]

export function BridgeModal({
    isOpen,
    onClose,
    balance,
    walletAddress,
    ensName,
    onWithdrawToWallet,
    onWithdrawToBank,
}: WithdrawModalProps) {
    const [destination, setDestination] = useState<Destination>('wallet')
    const [amount, setAmount] = useState('')
    const [status, setStatus] = useState<Status>('idle')
    const [statusMessage, setStatusMessage] = useState('')

    // Wallet withdrawal fields
    const [selectedChain, setSelectedChain] = useState('ETH-SEPOLIA')
    const [destinationAddress, setDestinationAddress] = useState('')

    // Bank withdrawal fields (placeholder for demo)
    const [linkedBankId] = useState<string | null>('demo-bank-123')

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setStatus('idle')
            setStatusMessage('')
        }
    }, [isOpen])

    if (!isOpen) return null

    const maxAmount = parseFloat(balance) || 0
    const amountNum = parseFloat(amount) || 0
    const isValidAmount = amountNum > 0 && amountNum <= maxAmount

    // Validate wallet withdrawal
    const isWalletValid = destination === 'wallet'
        ? (isValidAmount && destinationAddress.length > 10 && selectedChain)
        : true

    // Validate bank withdrawal
    const isBankValid = destination === 'bank'
        ? (isValidAmount && linkedBankId)
        : true

    const canSubmit = destination === 'wallet' ? isWalletValid : isBankValid

    const handleSubmit = async () => {
        if (!canSubmit) return

        setStatus('processing')

        try {
            if (destination === 'wallet') {
                setStatusMessage(`Withdrawing to ${SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.name}...`)
                await onWithdrawToWallet(selectedChain, destinationAddress, amount)
                setStatus('success')
                setStatusMessage('Withdrawal submitted! Check your wallet in a few minutes.')
            } else {
                setStatusMessage('Processing bank transfer...')
                await onWithdrawToBank(amount)
                setStatus('success')
                setStatusMessage('Bank transfer initiated! Funds will arrive in 1-3 business days.')
            }
        } catch (e: any) {
            setStatus('error')
            setStatusMessage(e.message || 'Transaction failed')
        }
    }

    const handleClose = () => {
        setAmount('')
        setDestinationAddress('')
        setStatus('idle')
        setStatusMessage('')
        onClose()
    }

    const setMaxAmount = () => {
        setAmount(balance)
    }

    // Use current Circle wallet as default destination
    const useMyAddress = () => {
        if (walletAddress) {
            setDestinationAddress(walletAddress)
        }
    }

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>💸 Withdraw Funds</h2>
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
                                    {ensName || `${walletAddress?.slice(0, 8)}...${walletAddress?.slice(-6)}`}
                                </span>
                            </div>
                            <span className="source-balance">${balance} USDC</span>
                        </div>
                    </div>

                    {/* Destination Selection */}
                    <div className="bridge-destination">
                        <span className="label">Withdraw to</span>
                        <div className="destination-options">
                            <button
                                className={`dest-option ${destination === 'wallet' ? 'active' : ''}`}
                                onClick={() => setDestination('wallet')}
                            >
                                <span className="dest-icon">🔗</span>
                                <span className="dest-name">External Wallet</span>
                                <span className="dest-desc">Any chain / address</span>
                            </button>
                            <button
                                className={`dest-option ${destination === 'bank' ? 'active' : ''}`}
                                onClick={() => setDestination('bank')}
                            >
                                <span className="dest-icon">🏦</span>
                                <span className="dest-name">Bank Account</span>
                                <span className="dest-desc">1-3 business days</span>
                            </button>
                        </div>
                    </div>

                    {/* Wallet-specific fields */}
                    {destination === 'wallet' && (
                        <>
                            {/* Chain Selection */}
                            <div className="bridge-chain">
                                <span className="label">Destination Chain</span>
                                <div className="chain-grid">
                                    {SUPPORTED_CHAINS.map((chain) => (
                                        <button
                                            key={chain.id}
                                            className={`chain-option ${selectedChain === chain.id ? 'active' : ''}`}
                                            onClick={() => setSelectedChain(chain.id)}
                                        >
                                            <span className="chain-icon">{chain.icon}</span>
                                            <span className="chain-name">{chain.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Destination Address */}
                            <div className="bridge-address">
                                <span className="label">Destination Address</span>
                                <div className="address-input-wrapper">
                                    <input
                                        type="text"
                                        value={destinationAddress}
                                        onChange={(e) => setDestinationAddress(e.target.value)}
                                        placeholder="0x..."
                                        disabled={status === 'processing'}
                                    />
                                    <button
                                        className="use-my-btn"
                                        onClick={useMyAddress}
                                        title="Use my Circle wallet address"
                                    >
                                        Use Mine
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Bank-specific fields */}
                    {destination === 'bank' && (
                        <div className="bank-info">
                            <span className="label">Linked Bank Account</span>
                            <div className="bank-card">
                                <span className="bank-icon">🏦</span>
                                <div className="bank-details">
                                    <span className="bank-name">Demo Bank ****1234</span>
                                    <span className="bank-status">✓ Verified</span>
                                </div>
                            </div>
                            <p className="bank-note">
                                Bank withdrawals are converted to USD and sent via wire transfer.
                            </p>
                        </div>
                    )}

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

                    {/* Preview */}
                    {amountNum > 0 && (
                        <div className="withdraw-preview">
                            <div className="preview-row">
                                <span>You send</span>
                                <span className="preview-value">${amountNum.toFixed(2)} USDC</span>
                            </div>
                            <div className="preview-row">
                                <span>Network fee (est.)</span>
                                <span className="preview-value">~$0.50</span>
                            </div>
                            <div className="preview-row total">
                                <span>You receive (approx.)</span>
                                <span className="preview-value">${(amountNum - 0.50).toFixed(2)}</span>
                            </div>
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
                            disabled={!canSubmit || status === 'processing'}
                        >
                            {status === 'processing' ? 'Processing...' : (
                                destination === 'wallet'
                                    ? `Withdraw to ${SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.name}`
                                    : 'Withdraw to Bank'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
