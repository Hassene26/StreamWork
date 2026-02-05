import { useState, useCallback, useEffect, useRef } from 'react'
import { circleService } from '../services/circle'
import { backendApi } from '../api/backend'
import { env } from '../config/env'

const STORAGE_KEY = 'streamwork_circle_session'

interface CircleSession {
    userId: string
    walletId: string
    address: string
}

interface TokenBalance {
    token: {
        symbol: string
        name: string
        decimals: number
    }
    amount: string
}

interface UseCircleWalletReturn {
    userId: string | null
    walletId: string | null
    address: string | null
    balance: string
    isLoading: boolean
    isRestoring: boolean
    error: string | null
    isConnected: boolean
    init: (appId: string) => void
    login: () => Promise<void>
    logout: () => void
    refreshBalance: () => Promise<void>
}

function saveSession(session: CircleSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function loadSession(): CircleSession | null {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null
    try {
        return JSON.parse(data)
    } catch {
        return null
    }
}

function clearSession(): void {
    localStorage.removeItem(STORAGE_KEY)
}

export function useCircleWallet(): UseCircleWalletReturn {
    const [userId, setUserId] = useState<string | null>(null)
    const [walletId, setWalletId] = useState<string | null>(null)
    const [address, setAddress] = useState<string | null>(null)
    const [balance, setBalance] = useState<string>('0.00')
    const [isLoading, setIsLoading] = useState(false)
    const [isRestoring, setIsRestoring] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const isConnected = !!walletId && !!address

    // Pre-fetched device credentials (to avoid async gap on login click)
    const prefetchedDeviceToken = useRef<string | null>(null)
    const prefetchedDeviceEncryptionKey = useRef<string | null>(null)

    const init = useCallback((appId: string) => {
        try {
            circleService.init(appId)
            console.log('Circle SDK initialized with App ID:', appId)
        } catch (err) {
            console.error('Failed to init Circle SDK:', err)
            setError('Failed to initialize Circle SDK')
        }
    }, [])

    // Fetch balance for a wallet (balance fetching is best-effort)
    const fetchBalance = useCallback(async (wId: string, token?: string) => {
        try {
            const response = await backendApi.getWalletBalance(wId, token)
            const balances: TokenBalance[] = response.tokenBalances || []

            // Find USDC balance (or first stablecoin)
            const usdcBalance = balances.find(
                (b) => b.token.symbol === 'USDC' || b.token.symbol === 'USDT'
            )

            if (usdcBalance) {
                // Format with proper decimals
                const decimals = usdcBalance.token.decimals || 6
                const amount = parseFloat(usdcBalance.amount) / Math.pow(10, decimals)
                setBalance(amount.toFixed(2))
            } else if (balances.length > 0) {
                // Use first available balance
                const first = balances[0]
                const decimals = first.token.decimals || 18
                const amount = parseFloat(first.amount) / Math.pow(10, decimals)
                setBalance(amount.toFixed(2))
            } else {
                setBalance('0.00')
            }
        } catch (err) {
            console.warn('Failed to fetch balance:', err)
            // Don't fail - balance fetch is non-critical, show 0
            setBalance('0.00')
        }
    }, [])

    const refreshBalance = useCallback(async () => {
        if (walletId) {
            await fetchBalance(walletId)
        }
    }, [walletId, fetchBalance])

    // Restore session on mount
    useEffect(() => {
        const restoreSession = async () => {
            // Initialize SDK first
            if (env.circleAppId && !circleService['isInitialized']) {
                try {
                    circleService.init(env.circleAppId)
                } catch (e) {
                    console.warn('SDK Init Warning:', e)
                }
            }

            // Try to restore saved session
            const session = loadSession()
            if (session) {
                console.log('Restoring Circle session...')
                try {
                    // Verify session is still valid by checking wallets
                    const walletResponse = await backendApi.getWallets(session.userId)

                    if (walletResponse.wallets && walletResponse.wallets.length > 0) {
                        const wallet = walletResponse.wallets.find(
                            (w: any) => w.id === session.walletId
                        ) || walletResponse.wallets[0]

                        setUserId(session.userId)
                        setWalletId(wallet.id)
                        setAddress(wallet.address)

                        // Fetch balance
                        await fetchBalance(wallet.id)
                        console.log('Session restored successfully')
                    } else {
                        // Session invalid, clear it
                        clearSession()
                    }
                } catch (err) {
                    console.warn('Failed to restore session:', err)
                    clearSession()
                }
            }
            setIsRestoring(false)
        }

        restoreSession()
    }, [fetchBalance])

    // Pre-fetch device token so login popup opens without async delay
    useEffect(() => {
        if (isConnected) return

        const prefetch = async () => {
            try {
                const deviceId = crypto.randomUUID()
                const deviceResponse = await backendApi.getDeviceToken(deviceId)
                const { deviceToken, deviceEncryptionKey } = deviceResponse.data || deviceResponse
                prefetchedDeviceToken.current = deviceToken
                prefetchedDeviceEncryptionKey.current = deviceEncryptionKey
                console.log('Device token pre-fetched successfully')
            } catch (err) {
                console.warn('Failed to pre-fetch device token:', err)
            }
        }

        prefetch()
    }, [isConnected])

    const login = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            // 1. Get device credentials (pre-fetched or inline fallback)
            let deviceToken: string
            let deviceEncryptionKey: string

            if (prefetchedDeviceToken.current && prefetchedDeviceEncryptionKey.current) {
                // Fast path: use pre-fetched credentials (no async gap before popup)
                console.log('Using pre-fetched device token for immediate popup')
                deviceToken = prefetchedDeviceToken.current
                deviceEncryptionKey = prefetchedDeviceEncryptionKey.current
                prefetchedDeviceToken.current = null
                prefetchedDeviceEncryptionKey.current = null
            } else {
                // Fallback: fetch inline (popup may be blocked by browser)
                console.warn('No pre-fetched device token, fetching inline (popup may be blocked)')
                const deviceId = crypto.randomUUID()
                const deviceResponse = await backendApi.getDeviceToken(deviceId)
                const resp = deviceResponse.data || deviceResponse
                deviceToken = resp.deviceToken
                deviceEncryptionKey = resp.deviceEncryptionKey
            }

            // 2. Perform Social Login (SDK handles Google Popup)
            console.log('Launching Circle Social Login...')
            const authResult = await circleService.performLogin(deviceToken, deviceEncryptionKey)
            const newUserId = authResult.userId
            console.log('Social Login Success, User ID:', newUserId)

            // 4. Check for existing wallets
            let walletResponse = await backendApi.getWallets(newUserId)

            // 5. If no wallet, initialize one
            if (!walletResponse.wallets || walletResponse.wallets.length === 0) {
                console.log('No wallet found, initializing...')
                const { challengeId } = await backendApi.initWallet(newUserId)
                if (challengeId) {
                    await circleService.execute(
                        authResult.userToken,
                        authResult.encryptionKey,
                        challengeId
                    )
                    // Wait for creation
                    await new Promise((r) => setTimeout(r, 2000))
                    walletResponse = await backendApi.getWallets(newUserId)
                }
            }

            if (walletResponse.wallets && walletResponse.wallets.length > 0) {
                const wallet = walletResponse.wallets[0]

                // Save session
                saveSession({
                    userId: newUserId,
                    walletId: wallet.id,
                    address: wallet.address,
                })

                setUserId(newUserId)
                setWalletId(wallet.id)
                setAddress(wallet.address)

                // Fetch balance
                await fetchBalance(wallet.id)

                console.log('Wallet Connected:', wallet)
            } else {
                throw new Error('Wallet creation failed or pending')
            }
        } catch (err: any) {
            console.error('Login failed:', err)
            setError(err.message || 'Failed to login')
        } finally {
            setIsLoading(false)
        }
    }, [fetchBalance])

    const logout = useCallback(() => {
        clearSession()
        setUserId(null)
        setWalletId(null)
        setAddress(null)
        setBalance('0.00')
        setError(null)
        console.log('Logged out from Circle')
    }, [])

    return {
        userId,
        walletId,
        address,
        balance,
        isLoading,
        isRestoring,
        error,
        isConnected,
        init,
        login,
        logout,
        refreshBalance,
    }
}
