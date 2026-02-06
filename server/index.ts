import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';

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

// 10. Link Bank Account (for fiat withdrawal)
// POST /api/bank/link
app.post('/api/bank/link', async (req, res) => {
    try {
        const { billingDetails, bankAddress, accountNumber, routingNumber } = req.body;

        if (!accountNumber || !routingNumber) {
            return res.status(400).json({ error: 'Missing accountNumber or routingNumber' });
        }

        const response = await fetch('https://api-sandbox.circle.com/v1/businessAccount/banks/wires', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                billingDetails: billingDetails || {
                    name: 'StreamWork User',
                    city: 'New York',
                    country: 'US',
                    line1: '123 Main St',
                    district: 'NY',
                    postalCode: '10001',
                },
                bankAddress: bankAddress || {
                    bankName: 'Bank of America',
                    city: 'New York',
                    country: 'US',
                    line1: '100 Financial Blvd',
                    district: 'NY',
                },
                accountNumber,
                routingNumber,
                idempotencyKey: uuidv4(),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Link Bank Error:', data);
            return res.status(response.status).json(data);
        }

        // Returns: { id, status, description, trackingRef }
        res.json(data.data);
    } catch (error: any) {
        console.error('Link Bank Error:', error?.message);
        res.status(500).json({ error: 'Failed to link bank account' });
    }
});

// 11. List Linked Bank Accounts
// GET /api/bank/accounts
app.get('/api/bank/accounts', async (req, res) => {
    try {
        const response = await fetch('https://api-sandbox.circle.com/v1/businessAccount/banks/wires', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data.data || []);
    } catch (error: any) {
        console.error('List Banks Error:', error?.message);
        res.status(500).json({ error: 'Failed to list bank accounts' });
    }
});

// 12. Withdraw to Bank (create payout)
// POST /api/withdraw/to-bank
app.post('/api/withdraw/to-bank', async (req, res) => {
    try {
        const { bankAccountId, amount, currency } = req.body;

        if (!bankAccountId || !amount) {
            return res.status(400).json({ error: 'Missing bankAccountId or amount' });
        }

        const response = await fetch('https://api-sandbox.circle.com/v1/businessAccount/payouts', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                destination: {
                    type: 'wire',
                    id: bankAccountId,
                },
                amount: {
                    currency: currency || 'USD',
                    amount: amount.toString(),
                },
                idempotencyKey: uuidv4(),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Withdraw to Bank Error:', data);
            return res.status(response.status).json(data);
        }

        // Returns: { id, status, amount, destination }
        res.json(data.data);
    } catch (error: any) {
        console.error('Withdraw to Bank Error:', error?.message);
        res.status(500).json({ error: 'Failed to withdraw to bank' });
    }
});

// 13. Get Payout Status
// GET /api/withdraw/payout-status/:payoutId
app.get('/api/withdraw/payout-status/:payoutId', async (req, res) => {
    try {
        const { payoutId } = req.params;

        const response = await fetch(`https://api-sandbox.circle.com/v1/businessAccount/payouts/${payoutId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data.data);
    } catch (error: any) {
        console.error('Get Payout Status Error:', error?.message);
        res.status(500).json({ error: 'Failed to get payout status' });
    }
});

app.listen(port, () => {
    console.log(`StreamWork Backend running at http://localhost:${port}`);
});

