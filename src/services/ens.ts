/**
 * ENS Service - Name resolution and text record lookup
 *
 * Uses viem's built-in ENS support on Ethereum mainnet
 * (ENS is only on mainnet, but works with any wallet)
 */

import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

// Use mainnet for ENS resolution (ENS is only deployed on mainnet)
const publicClient = createPublicClient({
    chain: mainnet,
    transport: http('https://eth.llamarpc.com'), // Free mainnet RPC
})

export interface ENSProfile {
    name: string | null
    address: string | null
    avatar: string | null
    description: string | null
    preferredStablecoin: string | null
    paymentSchedule: string | null
    taxJurisdiction: string | null
    twitter: string | null
    github: string | null
}

/**
 * Resolve ENS name to address
 */
export async function resolveENSName(name: string): Promise<string | null> {
    try {
        const normalizedName = normalize(name)
        const address = await publicClient.getEnsAddress({
            name: normalizedName,
        })
        return address
    } catch (error) {
        console.warn('ENS resolution failed:', error)
        return null
    }
}

/**
 * Reverse lookup - get ENS name for an address
 */
export async function lookupENSName(address: `0x${string}`): Promise<string | null> {
    try {
        const name = await publicClient.getEnsName({
            address,
        })
        return name
    } catch (error) {
        console.warn('ENS reverse lookup failed:', error)
        return null
    }
}

/**
 * Get ENS avatar URL
 */
export async function getENSAvatar(name: string): Promise<string | null> {
    try {
        const normalizedName = normalize(name)
        const avatar = await publicClient.getEnsAvatar({
            name: normalizedName,
        })
        return avatar
    } catch (error) {
        console.warn('ENS avatar lookup failed:', error)
        return null
    }
}

/**
 * Get a specific ENS text record
 */
export async function getENSText(name: string, key: string): Promise<string | null> {
    try {
        const normalizedName = normalize(name)
        const text = await publicClient.getEnsText({
            name: normalizedName,
            key,
        })
        return text
    } catch (error) {
        console.warn(`ENS text record "${key}" lookup failed:`, error)
        return null
    }
}

/**
 * Get full ENS profile with all relevant records
 */
export async function getENSProfile(nameOrAddress: string): Promise<ENSProfile> {
    let name: string | null = null
    let address: string | null = null

    // Determine if input is name or address
    if (nameOrAddress.startsWith('0x')) {
        address = nameOrAddress
        name = await lookupENSName(nameOrAddress as `0x${string}`)
    } else {
        name = nameOrAddress
        address = await resolveENSName(nameOrAddress)
    }

    if (!name) {
        return {
            name: null,
            address,
            avatar: null,
            description: null,
            preferredStablecoin: null,
            paymentSchedule: null,
            taxJurisdiction: null,
            twitter: null,
            github: null,
        }
    }

    // Fetch all text records in parallel
    const [
        avatar,
        description,
        preferredStablecoin,
        paymentSchedule,
        taxJurisdiction,
        twitter,
        github,
    ] = await Promise.all([
        getENSAvatar(name),
        getENSText(name, 'description'),
        getENSText(name, 'preferred_stablecoin'),
        getENSText(name, 'payment_schedule'),
        getENSText(name, 'tax_jurisdiction'),
        getENSText(name, 'com.twitter'),
        getENSText(name, 'com.github'),
    ])

    return {
        name,
        address,
        avatar,
        description,
        preferredStablecoin: preferredStablecoin || 'USDC',
        paymentSchedule: paymentSchedule || 'per_minute',
        taxJurisdiction,
        twitter,
        github,
    }
}

/**
 * Check if string is a valid ENS name
 */
export function isENSName(input: string): boolean {
    return input.includes('.eth') || input.includes('.xyz') || input.includes('.com')
}

/**
 * Resolve input that could be either ENS name or address
 */
export async function resolveAddressOrENS(input: string): Promise<{
    address: string | null
    ensName: string | null
}> {
    if (input.startsWith('0x') && input.length === 42) {
        // It's an address, try reverse lookup
        const ensName = await lookupENSName(input as `0x${string}`)
        return { address: input, ensName }
    } else if (isENSName(input)) {
        // It's an ENS name, resolve it
        const address = await resolveENSName(input)
        return { address, ensName: address ? input : null }
    }

    return { address: null, ensName: null }
}
