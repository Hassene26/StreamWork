/**
 * Circle SDK Service for Social Login
 * 
 * Based on Circle's official documentation:
 * https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login
 */

import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { SocialLoginProvider } from '@circle-fin/w3s-pw-web-sdk/dist/src/types'
import { env } from '../config/env'

// Cookie helpers for persisting config across OAuth redirect
function setCookie(name: string, value: string, days = 1): void {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
}

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : null
}

function clearCookie(name: string): void {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}

// Store OAuth result in sessionStorage
const OAUTH_RESULT_KEY = 'circle_oauth_result'

export interface LoginResult {
    userToken: string
    encryptionKey: string
}

export function storeLoginResult(result: LoginResult): void {
    sessionStorage.setItem(OAUTH_RESULT_KEY, JSON.stringify(result))
}

export function getStoredLoginResult(): LoginResult | null {
    const data = sessionStorage.getItem(OAUTH_RESULT_KEY)
    if (!data) return null
    try {
        return JSON.parse(data)
    } catch {
        return null
    }
}

export function clearStoredLoginResult(): void {
    sessionStorage.removeItem(OAUTH_RESULT_KEY)
}

export class CircleService {
    private sdk: W3SSdk | null = null
    private isInitialized = false
    private onLoginComplete: ((error: any, result: any) => void) | null = null

    constructor() { }

    /**
     * Initialize the SDK with restored cookies if available
     * This must be called on every page load to handle OAuth callbacks
     */
    init(appId: string, onLoginComplete?: (error: any, result: any) => void): void {
        if (this.isInitialized && this.sdk) {
            console.log('Circle SDK already initialized')
            return
        }

        // Restore config from cookies (for after OAuth redirect)
        const restoredAppId = getCookie('circle_appId') || appId || ''
        const restoredGoogleClientId = getCookie('circle_googleClientId') || env.googleAuthClientId || ''
        const restoredDeviceToken = getCookie('circle_deviceToken') || ''
        const restoredDeviceEncryptionKey = getCookie('circle_deviceEncryptionKey') || ''

        console.log('🔐 Initializing Circle SDK...')
        console.log('  - App ID:', restoredAppId ? 'present' : 'MISSING')
        console.log('  - Google Client ID:', restoredGoogleClientId ? 'present' : 'MISSING')
        console.log('  - Device Token:', restoredDeviceToken ? 'restored from cookie' : 'not set')

        const handleLoginComplete = (error: any, result: any) => {
            console.log('🔐 OAuth callback received:', { error, result })

            if (error) {
                console.error('❌ OAuth Error:', error)
            } else if (result) {
                console.log('✅ OAuth Success! userToken received')
                // Store the result for later use
                storeLoginResult({
                    userToken: result.userToken,
                    encryptionKey: result.encryptionKey,
                })
            }

            // Call external callback if provided
            if (this.onLoginComplete) {
                this.onLoginComplete(error, result)
            }
            if (onLoginComplete) {
                onLoginComplete(error, result)
            }
        }

        const initialConfig = {
            appSettings: { appId: restoredAppId },
            loginConfigs: {
                deviceToken: restoredDeviceToken,
                deviceEncryptionKey: restoredDeviceEncryptionKey,
                google: {
                    clientId: restoredGoogleClientId,
                    redirectUri: window.location.origin,  // Must be root!
                    selectAccountPrompt: true,
                },
            },
        }

        this.sdk = new W3SSdk(initialConfig, handleLoginComplete)
        this.isInitialized = true
        console.log('✅ Circle SDK initialized')
    }

    /**
     * Get the SDK's device ID (for creating device token)
     */
    async getDeviceId(): Promise<string> {
        if (!this.sdk) throw new Error('SDK not initialized')
        return this.sdk.getDeviceId()
    }

    /**
     * Set login complete callback
     */
    setOnLoginComplete(callback: (error: any, result: any) => void): void {
        this.onLoginComplete = callback
    }

    /**
     * Perform social login with Google
     * IMPORTANT: Config must be saved to cookies before calling this!
     */
    performLogin(deviceToken: string, deviceEncryptionKey: string): void {
        if (!this.sdk) throw new Error('SDK not initialized')

        // Save config to cookies so it can be restored after redirect
        setCookie('circle_appId', env.circleAppId)
        setCookie('circle_googleClientId', env.googleAuthClientId)
        setCookie('circle_deviceToken', deviceToken)
        setCookie('circle_deviceEncryptionKey', deviceEncryptionKey)

        // Update SDK config with device credentials
        this.sdk.updateConfigs({
            appSettings: { appId: env.circleAppId },
            loginConfigs: {
                deviceToken,
                deviceEncryptionKey,
                google: {
                    clientId: env.googleAuthClientId,
                    redirectUri: window.location.origin,  // Must be root!
                    selectAccountPrompt: true,
                },
            },
        })

        console.log('🔐 Starting Google login...')
        this.sdk.performLogin(SocialLoginProvider.GOOGLE)
    }

    /**
     * Set authentication for challenge execution
     */
    setAuthentication(userToken: string, encryptionKey: string): void {
        if (!this.sdk) throw new Error('SDK not initialized')
        this.sdk.setAuthentication({ userToken, encryptionKey })
    }

    /**
     * Execute a challenge (for wallet creation)
     */
    execute(challengeId: string, onComplete?: (error: any, result: any) => void): void {
        if (!this.sdk) throw new Error('SDK not initialized')
        this.sdk.execute(challengeId, onComplete)
    }

    /**
     * Clean up cookies after successful login
     */
    clearCookies(): void {
        clearCookie('circle_appId')
        clearCookie('circle_googleClientId')
        clearCookie('circle_deviceToken')
        clearCookie('circle_deviceEncryptionKey')
    }

    /**
     * Check if SDK is ready
     */
    get ready(): boolean {
        return this.isInitialized && !!this.sdk
    }
}

export const circleService = new CircleService()
