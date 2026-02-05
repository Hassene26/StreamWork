import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import type { SocialLoginProvider as SocialLoginProviderType } from '@circle-fin/w3s-pw-web-sdk'
import { env } from '../config/env'

export interface CircleWalletConfig {
    appId: string
    userToken: string
    encryptionKey: string
    challengeId: string
}

export class CircleService {
    private sdk: W3SSdk | null = null
    private isInitialized: boolean = false
    private loginResolver: ((result: any) => void) | null = null
    private loginRejecter: ((error: any) => void) | null = null

    constructor() { }

    init(appId: string) {
        if (this.isInitialized) return

        const googleClientId = env.googleAuthClientId
        const redirectUri = window.location.origin

        console.log('Circle SDK Init - Google Client ID:', googleClientId ? 'present' : 'MISSING')

        // Pass Google login config at construction time - the SDK is a singleton
        // so this MUST include loginConfigs on first creation
        this.sdk = new W3SSdk(
            {
                appSettings: { appId },
                loginConfigs: {
                    google: {
                        clientId: googleClientId,
                        redirectUri: redirectUri,
                        selectAccountPrompt: true,
                    },
                    deviceToken: '',
                    deviceEncryptionKey: '',
                },
            },
            (error, result) => {
                console.log('OAuth callback:', { error, result })
                if (error) {
                    console.error('OAuth Error:', error)
                    if (this.loginRejecter) {
                        this.loginRejecter(error)
                        this.loginRejecter = null
                        this.loginResolver = null
                    }
                } else if (result) {
                    console.log('OAuth Success:', result)
                    if (this.loginResolver) {
                        this.loginResolver(result)
                        this.loginResolver = null
                        this.loginRejecter = null
                    }
                }
            }
        )

        this.isInitialized = true
    }

    async execute(userToken: string, encryptionKey: string, challengeId: string) {
        if (!this.sdk) throw new Error("Circle SDK not initialized")

        this.sdk.setAuthentication({ userToken, encryptionKey })

        return new Promise((resolve, reject) => {
            this.sdk!.execute(challengeId, (error, result) => {
                if (error) {
                    console.error("Circle Execution Error:", error)
                    reject(error)
                    return
                }
                console.log("Circle Execution Success:", result)
                resolve(result)
            })
        })
    }

    async performLogin(deviceToken: string, deviceEncryptionKey: string): Promise<any> {
        if (!this.sdk) throw new Error("Circle SDK not initialized")

        // Update loginConfigs with the actual device credentials before login
        this.sdk.updateConfigs({
            appSettings: { appId: env.circleAppId },
            loginConfigs: {
                google: {
                    clientId: env.googleAuthClientId,
                    redirectUri: window.location.origin,
                    selectAccountPrompt: true,
                },
                deviceToken,
                deviceEncryptionKey,
            },
        })

        const loginPromise = new Promise((resolve, reject) => {
            this.loginResolver = resolve
            this.loginRejecter = reject

            setTimeout(() => {
                if (this.loginRejecter) {
                    this.loginRejecter(new Error('Login timeout'))
                    this.loginResolver = null
                    this.loginRejecter = null
                }
            }, 5 * 60 * 1000)
        })

        console.log('Calling performLogin...')
        await this.sdk.performLogin('Google' as SocialLoginProviderType)

        return loginPromise
    }
}

export const circleService = new CircleService()
