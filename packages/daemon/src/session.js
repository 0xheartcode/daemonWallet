import { EventEmitter } from 'node:events';

export class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.autoLockEnabled = options.autoLock || false;
    this.unlockTimeout = options.unlockTimeout || 900000; // 15 minutes default
    this.isUnlocked = false;
    this.activeSessions = 0;
    this.unlockTimer = null;
    this.accounts = [];
    this.unlockTime = null;
  }

  unlock(accounts) {
    this.isUnlocked = true;
    this.accounts = accounts;
    this.unlockTime = Date.now();
    
    // Only start auto-lock timer if enabled
    if (this.autoLockEnabled) {
      this.resetUnlockTimer();
    }
    
    this.emit('unlocked', accounts);
  }

  lock() {
    this.isUnlocked = false;
    this.accounts = [];
    this.unlockTime = null;
    this.clearUnlockTimer();
    this.emit('locked');
  }

  addSession() {
    this.activeSessions++;
    
    // Only reset timer if auto-lock is enabled
    if (this.autoLockEnabled) {
      this.resetUnlockTimer();
    }
    
    this.emit('session-added');
  }

  removeSession() {
    if (this.activeSessions > 0) {
      this.activeSessions--;
    }
    
    // Only handle timeout if auto-lock is enabled
    if (this.autoLockEnabled && this.activeSessions === 0) {
      // No active sessions, start shorter timeout
      this.resetUnlockTimer(60000); // 1 minute when idle
    }
    
    this.emit('session-removed');
  }

  enableAutoLock(timeout = null) {
    this.autoLockEnabled = true;
    if (timeout) {
      this.unlockTimeout = timeout;
    }
    
    // Start timer if currently unlocked
    if (this.isUnlocked) {
      this.resetUnlockTimer();
    }
  }

  disableAutoLock() {
    this.autoLockEnabled = false;
    this.clearUnlockTimer();
  }

  getStatus() {
    return {
      locked: !this.isUnlocked,
      accounts: this.accounts,
      activeSessions: this.activeSessions,
      autoLockEnabled: this.autoLockEnabled,
      unlockTime: this.unlockTime,
      timeoutRemaining: this.unlockTimer && this.autoLockEnabled ? this.unlockTimeout : 0
    };
  }

  resetUnlockTimer(timeout = null) {
    if (!this.autoLockEnabled) {
      return;
    }
    
    this.clearUnlockTimer();
    
    const timeoutMs = timeout || this.unlockTimeout;
    
    this.unlockTimer = setTimeout(() => {
      this.lock();
    }, timeoutMs);
  }

  clearUnlockTimer() {
    if (this.unlockTimer) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
  }

  requireUnlocked() {
    if (!this.isUnlocked) {
      throw new Error('Wallet is locked');
    }
  }

  destroy() {
    this.clearUnlockTimer();
    this.removeAllListeners();
  }
}