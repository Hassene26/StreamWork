import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCircleWallet } from '../hooks/useCircleWallet'
import { useENSProfile } from '../hooks/useENS'

function getLinkedENS(address: string | null): string | null {
    if (!address) return null
    return localStorage.getItem(`streamwork_ens_${address}`)
}

export function Settings() {
    const { address: circleAddress } = useCircleWallet()

    // State management
    const [linkedEns, setLinkedEns] = useState<string | null>(null)
    const [preferredStablecoin, setPreferredStablecoin] = useState('USDC')
    const [taxJurisdiction, setTaxJurisdiction] = useState('BR')
    const [autoTax, setAutoTax] = useState(true)

    // Load linked ENS when address changes
    useEffect(() => {
        setLinkedEns(getLinkedENS(circleAddress))
    }, [circleAddress])

    const { profile: ensProfile } = useENSProfile(linkedEns || circleAddress || null)

    // Determine display values
    const displayName = ensProfile?.name || linkedEns || 'No ENS Name'
    const displayAddress = circleAddress ? `${circleAddress.slice(0, 6)}...${circleAddress.slice(-4)}` : 'Not Connected'
    const hasEns = !!(ensProfile?.name || linkedEns)

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased min-h-screen font-display">
            <div className="flex h-screen overflow-hidden">
                {/* Sidebar Navigation */}
                <aside className="w-64 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-[#111813] flex flex-col justify-between shrink-0">
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-background-dark font-bold">bolt</span>
                            </div>
                            <div>
                                <h1 className="text-lg font-bold leading-none tracking-tight">StreamWork</h1>
                                <p className="text-xs text-slate-500 dark:text-[#9db9a4]">Real-time Payroll</p>
                            </div>
                        </div>
                        <nav className="space-y-1">
                            <Link to="/employee" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                                <span className="material-symbols-outlined">dashboard</span>
                                <span className="text-sm font-medium">Dashboard</span>
                            </Link>
                            <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary transition-colors">
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>settings</span>
                                <span className="text-sm font-medium">Settings</span>
                            </Link>
                        </nav>
                    </div>
                </aside>

                {/* Main Content Section */}
                <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-background-dark p-8">
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Page Header */}
                        <header>
                            <h2 className="text-3xl font-extrabold tracking-tight">Settings</h2>
                            <p className="text-slate-500 dark:text-[#9db9a4] mt-1">Manage your ENS identity, payment preferences and bank connections.</p>
                        </header>

                        {/* Profile & ENS Section */}
                        <section className="bg-white dark:bg-[#111813] border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-full border-2 border-primary/30 p-1">
                                            {/* Avatar: Use ENS avatar or Fallback to Initials */}
                                            {ensProfile?.avatar ? (
                                                <img
                                                    src={ensProfile.avatar}
                                                    alt="Avatar"
                                                    className="w-full h-full rounded-full object-cover bg-slate-800"
                                                />
                                            ) : (
                                                <div className="w-full h-full rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center overflow-hidden">
                                                    <span className="text-3xl font-bold text-white">
                                                        {displayName !== 'No ENS Name'
                                                            ? displayName.slice(0, 2).toUpperCase()
                                                            : (circleAddress ? circleAddress.slice(2, 4).toUpperCase() : '??')
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="absolute bottom-1 right-1 w-6 h-6 bg-primary rounded-full border-4 border-white dark:border-[#111813] flex items-center justify-center" title="Channel Active">
                                            <span className="material-symbols-outlined text-[10px] text-background-dark font-black">bolt</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-2xl font-bold tracking-tight">{displayName}</h3>
                                            {hasEns && (
                                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded tracking-wider">ENS Verified</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-slate-500 dark:text-[#9db9a4]">
                                            <span className="font-mono text-sm">{displayAddress}</span>
                                            <button
                                                className="material-symbols-outlined text-lg hover:text-primary transition-colors cursor-pointer"
                                                onClick={() => circleAddress && navigator.clipboard.writeText(circleAddress)}
                                                title="Copy Address"
                                            >
                                                content_copy
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button className="px-5 py-2 border border-slate-200 dark:border-white/10 hover:border-primary/50 text-sm font-bold rounded-lg transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">edit_note</span>
                                    Edit ENS
                                </button>
                            </div>
                        </section>

                        {/* Settings Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Payment Preferences */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 px-1">
                                    <span className="material-symbols-outlined text-primary">payments</span>
                                    <h3 className="text-lg font-bold">Payment Preferences</h3>
                                </div>
                                <div className="bg-white dark:bg-[#111813] border border-slate-200 dark:border-white/5 rounded-xl p-6 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Preferred Stablecoin</label>
                                        <div className="relative">
                                            <select
                                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none"
                                                value={preferredStablecoin}
                                                onChange={(e) => setPreferredStablecoin(e.target.value)}
                                            >
                                                <option value="USDC">USD Coin (USDC)</option>
                                                <option value="USDT">Tether (USDT)</option>
                                                <option value="DAI">DAI Stablecoin (DAI)</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <span className="material-symbols-outlined text-slate-400">expand_more</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Linked Bank Accounts */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">account_balance</span>
                                        <h3 className="text-lg font-bold">Linked Bank Accounts</h3>
                                    </div>
                                    <button className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">add_circle</span>
                                        Add Account
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {/* Mercado Pago Account */}
                                    <div className="bg-white dark:bg-[#111813] border border-slate-200 dark:border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 overflow-hidden">
                                                <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold">Mercado Pago</h4>
                                                <p className="text-xs text-slate-500 dark:text-[#9db9a4] font-mono mt-0.5">**** 1234 • Checking</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">verified</span>
                                                VERIFIED
                                            </span>
                                            <button className="material-symbols-outlined text-slate-400 hover:text-white transition-colors">more_vert</button>
                                        </div>
                                    </div>
                                    {/* Network Info */}
                                    <div className="p-4 border border-dashed border-slate-300 dark:border-white/10 rounded-xl bg-transparent">
                                        <div className="flex gap-3">
                                            <span className="material-symbols-outlined text-slate-400">info</span>
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                                                    Your payouts are routed via <strong>Circle's Arc</strong> state channels for instantaneous settlement to local accounts.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Footer Actions */}
                        <div className="pt-8 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-4">
                            <button className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-[#9db9a4] hover:text-slate-900 dark:hover:text-white transition-colors">
                                Cancel
                            </button>
                            <button className="px-8 py-2.5 bg-primary hover:bg-primary/90 text-background-dark text-sm font-bold rounded-lg shadow-lg shadow-primary/10 transition-all">
                                Save Profile Changes
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}