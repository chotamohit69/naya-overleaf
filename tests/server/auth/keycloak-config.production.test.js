describe('keycloak-config production session secret hardening', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = 'production';
    delete process.env.SKIP_KEYCLOAK;

    jest.doMock('keycloak-connect', () => {
      return jest.fn().mockImplementation(() => ({
        middleware: () => (req, res, next) => next(),
        protect: () => (req, res, next) => next()
      }));
    });
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  const requireConfigFresh = () => require('../../../src/server/auth/keycloak-config');

  it('rejects production startup when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;
    expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
  });

  it('rejects production startup when SESSION_SECRET is empty', () => {
    process.env.SESSION_SECRET = '';
    expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
  });

  it('rejects production startup when SESSION_SECRET uses insecure default value', () => {
    process.env.SESSION_SECRET = 'naya-overleaf-secret';
    expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
  });

  it('rejects production startup when SESSION_SECRET is too short', () => {
    process.env.SESSION_SECRET = 'strong-session-secret-value';
    expect(() => requireConfigFresh()).toThrow(/32 characters/);
  });

  it('rejects production startup when SKIP_KEYCLOAK is enabled', () => {
    process.env.SESSION_SECRET = 'a'.repeat(48);
    process.env.SKIP_KEYCLOAK = 'true';
    expect(() => requireConfigFresh()).toThrow(/SKIP_KEYCLOAK/);
  });

  it('allows production startup when SESSION_SECRET is valid', () => {
    process.env.SESSION_SECRET = 'a'.repeat(48);
    expect(() => requireConfigFresh()).not.toThrow();
  });
});
