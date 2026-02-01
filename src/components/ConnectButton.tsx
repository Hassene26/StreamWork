import { useAccount, useConnect, useDisconnect } from 'wagmi'
import './ConnectButton.css'

export function ConnectButton() {
    const { address, isConnected } = useAccount()
    const { connect, connectors, isPending } = useConnect()
    const { disconnect } = useDisconnect()

    if (isConnected && address) {
        return (
            <div className="connect-button-wrapper">
                <button className="btn btn-outline connect-btn connected" onClick={() => disconnect()}>
                    <span className="address">{formatAddress(address)}</span>
                    <span className="disconnect-text">Disconnect</span>
                </button>
            </div>
        )
    }

    return (
        <div className="connect-button-wrapper">
            <button
                className="btn btn-primary connect-btn"
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isPending}
            >
                {isPending ? 'Connecting...' : 'Connect Wallet'}
            </button>
        </div>
    )
}

function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}
