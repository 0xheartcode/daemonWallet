import { DaemonStateManager, DAEMON_STATES, DAEMON_EVENTS } from './core/daemon-state.js';
import { ValidationPipeline, ValidationError } from './core/validation-pipeline.js';
import { EnhancedKeystore, KEYSTORE_EVENTS } from './core/enhanced-keystore.js';
import { SessionManager } from './session.js';
import { DaemonIPCServer } from './ipc-server.js';
import { NativeMessaging } from './messaging.js';
import { ApprovalUI } from './approval.js';
import { Config } from '@daemon-wallet/core';
import { ethers } from 'ethers';
import chalk from 'chalk';

export class EnhancedDaemonService {
  constructor() {
    // Core components
    this.stateManager = new DaemonStateManager();
    this.keystore = new EnhancedKeystore();
    this.sessionManager = new SessionManager({ autoLock: false }); // No auto-lock by default
    this.config = new Config();
    this.validationPipeline = new ValidationPipeline(this.stateManager, this.keystore);
    
    // Services
    this.ipcServer = null;
    this.nativeMessaging = new NativeMessaging();
    this.approvalUI = new ApprovalUI();
    this.provider = null;
    
    // State
    this.startTime = Date.now();
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // State manager events
    this.stateManager.on(DAEMON_EVENTS.STATE_CHANGED, ({ from, to, metadata }) => {
      console.log(chalk.blue('🔄 State:'), chalk.gray(from), '→', this._getStateColor(to));
    });

    this.stateManager.on(DAEMON_EVENTS.ERROR, (error) => {
      console.error(chalk.red('❌ Daemon error:'), error.message);
    });

    // Keystore events
    this.keystore.on(KEYSTORE_EVENTS.LOADED, () => {
      console.log(chalk.green('📦 Keystore loaded'));
      this.stateManager.emit(DAEMON_EVENTS.KEYSTORE_LOADED);
      this._updateStateFromKeystore();
    });

    this.keystore.on(KEYSTORE_EVENTS.CHANGED, (details) => {
      console.log(chalk.yellow('🔄 Keystore changed:'), details);
      this.stateManager.emit(DAEMON_EVENTS.KEYSTORE_CHANGED, details);
      this._updateStateFromKeystore();
    });

    this.keystore.on(KEYSTORE_EVENTS.UNLOCKED, (data) => {
      this.sessionManager.unlock(data.accounts);
      this.stateManager.transition(DAEMON_STATES.UNLOCKED, { 
        accounts: data.accounts,
        unlockTime: Date.now()
      });
    });

    this.keystore.on(KEYSTORE_EVENTS.LOCKED, () => {
      this.sessionManager.lock();
      this.stateManager.transition(DAEMON_STATES.LOCKED);
    });

    this.keystore.on(KEYSTORE_EVENTS.ERROR, (error) => {
      this.stateManager.handleError(error, { component: 'keystore' });
    });

    // Session manager events
    this.sessionManager.on('unlocked', (accounts) => {
      console.log(chalk.green(`🔓 Session unlocked: ${accounts.length} accounts`));
    });

    this.sessionManager.on('locked', () => {
      console.log(chalk.yellow('🔒 Session locked'));
    });
  }

  async start() {
    try {
      console.log(chalk.blue('🚀 Starting Enhanced Daemon Service...'));
      
      this.stateManager.transition(DAEMON_STATES.STARTING, { 
        startTime: this.startTime 
      });

      // Initialize configuration
      await this.config.load();
      console.log(chalk.green('✅ Configuration loaded'));

      // Initialize keystore with auto-reload
      await this.keystore.init();
      console.log(chalk.green('✅ Keystore initialized with auto-reload'));

      // Setup Ethereum provider
      const network = this.config.getDefaultNetwork();
      this.provider = new ethers.JsonRpcProvider(network.rpc);
      console.log(chalk.green('✅ Ethereum provider connected'));

      // Start IPC server
      await this.startIPCServer();
      
      // Determine daemon mode
      await this.setupDaemonMode();

      // Update state based on keystore
      this._updateStateFromKeystore();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log(chalk.green('🎉 Enhanced Daemon Service started successfully!'));

    } catch (error) {
      console.error(chalk.red('❌ Failed to start daemon:'), error.message);
      this.stateManager.handleError(error, { phase: 'startup' });
      throw error;
    }
  }

  async startIPCServer() {
    try {
      const socketPath = this.config.getDaemonSocket();
      console.log(chalk.yellow('🔧 Setting up IPC server at:'), socketPath);
      
      this.ipcServer = new DaemonIPCServer(
        socketPath,
        this.sessionManager,
        this.keystore,
        this.approvalUI
      );

      // Enhanced IPC server with validation pipeline
      this._setupEnhancedIPCHandlers();
      
      await this.ipcServer.start();
      console.log(chalk.green('✅ Enhanced IPC server started'));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to start IPC server:'), error.message);
      throw error;
    }
  }

  _setupEnhancedIPCHandlers() {
    // Override the message handler to use validation pipeline
    const originalHandleMessage = this.ipcServer.handleMessage.bind(this.ipcServer);
    
    this.ipcServer.handleMessage = async (message, socket) => {
      try {
        // Create request object for validation
        const request = {
          id: message.id,
          type: message.type,
          data: message.data,
          origin: 'cli', // IPC requests are from CLI
          timestamp: Date.now()
        };

        // Run through validation pipeline
        await this.validationPipeline.validate(request);
        
        // If validation passes, proceed with original handler
        return await originalHandleMessage(message, socket);
        
      } catch (error) {
        console.error(chalk.red('❌ Request validation failed:'), error.message);
        
        // Send validation error response
        const { IPCMessage, IPC_MESSAGE_TYPES } = await import('@daemon-wallet/core');
        const errorResponse = new IPCMessage(IPC_MESSAGE_TYPES.ERROR, {
          code: error.code || 'VALIDATION_ERROR',
          message: error.message,
          context: error.context || {}
        });
        errorResponse.id = message.id;
        
        this.ipcServer.server.sendToClient(socket, errorResponse);
      }
    };
  }

  async setupDaemonMode() {
    // Check if running in Chrome native messaging mode or background mode
    const isNativeMessaging = !process.stdin.isTTY || process.env.DAEMON_MODE === 'background';
    
    if (process.env.DAEMON_MODE === 'background') {
      // Background daemon mode - minimal output, no native messaging setup
      console.log(chalk.blue('🔧 Running in background mode'));
      console.log(chalk.blue('📡 IPC server:'), this.config.getDaemonSocket());
    } else if (!process.stdin.isTTY) {
      // Chrome native messaging mode
      console.log(chalk.blue('🌐 Running in native messaging mode'));
      this.setupNativeMessaging();
      this.nativeMessaging.connect();
    } else {
      // Development/manual mode
      console.log(chalk.blue('🛠️  Running in development mode'));
      console.log(chalk.blue('📡 IPC server:'), this.config.getDaemonSocket());
      console.log(chalk.gray('Run "wallet-cli daemon status" to test'));
    }
  }

  setupNativeMessaging() {
    this.nativeMessaging.on('connect', () => {
      this.approvalUI.showConnectionStatus(true);
      this.sessionManager.addSession();
    });

    this.nativeMessaging.on('disconnect', () => {
      this.approvalUI.showConnectionStatus(false);
      this.sessionManager.removeSession();
    });

    this.nativeMessaging.on('message', async (message) => {
      try {
        // Create request object for validation
        const request = {
          id: message.id,
          type: message.method,
          data: { params: message.params },
          origin: message.origin || 'unknown',
          timestamp: Date.now()
        };

        // Run through validation pipeline
        await this.validationPipeline.validate(request);
        
        // If validation passes, handle the message
        await this.handleNativeMessage(message);
        
      } catch (error) {
        console.error(chalk.red('❌ Native message validation failed:'), error.message);
        this.nativeMessaging.sendError(message.id, -1, error.message);
      }
    });

    this.nativeMessaging.on('error', (err) => {
      this.approvalUI.showError(err.message);
      this.stateManager.handleError(err, { component: 'native-messaging' });
    });
  }

  async handleNativeMessage(message) {
    // This would contain the existing native message handlers
    // For now, just log that we received it
    console.log(chalk.blue('📨 Native message:'), message.method);
    
    // TODO: Implement native message handlers with validation
    this.nativeMessaging.sendResponse(message.id, { 
      success: true, 
      message: 'Enhanced daemon received message' 
    });
  }

  _updateStateFromKeystore() {
    if (!this.keystore.hasKeystore()) {
      this.stateManager.transition(DAEMON_STATES.READY, { 
        hasKeystore: false 
      });
    } else if (this.keystore.isLocked) {
      this.stateManager.transition(DAEMON_STATES.LOCKED, { 
        hasKeystore: true 
      });
    } else {
      this.stateManager.transition(DAEMON_STATES.UNLOCKED, { 
        hasKeystore: true,
        accounts: this.keystore.getAccounts()
      });
    }
  }

  getStatus() {
    const daemonStatus = this.stateManager.getStatus();
    const sessionStatus = this.sessionManager.getStatus();
    
    return {
      ...daemonStatus,
      ...sessionStatus,
      hasKeystore: this.keystore.hasKeystore(),
      keystoreCount: 0, // Will be filled by IPC handler
      uptime: Date.now() - this.startTime,
      version: '0.2.0-enhanced'
    };
  }

  setupGracefulShutdown() {
    const shutdown = async () => {
      console.log(chalk.yellow('\n🛑 Shutting down Enhanced Daemon Service...'));
      
      try {
        // Lock wallet
        if (!this.keystore.isLocked) {
          this.keystore.lock();
        }
        
        // Destroy components
        if (this.sessionManager) {
          this.sessionManager.destroy();
        }
        
        if (this.keystore) {
          await this.keystore.destroy();
        }
        
        if (this.ipcServer) {
          await this.ipcServer.stop();
        }
        
        console.log(chalk.green('✅ Enhanced Daemon shutdown complete'));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('❌ Error during shutdown:'), error.message);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
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