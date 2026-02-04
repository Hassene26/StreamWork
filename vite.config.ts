import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    envPrefix: ['VITE_', 'APP_'],
    define: {
        global: 'globalThis',
        'process.env': {},
    },
    resolve: {
        alias: {
            buffer: 'buffer',
            stream: 'stream-browserify',
            util: 'util',
            events: 'events',
        },
    },
})
