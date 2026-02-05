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

// 5. Get User Wallets
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
        // Return empty balance on error (non-critical)
        res.json({ tokenBalances: [] });
    }
});

app.listen(port, () => {
    console.log(`StreamWork Backend running at http://localhost:${port}`);
});
