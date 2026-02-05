/**
 * React hooks for ENS name resolution and profile lookup
 */

import { useState, useEffect, useCallback } from 'react'
import {
    resolveENSName,
    lookupENSName,
    getENSProfile,
    resolveAddressOrENS,
    isENSName,
    type ENSProfile,
} from '../services/ens'

/**
 * Hook to resolve an ENS name to an address
 */
export function useENSAddress(name: string | null) {
    const [address, setAddress] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!name || !isENSName(name)) {
            setAddress(null)
            return
        }

        setIsLoading(true)
        setError(null)

        resolveENSName(name)
            .then((addr) => {
                setAddress(addr)
                if (!addr) {
                    setError('ENS name not found')
                }
            })
            .catch((err) => {
                setError(err.message)
                setAddress(null)
            })
            .finally(() => {
                setIsLoading(false)
            })
    }, [name])

    return { address, isLoading, error }
}

/**
 * Hook for reverse ENS lookup (address -> name)
 */
export function useENSName(address: string | null) {
    const [name, setName] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!address || !address.startsWith('0x')) {
            setName(null)
            return
        }

        setIsLoading(true)

        lookupENSName(address as `0x${string}`)
            .then(setName)
            .catch(() => setName(null))
            .finally(() => setIsLoading(false))
    }, [address])

    return { name, isLoading }
}

/**
 * Hook to get full ENS profile
 */
export function useENSProfile(nameOrAddress: string | null) {
    const [profile, setProfile] = useState<ENSProfile | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!nameOrAddress) {
            setProfile(null)
            return
        }

        setIsLoading(true)
        setError(null)

        getENSProfile(nameOrAddress)
            .then(setProfile)
            .catch((err) => {
                setError(err.message)
                setProfile(null)
            })
            .finally(() => setIsLoading(false))
    }, [nameOrAddress])

    return { profile, isLoading, error }
}

/**
 * Hook to resolve input (ENS or address) with validation
 */
export function useResolveInput(input: string) {
    const [result, setResult] = useState<{
        address: string | null
        ensName: string | null
        isValid: boolean
    }>({
        address: null,
        ensName: null,
        isValid: false,
    })
    const [isLoading, setIsLoading] = useState(false)

    const resolve = useCallback(async (value: string) => {
        if (!value) {
            setResult({ address: null, ensName: null, isValid: false })
            return
        }

        // Quick check for valid address format
        if (value.startsWith('0x') && value.length === 42) {
            setResult({ address: value, ensName: null, isValid: true })
            // Try reverse lookup in background
            lookupENSName(value as `0x${string}`).then((name) => {
                if (name) {
                    setResult((prev) => ({ ...prev, ensName: name }))
                }
            })
            return
        }

        // Check for ENS name
        if (isENSName(value)) {
            setIsLoading(true)
            try {
                const { address, ensName } = await resolveAddressOrENS(value)
                setResult({
                    address,
                    ensName,
                    isValid: !!address,
                })
            } catch {
                setResult({ address: null, ensName: null, isValid: false })
            } finally {
                setIsLoading(false)
            }
            return
        }

        setResult({ address: null, ensName: null, isValid: false })
    }, [])

    useEffect(() => {
        // Debounce resolution
        const timer = setTimeout(() => resolve(input), 300)
        return () => clearTimeout(timer)
    }, [input, resolve])

    return { ...result, isLoading }
}
