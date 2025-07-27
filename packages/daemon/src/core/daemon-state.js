import { EventEmitter } from 'node:events';
import chalk from 'chalk';

export const DAEMON_STATES = {
  STARTING: 'starting',
  READY: 'ready',
  LOCKED: 'locked', 
  UNLOCKED: 'unlocked',
  ERROR: 'error'
};

export const DAEMON_EVENTS = {
  STATE_CHANGED: 'state_changed',
  KEYSTORE_LOADED: 'keystore_loaded',
  KEYSTORE_CHANGED: 'keystore_changed',
  WALLET_UNLOCKED: 'wallet_unlocked',
  WALLET_LOCKED: 'wallet_locked',
  ERROR: 'error',
  READY: 'ready'
};

export class DaemonStateManager extends EventEmitter {
  constructor() {
    super();
    this.currentState = DAEMON_STATES.STARTING;
    this.previousState = null;
    this.stateHistory = [];
    this.errorCount = 0;
    this.maxErrors = 5;
    this.metadata = {};
  }

  getCurrentState() {
    return this.currentState;
  }

  getPreviousState() {
    return this.previousState;
  }

  getMetadata() {
    return { ...this.metadata };
  }

  isState(state) {
    return this.currentState === state;
  }

  canTransitionTo(newState) {
    const validTransitions = {
      [DAEMON_STATES.STARTING]: [DAEMON_STATES.READY, DAEMON_STATES.ERROR],
      [DAEMON_STATES.READY]: [DAEMON_STATES.LOCKED, DAEMON_STATES.ERROR],
      [DAEMON_STATES.LOCKED]: [DAEMON_STATES.UNLOCKED, DAEMON_STATES.ERROR, DAEMON_STATES.READY],
      [DAEMON_STATES.UNLOCKED]: [DAEMON_STATES.LOCKED, DAEMON_STATES.ERROR, DAEMON_STATES.READY],
      [DAEMON_STATES.ERROR]: [DAEMON_STATES.STARTING, DAEMON_STATES.READY]
    };

    return validTransitions[this.currentState]?.includes(newState) || false;
  }

  transition(newState, metadata = {}) {
    if (!this.canTransitionTo(newState)) {
      const error = new Error(`Invalid state transition from ${this.currentState} to ${newState}`);
      console.error(chalk.red('❌ State transition error:'), error.message);
      this.emit(DAEMON_EVENTS.ERROR, error);
      return false;
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.metadata = { ...metadata, timestamp: Date.now() };
    
    // Track state history (keep last 10)
    this.stateHistory.push({
      from: this.previousState,
      to: this.currentState,
      timestamp: Date.now(),
      metadata
    });
    if (this.stateHistory.length > 10) {
      this.stateHistory.shift();
    }

    // Reset error count on successful transitions
    if (newState !== DAEMON_STATES.ERROR) {
      this.errorCount = 0;
    }

    console.log(chalk.blue('🔄 State transition:'), 
      chalk.gray(this.previousState), '→', 
      this._getStateColor(this.currentState)
    );

    // Emit events
    this.emit(DAEMON_EVENTS.STATE_CHANGED, {
      from: this.previousState,
      to: this.currentState,
      metadata: this.metadata
    });

    // Emit specific state events
    switch (newState) {
      case DAEMON_STATES.READY:
        this.emit(DAEMON_EVENTS.READY);
        break;
      case DAEMON_STATES.UNLOCKED:
        this.emit(DAEMON_EVENTS.WALLET_UNLOCKED, metadata);
        break;
      case DAEMON_STATES.LOCKED:
        this.emit(DAEMON_EVENTS.WALLET_LOCKED, metadata);
        break;
      case DAEMON_STATES.ERROR:
        this.errorCount++;
        this.emit(DAEMON_EVENTS.ERROR, metadata.error);
        break;
    }

    return true;
  }

  handleError(error, context = {}) {
    console.error(chalk.red('❌ Daemon error:'), error.message);
    
    // Circuit breaker: too many errors
    if (this.errorCount >= this.maxErrors) {
      console.error(chalk.red('🚨 Circuit breaker: Too many errors, daemon needs restart'));
      this.transition(DAEMON_STATES.ERROR, { 
        error, 
        context, 
        circuitBreakerTripped: true 
      });
      return;
    }

    this.transition(DAEMON_STATES.ERROR, { error, context });
  }

  getStatus() {
    return {
      state: this.currentState,
      previousState: this.previousState,
      metadata: this.metadata,
      errorCount: this.errorCount,
      uptime: this.metadata.startTime ? Date.now() - this.metadata.startTime : 0,
      locked: this.currentState === DAEMON_STATES.LOCKED,
      ready: [DAEMON_STATES.READY, DAEMON_STATES.LOCKED, DAEMON_STATES.UNLOCKED].includes(this.currentState)
    };
  }

  _getStateColor(state) {
    const colors = {
      [DAEMON_STATES.STARTING]: chalk.yellow(state),
      [DAEMON_STATES.READY]: chalk.blue(state),
      [DAEMON_STATES.LOCKED]: chalk.red(state),
      [DAEMON_STATES.UNLOCKED]: chalk.green(state),
      [DAEMON_STATES.ERROR]: chalk.bgRed.white(state)
    };
    return colors[state] || chalk.gray(state);
  }
}