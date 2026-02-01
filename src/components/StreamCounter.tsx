import { useEffect, useState } from 'react'
import './StreamCounter.css'

interface StreamCounterProps {
    amount: number
    prefix?: string
}

export function StreamCounter({ amount, prefix = '$' }: StreamCounterProps) {
    const [displayAmount, setDisplayAmount] = useState(amount)

    useEffect(() => {
        // Smooth animation to target amount
        const diff = amount - displayAmount
        if (Math.abs(diff) < 0.001) {
            setDisplayAmount(amount)
            return
        }

        const step = diff / 10
        const timer = setTimeout(() => {
            setDisplayAmount((prev) => prev + step)
        }, 50)

        return () => clearTimeout(timer)
    }, [amount, displayAmount])

    const formatted = formatMoney(displayAmount)
    const [dollars, cents] = formatted.split('.')

    return (
        <div className="stream-counter-wrapper">
            <span className="counter-prefix">{prefix}</span>
            <span className="counter-dollars">{dollars}</span>
            <span className="counter-separator">.</span>
            <span className="counter-cents">{cents}</span>
            <div className="counter-glow"></div>
        </div>
    )
}

function formatMoney(amount: number): string {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}
