/**
 * Type-safe environment configuration for StreamWork frontend
 *
 * All environment variables must be prefixed with VITE_ or APP_
 * to be exposed to the frontend (see vite.config.ts)
 */

export const env = {
    // Circle Configuration
    circleAppId: import.meta.env.APP_ID || '',
    googleAuthClientId: import.meta.env.VITE_GOOGLE_AUTH_CLIENT_ID || '',

    // WalletConnect
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'streamwork-demo',

    // API
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',

    // Yellow Network (hardcoded for sandbox)
    yellowClearNodeUrl: 'wss://clearnet-sandbox.yellow.com/ws',

    // Blockchain
    chainId: 11155111, // Sepolia
} as const

// Validation helper - call on app init to warn about missing config
export function validateEnv(): void {
    const warnings: string[] = []

    if (!env.circleAppId) {
        warnings.push('APP_ID not set - Circle wallet features will not work')
    }

    if (env.walletConnectProjectId === 'streamwork-demo') {
        warnings.push('VITE_WALLETCONNECT_PROJECT_ID not set - using fallback')
    }

    if (warnings.length > 0) {
        console.warn('Environment configuration warnings:')
        warnings.forEach(w => console.warn(`  - ${w}`))
    }
}

// Type declaration for Vite env
declare global {
    interface ImportMetaEnv {
        readonly APP_ID: string
        readonly VITE_GOOGLE_AUTH_CLIENT_ID: string
        readonly VITE_WALLETCONNECT_PROJECT_ID: string
        readonly VITE_API_URL: string
    }
}
