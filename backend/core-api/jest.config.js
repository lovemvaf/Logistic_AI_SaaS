module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^shared-types$': '<rootDir>/../../packages/shared-types/src',
    '^wms-engine$': '<rootDir>/../../packages/wms-engine/src',
  },
};
