import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.integration.spec.ts', 'src/**/*.e2e-spec.ts'],
      coverage: {
        enabled: false,
      },
    },
  }),
);
