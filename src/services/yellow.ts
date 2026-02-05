/**
 * Yellow Network Service - Real SDK Integration
 * 
 * Implements state channel functionality using the actual @erc7824/nitrolite SDK.
 * Connects to Yellow Network's sandbox ClearNode for testing.
 */

import {
    NitroliteClient,
    WalletStateSigner,
    createECDSAMessageSigner,
    createEIP712AuthMessageSigner,
    createAuthRequestMessage,
    createAuthVerifyMessageFromChallenge,
    createCreateChannelMessage,
    createResizeChannelMessage,
    createCloseChannelMessage,
    createGetLedgerBalancesMessage,
    createTransferMessage,
    createSubmitAppStateMessage,
} from '@erc7824/nitrolite'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { WalletClient, PublicClient, Address } from 'viem'

// Sandbox WebSocket endpoint
const CLEARNODE_SANDBOX_URL = 'wss://clearnet-sandbox.yellow.com/ws'

// Contract addresses on Sepolia (from Yellow docs)
const CUSTODY_ADDRESS = '0x019B65A265EB3363822f2752141b3dF16131b262' as const
const ADJUDICATOR_ADDRESS = '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as const

// Test token on Sepolia (ytest.usd)
const YTEST_USD_TOKEN = '0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb' as const

export type ChannelStatus = 'pending' | 'open' | 'streaming' | 'settling' | 'closed'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error'

export interface PaymentChannel {
    id: string
    employer: string
    employee: string
    employeeEns?: string
    totalDeposit: bigint
    employeeBalance: bigint
    employerBalance: bigint
    ratePerMinute: bigint
    status: ChannelStatus
    version: bigint
    createdAt: Date
    lastUpdate: Date
}

export interface YellowServiceEvents {
    onStatusChange: (status: ConnectionStatus) => void
    onChannelUpdate: (channel: PaymentChannel) => void
    onError: (error: Error) => void
}

type StatusHandler = (status: ConnectionStatus) => void
type ErrorHandler = (error: Error) => void
type ChannelHandler = (channel: PaymentChannel) => void
type BalanceHandler = (balance: bigint) => void

class YellowService {
    private ws: WebSocket | null = null
    private nitroliteClient: NitroliteClient | null = null
    private publicClient: PublicClient | null = null
    private walletClient: WalletClient | null = null
    private userAddress: Address | null = null

    // Session management
    private sessionPrivateKey: `0x${string}` | null = null
    private sessionSigner: ReturnType<typeof createECDSAMessageSigner> | null = null
    private sessionAddress: Address | null = null
    private isAuthenticated = false

    // Channel state
    private channels: Map<string, PaymentChannel> = new Map()
    private _currentBalance: bigint = 0n

    // Event handlers
    private statusHandlers: Set<StatusHandler> = new Set()
    private errorHandlers: Set<ErrorHandler> = new Set()
    private channelHandlers: Set<ChannelHandler> = new Set()
    private balanceHandlers: Set<BalanceHandler> = new Set()

    // Connection state
    private _connectionStatus: ConnectionStatus = 'disconnected'
    private reconnectAttempts = 0
    private maxReconnectAttempts = 5

    /**
     * Initialize viem clients with MetaMask (browser wallet)
     */
    async setupClients(walletClient: WalletClient): Promise<void> {
        this.walletClient = walletClient
        this.userAddress = walletClient.account?.address || null

        // Create public client for reading chain data
        this.publicClient = createPublicClient({
            chain: sepolia,
            transport: http('https://1rpc.io/sepolia'), // Public fallback
        })

        // Initialize NitroliteClient
        if (this.walletClient && this.publicClient) {
            // Use 'any' to bypass strict SDK type requirements
            // The wagmi WalletClient is compatible at runtime
            this.nitroliteClient = new NitroliteClient({
                publicClient: this.publicClient as any,
                walletClient: this.walletClient as any,
                stateSigner: new WalletStateSigner(this.walletClient as any),
                addresses: {
                    custody: CUSTODY_ADDRESS,
                    adjudicator: ADJUDICATOR_ADDRESS,
                },
                chainId: sepolia.id,
                challengeDuration: 3600n, // 1 hour
            })

            console.log('✅ NitroliteClient initialized')
            console.log('   Wallet Address:', this.userAddress)
        }
    }

    /**
     * Connect to Yellow Network ClearNode via WebSocket
     */
    async connect(): Promise<void> {
        if (!this.userAddress) {
            throw new Error('Wallet not connected. Call setupClients first.')
        }

        this.updateStatus('connecting')

        return new Promise((resolve, reject) => {
            try {
                console.log('🔗 Connecting to Yellow Network sandbox...')

                this.ws = new WebSocket(CLEARNODE_SANDBOX_URL)

                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected to ClearNode')
                    this.reconnectAttempts = 0
                    this.authenticate()
                    resolve()
                }

                this.ws.onmessage = (event) => {
                    this.handleMessage(event)
                }

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error)
                    this.notifyError(new Error('WebSocket connection error'))
                    reject(error)
                }

                this.ws.onclose = (event) => {
                    console.log(`WebSocket closed: ${event.code} ${event.reason}`)
                    this.updateStatus('disconnected')
                    this.attemptReconnect()
                }
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
     * Authenticate with session key (EIP-712)
     */
    private async authenticate(): Promise<void> {
        if (!this.ws || !this.walletClient || !this.userAddress) {
            throw new Error('Not ready for authentication')
        }

        this.updateStatus('authenticating')

        // Generate session keypair
        this.sessionPrivateKey = generatePrivateKey()
        const sessionAccount = privateKeyToAccount(this.sessionPrivateKey)
        this.sessionAddress = sessionAccount.address
        this.sessionSigner = createECDSAMessageSigner(this.sessionPrivateKey)

        // Auth params
        const authParams = {
            session_key: this.sessionAddress,
            allowances: [{
                asset: 'ytest.usd',
                amount: '1000000000' // Large allowance for testing
            }],
            expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour
            scope: 'streamwork.app',
        }

        // Create and send auth request
        const authRequestMsg = await createAuthRequestMessage({
            address: this.userAddress,
            application: 'StreamWork',
            ...authParams,
        })

            // Store authParams for challenge verification
            ; (this as any)._authParams = authParams

        this.ws.send(authRequestMsg)
        console.log('📤 Sent auth request')
    }

    /**
     * Handle incoming WebSocket messages
     */
    private async handleMessage(event: MessageEvent): Promise<void> {
        try {
            const response = JSON.parse(event.data)
            console.log('📨 Received:', response.res?.[1] || response.error?.code || 'unknown')

            if (response.error) {
                console.error('❌ RPC Error Response:', JSON.stringify(response.error, null, 2))

                // Auto-recover session if authentication checks fail
                if (response.error.message?.includes('authentication required')) {
                    console.log('🔄 Session invalid, re-authenticating...')
                    this.authenticate()
                    return
                }

                this.notifyError(new Error(response.error.message || 'RPC error'))
                return
            }

            const method = response.res?.[1]
            const payload = response.res?.[2]

            switch (method) {
                case 'auth_challenge':
                    await this.handleAuthChallenge(payload)
                    break

                case 'auth_verify':
                    this.handleAuthSuccess(payload)
                    break

                case 'channels':
                    this.handleChannelsUpdate(payload)
                    break

                case 'create_channel':
                    await this.handleChannelCreated(payload)
                    break

                case 'resize_channel':
                    await this.handleChannelResized(payload)
                    break

                case 'close_channel':
                    await this.handleChannelClosed(payload)
                    break

                case 'transfer':
                    this.handleTransferComplete(payload)
                    break

                case 'cu': // Channel Update notification
                    this.handleSingleChannelUpdate(payload)
                    break

                case 'bu': // Balance Update notification
                    console.log('💰 Balance update received:', payload)
                    this.handleBalanceUpdate(payload)
                    break

                case 'ledger_balances':
                case 'get_ledger_balances':
                    console.log('📊 Ledger balances received:', payload)
                    this.handleLedgerBalancesUpdate(payload)
                    break

                case 'error':
                    console.error('❌ Server sent error:', payload)
                    if (payload?.error === 'authentication required' || payload?.message?.includes('authentication required')) {
                        console.log('🔄 Session invalid, re-authenticating...')
                        this.isAuthenticated = false // Force re-auth
                        this.authenticate()
                    }
                    break

                default:
                    console.log('Unhandled method:', method)
                    console.log('Payload:', JSON.stringify(payload, null, 2))
            }
        } catch (err) {
            console.error('Error handling message:', err)
        }
    }

    /**
     * Handle auth challenge - sign with main wallet
     */
    private async handleAuthChallenge(payload: any): Promise<void> {
        if (this.isAuthenticated) {
            console.log('⚠️ Already authenticated, skipping challenge')
            return
        }
        if (!this.walletClient) {
            console.error('❌ No wallet client available for signing')
            return
        }
        if (!this.ws) {
            console.error('❌ No WebSocket connection for auth')
            return
        }

        console.log('🔐 Received auth challenge, requesting wallet signature...')

        try {
            const challenge = payload.challenge_message
            const authParams = (this as any)._authParams

            if (!authParams) {
                console.error('❌ Auth params not set - authenticate() may not have been called')
                return
            }

            // Create EIP-712 signer with main wallet
            // This should trigger MetaMask popup
            const signer = createEIP712AuthMessageSigner(
                this.walletClient as any,
                authParams,
                { name: 'StreamWork' }
            )

            // Create and send verification - this is where MetaMask popup should appear
            console.log('📝 Signing auth challenge with wallet...')
            const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge)

            this.ws.send(verifyMsg)
            console.log('📤 Sent auth verification (signed with wallet)')
        } catch (err) {
            console.error('❌ Auth challenge signing failed:', err)
            this.notifyError(err as Error)
        }
    }

    /**
     * Handle successful authentication
     */
    private handleAuthSuccess(payload: any): void {
        this.isAuthenticated = true
        this.updateStatus('connected')
        console.log('✅ Authenticated with Yellow Network!')
        console.log('   Session key:', payload.session_key)

        // Query ledger balances
        this.queryLedgerBalances()
    }

    /**
     * Query user's ledger balances
     */
    private async queryLedgerBalances(): Promise<void> {
        if (!this.sessionSigner || !this.userAddress || !this.ws) return

        const ledgerMsg = await createGetLedgerBalancesMessage(
            this.sessionSigner,
            this.userAddress,
            Date.now()
        )
        this.ws.send(ledgerMsg)
    }

    /**
     * Handle single channel update (cu)
     */
    private handleSingleChannelUpdate(ch: any): void {
        console.log('🔄 Processing channel update:', ch.channel_id, ch)

        // If we already have the channel, preserve known data
        const existing = this.channels.get(ch.channel_id)

        // Determine counterparty (Employee)
        let employeeAddress = existing?.employee

        if (!employeeAddress) {
            const myAddress = this.userAddress?.toLowerCase() || ''

            // Try 'participants' array (standard Nitro)
            if (ch.participants && Array.isArray(ch.participants)) {
                const other = ch.participants.find((p: string) => p.toLowerCase() !== myAddress)
                if (other) employeeAddress = other
            }

            // Try 'counterparty' field
            if (!employeeAddress && ch.counterparty && ch.counterparty.toLowerCase() !== myAddress) {
                employeeAddress = ch.counterparty
            }

            // Try 'participant' field (sometimes used for sender/initiator, risky but fallback)
            if (!employeeAddress && ch.participant && ch.participant.toLowerCase() !== myAddress) {
                employeeAddress = ch.participant
            }
        }

        employeeAddress = employeeAddress || ''

        // Preserve existing balance tracking if we have it
        const currentEmployerBalance = existing?.employerBalance || BigInt(ch.amount || 0)
        const currentEmployeeBalance = existing?.employeeBalance || 0n
        const currentRate = existing?.ratePerMinute || BigInt(ch.rate || 750000)

        // Smart update for Total Deposit:
        // If server sends '0' (placeholder) but we know it's funded, keep our local value
        let newTotalDeposit = BigInt(ch.amount || 0)
        if (newTotalDeposit === 0n && existing?.totalDeposit && existing.totalDeposit > 0n) {
            console.log('⚠️ Server sent amount=0 but we have local deposit, preserving:', existing.totalDeposit)
            newTotalDeposit = existing.totalDeposit
        } else if (existing?.totalDeposit && newTotalDeposit !== existing.totalDeposit) {
            // If server sends a different non-zero amount, use it (could be withdrawal)
            newTotalDeposit = BigInt(ch.amount || 0)
        }
        else if (!existing && newTotalDeposit === 0n) {
            // New channel with 0 amount (just created)
            newTotalDeposit = 0n
        }
        else {
            // specific override logic
            newTotalDeposit = BigInt(ch.amount || existing?.totalDeposit || 0)
        }


        const channel: PaymentChannel = {
            id: ch.channel_id,
            employer: this.userAddress || '',
            employee: employeeAddress,
            totalDeposit: newTotalDeposit,
            // Preserve balances if they exist, only update from server if explicitly provided
            employerBalance: ch.employer_balance
                ? BigInt(ch.employer_balance)
                : currentEmployerBalance,
            employeeBalance: ch.employee_balance
                ? BigInt(ch.employee_balance)
                : currentEmployeeBalance,
            ratePerMinute: currentRate,
            status: ch.status as ChannelStatus,
            version: ch.version ? BigInt(ch.version) : (existing?.version || 0n),
            createdAt: ch.created_at ? new Date(ch.created_at) : (existing?.createdAt || new Date()),
            lastUpdate: ch.updated_at ? new Date(ch.updated_at) : new Date(),
        }
        this.channels.set(channel.id, channel)
        console.log('📢 Notifying channel update:', channel.id, 'Status:', channel.status, 'EmpBal:', channel.employerBalance)
        this.notifyChannelUpdate(channel)
    }

    /**
     * Handle channels list update
     */
    private handleChannelsUpdate(payload: any): void {
        const channels = payload.channels || []
        console.log(`📊 Found ${channels.length} channels`)

        for (const ch of channels) {
            this.handleSingleChannelUpdate(ch)
        }
    }

    /**
     * Handle successful transfer completion
     */
    private handleTransferComplete(payload: any): void {
        console.log('✅ Transfer complete:', payload)

        // Extract transfer details
        const { amount, destination, asset } = payload || {}

        if (amount && destination) {
            console.log(`💸 Transferred ${amount} ${asset || 'USDC'} to ${destination}`)

            // Find and update the channel for this recipient
            for (const [channelId, channel] of this.channels) {
                if (channel.employee.toLowerCase() === destination.toLowerCase()) {
                    // Update channel balances
                    const transferAmount = BigInt(amount)
                    channel.employeeBalance += transferAmount
                    channel.employerBalance = channel.employerBalance > transferAmount
                        ? channel.employerBalance - transferAmount
                        : 0n
                    channel.lastUpdate = new Date()
                    channel.status = 'streaming'

                    console.log(`📊 Updated channel ${channelId}:`)
                    console.log(`   Employee balance: ${channel.employeeBalance}`)
                    console.log(`   Employer balance: ${channel.employerBalance}`)

                    this.notifyChannelUpdate(channel)
                    break
                }
            }
        }

        // Refresh ledger balances after transfer
        this.queryLedgerBalances()
    }

    /**
     * Handle ledger balances update
     */
    private handleLedgerBalancesUpdate(payload: any): void {
        console.log('📊 Processing ledger balances:', payload)

        // payload could be { balances: [...] } or an array directly
        const balances = payload?.balances || payload?.assets || payload || []

        if (Array.isArray(balances)) {
            for (const entry of balances) {
                const asset = entry.asset || entry.token
                const balance = entry.balance || entry.amount

                if (asset === 'ytest.usd' || asset?.toLowerCase().includes('usd')) {
                    try {
                        const balValue = BigInt(balance || 0)
                        console.log(`💰 Unified balance for ${asset}: ${balValue}`)
                        this._currentBalance = balValue
                        this.notifyBalanceUpdate(balValue)
                    } catch (e) {
                        console.error('Failed to parse balance:', e)
                    }
                }
            }
        }
    }

    // Track pending counterparty for channel creation
    private _pendingCounterparty: string | null = null
    private _pendingDepositAmount: bigint | null = null
    private _pendingRate: bigint | null = null

    /**
     * Create a new payment channel
     */
    async createChannel(counterparty: string, depositAmount: bigint, rate: bigint): Promise<string | null> {
        if (!this.sessionSigner || !this.ws) {
            throw new Error('Not connected to Yellow Network')
        }

        console.log(`📤 Creating new channel with ${counterparty}, deposit: ${depositAmount}...`)
        this._pendingCounterparty = counterparty
        this._pendingDepositAmount = depositAmount
        this._pendingRate = rate

        const createChannelMsg = await createCreateChannelMessage(
            this.sessionSigner,
            {
                chain_id: sepolia.id,
                token: YTEST_USD_TOKEN,
            }
        )

        this.ws.send(createChannelMsg)

        // Channel ID will be returned in handleChannelCreated
        return null
    }

    /**
     * Handle channel created response
     */
    private async handleChannelCreated(payload: any): Promise<void> {
        console.log('🎉 Channel created:', payload)

        // Destructure payload to get all necessary fields for On-Chain creation
        const { channel_id, channel, state, server_signature } = payload

        if (!channel) return

        console.log('✅ Channel created on-chain:', channel_id)

        // Capture funding amount before clearing pending state
        const fundingAmount = this._pendingDepositAmount || 20n
        console.log(`💰 Captured funding amount: ${fundingAmount}`)

        const employeeAddress = this._pendingCounterparty || channel.counterparty

        const newChannel: PaymentChannel = {
            id: channel_id,
            employer: this.userAddress || '',
            employee: employeeAddress,
            totalDeposit: 0n,
            employerBalance: 0n,
            employeeBalance: 0n,
            ratePerMinute: this._pendingRate || 750000n,
            status: 'open',
            version: state && state.version ? BigInt(state.version) : 0n,
            createdAt: new Date(),
            lastUpdate: new Date(),
        }

        // Clear pending
        this._pendingCounterparty = null
        this._pendingDepositAmount = null
        this._pendingRate = null

        this.channels.set(channel_id, newChannel)
        this.notifyChannelUpdate(newChannel)
        if (!this.nitroliteClient) {
            console.error('NitroliteClient not initialized')
            return
        }

        // Transform state for SDK
        const unsignedInitialState = {
            intent: state.intent,
            version: BigInt(state.version),
            data: state.state_data,
            allocations: state.allocations.map((a: any) => ({
                destination: a.destination,
                token: a.token,
                amount: BigInt(a.amount),
            })),
        }

        try {
            console.log('📝 Requesting wallet signature for On-Chain Channel Creation...')
            // Submit to blockchain
            const createResult = await this.nitroliteClient.createChannel({
                channel,
                unsignedInitialState,
                serverSignature: server_signature,
            })

            const txHash = typeof createResult === 'string' ? createResult : createResult.txHash
            console.log('✅ Channel created on-chain:', txHash)

            // Wait for confirmation
            if (this.publicClient) {
                console.log('⏳ Waiting for transaction confirmation...')
                await this.publicClient.waitForTransactionReceipt({ hash: txHash })
                console.log('✅ Transaction confirmed')
            }

            // Fund the channel
            await this.fundChannel(channel_id, fundingAmount)

        } catch (err) {
            console.error('❌ Error creating channel on-chain:', err)
            this.notifyError(err as Error)
            // Remove from local state if failed
            this.channels.delete(channel_id)
            // Notify UI of removal/error
            // We can send a dummy update or force refresh
            this.queryLedgerBalances()
        }
    }

    /**
     * Fund a channel with tokens from unified balance
     */
    async fundChannel(channelId: string, amount: bigint): Promise<void> {
        if (!this.sessionSigner || !this.ws || !this.userAddress) {
            throw new Error('Not connected')
        }

        console.log(`📤 Funding channel with ${amount} tokens...`)

        const resizeMsg = await createResizeChannelMessage(
            this.sessionSigner,
            {
                channel_id: channelId as `0x${string}`,
                allocate_amount: amount, // From unified balance (faucet)
                funds_destination: this.userAddress,
            }
        )

        this.ws.send(resizeMsg)
    }

    /**
     * Handle channel resized response
     */
    private async handleChannelResized(payload: any): Promise<void> {
        const { channel_id, state, server_signature } = payload
        console.log('✅ Channel resized:', channel_id)

        if (!this.nitroliteClient || !this.publicClient) return

        // Build resize state
        const resizeState = {
            intent: state.intent,
            version: BigInt(state.version),
            data: state.state_data || state.data,
            allocations: state.allocations.map((a: any) => ({
                destination: a.destination,
                token: a.token,
                amount: BigInt(a.amount),
            })),
            channelId: channel_id,
            serverSignature: server_signature,
        }

        try {
            // Get proof states from chain
            let proofStates: any[] = []
            try {
                const onChainData = await this.nitroliteClient.getChannelData(channel_id as `0x${string}`)
                if (onChainData.lastValidState) {
                    proofStates = [onChainData.lastValidState]
                }
            } catch (e) {
                console.log('No existing on-chain data')
            }

            // Submit resize to chain
            const { txHash } = await this.nitroliteClient.resizeChannel({
                resizeState,
                proofStates,
            })

            console.log('✅ Channel funded on-chain:', txHash)

            // Update local channel state
            const channel = this.channels.get(channel_id)
            if (channel) {
                // Calculate total deposited in channel
                const totalFunded = resizeState.allocations.reduce(
                    (sum: bigint, a: any) => sum + BigInt(a.amount),
                    0n
                )
                channel.totalDeposit = totalFunded
                // Set employer balance to the funded amount (employee starts at 0)
                channel.employerBalance = totalFunded
                channel.employeeBalance = 0n
                channel.status = 'open'
                channel.version = resizeState.version
                channel.lastUpdate = new Date()

                console.log(`📊 Channel ${channel_id} funded:`)
                console.log(`   Total deposit: ${totalFunded}`)
                console.log(`   Employer balance: ${channel.employerBalance}`)

                this.notifyChannelUpdate(channel)
            }

        } catch (err) {
            console.error('Error resizing channel on-chain:', err)
            this.notifyError(err as Error)
        }
    }

    /**
     * Send an off-chain payment transfer (for streaming)
     * This transfers from the sender's unified balance to the recipient's unified balance
     */
    async sendPayment(amount: bigint, recipient: string): Promise<void> {
        if (!this.sessionSigner || !this.ws) {
            throw new Error('Not connected to Yellow Network')
        }

        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Yellow Network')
        }

        // Check if we have an open funded channel with this recipient
        let targetChannel: PaymentChannel | undefined
        for (const ch of this.channels.values()) {
            if (ch.employee.toLowerCase() === recipient.toLowerCase() && ch.status === 'open' && ch.totalDeposit > 0n) {
                targetChannel = ch
                break
            }
        }

        if (targetChannel) {
            console.log(`🔄 Sending payment via Channel Update (Channel ${targetChannel.id})`)
            return this.sendChannelUpdate(targetChannel, amount)
        }

        console.log(`💸 Sending payment via Ledger Transfer (No funded channel found)`)

        try {
            // Use 'ytest.usd' symbol for the sandbox, not the token address
            const transferMsg = await createTransferMessage(
                this.sessionSigner,
                {
                    destination: recipient as `0x${string}`,
                    allocations: [{
                        asset: 'ytest.usd', // Use asset symbol, not address
                        amount: amount.toString(),
                    }]
                }
            )

            this.ws.send(transferMsg)
            console.log('📤 Transfer message sent')
        } catch (err) {
            console.error('❌ Failed to create/send transfer message:', err)
            throw err
        }
    }

    private async sendChannelUpdate(channel: PaymentChannel, amount: bigint): Promise<void> {
        if (!this.sessionSigner || !this.ws) throw new Error('Not authenticated')

        // Safety check
        if (channel.employerBalance < amount) {
            console.error(`❌ Insufficient channel balance. Has: ${channel.employerBalance}, Need: ${amount}`)
            throw new Error('Insufficient channel balance')
        }

        const newEmployerBal = channel.employerBalance - amount
        const newEmployeeBal = channel.employeeBalance + amount
        const nextVersion = (channel.version || 0n) + 1n

        console.log(`📊 Updating Channel ${channel.id} (v${channel.version}) -> v${nextVersion}: Emp ${newEmployerBal} | Wkr ${newEmployeeBal}`)

        try {
            const updateMsg = await createSubmitAppStateMessage(
                this.sessionSigner,
                {
                    app_session_id: channel.id as `0x${string}`,
                    version: Number(nextVersion),
                    allocations: [
                        {
                            destination: channel.employer as `0x${string}`,
                            amount: newEmployerBal.toString(),
                            allocation_type: 0 // simple
                        },
                        {
                            destination: channel.employee as `0x${string}`,
                            amount: newEmployeeBal.toString(),
                            allocation_type: 0
                        }
                    ],
                } as any, // Cast to any to avoid complex TS generics
                undefined, // requestId
                undefined  // timestamp
            )

            console.log('📤 Sending Channel Update Message:', JSON.stringify(updateMsg, null, 2))
            this.ws.send(updateMsg)
            console.log('📤 Channel Update sent')

        } catch (e) {
            console.error('Failed to create channel update:', e)
            throw e
        }
    }

    async closeChannel(channelId: string, destination?: string): Promise<string | null> {
        if (!this.sessionSigner || !this.ws || !this.userAddress) {
            throw new Error('Not connected')
        }

        const channel = this.channels.get(channelId)
        if (!channel) {
            throw new Error('Channel not found')
        }

        const closeDest = destination || this.userAddress
        console.log('📤 Closing channel:', channelId, 'to dest:', closeDest)

        const closeMsg = await createCloseChannelMessage(
            this.sessionSigner,
            channelId.toLowerCase() as `0x${string}`,
            closeDest.toLowerCase() as `0x${string}`
        )
        this.ws.send(closeMsg)
        return channelId
    }

    /**
     * Handle channel closed response
     */
    private async handleChannelClosed(payload: any): Promise<void> {
        const { channel_id, state, server_signature } = payload
        console.log('✅ Channel close prepared:', channel_id)

        if (!this.nitroliteClient || !this.publicClient) return

        try {
            // Submit close to chain
            const txHash = await this.nitroliteClient.closeChannel({
                finalState: {
                    intent: state.intent,
                    version: BigInt(state.version),
                    data: state.state_data || state.data,
                    allocations: state.allocations.map((a: any) => ({
                        destination: a.destination,
                        token: a.token,
                        amount: BigInt(a.amount),
                    })),
                    channelId: channel_id,
                    serverSignature: server_signature,
                },
                stateData: state.state_data || state.data || '0x',
            })

            console.log('✅ Channel closed on-chain:', txHash)

            if (this.publicClient) {
                console.log('⏳ Waiting for close transaction confirmation...')
                await this.publicClient.waitForTransactionReceipt({ hash: txHash })
                console.log('✅ Close confirmed')
            }

            // Withdraw funds
            const token = state.allocations[0].token
            await this.withdrawFunds(token as `0x${string}`)

            // Update local state
            const channel = this.channels.get(channel_id)
            if (channel) {
                channel.status = 'closed'
                this.notifyChannelUpdate(channel)
            }

        } catch (err) {
            console.error('Error closing channel on-chain:', err)
            this.notifyError(err as Error)
        }
    }

    /**
     * Withdraw funds from custody contract
     */
    private async withdrawFunds(token: `0x${string}`): Promise<void> {
        if (!this.nitroliteClient || !this.publicClient) return

        // Check withdrawable balance
        const userAddress = this.nitroliteClient.account.address

        const result = await this.publicClient.readContract({
            address: CUSTODY_ADDRESS,
            abi: [{
                type: 'function',
                name: 'getAccountsBalances',
                inputs: [
                    { name: 'users', type: 'address[]' },
                    { name: 'tokens', type: 'address[]' }
                ],
                outputs: [{ type: 'uint256[]' }],
                stateMutability: 'view'
            }],
            functionName: 'getAccountsBalances',
            args: [[userAddress], [token]],
        }) as bigint[]

        const withdrawableBalance = result[0]
        console.log(`💰 Withdrawable balance: ${withdrawableBalance}`)

        if (withdrawableBalance > 0n) {
            const withdrawalTx = await this.nitroliteClient.withdrawal(token, withdrawableBalance)
            console.log('✅ Funds withdrawn:', withdrawalTx)
        }
    }

    /**
     * Disconnect from Yellow Network
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close(1000, 'User initiated disconnect')
            this.ws = null
        }
        this.isAuthenticated = false
        this.updateStatus('disconnected')
        console.log('Yellow Network disconnected')
    }

    /**
     * Attempt to reconnect
     */
    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached')
            return
        }

        this.reconnectAttempts++
        const delay = 2000 * Math.pow(2, this.reconnectAttempts - 1)

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

        setTimeout(() => {
            this.connect().catch(console.error)
        }, delay)
    }

    // Event subscription methods
    onStatusChange(handler: StatusHandler): () => void {
        this.statusHandlers.add(handler)
        return () => this.statusHandlers.delete(handler)
    }

    onError(handler: ErrorHandler): () => void {
        this.errorHandlers.add(handler)
        return () => this.errorHandlers.delete(handler)
    }

    onChannelUpdate(handler: ChannelHandler): () => void {
        this.channelHandlers.add(handler)
        return () => this.channelHandlers.delete(handler)
    }

    onBalanceUpdate(handler: (balance: bigint) => void): () => void {
        this.balanceHandlers.add(handler)
        return () => {
            this.balanceHandlers.delete(handler)
        }
    }

    private handleBalanceUpdate(payload: any) {
        // Payload expected: { asset: '...', balance: '123456' }
        if (payload && payload.balance) {
            try {
                const balance = BigInt(payload.balance)
                this._currentBalance = balance
                this.notifyBalanceUpdate(balance)
            } catch (e) {
                console.error('Failed to parse balance update', e)
            }
        }
    }

    private notifyBalanceUpdate(balance: bigint) {
        this.balanceHandlers.forEach(handler => handler(balance))
    }

    private updateStatus(status: ConnectionStatus): void {
        this._connectionStatus = status
        this.statusHandlers.forEach(h => h(status))
    }

    private notifyError(error: Error): void {
        this.errorHandlers.forEach(h => h(error))
    }

    private notifyChannelUpdate(channel: PaymentChannel): void {
        this.channelHandlers.forEach(h => h(channel))
    }

    // Getters
    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus
    }

    get isConnected(): boolean {
        return this._connectionStatus === 'connected'
    }

    getAllChannels(): PaymentChannel[] {
        return Array.from(this.channels.values())
    }

    getChannel(channelId: string): PaymentChannel | undefined {
        return this.channels.get(channelId)
    }

    getBalance(): bigint {
        return this._currentBalance
    }
}

// Export singleton instance
export const yellowService = new YellowService()
