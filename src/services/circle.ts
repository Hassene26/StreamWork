
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

export interface CircleWalletConfig {
    appId: string
    userToken: string
    encryptionKey: string
    challengeId: string
}

export class CircleService {
    private sdk: W3SSdk
    private isInitialized: boolean = false

    constructor() {
        this.sdk = new W3SSdk()
    }

    init(appId: string) {
        if (this.isInitialized) return
        this.sdk.setAppSettings({ appId })
        this.isInitialized = true
    }

    async execute(userToken: string, encryptionKey: string, challengeId: string) {
        if (!this.isInitialized) throw new Error("Circle SDK not initialized")

        this.sdk.setAuthentication({
            userToken,
            encryptionKey,
        })

        return new Promise((resolve, reject) => {
            this.sdk.execute(challengeId, (error, result) => {
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
        if (!this.isInitialized) throw new Error("Circle SDK not initialized")

        // @ts-ignore - performLogin might not be in the type definition yet if outdated
        return new Promise((resolve, reject) => {
            // @ts-ignore
            this.sdk.performLogin(deviceToken, deviceEncryptionKey, (error, result) => {
                if (error) {
                    console.error("Circle Login Error:", error)
                    reject(error)
                    return
                }
                console.log("Circle Login Success:", result)
                resolve(result)
            })
        })
    }
}

export const circleService = new CircleService()
