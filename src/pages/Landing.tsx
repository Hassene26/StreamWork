import { Link } from 'react-router-dom'
import './Landing.css'

export function Landing() {
    return (
        <div className="landing">
            <section className="hero">
                <div className="hero-content animate-slideUp">
                    <div className="hero-badge">
                        <span className="badge-icon">🚀</span>
                        <span>HackMoney 2026</span>
                    </div>

                    <h1 className="hero-title">
                        Stream Salaries in <span className="gradient-text">Real-Time</span>
                    </h1>

                    <p className="hero-subtitle">
                        Pay remote workers per minute using state channels.
                        No gas fees. No delays. No bank intermediaries.
                    </p>

                    <div className="hero-stats">
                        <div className="stat">
                            <span className="stat-value">$0</span>
                            <span className="stat-label">Gas per payment</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">60x</span>
                            <span className="stat-label">Payments/hour</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">0%</span>
                            <span className="stat-label">Hidden fees</span>
                        </div>
                    </div>

                    <div className="hero-actions">
                        <Link to="/employer" className="btn btn-primary btn-lg">
                            Start Streaming Salary
                        </Link>
                        <Link to="/employee" className="btn btn-outline btn-lg">
                            Receive Payments
                        </Link>
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="stream-demo">
                        <div className="stream-demo-label">Money Streaming Live</div>
                        <div className="stream-counter">$1,847.32</div>
                        <div className="stream-rate">+$0.75/min</div>
                        <div className="stream-particles">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="particle" style={{ animationDelay: `${i * 0.2}s` }} />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="features">
                <h2 className="text-center mb-xl">How It Works</h2>
                <div className="grid grid-3">
                    <div className="card feature-card">
                        <div className="feature-icon">💰</div>
                        <h3>Deposit Once</h3>
                        <p className="text-secondary">
                            Employer deposits USDC into a state channel. One gas fee, then unlimited payments.
                        </p>
                    </div>
                    <div className="card feature-card">
                        <div className="feature-icon">⚡</div>
                        <h3>Stream Per Minute</h3>
                        <p className="text-secondary">
                            Every minute, a cryptographic signature updates the balance. No blockchain needed.
                        </p>
                    </div>
                    <div className="card feature-card">
                        <div className="feature-icon">🏦</div>
                        <h3>Withdraw Anytime</h3>
                        <p className="text-secondary">
                            Employee withdraws accumulated earnings to their bank via Circle's Bridge Kit.
                        </p>
                    </div>
                </div>
            </section>

            <section className="tech-stack">
                <h2 className="text-center mb-xl">Built With</h2>
                <div className="tech-logos">
                    <div className="tech-item">
                        <div className="tech-name">Yellow Network</div>
                        <div className="tech-desc">State Channels</div>
                    </div>
                    <div className="tech-item">
                        <div className="tech-name">Circle Arc</div>
                        <div className="tech-desc">Wallets & Offramp</div>
                    </div>
                    <div className="tech-item">
                        <div className="tech-name">ENS</div>
                        <div className="tech-desc">Human Addresses</div>
                    </div>
                </div>
            </section>
        </div>
    )
}
