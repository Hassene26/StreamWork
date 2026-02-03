/**
 * Hook for simulated streaming balance
 * Used for demo purposes when not connected to Yellow Network
 */

import { useState, useEffect, useRef } from 'react'

interface UseStreamBalanceReturn {
    balance: number
    isStreaming: boolean
    start: (initialBalance: number, ratePerMinute: number) => void
    pause: () => void
    resume: () => void
    reset: () => void
}

export function useSimulatedStream(
    initialBalance = 0,
    ratePerMinute = 0.75
): UseStreamBalanceReturn {
    const [balance, setBalance] = useState(initialBalance)
    const [isStreaming, setIsStreaming] = useState(false)
    const rateRef = useRef(ratePerMinute)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const start = (initial: number, rate: number) => {
        setBalance(initial)
        rateRef.current = rate
        setIsStreaming(true)
    }

    const pause = () => {
        setIsStreaming(false)
    }

    const resume = () => {
        setIsStreaming(true)
    }

    const reset = () => {
        setBalance(0)
        setIsStreaming(false)
    }

    useEffect(() => {
        if (isStreaming) {
            // Update every second (rate is per minute, so divide by 60)
            intervalRef.current = setInterval(() => {
                setBalance((prev) => prev + rateRef.current / 60)
            }, 1000)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [isStreaming])

    return {
        balance,
        isStreaming,
        start,
        pause,
        resume,
        reset,
    }
}
