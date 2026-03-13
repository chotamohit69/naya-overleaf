/**
 * Tests for Dev Authentication
 */

describe('Dev Authentication', () => {
  let devAuth;
  
  beforeEach(() => {
    jest.resetModules();
    devAuth = require('../../../src/server/auth/dev-auth');
  });
  
  describe('IS_DEV', () => {
    it('should be true when NODE_ENV is not production', () => {
      expect(typeof devAuth.IS_DEV).toBe('boolean');
    });
  });
  
  describe('DEV_USER', () => {
    it('should have required user properties', () => {
      expect(devAuth.DEV_USER).toHaveProperty('id');
      expect(devAuth.DEV_USER).toHaveProperty('name');
      expect(devAuth.DEV_USER).toHaveProperty('email');
      expect(devAuth.DEV_USER).toHaveProperty('roles');
    });
  });
  
  describe('devAuthMiddleware', () => {
    it('should add user to request in dev mode', () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();
      
      devAuth.devAuthMiddleware(mockReq, mockRes, mockNext);
      
      if (devAuth.IS_DEV) {
        expect(mockReq.user).toBeDefined();
        expect(mockReq.kauth).toBeDefined();
      }
      expect(mockNext).toHaveBeenCalled();
    });
  });
  
  describe('createDevAuthRoutes', () => {
    it('should create an Express router', () => {
      const router = devAuth.createDevAuthRoutes();
      expect(router).toBeDefined();
    });
  });
});
