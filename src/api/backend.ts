
const API_URL = 'http://localhost:3000/api'

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
    }
}
