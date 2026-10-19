import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    clearMocks: true,
    // Bound jsdom workers on developer laptops and Docker Desktop.
    maxWorkers: 1,
  },
}));
