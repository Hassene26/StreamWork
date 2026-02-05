/**
 * useCircleWallet Hook
 * 
 * Implements Circle social login flow based on official documentation:
 * https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login
 * 
 * Flow:
 * 1. Get deviceId from SDK
 * 2. Create device token (backend)
 * 3. Login with Google (SDK redirects, then callback fires with userToken)
 * 4. Initialize user (backend → challengeId)
 * 5. Execute challenge (SDK → creates wallet)
 * 6. List wallets (get the created wallet)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { circleService, getStoredLoginResult, clearStoredLoginResult, LoginResult } from '../services/circle'
import { backendApi } from '../api/backend'
import { env } from '../config/env'

const SESSION_KEY = 'streamwork_circle_session'

interface CircleSession {
    walletId: string
    walletAddress: string
    userToken: string
    encryptionKey: string
}

interface Wallet {
    id: string
    address: string
    blockchain: string
}

interface UseCircleWalletReturn {
    // State
    walletId: string | null
    address: string | null
    balance: string
    isLoading: boolean
    isRestoring: boolean
    error: string | null
    status: string
    isConnected: boolean

    // Actions
    login: () => Promise<void>
    logout: () => void
    refreshBalance: () => Promise<void>
}

function saveSession(session: CircleSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function loadSession(): CircleSession | null {
    try {
        const data = localStorage.getItem(SESSION_KEY)
        return data ? JSON.parse(data) : null
    } catch {
        return null
    }
}

function clearSession(): void {
    localStorage.removeItem(SESSION_KEY)
}

export function useCircleWallet(): UseCircleWalletReturn {
    const [walletId, setWalletId] = useState<string | null>(null)
    const [address, setAddress] = useState<string | null>(null)
    const [balance, setBalance] = useState<string>('0.00')
    const [isLoading, setIsLoading] = useState(false)
    const [isRestoring, setIsRestoring] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string>('Ready')

    // Pre-fetched device credentials
    const deviceIdRef = useRef<string | null>(null)
    const deviceTokenRef = useRef<string | null>(null)
    const deviceEncryptionKeyRef = useRef<string | null>(null)

    const isConnected = !!walletId && !!address

    // Fetch balance for a wallet
    const fetchBalance = useCallback(async (wId: string, userToken?: string) => {
        try {
            const response = await backendApi.getWalletBalance(wId, userToken)
            const balances = response.tokenBalances || []

            const usdcBalance = balances.find((b: any) =>
                b.token?.symbol?.startsWith('USDC') || b.token?.name?.includes('USDC')
            )

            if (usdcBalance) {
                const decimals = usdcBalance.token.decimals || 6
                const amount = parseFloat(usdcBalance.amount) / Math.pow(10, decimals)
                setBalance(amount.toFixed(2))
            } else if (balances.length > 0) {
                const first = balances[0]
                const decimals = first.token?.decimals || 18
                const amount = parseFloat(first.amount) / Math.pow(10, decimals)
                setBalance(amount.toFixed(2))
            } else {
                setBalance('0.00')
            }
        } catch (err) {
            console.warn('Failed to fetch balance:', err)
            setBalance('0.00')
        }
    }, [])

    const refreshBalance = useCallback(async () => {
        if (walletId) {
            const session = loadSession()
            await fetchBalance(walletId, session?.userToken)
        }
    }, [walletId, fetchBalance])

    // Load wallets and complete the connection
    const loadWallets = useCallback(async (userToken: string, encryptionKey: string) => {
        setStatus('Loading wallet details...')

        try {
            const response = await backendApi.listWalletsByToken(userToken)
            const wallets: Wallet[] = response.wallets || []

            if (wallets.length > 0) {
                const wallet = wallets[0]

                // Save session
                saveSession({
                    walletId: wallet.id,
                    walletAddress: wallet.address,
                    userToken,
                    encryptionKey,
                })

                setWalletId(wallet.id)
                setAddress(wallet.address)

                // Fetch balance
                await fetchBalance(wallet.id, userToken)

                // Clean up
                circleService.clearCookies()
                clearStoredLoginResult()

                setStatus('Wallet connected! 🎉')
                console.log('✅ Circle wallet connected:', wallet.address)
            } else {
                setStatus('No wallets found')
                setError('No wallets found for this user')
            }
        } catch (err: any) {
            console.error('Failed to load wallets:', err)
            setError(err.message || 'Failed to load wallets')
            setStatus('Failed to load wallets')
        }
    }, [fetchBalance])

    // Initialize user and create wallet
    const initializeAndCreateWallet = useCallback(async (loginResult: LoginResult) => {
        const { userToken, encryptionKey } = loginResult

        try {
            setStatus('Initializing user...')
            console.log('🔐 Initializing user with userToken...')

            const initResponse = await backendApi.initializeUser(userToken)

            // Code 155106 = user already initialized
            if (initResponse.code === 155106 || initResponse.status === 409) {
                console.log('ℹ️ User already initialized, loading existing wallets...')
                await loadWallets(userToken, encryptionKey)
                return
            }

            const challengeId = initResponse.challengeId
            if (!challengeId) {
                throw new Error('No challengeId returned from initialization')
            }

            console.log('🔐 Got challengeId:', challengeId)
            setStatus('Creating wallet...')

            // Set authentication and execute challenge
            circleService.setAuthentication(userToken, encryptionKey)

            circleService.execute(challengeId, async (error: any) => {
                if (error) {
                    console.error('❌ Challenge execution failed:', error)
                    setError(error?.message || 'Failed to create wallet')
                    setStatus('Wallet creation failed')
                    setIsLoading(false)
                    return
                }

                console.log('✅ Challenge executed, wallet created!')
                setStatus('Wallet created! Loading details...')

                // Wait a bit for Circle to index the wallet
                await new Promise(r => setTimeout(r, 2000))

                // Load the created wallet
                await loadWallets(userToken, encryptionKey)
                setIsLoading(false)
            })
        } catch (err: any) {
            console.error('Failed to initialize user:', err)
            setError(err.message || 'Failed to initialize user')
            setStatus('Initialization failed')
            setIsLoading(false)
        }
    }, [loadWallets])

    // Handle OAuth callback result
    const handleLoginComplete = useCallback((error: any, result: any) => {
        if (error) {
            console.error('❌ Login failed:', error)
            setError(error.message || 'Login failed')
            setStatus('Login failed')
            setIsLoading(false)
            return
        }

        if (result) {
            console.log('✅ Login successful, got credentials')
            setStatus('Login successful! Creating wallet...')

            // Continue with wallet creation
            initializeAndCreateWallet({
                userToken: result.userToken,
                encryptionKey: result.encryptionKey,
            })
        }
    }, [initializeAndCreateWallet])

    // Initialize SDK and check for OAuth callback on mount
    useEffect(() => {
        const init = async () => {
            // Initialize Circle SDK
            if (env.circleAppId && !circleService.ready) {
                circleService.init(env.circleAppId, handleLoginComplete)
            }

            // Check for OAuth callback result (from redirect)
            const storedResult = getStoredLoginResult()
            if (storedResult) {
                console.log('🔐 Found stored login result from OAuth redirect')
                setIsLoading(true)
                await initializeAndCreateWallet(storedResult)
                setIsRestoring(false)
                return
            }

            // Try to restore existing session
            const session = loadSession()
            if (session) {
                console.log('🔐 Restoring saved session...')
                setWalletId(session.walletId)
                setAddress(session.walletAddress)
                await fetchBalance(session.walletId, session.userToken)
                setStatus('Session restored')
            }

            // Pre-fetch device credentials for faster login
            try {
                if (circleService.ready && !deviceIdRef.current) {
                    const deviceId = await circleService.getDeviceId()
                    deviceIdRef.current = deviceId
                    localStorage.setItem('circle_deviceId', deviceId)

                    const { deviceToken, deviceEncryptionKey } = await backendApi.getDeviceToken(deviceId)
                    deviceTokenRef.current = deviceToken
                    deviceEncryptionKeyRef.current = deviceEncryptionKey
                    console.log('✅ Device token pre-fetched')
                }
            } catch (err) {
                console.warn('Failed to pre-fetch device token:', err)
            }

            setIsRestoring(false)
        }

        init()
    }, [handleLoginComplete, initializeAndCreateWallet, fetchBalance])

    // Login function
    const login = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        setStatus('Preparing login...')

        try {
            // Get or use cached device credentials
            let deviceToken = deviceTokenRef.current
            let deviceEncryptionKey = deviceEncryptionKeyRef.current

            if (!deviceToken || !deviceEncryptionKey) {
                setStatus('Creating device token...')

                let deviceId = deviceIdRef.current || localStorage.getItem('circle_deviceId')
                if (!deviceId && circleService.ready) {
                    deviceId = await circleService.getDeviceId()
                    deviceIdRef.current = deviceId
                    localStorage.setItem('circle_deviceId', deviceId)
                }

                if (!deviceId) {
                    throw new Error('Could not get device ID')
                }

                const response = await backendApi.getDeviceToken(deviceId)
                deviceToken = response.deviceToken
                deviceEncryptionKey = response.deviceEncryptionKey

                deviceTokenRef.current = deviceToken
                deviceEncryptionKeyRef.current = deviceEncryptionKey
            }

            setStatus('Redirecting to Google...')

            // This will redirect to Google OAuth
            circleService.performLogin(deviceToken!, deviceEncryptionKey!)

            // Note: Page will redirect, so we don't continue here
        } catch (err: any) {
            console.error('Login error:', err)
            setError(err.message || 'Login failed')
            setStatus('Login failed')
            setIsLoading(false)
        }
    }, [])

    // Logout function
    const logout = useCallback(() => {
        clearSession()
        circleService.clearCookies()
        clearStoredLoginResult()

        setWalletId(null)
        setAddress(null)
        setBalance('0.00')
        setError(null)
        setStatus('Logged out')

        console.log('🔐 Circle wallet disconnected')
    }, [])

    return {
        walletId,
        address,
        balance,
        isLoading,
        isRestoring,
        error,
        status,
        isConnected,
        login,
        logout,
        refreshBalance,
    }
}
