jest.setTimeout(10000);

process.env.NODE_ENV = 'test';
process.env.SKIP_KEYCLOAK = 'true';
process.env.MONGODB_URI = 'mongodb://localhost:27017';
process.env.DB_NAME = 'naya_overleaf_test';

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
