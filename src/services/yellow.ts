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
    createGetChannelsMessage,
    createAppSessionMessage,
    createSubmitAppStateMessage,
    RPCProtocolVersion,
    RPCAppStateIntent,
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
    appSessionId?: string  // Application Session ID for streaming payments
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

    // Pending operations
    private _pendingAppSessionChannelId: string | null = null

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
            application: 'streamwork',  // Lowercase to match App Session
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

            // DEBUG: Log ALL raw messages to identify correct method names
            console.log('📨 RAW WebSocket message:', JSON.stringify(response, null, 2))

            const method = response.res?.[1] || response.error?.code || 'unknown'
            console.log('📨 Received method:', method)

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

            // method already declared above for logging
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

                case 'create_app_session':
                case 'app_session':        // Alternative name
                case 'session_created':    // From Quick Start docs
                    console.log('🎯 Received app session response:', method, payload)
                    this.handleAppSessionCreated(payload)
                    break

                case 'submit_app_state':
                    this.handleAppStateSubmitted(payload)
                    break

                case 'asu': // App Session Update notification
                    this.handleAppSessionUpdate(payload)
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
                { name: 'streamwork' }  // Must match auth request application name
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

        // Query ledger balances and channels
        this.queryLedgerBalances()
        this.queryChannels()
    }

    /**
     * Query active channels
     */
    private async queryChannels(): Promise<void> {
        if (!this.sessionSigner || !this.ws) return

        console.log('🔍 Querying channels...')
        const channelsMsg = await createGetChannelsMessage(
            this.sessionSigner
        )
        this.ws.send(channelsMsg)
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

            // Try 'allocations' (most reliable if present)
            if (!employeeAddress && (ch.allocations || (ch.state && ch.state.allocations))) {
                const allocs = ch.allocations || ch.state.allocations
                if (Array.isArray(allocs)) {
                    const other = allocs.find((a: any) => {
                        const dest = a.destination || a.address || ''
                        return dest && dest.toLowerCase() !== myAddress
                    })
                    if (other) employeeAddress = other.destination || other.address
                }
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


        const ensMap = JSON.parse(localStorage.getItem('streamwork_channel_ens') || '{}')
        const channel: PaymentChannel = {
            id: ch.channel_id,
            employer: this.userAddress || '',
            employee: employeeAddress,
            employeeEns: existing?.employeeEns || ensMap[ch.channel_id] || undefined,
            totalDeposit: newTotalDeposit,
            // Preserve balances if they exist, only update from server if explicitly provided
            employerBalance: ch.employer_balance
                ? BigInt(ch.employer_balance)
                : currentEmployerBalance,
            employeeBalance: ch.employee_balance
                ? BigInt(ch.employee_balance)
                : currentEmployeeBalance,
            ratePerMinute: currentRate,
            // Preserve 'pending' status if channel is still being set up (no appSessionId yet)
            // Server may send 'open' before we finish local on-chain setup
            status: (existing?.status === 'pending' && !existing?.appSessionId)
                ? 'pending'
                : (ch.status as ChannelStatus),
            version: ch.version ? BigInt(ch.version) : (existing?.version || 0n),
            appSessionId: existing?.appSessionId,  // CRITICAL: Preserve App Session ID!
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
    private _pendingEnsName: string | null = null

    /**
     * Create a new payment channel
     */
    async createChannel(counterparty: string, depositAmount: bigint, rate: bigint, ensName?: string): Promise<string | null> {
        if (!this.sessionSigner || !this.ws) {
            throw new Error('Not connected to Yellow Network')
        }

        console.log(`📤 Creating new channel with ${counterparty}, deposit: ${depositAmount}...`)
        this._pendingCounterparty = counterparty
        this._pendingDepositAmount = depositAmount
        this._pendingRate = rate
        this._pendingEnsName = ensName || null

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
            employeeEns: this._pendingEnsName || undefined,
            totalDeposit: 0n,
            employerBalance: 0n,
            employeeBalance: 0n,
            ratePerMinute: this._pendingRate || 750000n,
            status: 'pending',  // Will change to 'open' after on-chain creation + funding complete
            version: state && state.version ? BigInt(state.version) : 0n,
            createdAt: new Date(),
            lastUpdate: new Date(),
        }

        // Cache ENS in localStorage for persistence across reconnects
        if (this._pendingEnsName) {
            const ensMap = JSON.parse(localStorage.getItem('streamwork_channel_ens') || '{}')
            ensMap[channel_id] = this._pendingEnsName
            localStorage.setItem('streamwork_channel_ens', JSON.stringify(ensMap))
        }

        // Clear pending
        this._pendingCounterparty = null
        this._pendingDepositAmount = null
        this._pendingRate = null
        this._pendingEnsName = null

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

            // Option A: Skip channel funding - use App Session directly from unified balance
            // The App Session allocations will reserve funds from unified balance
            newChannel.employerBalance = fundingAmount
            newChannel.employeeBalance = 0n
            newChannel.totalDeposit = fundingAmount
            this.channels.set(channel_id, newChannel)

            console.log('🚀 Creating App Session directly from unified balance...')
            await this.createAppSession(newChannel)

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

        console.log(`📤 Sending resize channel message for channel ${channelId}...`)
        this.ws.send(resizeMsg)
        console.log(`✅ Resize message sent`)
    }

    /**
     * Handle channel resized response
     */
    private async handleChannelResized(payload: any): Promise<void> {
        console.log('🔄 handleChannelResized triggered:', JSON.stringify(payload))
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
                console.log(`🔍 Fetching on-chain data for ${channel_id}...`)
                const onChainData = await this.nitroliteClient.getChannelData(channel_id as `0x${string}`)
                console.log('✅ On-chain data fetched')
                if (onChainData.lastValidState) {
                    proofStates = [onChainData.lastValidState]
                }
            } catch (e) {
                console.log('No existing on-chain data')
            }

            // Submit resize to chain
            // Submit resize to chain - WITH TIMEOUT
            console.log('📝 Requesting wallet signature for Resize Transaction (Funding)... CHECK YOUR WALLET!')

            const { txHash } = await Promise.race([
                this.nitroliteClient.resizeChannel({
                    resizeState,
                    proofStates,
                }),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('Resize Transaction Timed Out! Did you sign the wallet prompt?')), 30000)
                )
            ])

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
                // Status remains 'pending' - will become 'open' in handleAppSessionCreated
                channel.version = resizeState.version
                channel.lastUpdate = new Date()

                console.log(`📊 Channel ${channel_id} funded:`)
                console.log(`   Total deposit: ${totalFunded}`)
                console.log(`   Employer balance: ${channel.employerBalance}`)

                this.notifyChannelUpdate(channel)

                // Create Application Session for streaming payments
                console.log('🚀 About to create App Session for channel:', channel.id)
                console.log('   Channel state:', JSON.stringify({
                    id: channel.id,
                    employer: channel.employer,
                    employee: channel.employee,
                    employerBalance: channel.employerBalance.toString(),
                    employeeBalance: channel.employeeBalance.toString(),
                    status: channel.status
                }, null, 2))
                await this.createAppSession(channel)
                console.log('✅ createAppSession call completed for channel:', channel.id)
            }

        } catch (err) {
            console.error('Error resizing channel on-chain:', err)
            this.notifyError(err as Error)
        }
    }

    /**
     * Create an Application Session for a channel
     * This is required to use submit_app_state for streaming payments
     */
    private async createAppSession(channel: PaymentChannel): Promise<void> {
        console.log('🏁 createAppSession called for', channel.id)
        if (!this.sessionSigner || !this.ws) {
            console.error('Cannot create app session: not connected')
            return
        }

        console.log(`🔧 Creating Application Session for channel ${channel.id}`)

        try {
            // Helper: Convert from smallest units (6 decimals) to decimal string
            // e.g., 10000000n → "10.0"
            const toDecimalAmount = (amount: bigint): string => {
                const whole = amount / 1_000_000n
                const decimal = amount % 1_000_000n
                if (decimal === 0n) {
                    return whole.toString()
                }
                return `${whole}.${decimal.toString().padStart(6, '0').replace(/0+$/, '')}`
            }

            const employerAmount = toDecimalAmount(channel.employerBalance)
            const employeeAmount = toDecimalAmount(channel.employeeBalance)

            console.log(`📊 App Session allocations: employer=${employerAmount}, employee=${employeeAmount}`)

            const appSessionMsg = await createAppSessionMessage(
                this.sessionSigner,
                {
                    definition: {
                        application: 'streamwork',  // Must match auth request application name
                        protocol: RPCProtocolVersion.NitroRPC_0_4,
                        participants: [channel.employer as `0x${string}`, channel.employee as `0x${string}`],
                        weights: [100, 0],  // Employer has full control over state updates
                        quorum: 100,
                        challenge: 0,
                        nonce: Date.now(),
                    },
                    // CRITICAL: Both participants MUST be in allocations, even if employee has 0 balance
                    // Amounts must be in DECIMAL format (e.g., "10.0"), not smallest units!
                    allocations: [
                        { participant: channel.employer as `0x${string}`, asset: 'ytest.usd', amount: employerAmount },
                        { participant: channel.employee as `0x${string}`, asset: 'ytest.usd', amount: employeeAmount },
                    ],
                }
            )

            console.log('📤 App Session message to send:', appSessionMsg)
            this.ws.send(appSessionMsg)
            console.log('📤 App Session creation message sent for channel', channel.id)

            // Store pending info to link response back to channel
            this._pendingAppSessionChannelId = channel.id

        } catch (err) {
            console.error('Failed to create app session:', err)
        }
    }

    /**
     * Handle Application Session created response
     */
    private handleAppSessionCreated(payload: any): void {
        console.log('✅ App Session created:', payload)

        const appSessionId = payload.app_session_id
        if (!appSessionId) {
            console.error('No app_session_id in response')
            return
        }

        // Link to the pending channel
        if (this._pendingAppSessionChannelId) {
            const channel = this.channels.get(this._pendingAppSessionChannelId)
            if (channel) {
                channel.appSessionId = appSessionId
                channel.status = 'open'  // NOW the channel is fully ready for streaming!
                console.log(`🔗 Linked App Session ${appSessionId} to channel ${channel.id} - Status: OPEN`)
                this.notifyChannelUpdate(channel)
            }
            this._pendingAppSessionChannelId = null
        }
    }

    /**
     * Handle submit_app_state response (payment confirmation)
     */
    private handleAppStateSubmitted(payload: any): void {
        console.log('✅ App state submitted:', payload)

        // Update local channel state based on the confirmed allocations
        const appSessionId = payload.app_session_id
        if (appSessionId) {
            // Find the channel by app session ID
            for (const channel of this.channels.values()) {
                if (channel.appSessionId === appSessionId) {
                    // Update version
                    channel.version = BigInt(payload.version || channel.version)
                    channel.lastUpdate = new Date()

                    // Parse allocations if present
                    if (payload.allocations) {
                        for (const alloc of payload.allocations) {
                            if (alloc.participant?.toLowerCase() === channel.employer.toLowerCase()) {
                                channel.employerBalance = BigInt(alloc.amount || 0)
                            } else if (alloc.participant?.toLowerCase() === channel.employee.toLowerCase()) {
                                channel.employeeBalance = BigInt(alloc.amount || 0)
                            }
                        }
                    }

                    this.notifyChannelUpdate(channel)
                    break
                }
            }
        }
    }

    /**
     * Handle App Session Update notification (asu)
     * These are pushed by the server when app session state changes
     */
    private handleAppSessionUpdate(payload: any): void {
        console.log('📱 App Session Update:', payload)

        const appSession = payload.app_session
        const allocations = payload.participant_allocations

        if (!appSession?.app_session_id) return

        // Find the channel linked to this app session
        for (const channel of this.channels.values()) {
            if (channel.appSessionId === appSession.app_session_id) {
                // Update version
                channel.version = BigInt(appSession.version || channel.version)
                channel.lastUpdate = new Date()

                // Update allocations
                if (allocations) {
                    for (const alloc of allocations) {
                        if (alloc.participant?.toLowerCase() === channel.employer.toLowerCase()) {
                            channel.employerBalance = BigInt(alloc.amount || 0)
                        } else if (alloc.participant?.toLowerCase() === channel.employee.toLowerCase()) {
                            channel.employeeBalance = BigInt(alloc.amount || 0)
                        }
                    }
                }

                console.log(`📊 Channel ${channel.id} updated from asu: version=${channel.version}, empBal=${channel.employerBalance}`)
                this.notifyChannelUpdate(channel)
                break
            }
        }
    }

    /**
     * Send a channel state update for streaming payments
     * Uses submit_app_state to update allocations within the Application Session
     */
    private async sendChannelUpdate(channel: PaymentChannel, amount: bigint): Promise<void> {
        if (!this.sessionSigner || !this.ws) throw new Error('Not authenticated')

        if (!channel.appSessionId) {
            throw new Error('No Application Session for this channel - cannot send state update')
        }

        // Safety check
        if (channel.employerBalance < amount) {
            console.error(`❌ Insufficient channel balance. Has: ${channel.employerBalance}, Need: ${amount}`)
            throw new Error('Insufficient channel balance')
        }

        const newEmployerBal = channel.employerBalance - amount
        const newEmployeeBal = channel.employeeBalance + amount
        const nextVersion = Number((channel.version || 0n) + 1n)

        console.log(`📊 Updating Channel ${channel.id} (v${channel.version}) -> v${nextVersion}: Emp ${newEmployerBal} | Wkr ${newEmployeeBal}`)

        try {
            const updateMsg = await createSubmitAppStateMessage(
                this.sessionSigner,
                {
                    app_session_id: channel.appSessionId as `0x${string}`,
                    intent: RPCAppStateIntent.Operate,
                    version: nextVersion,
                    allocations: [
                        { participant: channel.employer as `0x${string}`, asset: 'ytest.usd', amount: newEmployerBal.toString() },
                        { participant: channel.employee as `0x${string}`, asset: 'ytest.usd', amount: newEmployeeBal.toString() },
                    ],
                }
            )

            console.log('📤 Sending Channel Update Message:', JSON.stringify(updateMsg, null, 2))
            this.ws.send(updateMsg)
            console.log('📤 Channel Update sent')

            // Optimistically update local state
            channel.employerBalance = newEmployerBal
            channel.employeeBalance = newEmployeeBal
            channel.version = BigInt(nextVersion)
            channel.lastUpdate = new Date()

        } catch (e) {
            console.error('Failed to create channel update:', e)
            throw e
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

        // Check if we have an open funded channel with an App Session for this recipient
        let targetChannel: PaymentChannel | undefined
        for (const ch of this.channels.values()) {
            if (ch.employee.toLowerCase() === recipient.toLowerCase() && ch.status === 'open') {
                targetChannel = ch
                break
            }
        }

        // Prioritize App Session state updates (channel-based) over Ledger Transfers
        if (targetChannel) {
            if (targetChannel.appSessionId) {
                console.log(`🔄 Sending payment via App Session (Channel ${targetChannel.id})`)
                return this.sendChannelUpdate(targetChannel, amount)
            } else {
                // Throw specific error so caller knows to retry - not a fatal error
                const err = new Error(`App Session not ready for channel ${targetChannel.id}`)
                err.name = 'AppSessionNotReady'
                console.log(`⏳ ${err.message} - caller should retry`)
                throw err
            }
        }

        // Fall back to Ledger Transfer if NO channel exists
        console.log(`💸 Sending payment via Ledger Transfer to ${recipient}`)

        // Validate recipient address
        if (!recipient || recipient.trim() === '') {
            console.error('❌ Cannot send payment: recipient address is empty')
            console.error('   Available channels:', Array.from(this.channels.entries()).map(([id, ch]) => ({
                id,
                employee: ch.employee,
                status: ch.status,
                appSessionId: ch.appSessionId
            })))
            throw new Error('Recipient address is empty - check employee address detection')
        }

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
                outputs: [{ type: 'uint256[][]' }],
                stateMutability: 'view'
            }],
            functionName: 'getAccountsBalances',
            args: [[userAddress], [token]],
        }) as bigint[][]

        const withdrawableBalance = result[0]?.[0] || 0n
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
        console.log('🔍 Parsing balance update payload:', JSON.stringify(payload, null, 2))

        // Handle balance_updates array format (from bu messages)
        // Example: { balance_updates: [{ asset: 'ytest.usd', amount: '83057.99987' }] }
        const updates = payload?.balance_updates || [payload]

        for (const update of updates) {
            const asset = update?.asset || update?.token
            const balanceStr = update?.balance || update?.amount

            if (asset && (asset === 'ytest.usd' || asset.toLowerCase().includes('usd'))) {
                try {
                    // Handle decimal amounts - server may return "83057.99987"
                    // Convert to smallest units (6 decimals for USDC-like tokens)
                    let balance: bigint
                    if (balanceStr?.includes('.')) {
                        const [whole, decimal = ''] = balanceStr.split('.')
                        const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6)
                        balance = BigInt(whole) * 1_000_000n + BigInt(paddedDecimal)
                    } else {
                        balance = BigInt(balanceStr || 0)
                    }

                    console.log(`💰 Updated balance for ${asset}: ${balance} (raw: ${balanceStr})`)
                    this._currentBalance = balance
                    this.notifyBalanceUpdate(balance)
                } catch (e) {
                    console.error('Failed to parse balance update', e)
                }
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

    // ============================================
    // ON-CHAIN DEPOSIT METHODS
    // ============================================

    /**
     * Get user's USDC balance in their wallet (not yet deposited)
     */
    async getWalletTokenBalance(): Promise<bigint> {
        if (!this.nitroliteClient) {
            throw new Error('NitroliteClient not initialized')
        }
        return await this.nitroliteClient.getTokenBalance(YTEST_USD_TOKEN)
    }

    /**
     * Get user's balance in Yellow Network Custody (deposited, ready for channels)
     */
    async getCustodyBalance(): Promise<bigint> {
        if (!this.nitroliteClient) {
            throw new Error('NitroliteClient not initialized')
        }
        return await this.nitroliteClient.getAccountBalance(YTEST_USD_TOKEN)
    }

    /**
     * Get current ERC20 allowance for Custody contract
     */
    async getTokenAllowance(): Promise<bigint> {
        if (!this.nitroliteClient) {
            throw new Error('NitroliteClient not initialized')
        }
        return await this.nitroliteClient.getTokenAllowance(YTEST_USD_TOKEN)
    }

    /**
     * Approve Custody contract to spend USDC
     * This is required before depositing
     * @returns Transaction hash
     */
    async approveToken(amount: bigint): Promise<string> {
        if (!this.nitroliteClient || !this.publicClient) {
            throw new Error('NitroliteClient or PublicClient not initialized')
        }

        console.log(`🔐 Approving ${amount} tokens for Custody contract...`)
        const txHash = await this.nitroliteClient.approveTokens(YTEST_USD_TOKEN, amount)
        console.log(`✅ Approval transaction submitted: ${txHash}`)

        console.log('⏳ Waiting for approval confirmation...')
        await this.publicClient.waitForTransactionReceipt({ hash: txHash })
        console.log('✅ Approval confirmed')

        return txHash
    }

    /**
     * Deposit USDC from wallet to Yellow Network Custody
     * User must approve first!
     * @returns Transaction hash
     */
    async depositToCustody(amount: bigint): Promise<string> {
        if (!this.nitroliteClient || !this.publicClient) {
            throw new Error('NitroliteClient or PublicClient not initialized')
        }

        // Check allowance
        const allowance = await this.getTokenAllowance()
        if (allowance < amount) {
            console.log(`⚠️ Insufficient allowance (${allowance} < ${amount}). Approving...`)
            await this.approveToken(amount)
        }

        console.log(`💰 Depositing ${amount} tokens to Custody...`)
        const txHash = await this.nitroliteClient.deposit(YTEST_USD_TOKEN, amount)
        console.log(`✅ Deposit transaction submitted: ${txHash}`)

        console.log('⏳ Waiting for deposit confirmation...')
        await this.publicClient.waitForTransactionReceipt({ hash: txHash })
        console.log('✅ Deposit confirmed')

        // Refresh balances
        this.queryLedgerBalances()

        return txHash
    }

    /**
     * Mint test tokens (Faucet)
     * @returns Transaction hash
     */
    async mintToken(amount: bigint): Promise<string> {
        if (!this.walletClient || !this.publicClient) {
            throw new Error('WalletClient or PublicClient not initialized')
        }

        console.log(`🚰 Minting ${amount} tokens...`)

        // Minimal ABI for mint function
        const mintAbi = [{
            inputs: [
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' }
            ],
            name: 'mint',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function'
        }] as const

        try {
            const txHash = await this.walletClient.writeContract({
                address: YTEST_USD_TOKEN,
                abi: mintAbi,
                functionName: 'mint',
                args: [this.userAddress as `0x${string}`, amount],
                chain: sepolia,
                account: this.userAddress as `0x${string}`
            })

            console.log(`✅ Mint transaction submitted: ${txHash}`)

            console.log('⏳ Waiting for minting confirmation...')
            await this.publicClient.waitForTransactionReceipt({ hash: txHash })
            console.log('✅ Minting confirmed')

            return txHash
        } catch (err) {
            console.error('Failed to mint tokens. The contract might not be public.', err)
            throw err
        }
    }

    /**
     * Withdraw USDC from Custody back to wallet
     * @returns Transaction hash
     */
    async withdrawFromCustody(amount: bigint): Promise<string> {
        if (!this.nitroliteClient || !this.publicClient) {
            throw new Error('NitroliteClient or PublicClient not initialized')
        }

        console.log(`💸 Withdrawing ${amount} tokens from Custody...`)
        const txHash = await this.nitroliteClient.withdrawal(YTEST_USD_TOKEN, amount)
        console.log(`✅ Withdrawal transaction submitted: ${txHash}`)

        console.log('⏳ Waiting for withdrawal confirmation...')
        await this.publicClient.waitForTransactionReceipt({ hash: txHash })
        console.log('✅ Withdrawal confirmed')

        // Refresh balances
        this.queryLedgerBalances()

        return txHash
    }

    /**
     * Get custody balance for ANY address
     */
    async getCustodyBalanceForAddress(address: string): Promise<bigint> {
        if (!this.publicClient) return 0n

        const CUSTODY_ADDRESS = '0x019B65A265EB3363822f2752141b3dF16131b262'

        try {
            // Retrieve balance from Custody contract
            // Uses getAccountsBalances(address[], address[]) -> uint256[][]
            const result = await this.publicClient.readContract({
                address: CUSTODY_ADDRESS,
                abi: [{
                    type: 'function',
                    name: 'getAccountsBalances',
                    inputs: [{ name: 'users', type: 'address[]' }, { name: 'tokens', type: 'address[]' }],
                    outputs: [{ type: 'uint256[][]' }],
                    stateMutability: 'view'
                }] as const,
                functionName: 'getAccountsBalances',
                args: [[address as `0x${string}`], [YTEST_USD_TOKEN]],
            }) as bigint[][]

            return result[0]?.[0] || 0n
        } catch (err) {
            console.error('Failed to fetch custody balance:', err)
            return 0n
        }
    }

    /**
     * Get balance of a specific channel
     */
    async getChannelBalance(channelId: string): Promise<bigint> {
        if (!this.publicClient) return 0n

        const CUSTODY_ADDRESS = '0x019B65A265EB3363822f2752141b3dF16131b262'

        try {
            const result = await this.publicClient.readContract({
                address: CUSTODY_ADDRESS,
                abi: [{
                    name: 'getChannelBalances',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'channelId', type: 'bytes32' }, { name: 'tokens', type: 'address[]' }],
                    outputs: [{ name: 'balances', type: 'uint256[]' }]
                }] as const,
                functionName: 'getChannelBalances',
                args: [channelId as `0x${string}`, [YTEST_USD_TOKEN]],
            }) as bigint[]

            return result[0] || 0n
        } catch (err) {
            console.error('Failed to fetch channel balance:', err)
            return 0n
        }
    }
}

// Export singleton instance
export const yellowService = new YellowService()
