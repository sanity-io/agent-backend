import { defineConfig } from 'vitest/config';
import path from 'path';

// Get the absolute path to the project root
const projectRoot = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['./test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['./src/**/*.ts'],
      exclude: [
        './src/**/*.d.ts', 
        '**/node_modules/**', 
        './src/startServer.js'
      ],
      all: true,
      reportsDirectory: './coverage'
    },
    testTimeout: 10000,
    root: projectRoot,
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
}); 