import type { Config } from 'jest';

const config: Config = {
  displayName: '@ellines-eip/web',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/functions', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  // Exclude API endpoint files named test.ts from test runs (they're not test files)
  testPathIgnorePatterns: ['/node_modules/', '/\\.next/', '/out/', '/functions/api/.*/test\\.ts$'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@ellines-eip/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@ellines-eip/ellinea-ai$': '<rootDir>/../../packages/ellinea-ai/src/index.ts',
  },
  collectCoverageFrom: [
    'functions/**/*.ts',
    '!functions/**/*.d.ts',
    '!functions/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};

export default config;
