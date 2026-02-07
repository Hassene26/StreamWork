import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';
import { createPublicClient, createWalletClient, http, encodeFunctionData, namehash, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';

// Load .env from parent directory (project root)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Circle User-Controlled Wallets Client
// 🛑 CRITICAL: This API Key and Entity Secret MUST remain server-side.
const apiKey = process.env.CIRCLE_API_KEY || '';
console.log('Circle API Key loaded:', apiKey ? `${apiKey.substring(0, 20)}...` : 'MISSING');
console.log('API Key format check - contains colons:', apiKey.includes(':'));

const circleClient = initiateUserControlledWalletsClient({
    apiKey: apiKey,
});

// ============================================
// ENS REGISTRATION SETUP (Sepolia)
// Backend-sponsored registration — pays gas so users don't need ETH
// ============================================

const ENS_REGISTRAR_CONTROLLER = '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968' as const;
const ENS_PUBLIC_RESOLVER = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const;
const ENS_REGISTRATION_DURATION = BigInt(365 * 24 * 60 * 60); // 1 year in seconds

const ensRegistrarAbi = [
    {
        name: 'available',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'label', type: 'string' }],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'rentPrice',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'label', type: 'string' },
            { name: 'duration', type: 'uint256' },
        ],
        outputs: [
            {
                name: 'price',
                type: 'tuple',
                components: [
                    { name: 'base', type: 'uint256' },
                    { name: 'premium', type: 'uint256' },
                ],
            },
        ],
    },
    {
        name: 'makeCommitment',
        type: 'function',
        stateMutability: 'pure',
        inputs: [
            {
                name: 'registration',
                type: 'tuple',
                components: [
                    { name: 'label', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'duration', type: 'uint256' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'uint8' },
                    { name: 'referrer', type: 'bytes32' },
                ],
            },
        ],
        outputs: [{ name: 'commitment', type: 'bytes32' }],
    },
    {
        name: 'commit',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'commitment', type: 'bytes32' }],
        outputs: [],
    },
    {
        name: 'register',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'registration',
                type: 'tuple',
                components: [
                    { name: 'label', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'duration', type: 'uint256' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'uint8' },
                    { name: 'referrer', type: 'bytes32' },
                ],
            },
        ],
        outputs: [],
    },
    {
        name: 'minCommitmentAge',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

const ensResolverAbi = [
    {
        name: 'setAddr',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'a', type: 'address' },
        ],
        outputs: [],
    },
] as const;

// Sepolia viem clients for ENS registration
const sepoliaPublicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
});

const ensPrivateKey = process.env.ENS_REGISTRAR_PRIVATE_KEY;
let ensWalletClient: ReturnType<typeof createWalletClient> | null = null;

if (ensPrivateKey) {
    const account = privateKeyToAccount(`0x${ensPrivateKey.replace('0x', '')}` as Hex);
    ensWalletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
    });
    console.log('ENS Registrar wallet loaded:', account.address);
} else {
    console.warn('ENS_REGISTRAR_PRIVATE_KEY not set — ENS registration disabled');
}

// In-memory job store for async ENS registration
interface ENSRegistrationJob {
    id: string;
    label: string;
    ownerAddress: string;
    status: 'committing' | 'waiting' | 'registering' | 'complete' | 'error';
    txHash?: string;
    error?: string;
    createdAt: number;
}

const ensJobs = new Map<string, ENSRegistrationJob>();

// Middleware to log requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- Endpoints ---

// 1. Create a New User (or get token for existing)
// This simulates "Logging in" with Circle to get a session token
app.post('/api/users/create', async (req, res) => {
    try {
        const { userId } = req.body;
        // In a real app, 'userId' comes from your IDP (Auth0, Firebase, Google, etc.)
        // We Map 'google-oauth-uid' -> Circle 'userId' (UUID)

        // For demo: We just invoke "create user" idempotently
        const response = await circleClient.createUser({
            userId: userId, // Must be UUID
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('Create User Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create user', details: error?.response?.data });
    }
});

// 2. Get User Token
// Required for the Frontend SDK to initialize
app.post('/api/users/token', async (req, res) => {
    try {
        const { userId } = req.body;
        const response = await circleClient.createUserToken({
            userId: userId,
        });
        res.json(response.data);
    } catch (error: any) {
        console.error('Get Token Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get token', details: error?.response?.data });
    }
});

// 2a. Get Device Token for Social Login
app.post('/api/auth/device-token', async (req, res) => {
    try {
        const { deviceId } = req.body;
        const response = await circleClient.createDeviceTokenForSocialLogin({
            deviceId: deviceId,
        });
        res.json(response.data);
    } catch (error: any) {
        console.error('Get Device Token Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get device token', details: error?.response?.data });
    }
});

// 3. Initialize Wallet (Generate Challenge)
// Instead of creating the wallet directly, we generate a challenge
// The Frontend SDK (W3S) will execute this challenge with the User's PIN
app.post('/api/wallets/init', async (req, res) => {
    try {
        const { userId, blockchains } = req.body;
        const idempotencyKey = uuidv4();

        const response = await circleClient.createUserPinWithWallets({
            userId: userId,
            blockchains: blockchains || ['ETH-SEPOLIA'], // Default to Sepolia
            idempotencyKey: idempotencyKey,
        });

        // We return the challengeId to the frontend
        res.json(response.data);
    } catch (error: any) {
        console.error('Init Wallet Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to initialize wallet', details: error?.response?.data });
    }
});

// 4. Payouts (Mock/Sandbox)
// Triggers a payout to a bank account
app.post('/api/payouts', async (req, res) => {
    console.log('💰 Initiating Payout:', req.body);
    // Simulation: Just return success for the Hackathon Demo
    // In reality: Call @circle-fin/developer-controlled-wallets -> createPayout()

    await new Promise(r => setTimeout(r, 1000)); // Fake delay

    res.json({
        id: uuidv4(),
        status: 'pending',
        amount: req.body.amount,
        destination: 'Bank of America **** 1234'
    });
});

// 5. Get User Wallets (legacy - by userId)
app.get('/api/wallets/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const response = await circleClient.listWallets({ userId });
        res.json(response.data);
    } catch (error: any) {
        console.error('Get Wallets Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get wallets', details: error?.response?.data });
    }
});

// 5a. Initialize User for Social Login (returns challengeId)
// Uses X-User-Token header pattern from Circle docs
app.post('/api/users/initialize', async (req, res) => {
    try {
        const { userToken, blockchains } = req.body;

        if (!userToken) {
            return res.status(400).json({ error: 'Missing userToken' });
        }

        // Call Circle API to initialize user with the social login userToken
        const response = await fetch('https://api.circle.com/v1/w3s/user/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'X-User-Token': userToken,
            },
            body: JSON.stringify({
                idempotencyKey: uuidv4(),
                accountType: 'SCA',
                blockchains: blockchains || ['ETH-SEPOLIA'],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Pass through Circle error payload (e.g. code 155106: user already initialized)
            console.error('Initialize User Error:', data);
            return res.status(response.status).json(data);
        }

        // Returns: { challengeId }
        res.json(data.data);
    } catch (error: any) {
        console.error('Initialize User Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to initialize user', details: error?.response?.data });
    }
});

// 5b. List Wallets using userToken (for social login flow)
app.post('/api/wallets/list', async (req, res) => {
    try {
        const { userToken } = req.body;

        if (!userToken) {
            return res.status(400).json({ error: 'Missing userToken' });
        }

        const response = await fetch('https://api.circle.com/v1/w3s/wallets', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'X-User-Token': userToken,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('List Wallets Error:', data);
            return res.status(response.status).json(data);
        }

        // Returns: { wallets: [...] }
        res.json(data.data);
    } catch (error: any) {
        console.error('List Wallets Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to list wallets', details: error?.response?.data });
    }
});

// 6. Get Wallet Balance
// Note: For user-controlled wallets, we need userToken from frontend
app.post('/api/wallets/balance', async (req, res) => {
    try {
        const { walletId, userToken } = req.body;
        const response = await circleClient.getWalletTokenBalance({
            walletId: walletId,
            userToken: userToken,
        });
        res.json(response.data);
    } catch (error: any) {
        console.error('Get Balance Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch balance', details: error?.response?.data });
    }
});

// ============================================
// USER-CONTROLLED WALLET TRANSFER ENDPOINTS
// These use the challenge-based flow for user wallets
// ============================================

// 7. Create Transfer Challenge (for wallet-to-wallet withdrawal)
// The frontend must execute the returned challengeId via the Circle SDK
app.post('/api/withdraw/create-transfer', async (req, res) => {
    try {
        const { userToken, walletId, destinationAddress, amount, tokenId } = req.body;

        if (!userToken || !walletId || !destinationAddress || !amount || !tokenId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['userToken', 'walletId', 'destinationAddress', 'amount', 'tokenId']
            });
        }

        const response = await circleClient.createTransaction({
            userToken,
            walletId,
            destinationAddress,
            amounts: [amount.toString()],
            tokenId,
            fee: {
                type: 'level',
                config: {
                    feeLevel: 'MEDIUM',
                },
            },
        });

        console.log('Transfer challenge created:', response.data);
        // Returns: { challengeId: '...' }
        res.json(response.data);
    } catch (error: any) {
        console.error('Create Transfer Error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create transfer', details: error?.response?.data });
    }
});

// ============================================
// BANK WITHDRAWAL ENDPOINTS
// In production, these would use Circle Mint businessAccount API:
//   1. User wallet → platform wallet (challenge flow above)
//   2. Platform → bank payout (businessAccount/payouts API)
// Currently mocked for hackathon demo.
// ============================================

// ============================================
// ENS REGISTRATION ENDPOINTS
// Backend-sponsored registration on Sepolia
// ============================================

// 8. Check ENS Name Availability
app.post('/api/ens/available', async (req, res) => {
    try {
        const { label } = req.body;
        if (!label || typeof label !== 'string') {
            return res.status(400).json({ error: 'Missing label' });
        }

        const isAvailable = await sepoliaPublicClient.readContract({
            address: ENS_REGISTRAR_CONTROLLER,
            abi: ensRegistrarAbi,
            functionName: 'available',
            args: [label],
        });

        let price = { base: '0', premium: '0' };
        if (isAvailable) {
            const priceResult = await sepoliaPublicClient.readContract({
                address: ENS_REGISTRAR_CONTROLLER,
                abi: ensRegistrarAbi,
                functionName: 'rentPrice',
                args: [label, ENS_REGISTRATION_DURATION],
            });
            price = {
                base: priceResult.base.toString(),
                premium: priceResult.premium.toString(),
            };
        }

        res.json({ available: isAvailable, price });
    } catch (error: any) {
        console.error('ENS Available Error:', error.message);
        res.status(500).json({ error: 'Failed to check ENS availability', details: error.message });
    }
});

// 9. Start ENS Registration (async — returns jobId)
app.post('/api/ens/register', async (req, res) => {
    try {
        const { label, ownerAddress } = req.body;
        if (!label || !ownerAddress) {
            return res.status(400).json({ error: 'Missing label or ownerAddress' });
        }
        if (!ensWalletClient) {
            return res.status(503).json({ error: 'ENS registration not configured (missing private key)' });
        }

        // Create job
        const jobId = uuidv4();
        const job: ENSRegistrationJob = {
            id: jobId,
            label,
            ownerAddress,
            status: 'committing',
            createdAt: Date.now(),
        };
        ensJobs.set(jobId, job);

        // Return jobId immediately — registration runs in background
        res.json({ jobId });

        // Run registration asynchronously
        runENSRegistration(job).catch((err) => {
            console.error('ENS registration failed:', err);
            job.status = 'error';
            job.error = err.message;
        });
    } catch (error: any) {
        console.error('ENS Register Error:', error.message);
        res.status(500).json({ error: 'Failed to start ENS registration', details: error.message });
    }
});

// 10. Check ENS Registration Status
app.get('/api/ens/status/:jobId', async (req, res) => {
    const job = ensJobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json({
        status: job.status,
        label: job.label,
        name: `${job.label}.eth`,
        txHash: job.txHash,
        error: job.error,
    });
});

// Background ENS registration logic
async function runENSRegistration(job: ENSRegistrationJob) {
    if (!ensWalletClient) throw new Error('ENS wallet not configured');

    const { label, ownerAddress } = job;
    const secret = `0x${crypto.randomBytes(32).toString('hex')}` as Hex;

    // Encode setAddr call for the resolver data[] parameter
    // This makes the name resolve to the owner's Circle wallet address immediately
    const node = namehash(`${label}.eth`);
    const setAddrData = encodeFunctionData({
        abi: ensResolverAbi,
        functionName: 'setAddr',
        args: [node, ownerAddress as `0x${string}`],
    });

    const registration = {
        label,
        owner: ownerAddress as `0x${string}`,
        duration: ENS_REGISTRATION_DURATION,
        secret,
        resolver: ENS_PUBLIC_RESOLVER,
        data: [setAddrData],
        reverseRecord: 0,
        referrer: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    };

    console.log(`[ENS] Starting registration for ${label}.eth → ${ownerAddress}`);

    // Step 1: makeCommitment (read-only)
    const commitment = await sepoliaPublicClient.readContract({
        address: ENS_REGISTRAR_CONTROLLER,
        abi: ensRegistrarAbi,
        functionName: 'makeCommitment',
        args: [registration],
    });
    console.log(`[ENS] Commitment hash:`, commitment);

    // Step 2: commit (transaction)
    job.status = 'committing';
    const commitTx = await ensWalletClient.writeContract({
        address: ENS_REGISTRAR_CONTROLLER,
        abi: ensRegistrarAbi,
        functionName: 'commit',
        args: [commitment],
    });
    console.log(`[ENS] Commit tx:`, commitTx);

    // Wait for commit to be mined
    await sepoliaPublicClient.waitForTransactionReceipt({ hash: commitTx });
    console.log(`[ENS] Commit confirmed`);

    // Step 3: Wait for minCommitmentAge
    job.status = 'waiting';
    const minAge = await sepoliaPublicClient.readContract({
        address: ENS_REGISTRAR_CONTROLLER,
        abi: ensRegistrarAbi,
        functionName: 'minCommitmentAge',
    });
    const waitMs = (Number(minAge) + 5) * 1000; // Add 5s buffer
    console.log(`[ENS] Waiting ${waitMs / 1000}s for commitment age...`);
    await new Promise(r => setTimeout(r, waitMs));

    // Step 4: Get price and register
    job.status = 'registering';
    const price = await sepoliaPublicClient.readContract({
        address: ENS_REGISTRAR_CONTROLLER,
        abi: ensRegistrarAbi,
        functionName: 'rentPrice',
        args: [label, ENS_REGISTRATION_DURATION],
    });
    const totalPrice = price.base + price.premium;
    // Add 10% buffer for price fluctuations
    const value = totalPrice + (totalPrice / 10n);

    console.log(`[ENS] Registering ${label}.eth (price: ${totalPrice} wei)`);
    const registerTx = await ensWalletClient.writeContract({
        address: ENS_REGISTRAR_CONTROLLER,
        abi: ensRegistrarAbi,
        functionName: 'register',
        args: [registration],
        value,
    });
    console.log(`[ENS] Register tx:`, registerTx);

    // Wait for registration to be mined
    await sepoliaPublicClient.waitForTransactionReceipt({ hash: registerTx });

    job.status = 'complete';
    job.txHash = registerTx;
    console.log(`[ENS] ✅ ${label}.eth registered successfully! tx: ${registerTx}`);
}

app.listen(port, () => {
    console.log(`StreamWork Backend running at http://localhost:${port}`);
});

