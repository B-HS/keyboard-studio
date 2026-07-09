import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    test: {
        include: ['entities/**/*.test.ts', 'lib/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@app': fileURLToPath(new URL('./app', import.meta.url)),
            '@entities': fileURLToPath(new URL('./entities', import.meta.url)),
            '@features': fileURLToPath(new URL('./features', import.meta.url)),
            '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
            '@ui': fileURLToPath(new URL('./ui', import.meta.url)),
            '@widgets': fileURLToPath(new URL('./widgets', import.meta.url)),
        },
    },
})
