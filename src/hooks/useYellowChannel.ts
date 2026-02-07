/**
 * React hook for Yellow Network channel management
 * 
 * Uses real @erc7824/nitrolite SDK to connect to Yellow Network sandbox.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { yellowService, PaymentChannel, ConnectionStatus } from '../services/yellow'

interface UseYellowChannelReturn {
    connectionStatus: ConnectionStatus
    isConnected: boolean
    isConnecting: boolean
    channels: PaymentChannel[]
    createChannel: (counterparty: string, depositAmount: bigint, rate: bigint, ensName?: string) => Promise<string | null>
    fundChannel: (channelId: string, amount: bigint) => Promise<void>
    closeChannel: (channelId: string, destination?: string) => Promise<string | null>
    sendPayment: (amount: bigint, recipient: string) => Promise<void>
    depositToCustody: (amount: bigint) => Promise<string | null>
    withdrawFromCustody: (amount: bigint) => Promise<string | null>
    mintToken: (amount: bigint) => Promise<string | null>
    balance: bigint // Custody balance
    walletBalance: bigint // Wallet token balance
    error: Error | null
}

export function useYellowChannel(): UseYellowChannelReturn {
    const { address, isConnected: walletConnected } = useAccount()
    const { data: walletClient } = useWalletClient()

    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [balance, setBalance] = useState<bigint>(0n)
    const [walletBalance, setWalletBalance] = useState<bigint>(0n)
    const [channels, setChannels] = useState<PaymentChannel[]>([])
    const [error, setError] = useState<Error | null>(null)

    // Connect to Yellow Network when wallet is connected
    useEffect(() => {
        if (!walletConnected || !address || !walletClient) {
            return
        }

        const connectToYellow = async () => {
            setError(null)

            try {
                // Setup viem clients from wagmi wallet
                await yellowService.setupClients(walletClient)

                // Connect to ClearNode WebSocket
                await yellowService.connect()

                setConnectionStatus('connected')
                setIsConnected(true)
                setIsConnecting(false)
                setChannels(yellowService.getAllChannels())
                setBalance(yellowService.getBalance())

            } catch (err) {
                console.error('Failed to connect to Yellow Network:', err)
                setError(err instanceof Error ? err : new Error('Connection failed'))
                setConnectionStatus('error')
                setIsConnected(false)
                setIsConnecting(false)
            }
        }

        connectToYellow()

        // Subscribe to status changes
        const unsubStatus = yellowService.onStatusChange((status) => {
            setConnectionStatus(status)
            setIsConnected(status === 'connected')
            setIsConnecting(status === 'connecting' || status === 'authenticating')
            if (status === 'error') {
                setError(new Error('Yellow Network connection error'))
            }
        })

        // Subscribe to channel updates
        const unsubChannel = yellowService.onChannelUpdate((_channel) => {
            setChannels(yellowService.getAllChannels())
        })

        // Subscribe to balance updates
        const unsubBalance = yellowService.onBalanceUpdate((bal) => {
            console.log('💰 Hook received balance update:', bal)
            setBalance(bal)
        })

        // Subscribe to errors
        const unsubError = yellowService.onError((err) => {
            setError(err)
        })

        // Cleanup on unmount
        return () => {
            unsubStatus()
            unsubChannel()
            unsubBalance()
            unsubError()
            yellowService.disconnect()
            setConnectionStatus('disconnected')
            setIsConnected(false)
            setIsConnecting(false)
            setChannels([])
            setBalance(0n)
            setError(null)
        }
    }, [walletConnected, address, walletClient])

    // Refresh channels periodically (this can be removed if onChannelUpdate is sufficient)
    useEffect(() => {
        const refreshChannels = () => {
            setChannels(yellowService.getAllChannels())
        }

        const refreshWalletBalance = async () => {
            try {
                const wb = await yellowService.getWalletTokenBalance()
                setWalletBalance(wb)
            } catch (e) {
                // Ignore errors if not connected
            }
        }

        refreshChannels()
        refreshWalletBalance()
        const interval = setInterval(() => {
            refreshChannels()
            refreshWalletBalance()
        }, 2000)

        return () => clearInterval(interval)
    }, [walletConnected])

    const createChannel = useCallback(async (counterparty: string, depositAmount: bigint, rate: bigint, ensName?: string): Promise<string | null> => {
        try {
            setError(null)
            return await yellowService.createChannel(counterparty, depositAmount, rate, ensName)
        } catch (err) {
            console.error('Failed to create channel:', err)
            setError(err instanceof Error ? err : new Error('Failed to create channel'))
            return null
        }
    }, [])

    const fundChannel = useCallback(async (channelId: string, amount: bigint): Promise<void> => {
        try {
            setError(null)
            await yellowService.fundChannel(channelId, amount)
        } catch (err) {
            console.error('Failed to fund channel:', err)
            setError(err instanceof Error ? err : new Error('Failed to fund channel'))
        }
    }, [])

    const closeChannel = useCallback(async (channelId: string, destination?: string): Promise<string | null> => {
        try {
            setError(null)
            return await yellowService.closeChannel(channelId, destination)
        } catch (err) {
            console.error('Failed to close channel:', err)
            setError(err instanceof Error ? err : new Error('Failed to close channel'))
            return null
        }
    }, [])

    const sendPayment = useCallback(async (amount: bigint, recipient: string): Promise<void> => {
        try {
            setError(null)
            await yellowService.sendPayment(amount, recipient)
        } catch (err) {
            console.error('Failed to send payment:', err)
            setError(err instanceof Error ? err : new Error('Failed to send payment'))
        }
    }, [])

    const depositToCustody = useCallback(async (amount: bigint): Promise<string | null> => {
        try {
            setError(null)
            const txHash = await yellowService.depositToCustody(amount)
            return txHash
        } catch (err) {
            console.error('Failed to deposit to custody:', err)
            setError(err instanceof Error ? err : new Error('Failed to deposit'))
            return null
        }
    }, [])

    const withdrawFromCustody = useCallback(async (amount: bigint): Promise<string | null> => {
        try {
            setError(null)
            const txHash = await yellowService.withdrawFromCustody(amount)
            return txHash
        } catch (err) {
            console.error('Failed to withdraw from custody:', err)
            setError(err instanceof Error ? err : new Error('Failed to withdraw'))
            return null
        }
    }, [])

    const mintToken = useCallback(async (amount: bigint): Promise<string | null> => {
        try {
            setError(null)
            const txHash = await yellowService.mintToken(amount)
            return txHash
        } catch (err) {
            console.error('Failed to mint tokens:', err)
            setError(err instanceof Error ? err : new Error('Failed to mint tokens'))
            return null
        }
    }, [])

    return {
        connectionStatus,
        isConnected,
        isConnecting,
        channels,
        balance,
        createChannel,
        fundChannel,
        closeChannel,
        sendPayment,
        depositToCustody,
        withdrawFromCustody,
        mintToken,
        walletBalance,
        error,
    }
}

/**
 * Hook for real-time streaming balance updates
 */
export function useStreamBalance(channelId: string | null): {
    balance: bigint
    rate: bigint
    status: string | null
} {
    const [balance, setBalance] = useState(0n)
    const [rate, setRate] = useState(0n)
    const [status, setStatus] = useState<string | null>(null)

    useEffect(() => {
        if (!channelId) {
            return
        }

        const updateBalance = () => {
            const channel = yellowService.getChannel(channelId)
            if (channel) {
                setBalance(channel.employeeBalance)
                setRate(channel.ratePerMinute)
                setStatus(channel.status)
            }
        }

        updateBalance()
        const interval = setInterval(updateBalance, 100) // Update frequently for smooth animation

        return () => clearInterval(interval)
    }, [channelId])

    return { balance, rate, status }
}
