
import { BridgeKit, BridgeChain } from '@circle-fin/bridge-kit'
import { EthereumSepolia, ArcTestnet } from '@circle-fin/bridge-kit/chains'
import { ViemAdapter } from '@circle-fin/adapter-viem-v2'
import { createPublicClient, http } from 'viem'

export class BridgeService {
    private bridgeKit: BridgeKit | null = null
    private adapter: ViemAdapter | null = null

    constructor() { }

    init(walletClient: any) {
        this.bridgeKit = new BridgeKit()
        // Initialize ViemAdapter with the provided wallet client and capabilities
        // We use the connected walletClient for signing, and create a public client for reads
        this.adapter = new ViemAdapter({
            getWalletClient: () => walletClient,
            getPublicClient: ({ chain }) => createPublicClient({
                chain,
                transport: http() // Use default RPCs from chain definitions
            })
        }, {
            addressContext: 'user-controlled',
            supportedChains: [EthereumSepolia, ArcTestnet] as any
        })
    }

    async transferToArc(amount: string, destinationAddress: string): Promise<any> {
        if (!this.adapter || !this.bridgeKit) throw new Error('Not initialized')

        console.log(`Bridging ${amount} USDC to Arc (Dest: ${destinationAddress})...`)

        // Execute Bridge Transfer
        const result = await this.bridgeKit.bridge({
            from: {
                adapter: this.adapter,
                chain: BridgeChain.Ethereum_Sepolia
            },
            to: {
                adapter: this.adapter, // Reuse adapter for context
                chain: BridgeChain.Arc_Testnet,
                recipientAddress: destinationAddress
            },
            amount: amount,
            token: 'USDC'
        })

        console.log('Bridge Result:', result)
        return result
    }
}

export const bridgeService = new BridgeService()
