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
     * Initialize a wallet (Generate Challenge)
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
     * Get User Wallets
     */
    getWallets: async (userId: string) => {
        const response = await fetch(`${API_URL}/wallets/${userId}`)
        if (!response.ok) throw new Error('Failed to get wallets')
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
     * Note: userToken is optional - if not provided, returns empty balance
     */
    getWalletBalance: async (walletId: string, userToken?: string) => {
        const response = await fetch(`${API_URL}/wallets/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletId, userToken })
        })
        if (!response.ok) throw new Error('Failed to get balance')
        return response.json()
    }
}
