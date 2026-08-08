/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(t|j)sx?$': ['babel-jest', { presets: ['next/babel'] }],
  },
  moduleNameMapper: {
    '^@ellines-eip/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'functions/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThresholds: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
};

module.exports = config;
