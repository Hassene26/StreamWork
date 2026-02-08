import { useState, useEffect } from 'react'
// import './BridgeModal.css' - Removed in favor of Tailwind

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
    { id: 'ETH-SEPOLIA', name: 'Ethereum Sepolia', icon: '⟠' },
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

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] animate-in fade-in duration-200" onClick={handleClose}>
            <div
                className="bg-[#1a2e1e] border border-[#28392c] rounded-xl w-[90%] max-w-[480px] max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-6 border-b border-[#28392c]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">payments</span>
                        Withdraw Funds
                    </h2>
                    <button
                        className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
                        onClick={handleClose}
                    >
                        ×
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6">
                    {/* Source */}
                    <div>
                        <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">From</span>
                        <div className="bg-black/30 p-4 rounded-lg flex items-center gap-3 border border-[#28392c]">
                            <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                                <span className="text-primary font-bold">◉</span>
                            </div>
                            <div className="flex-1">
                                <span className="block text-sm font-bold text-white">Circle Wallet</span>
                                <span className="block text-xs text-slate-400 font-mono">
                                    {ensName || `${walletAddress?.slice(0, 8)}...${walletAddress?.slice(-6)}`}
                                </span>
                            </div>
                            <span className="font-mono font-bold text-white">${balance} <span className="text-slate-500 text-xs">USDC</span></span>
                        </div>
                    </div>

                    {/* Destination Selection */}
                    <div>
                        <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Withdraw to</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${destination === 'wallet'
                                        ? 'bg-primary/5 border-primary'
                                        : 'bg-black/20 border-[#28392c] hover:border-primary/50'
                                    }`}
                                onClick={() => setDestination('wallet')}
                            >
                                <span className="text-2xl">🔗</span>
                                <div className="text-center">
                                    <span className={`block text-sm font-bold ${destination === 'wallet' ? 'text-white' : 'text-slate-300'}`}>External Wallet</span>
                                    <span className="block text-[10px] text-slate-500">Any chain / address</span>
                                </div>
                            </button>
                            <button
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${destination === 'bank'
                                        ? 'bg-primary/5 border-primary'
                                        : 'bg-black/20 border-[#28392c] hover:border-primary/50'
                                    }`}
                                onClick={() => setDestination('bank')}
                            >
                                <span className="text-2xl">🏦</span>
                                <div className="text-center">
                                    <span className={`block text-sm font-bold ${destination === 'bank' ? 'text-white' : 'text-slate-300'}`}>Bank Account</span>
                                    <span className="block text-[10px] text-slate-500">1-3 business days</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Wallet-specific fields */}
                    {destination === 'wallet' && (
                        <>
                            {/* Chain Selection */}
                            <div>
                                <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Destination Chain</span>
                                <div className="flex flex-col gap-2">
                                    {SUPPORTED_CHAINS.map((chain) => (
                                        <button
                                            key={chain.id}
                                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${selectedChain === chain.id
                                                    ? 'bg-primary/10 border-primary text-white'
                                                    : 'bg-black/20 border-[#28392c] text-slate-400 hover:border-primary/50'
                                                }`}
                                            onClick={() => setSelectedChain(chain.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{chain.icon}</span>
                                                <span className="text-sm font-bold">{chain.name}</span>
                                            </div>
                                            {selectedChain === chain.id && <span className="material-symbols-outlined text-primary text-sm">check_circle</span>}
                                        </button>
                                    ))}
                                    <div className="text-center p-2 border border-dashed border-[#28392c] rounded-lg text-slate-500 text-xs italic">
                                        More chains coming soon...
                                    </div>
                                </div>
                            </div>

                            {/* Destination Address */}
                            <div>
                                <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Destination Address</span>
                                <div className="flex bg-black/30 border border-[#28392c] rounded-lg p-1">
                                    <input
                                        type="text"
                                        className="flex-1 bg-transparent border-none text-white text-sm px-3 py-2 focus:outline-none font-mono placeholder:text-slate-600"
                                        value={destinationAddress}
                                        onChange={(e) => setDestinationAddress(e.target.value)}
                                        placeholder="0x..."
                                        disabled={status === 'processing'}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Bank-specific fields */}
                    {destination === 'bank' && (
                        <div>
                            <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Linked Bank Account</span>
                            <div className="bg-black/30 p-4 rounded-lg flex items-center gap-3 border border-[#28392c]">
                                <span className="text-2xl">🏦</span>
                                <div>
                                    <span className="block text-sm font-bold text-white">Demo Bank ****1234</span>
                                    <span className="block text-xs text-primary">✓ Verified</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                Bank withdrawals are converted to USD and sent via wire transfer.
                            </p>
                        </div>
                    )}

                    {/* Amount Input */}
                    <div>
                        <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Amount</span>
                        <div className="flex bg-black/30 border border-[#28392c] rounded-lg p-1 relative items-center">
                            <input
                                type="number"
                                className="flex-1 bg-transparent border-none text-white text-xl px-4 py-2 focus:outline-none font-mono placeholder:text-slate-600"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                max={maxAmount}
                                step="0.01"
                                disabled={status === 'processing'}
                            />
                            <span className="text-slate-500 text-sm font-bold mr-2">USDC</span>
                            <button
                                className="bg-primary hover:bg-primary-dark text-[#102215] text-xs font-bold px-3 py-1.5 rounded transition-colors mr-1"
                                onClick={setMaxAmount}
                            >
                                MAX
                            </button>
                        </div>
                    </div>

                    {/* Preview */}
                    {amountNum > 0 && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">You send</span>
                                <span className="text-white font-mono">${amountNum.toFixed(2)} USDC</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-primary/10 font-bold">
                                <span className="text-slate-300">You receive</span>
                                <span className="text-primary font-mono">${amountNum.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    {/* Status */}
                    {status !== 'idle' && (
                        <div className={`p-4 rounded-lg flex items-center gap-3 text-sm ${status === 'processing' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-200' :
                                status === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-200' :
                                    'bg-red-500/10 border border-red-500/20 text-red-200'
                            }`}>
                            {status === 'processing' && <div className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                            {status === 'success' && <span className="material-symbols-outlined text-lg">check_circle</span>}
                            {status === 'error' && <span className="material-symbols-outlined text-lg">error</span>}
                            <span>{statusMessage}</span>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-[#28392c]">
                    {status === 'success' ? (
                        <button className="w-full bg-primary hover:bg-primary-dark text-[#102215] font-bold py-3.5 rounded-lg transition-all shadow-[0_0_20px_rgba(19,236,73,0.3)]" onClick={handleClose}>
                            Done
                        </button>
                    ) : (
                        <button
                            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-[#102215] font-bold py-3.5 rounded-lg transition-all shadow-[0_0_20px_rgba(19,236,73,0.3)] disabled:shadow-none"
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
