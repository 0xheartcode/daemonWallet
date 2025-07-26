import { EventEmitter } from 'node:events';

export class SessionManager extends EventEmitter {
  constructor(unlockTimeout = 900000) { // 15 minutes default
    super();
    this.unlockTimeout = unlockTimeout;
    this.isUnlocked = false;
    this.activeSessions = 0;
    this.unlockTimer = null;
    this.accounts = [];
  }

  unlock(accounts) {
    this.isUnlocked = true;
    this.accounts = accounts;
    this.resetUnlockTimer();
    this.emit('unlocked', accounts);
  }

  lock() {
    this.isUnlocked = false;
    this.accounts = [];
    this.clearUnlockTimer();
    this.emit('locked');
  }

  addSession() {
    this.activeSessions++;
    this.resetUnlockTimer();
    this.emit('session-added');
  }

  removeSession() {
    if (this.activeSessions > 0) {
      this.activeSessions--;
    }
    
    if (this.activeSessions === 0) {
      // No active sessions, start shorter timeout
      this.resetUnlockTimer(60000); // 1 minute when idle
    }
    
    this.emit('session-removed');
  }

  getStatus() {
    return {
      locked: !this.isUnlocked,
      accounts: this.accounts,
      activeSessions: this.activeSessions,
      timeoutRemaining: this.unlockTimer ? this.unlockTimeout : 0
    };
  }

  resetUnlockTimer(timeout = null) {
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