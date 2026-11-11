import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'], // never the compiled copies in dist/
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://placeholder-overridden-by-tests',
      JWT_ACCESS_SECRET: 'test_access_secret_test_access_secret_1234',
      JWT_REFRESH_SECRET: 'test_refresh_secret_test_refresh_secret_12',
      BCRYPT_SALT_ROUNDS: '4',
      CORS_ORIGINS: 'http://localhost:5173',
      // Keep tests hermetic: never pick up the developer's local server/.env seed credentials.
      SEED_ADMIN_EMAIL: '',
      SEED_ADMIN_PASSWORD: '',
    },
  },
});
