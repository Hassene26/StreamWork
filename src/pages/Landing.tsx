import { Link } from 'react-router-dom'

export function Landing() {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
                {/* Logo and Branding */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 text-primary">
                        <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <path d="M42.4379 44C42.4379 44 36.0744 33.9038 41.1692 24C46.8624 12.9336 42.2078 4 42.2078 4L7.01134 4C7.01134 4 11.6577 12.932 5.96912 23.9969C0.876273 33.9029 7.27094 44 7.27094 44L42.4379 44Z" fill="currentColor"></path>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">StreamWork</h1>
                </div>

                {/* Tagline */}
                <p className="text-slate-400 text-lg text-center max-w-lg mb-12">
                    Real-time salary streaming via state channels.
                    <span className="text-primary"> Zero gas. Instant payments.</span>
                </p>

                {/* Role Selection Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
                    {/* Employer Card */}
                    <Link
                        to="/employer"
                        className="group bg-card-dark border border-border-dark hover:border-primary/50 rounded-xl p-8 transition-all duration-300 hover:shadow-[0_0_30px_rgba(19,236,73,0.15)]"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                                <span className="material-symbols-outlined text-primary text-4xl">business</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">I'm an Employer</h2>
                            <p className="text-slate-400 text-sm mb-6">
                                Stream real-time payments to your remote team.
                                Manage payroll with state channels.
                            </p>
                            <div className="flex items-center gap-2 text-primary font-semibold">
                                <span>Open Dashboard</span>
                                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </div>
                        </div>
                    </Link>

                    {/* Employee Card */}
                    <Link
                        to="/employee"
                        className="group bg-card-dark border border-border-dark hover:border-primary/50 rounded-xl p-8 transition-all duration-300 hover:shadow-[0_0_30px_rgba(19,236,73,0.15)]"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                                <span className="material-symbols-outlined text-primary text-4xl">person</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">I'm an Employee</h2>
                            <p className="text-slate-400 text-sm mb-6">
                                Receive earnings in real-time.
                                Withdraw instantly to your bank.
                            </p>
                            <div className="flex items-center gap-2 text-primary font-semibold">
                                <span>View Earnings</span>
                                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Features Grid */}
                <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-white mb-1">$0</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Gas per payment</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold text-white mb-1">60x</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Payments/hour</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold text-primary mb-1">Instant</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Bank withdrawals</div>
                    </div>
                </div>

                {/* Tech Stack */}
                <div className="mt-16 flex items-center gap-6 text-slate-500 text-sm">
                    <span>Powered by</span>
                    <div className="flex items-center gap-4">
                        <span className="text-white font-semibold">Yellow Network</span>
                        <span className="text-border-dark">•</span>
                        <span className="text-white font-semibold">Circle Arc</span>
                        <span className="text-border-dark">•</span>
                        <span className="text-white font-semibold">ENS</span>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 text-center text-slate-500 text-xs">
                <p>© 2026 StreamWork Protocol. Built for ETHGlobal HackMoney.</p>
            </footer>
        </div>
    )
}
