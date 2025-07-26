import { DAEMON_STATES } from './daemon-state.js';
import chalk from 'chalk';

export const VALIDATION_ERRORS = {
  DAEMON_NOT_READY: 'daemon_not_ready',
  WALLET_LOCKED: 'wallet_locked', 
  NO_KEYSTORE: 'no_keystore',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_REQUEST: 'invalid_request',
  RATE_LIMITED: 'rate_limited'
};

export class ValidationError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.context = context;
  }
}

export class ValidationPipeline {
  constructor(stateManager, keystore, permissionManager = null) {
    this.stateManager = stateManager;
    this.keystore = keystore;
    this.permissionManager = permissionManager;
    this.rateLimiter = new Map(); // Simple rate limiting
  }

  async validate(request) {
    const validations = [
      () => this._validateDaemonState(request),
      () => this._validateKeystore(request),
      () => this._validateSession(request),
      () => this._validatePermissions(request),
      () => this._validateRateLimit(request),
      () => this._validateRequest(request)
    ];

    for (const validation of validations) {
      await validation();
    }

    console.log(chalk.green('✅ Request validation passed:'), request.type);
    return true;
  }

  _validateDaemonState(request) {
    const state = this.stateManager.getCurrentState();
    
    // Daemon must be ready for most operations
    if (state === DAEMON_STATES.STARTING) {
      throw new ValidationError(
        VALIDATION_ERRORS.DAEMON_NOT_READY,
        'Daemon is still starting up',
        { currentState: state }
      );
    }

    if (state === DAEMON_STATES.ERROR) {
      throw new ValidationError(
        VALIDATION_ERRORS.DAEMON_NOT_READY,
        'Daemon is in error state',
        { currentState: state }
      );
    }

    // Some operations allowed even when not fully ready
    const alwaysAllowed = ['get_status', 'ping', 'shutdown'];
    if (!alwaysAllowed.includes(request.type) && state === DAEMON_STATES.STARTING) {
      throw new ValidationError(
        VALIDATION_ERRORS.DAEMON_NOT_READY,
        'Daemon not ready for this operation',
        { currentState: state, operation: request.type }
      );
    }
  }

  _validateKeystore(request) {
    // Operations that require keystore to exist
    const keystoreRequired = [
      'unlock_keystore',
      'get_accounts', 
      'sign_transaction',
      'sign_message',
      'eth_accounts',
      'eth_sendTransaction',
      'personal_sign'
    ];

    if (keystoreRequired.includes(request.type)) {
      if (!this.keystore.hasKeystore()) {
        throw new ValidationError(
          VALIDATION_ERRORS.NO_KEYSTORE,
          'No wallet found. Create one first.',
          { operation: request.type }
        );
      }
    }
  }

  _validateSession(request) {
    // Operations that require unlocked wallet
    const unlockRequired = [
      'get_accounts',
      'sign_transaction', 
      'sign_message',
      'eth_accounts',
      'eth_sendTransaction',
      'personal_sign',
      'eth_sign'
    ];

    if (unlockRequired.includes(request.type)) {
      const state = this.stateManager.getCurrentState();
      if (state !== DAEMON_STATES.UNLOCKED) {
        throw new ValidationError(
          VALIDATION_ERRORS.WALLET_LOCKED,
          'Wallet is locked. Unlock first.',
          { currentState: state, operation: request.type }
        );
      }
    }
  }

  _validatePermissions(request) {
    // Skip permission check if no permission manager
    if (!this.permissionManager) {
      return;
    }

    // Browser requests need permission validation
    if (request.origin && request.origin !== 'cli') {
      const hasPermission = this.permissionManager.checkPermission(
        request.origin, 
        request.type
      );

      if (!hasPermission) {
        throw new ValidationError(
          VALIDATION_ERRORS.PERMISSION_DENIED,
          `Origin ${request.origin} not permitted for ${request.type}`,
          { origin: request.origin, operation: request.type }
        );
      }
    }
  }

  _validateRateLimit(request) {
    // Simple rate limiting per origin
    const key = `${request.origin || 'cli'}:${request.type}`;
    const now = Date.now();
    const limit = this._getRateLimit(request.type);
    
    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }

    const requests = this.rateLimiter.get(key);
    
    // Clean old requests (older than 1 minute)
    const filtered = requests.filter(time => now - time < 60000);
    
    if (filtered.length >= limit) {
      throw new ValidationError(
        VALIDATION_ERRORS.RATE_LIMITED,
        `Rate limit exceeded for ${request.type}`,
        { limit, current: filtered.length }
      );
    }

    filtered.push(now);
    this.rateLimiter.set(key, filtered);
  }

  _validateRequest(request) {
    // Basic request structure validation
    if (!request.type) {
      throw new ValidationError(
        VALIDATION_ERRORS.INVALID_REQUEST,
        'Request type is required',
        { request }
      );
    }

    // Validate required fields per request type
    const requiredFields = {
      'unlock_keystore': ['data.password'],
      'sign_transaction': ['data.transaction', 'data.address'],
      'sign_message': ['data.message', 'data.address'],
      'eth_sendTransaction': ['data.transaction']
    };

    const required = requiredFields[request.type];
    if (required) {
      for (const field of required) {
        const value = this._getNestedValue(request, field);
        if (value === undefined || value === null) {
          throw new ValidationError(
            VALIDATION_ERRORS.INVALID_REQUEST,
            `Missing required field: ${field}`,
            { field, requestType: request.type }
          );
        }
      }
    }
  }

  _getRateLimit(requestType) {
    // Rate limits per request type (requests per minute)
    const limits = {
      'sign_transaction': 10,
      'sign_message': 20,
      'unlock_keystore': 5,
      'get_status': 100,
      'get_accounts': 50
    };
    
    return limits[requestType] || 30; // Default limit
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}