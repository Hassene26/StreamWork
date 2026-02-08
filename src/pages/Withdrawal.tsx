import { useState } from 'react'
import { Link } from 'react-router-dom'

interface FXRate {
    currency: string
    code: string
    rate: number
    flag: string
}

const FX_RATES: FXRate[] = [
    { currency: 'Argentine Peso', code: 'ARS', rate: 980.00, flag: '🇦🇷' },
    { currency: 'Euro', code: 'EUR', rate: 0.92, flag: '🇪🇺' },
    { currency: 'British Pound', code: 'GBP', rate: 0.79, flag: '🇬🇧' },
    { currency: 'Nigerian Naira', code: 'NGN', rate: 1650.00, flag: '🇳🇬' },
    { currency: 'Indian Rupee', code: 'INR', rate: 83.50, flag: '🇮🇳' },
]

export function Withdrawal() {
    const [amount, setAmount] = useState('1200.00')
    const [selectedCurrency, setSelectedCurrency] = useState<FXRate>(FX_RATES[0])

    const usdAmount = parseFloat(amount) || 0
    const localAmount = usdAmount * selectedCurrency.rate

    // Fee comparison simulation
    const wiseFee = 45 // Fixed fee simulation (approx 3-4%)
    const bankFee = 75 // Fixed fee simulation (approx 6-7%)

    // For comparison table, we calculate the "You Net" amount
    // StreamWork: No fee
    const streamworkNet = localAmount

    // Wise: Rate is usually slightly worse + fees
    // Simulating a slightly worse rate for Wise/Bank to make StreamWork look better (as per design)
    const wiseRate = selectedCurrency.rate * 0.93
    const wiseNet = (usdAmount * wiseRate) - (wiseFee * (selectedCurrency.rate / 980 * 980)) // Rough scaling

    // Traditional Bank: Worst rate + high fees
    const bankRate = selectedCurrency.rate * 0.87
    const bankNet = (usdAmount * bankRate) - (bankFee * (selectedCurrency.rate / 980 * 980))

    const totalSavings = streamworkNet - bankNet

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white min-h-screen font-display">
            <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden">
                <div className="layout-container flex h-full grow flex-col">
                    {/* Navigation */}
                    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-[#28392c] px-6 lg:px-20 py-4 bg-white dark:bg-background-dark">
                        <div className="flex items-center gap-4">
                            <div className="size-8 text-primary">
                                <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                            </div>
                            <h2 className="text-slate-900 dark:text-white text-xl font-bold leading-tight tracking-tight">StreamWork</h2>
                        </div>
                        <nav className="hidden md:flex flex-1 justify-center gap-8">
                            <Link className="text-slate-600 dark:text-[#9db9a4] text-sm font-medium hover:text-primary transition-colors" to="/employee">Dashboard</Link>
                            <Link className="text-slate-600 dark:text-[#9db9a4] text-sm font-medium hover:text-primary transition-colors" to="#">Earnings</Link>
                            <Link className="text-slate-600 dark:text-[#9db9a4] text-sm font-medium hover:text-primary transition-colors" to="#">Payments</Link>
                            <Link className="text-slate-600 dark:text-[#9db9a4] text-sm font-medium hover:text-primary transition-colors" to="/settings">Settings</Link>
                        </nav>
                        <div className="flex items-center gap-4">
                            <button className="flex items-center justify-center rounded-lg h-10 w-10 bg-slate-100 dark:bg-[#28392c] text-slate-600 dark:text-white">
                                <span className="material-symbols-outlined text-[20px]">notifications</span>
                            </button>
                            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-700">
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-[#9db9a4]">Freelancer</p>
                                    <p className="text-sm font-bold">Alex Rivera</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-primary overflow-hidden">
                                    {/* Placeholder Avatar */}
                                    {/* <img src="..." /> */}
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Main Content Container */}
                    <main className="flex-1 flex flex-col items-center px-4 lg:px-20 py-8 max-w-[1280px] mx-auto w-full">
                        {/* Breadcrumbs & Header */}
                        <div className="w-full mb-8">
                            <div className="flex items-center gap-2 mb-2">
                                <Link className="text-slate-500 dark:text-[#9db9a4] text-sm hover:text-primary" to="/employee">Dashboard</Link>
                                <span className="material-symbols-outlined text-xs text-slate-400">chevron_right</span>
                                <span className="text-slate-900 dark:text-white text-sm font-semibold">Withdrawal</span>
                            </div>
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 text-slate-900 dark:text-white">Withdrawal & FX Conversion</h1>
                                    <p className="text-slate-500 dark:text-[#9db9a4] max-w-xl">Move your earnings to local currency instantly using Circle Arc state channels. Transparent rates, zero hidden fees.</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20">
                                    <span className="material-symbols-outlined text-primary text-sm animate-pulse">sensors</span>
                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Live Market Rates</span>
                                </div>
                            </div>
                        </div>

                        {/* Split View Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
                            {/* Left Side: Input */}
                            <div className="lg:col-span-5 flex flex-col gap-6">
                                <div className="bg-white dark:bg-[#1c271e] p-6 rounded-xl border border-slate-200 dark:border-[#3b5441] shadow-sm">
                                    <div className="flex justify-between items-center mb-6">
                                        <label className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-[#9db9a4]">Transfer Amount</label>
                                        <span className="text-xs font-medium bg-slate-100 dark:bg-[#28392c] dark:text-slate-200 px-2 py-1 rounded">USDC Balance: 2,450.00</span>
                                    </div>
                                    <div className="relative group mb-6">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                            <div className="bg-blue-600 rounded-full p-1 h-6 w-6 flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-white">S</span>
                                            </div>
                                            <span className="font-bold text-slate-900 dark:text-white">USDC</span>
                                        </div>
                                        <input
                                            className="w-full bg-slate-50 dark:bg-[#102215] border border-slate-200 dark:border-[#3b5441] rounded-lg py-5 pl-24 pr-20 text-2xl font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                            placeholder="0.00"
                                            step="0.01"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                        />
                                        <button
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-bold text-sm hover:underline"
                                            onClick={() => setAmount('2450.00')}
                                        >
                                            MAX
                                        </button>
                                    </div>

                                    {/* Currency Selection (Added to enable switching) */}
                                    <div className="mb-6">
                                        <label className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-[#9db9a4] block mb-2">Target Currency</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {FX_RATES.map(rate => (
                                                <button
                                                    key={rate.code}
                                                    className={`px-3 py-2 rounded-lg border text-sm font-bold flex items-center gap-2 transition-all ${selectedCurrency.code === rate.code
                                                        ? 'bg-primary/20 border-primary text-primary'
                                                        : 'bg-transparent border-slate-200 dark:border-[#3b5441] text-slate-600 dark:text-[#9db9a4] hover:bg-slate-100 dark:hover:bg-[#28392c]'
                                                        }`}
                                                    onClick={() => setSelectedCurrency(rate)}
                                                >
                                                    <span>{rate.flag}</span>
                                                    {rate.code}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 pt-6 border-t border-slate-100 dark:border-[#28392c]">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500 dark:text-[#9db9a4]">Destination</span>
                                            <span className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                                <span className="material-symbols-outlined text-blue-500">account_balance</span>
                                                Mercado Pago
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500 dark:text-[#9db9a4]">Account ID</span>
                                            <span className="font-bold text-slate-900 dark:text-white">alex.rivera.mp (CVU ...9281)</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500 dark:text-[#9db9a4]">Transfer Speed</span>
                                            <span className="text-primary font-bold flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">bolt</span>
                                                Instant
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {/* Trust / Tech Details */}
                                <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#3b5441]">
                                    <span className="material-symbols-outlined text-primary text-3xl">verified_user</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Secured by State Channels</h4>
                                        <p className="text-xs text-slate-500 dark:text-[#9db9a4]">Funds are settled instantly via Circle Arc infrastructure without traditional bank delays.</p>
                                    </div>
                                </div>
                            </div>
                            {/* Right Side: Preview & Comparison */}
                            <div className="lg:col-span-7 flex flex-col gap-6">
                                <div className="bg-primary/5 border border-primary/20 p-8 rounded-xl relative overflow-hidden">
                                    {/* Background Decor */}
                                    <div className="absolute -right-10 -top-10 text-primary/10 transform rotate-12 pointer-events-none">
                                        <span className="material-symbols-outlined text-[180px]">currency_exchange</span>
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">You Receive ({selectedCurrency.code})</p>
                                        <div className="flex items-baseline gap-3">
                                            <h2 className="text-5xl font-black text-slate-900 dark:text-white">
                                                {localAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </h2>
                                            <span className="text-xl font-bold text-slate-500 dark:text-[#9db9a4]">{selectedCurrency.code}</span>
                                        </div>
                                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Conversion Breakdown */}
                                            <div className="bg-white dark:bg-background-dark/50 p-4 rounded-lg border border-primary/10">
                                                <p className="text-xs font-bold text-slate-500 dark:text-[#9db9a4] mb-1">Exchange Rate</p>
                                                <p className="font-bold text-slate-900 dark:text-white">1 USDC = {selectedCurrency.rate.toFixed(2)} {selectedCurrency.code}</p>
                                                <p className="text-[10px] text-primary mt-1">Real-time Circle FX API</p>
                                            </div>
                                            <div className="bg-white dark:bg-background-dark/50 p-4 rounded-lg border border-primary/10">
                                                <p className="text-xs font-bold text-slate-500 dark:text-[#9db9a4] mb-1">Network Fee</p>
                                                <p className="font-bold text-slate-900 dark:text-white">$0.00 USDC</p>
                                                <p className="text-[10px] text-primary mt-1">Paid by StreamWork</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* Comparison Module */}
                                <div className="bg-white dark:bg-[#1c271e] rounded-xl border border-slate-200 dark:border-[#3b5441] overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-200 dark:border-[#3b5441] flex items-center justify-between bg-slate-50 dark:bg-black/20">
                                        <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                            <span className="material-symbols-outlined text-primary">analytics</span>
                                            StreamWork Savings
                                        </h3>
                                        <span className="text-[10px] font-bold bg-primary text-background-dark px-2 py-0.5 rounded-full">BEST VALUE</span>
                                    </div>
                                    <div className="p-6">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-slate-500 dark:text-[#9db9a4] text-left border-b border-slate-100 dark:border-white/5">
                                                    <th className="pb-3 font-medium">Provider</th>
                                                    <th className="pb-3 font-medium">Rate ({selectedCurrency.code})</th>
                                                    <th className="pb-3 font-medium">Total Fees</th>
                                                    <th className="pb-3 font-medium text-right">You Net</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                <tr className="group">
                                                    <td className="py-4 font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                                        <div className="size-2 rounded-full bg-primary"></div>
                                                        StreamWork
                                                    </td>
                                                    <td className="py-4 text-slate-700 dark:text-slate-300">{selectedCurrency.rate.toFixed(2)}</td>
                                                    <td className="py-4 text-primary font-bold">$0.00</td>
                                                    <td className="py-4 text-right font-black text-primary">
                                                        {localAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </td>
                                                </tr>
                                                <tr className="opacity-60 text-slate-600 dark:text-[#9db9a4]">
                                                    <td className="py-4 font-medium">Wise / Wire</td>
                                                    <td className="py-4">{wiseRate.toFixed(2)}</td>
                                                    <td className="py-4">${wiseFee.toFixed(2)}</td>
                                                    <td className="py-4 text-right">
                                                        {wiseNet.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </td>
                                                </tr>
                                                <tr className="opacity-60 text-slate-600 dark:text-[#9db9a4]">
                                                    <td className="py-4 font-medium">Local Bank</td>
                                                    <td className="py-4">{bankRate.toFixed(2)}</td>
                                                    <td className="py-4">${bankFee.toFixed(2)}</td>
                                                    <td className="py-4 text-right">
                                                        {bankNet.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div className="mt-6 p-4 bg-primary/20 border border-primary/30 rounded-lg flex items-center justify-between">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">Total Savings vs Traditional</span>
                                            <span className="text-lg font-black text-primary">+{totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedCurrency.code}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Action Area */}
                        <div className="w-full mt-12 bg-white dark:bg-[#1c271e] p-8 rounded-2xl border border-slate-200 dark:border-[#3b5441] shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="size-16 bg-slate-100 dark:bg-[#28392c] rounded-full flex items-center justify-center border-4 border-primary/20">
                                    <span className="material-symbols-outlined text-primary text-3xl">account_balance_wallet</span>
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-slate-900 dark:text-white">Ready to withdraw?</h4>
                                    <p className="text-slate-500 dark:text-[#9db9a4] text-sm">Transferring {usdAmount.toFixed(2)} USDC to your Mercado Pago wallet.</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                                <Link
                                    to="/employee"
                                    className="px-8 py-4 text-slate-500 dark:text-[#9db9a4] font-bold hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors w-full sm:w-auto text-center"
                                >
                                    Cancel
                                </Link>
                                <button className="px-10 py-4 bg-primary text-background-dark font-black text-lg rounded-lg shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto">
                                    Confirm Transfer
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                            </div>
                        </div>

                        {/* Extra Trust Info */}
                        <div className="mt-12 mb-20 flex flex-wrap justify-center gap-8 text-slate-400 dark:text-slate-600 grayscale opacity-50">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">security</span>
                                <span className="text-xs font-bold uppercase tracking-widest">PCI-DSS Compliant</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">hub</span>
                                <span className="text-xs font-bold uppercase tracking-widest">Powered by Circle Arc</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">encrypted</span>
                                <span className="text-xs font-bold uppercase tracking-widest">256-Bit SSL Secured</span>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    )
}
