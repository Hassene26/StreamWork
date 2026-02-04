
import { useState, useCallback } from 'react'
import { circleService } from '../services/circle'
import { backendApi } from '../api/backend'

interface UseCircleWalletReturn {
    walletId: string | null
    address: string | null
    balance: string
    isLoading: boolean
    error: string | null
    init: (appId: string) => void
    login: () => Promise<void>
}

export function useCircleWallet(): UseCircleWalletReturn {
    const [walletId, setWalletId] = useState<string | null>(null)
    const [address, setAddress] = useState<string | null>(null) // Circle Wallet Address
    const [balance, setBalance] = useState<string>('0.00')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const init = useCallback((appId: string) => {
        try {
            circleService.init(appId)
            console.log('Circle SDK initialized with App ID:', appId)
        } catch (err) {
            console.error('Failed to init Circle SDK:', err)
            setError('Failed to initialize Circle SDK')
        }
    }, [])

    // Auto-initialize if Env Var is present
    const appId = import.meta.env.APP_ID
    if (appId && !circleService['isInitialized']) {
        try {
            circleService.init(appId)
            console.log('Circle SDK initialized (Env):', appId)
        } catch (e) {
            console.warn('SDK Init Warning:', e)
        }
    }

    const login = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            // 1. Generate a random Device ID for this session
            const deviceId = crypto.randomUUID()
            console.log('Initiating Social Login with Device ID:', deviceId)

            // 2. Get Device Token from Backend
            const { deviceToken, deviceEncryptionKey } = await backendApi.getDeviceToken(deviceId)

            // 3. Perform Social Login (SDK handles Google Popup)
            console.log('Launching Circle Social Login...')
            // Result contains: { userToken, encryptionKey, userId, ... }
            const authResult = await circleService.performLogin(deviceToken, deviceEncryptionKey)
            const userId = authResult.userId
            console.log('Social Login Success, User ID:', userId)

            // 4. Check for existing wallets
            let walletResponse = await backendApi.getWallets(userId)

            // 5. If no wallet, User might be new -> Create Wallet (Challenge might be needed or handled by SDK flow)
            // Note: Social Login often restores access. If a wallet doesn't exist, we might need to Init it.
            if (!walletResponse.wallets || walletResponse.wallets.length === 0) {
                console.log('No wallet found, initializing...')
                // Initialize Wallet
                const { challengeId } = await backendApi.initWallet(userId)
                if (challengeId) {
                    // Execute Challenge (Set PIN if required by policy, or just acknowledge)
                    await circleService.execute(authResult.userToken, authResult.encryptionKey, challengeId)
                    // Wait for creation
                    await new Promise(r => setTimeout(r, 2000))
                    walletResponse = await backendApi.getWallets(userId)
                }
            }

            if (walletResponse.wallets && walletResponse.wallets.length > 0) {
                const wallet = walletResponse.wallets[0]
                setWalletId(wallet.id)
                setAddress(wallet.address)
                setBalance('0.00')
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
    }, [])

    return {
        walletId,
        address,
        balance,
        isLoading,
        error,
        init,
        login
    }
}
