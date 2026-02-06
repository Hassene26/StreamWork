import { env } from '../config/env'

const API_URL = env.apiUrl

export const backendApi = {
    /**
     * Create a new User in Circle's system (or ensure existence)
     */
    createUser: async (userId: string) => {
        const response = await fetch(`${API_URL}/users/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        })
        if (!response.ok) throw new Error('Failed to create user')
        return response.json()
    },

    /**
     * Get a session token for the user
     * Returns: { userToken, encryptionKey }
     */
    getUserToken: async (userId: string) => {
        const response = await fetch(`${API_URL}/users/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        })
        if (!response.ok) throw new Error('Failed to get token')
        return response.json()
    },

    /**
     * Get Device Token for Social Login
     * Returns: { deviceToken, deviceEncryptionKey }
     */
    getDeviceToken: async (deviceId: string) => {
        const response = await fetch(`${API_URL}/auth/device-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        })
        if (!response.ok) throw new Error('Failed to get device token')
        return response.json()
    },

    /**
     * Initialize a wallet (Generate Challenge) - Legacy method using userId
     * Returns: { challengeId }
     */
    initWallet: async (userId: string, blockchains = ['ETH-SEPOLIA']) => {
        const response = await fetch(`${API_URL}/wallets/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, blockchains })
        })
        if (!response.ok) throw new Error('Failed to initialize wallet')
        return response.json()
    },

    /**
     * Initialize User for Social Login (using userToken from OAuth)
     * Returns: { challengeId } or error code 155106 if already initialized
     */
    initializeUser: async (userToken: string, blockchains = ['ETH-SEPOLIA']) => {
        const response = await fetch(`${API_URL}/users/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userToken, blockchains })
        })
        const data = await response.json()
        // Don't throw for 155106 (user already initialized) - caller handles this
        if (!response.ok && data?.code !== 155106) {
            throw new Error(data?.message || 'Failed to initialize user')
        }
        return { ...data, status: response.status }
    },

    /**
     * Get User Wallets (legacy - by userId)
     */
    getWallets: async (userId: string) => {
        const response = await fetch(`${API_URL}/wallets/${userId}`)
        if (!response.ok) throw new Error('Failed to get wallets')
        return response.json()
    },

    /**
     * List Wallets using userToken (for social login flow)
     * Returns: { wallets: [...] }
     */
    listWalletsByToken: async (userToken: string) => {
        const response = await fetch(`${API_URL}/wallets/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userToken })
        })
        if (!response.ok) throw new Error('Failed to list wallets')
        return response.json()
    },

    /**
     * Initiate a Payout (Mock)
     */
    payout: async (amount: string, destination: string) => {
        const response = await fetch(`${API_URL}/payouts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, destination })
        })
        if (!response.ok) throw new Error('Failed to payout')
        return response.json()
    },

    /**
     * Get Wallet Balance
     * Returns token balances for a wallet
     */
    getWalletBalance: async (walletId: string, userToken?: string) => {
        const response = await fetch(`${API_URL}/wallets/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletId, userToken })
        })
        if (!response.ok) throw new Error('Failed to get balance')
        return response.json()
    },

    /**
     * Create Transfer Challenge (for user-controlled wallet withdrawals)
     * Returns: { challengeId } - must be executed via Circle SDK on frontend
     */
    createTransferChallenge: async (params: {
        userToken: string
        walletId: string
        destinationAddress: string
        amount: string
        tokenId: string
    }) => {
        const response = await fetch(`${API_URL}/withdraw/create-transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        })
        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to create transfer')
        }
        return response.json()
    }
}

