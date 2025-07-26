import { Keystore, Config } from '@daemon-wallet/core';
import { NativeMessaging } from './messaging.js';
import { SessionManager } from './session.js';
import { ApprovalUI } from './approval.js';
import { DaemonIPCServer } from './ipc-server.js';
import { ethers } from 'ethers';

class DaemonWalletService {
  constructor() {
    this.keystore = new Keystore();
    this.config = new Config();
    this.nativeMessaging = new NativeMessaging();
    this.sessionManager = new SessionManager();
    this.approvalUI = new ApprovalUI();
    this.ipcServer = null;
    this.provider = null;
  }

  async start() {
    try {
      // Initialize components
      await this.config.load();
      await this.keystore.init();
      
      // Setup Ethereum provider
      const network = this.config.getDefaultNetwork();
      this.provider = new ethers.JsonRpcProvider(network.rpc);
      
      // Start IPC server for CLI communication
      this.ipcServer = new DaemonIPCServer(
        this.config.getDaemonSocket(),
        this.sessionManager,
        this.keystore,
        this.approvalUI
      );
      
      await this.ipcServer.start();
      
      // Setup native messaging
      this.setupNativeMessaging();
      this.setupSessionManager();
      
      // Show welcome screen
      this.approvalUI.showWelcome();
      
      // Start native messaging
      this.nativeMessaging.connect();
      
      // Graceful shutdown handling
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
    } catch (err) {
      console.error('Failed to start daemon:', err);
      process.exit(1);
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
        await this.handleNativeMessage(message);
      } catch (err) {
        console.error('Message handling error:', err);
        this.nativeMessaging.sendError(message.id, -1, err.message);
      }
    });

    this.nativeMessaging.on('error', (err) => {
      this.approvalUI.showError(err.message);
    });
  }

  setupSessionManager() {
    this.sessionManager.on('locked', () => {
      console.log('\n🔒 Wallet locked due to inactivity');
    });

    this.sessionManager.on('unlocked', (accounts) => {
      console.log(`\n🔓 Wallet unlocked (${accounts.length} accounts)`);
    });
  }

  async handleNativeMessage(message) {
    const { id, method, params = [] } = message;

    switch (method) {
      case 'wallet_status':
        return this.handleWalletStatus(id);

      case 'wallet_unlock':
        return this.handleWalletUnlock(id);

      case 'eth_accounts':
        return this.handleEthAccounts(id);

      case 'eth_requestAccounts':
        return this.handleEthRequestAccounts(id, params);

      case 'eth_sendTransaction':
        return this.handleEthSendTransaction(id, params);

      case 'eth_sign':
        return this.handleEthSign(id, params);

      case 'personal_sign':
        return this.handlePersonalSign(id, params);

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  async handleWalletStatus(id) {
    const status = this.sessionManager.getStatus();
    this.nativeMessaging.sendResponse(id, {
      ...status,
      hasKeystore: !!this.keystore.encryptedData
    });
  }

  async handleWalletUnlock(id) {
    try {
      if (!this.keystore.encryptedData) {
        throw new Error('No wallet found. Create one with the CLI first.');
      }

      const password = await this.approvalUI.promptUnlock();
      const success = await this.keystore.unlock(password);

      if (success) {
        const accounts = this.keystore.getAccounts();
        this.sessionManager.unlock(accounts);
        
        this.nativeMessaging.sendResponse(id, {
          success: true,
          accounts
        });
      } else {
        this.nativeMessaging.sendResponse(id, {
          success: false,
          error: 'Invalid password'
        });
      }
    } catch (err) {
      this.nativeMessaging.sendError(id, -1, err.message);
    }
  }

  async handleEthAccounts(id) {
    try {
      this.sessionManager.requireUnlocked();
      const accounts = this.sessionManager.accounts;
      this.nativeMessaging.sendResponse(id, accounts);
    } catch (err) {
      this.nativeMessaging.sendResponse(id, []);
    }
  }

  async handleEthRequestAccounts(id, params) {
    try {
      // Check if wallet is unlocked
      if (!this.sessionManager.isUnlocked) {
        throw new Error('Wallet is locked. Unlock first.');
      }

      // Get origin from params if available
      const origin = params[0]?.origin || 'Unknown DApp';
      
      // Ask user for permission
      const approved = await this.approvalUI.promptAccountAccess(origin);
      
      if (approved) {
        const accounts = this.sessionManager.accounts;
        this.nativeMessaging.sendResponse(id, accounts);
      } else {
        this.nativeMessaging.sendError(id, 4001, 'User rejected the request');
      }
    } catch (err) {
      this.nativeMessaging.sendError(id, -1, err.message);
    }
  }

  async handleEthSendTransaction(id, params) {
    try {
      this.sessionManager.requireUnlocked();
      
      const txRequest = params[0];
      if (!txRequest) {
        throw new Error('Transaction parameters required');
      }

      // Show approval UI
      const approved = await this.approvalUI.promptTransactionApproval(txRequest);
      
      if (!approved) {
        this.approvalUI.showTransactionResult(false);
        this.nativeMessaging.sendError(id, 4001, 'User rejected the request');
        return;
      }

      // Sign and send transaction
      try {
        const signedTx = await this.keystore.signTransaction(txRequest, txRequest.from);
        const txResponse = await this.provider.broadcastTransaction(signedTx);
        
        this.approvalUI.showTransactionResult(true, txResponse.hash);
        this.nativeMessaging.sendResponse(id, txResponse.hash);
        
      } catch (err) {
        this.approvalUI.showTransactionResult(false, null, err.message);
        throw err;
      }

    } catch (err) {
      this.nativeMessaging.sendError(id, -1, err.message);
    }
  }

  async handleEthSign(id, params) {
    try {
      this.sessionManager.requireUnlocked();
      
      const [address, message] = params;
      if (!address || !message) {
        throw new Error('Address and message required');
      }

      // Show approval UI
      const approved = await this.approvalUI.promptMessageSignature({
        address,
        message
      });
      
      if (!approved) {
        this.nativeMessaging.sendError(id, 4001, 'User rejected the request');
        return;
      }

      // Sign message
      const signature = await this.keystore.signMessage(message, address);
      this.nativeMessaging.sendResponse(id, signature);

    } catch (err) {
      this.nativeMessaging.sendError(id, -1, err.message);
    }
  }

  async handlePersonalSign(id, params) {
    try {
      this.sessionManager.requireUnlocked();
      
      const [message, address] = params;
      if (!address || !message) {
        throw new Error('Address and message required');
      }

      // Show approval UI
      const approved = await this.approvalUI.promptMessageSignature({
        address,
        message
      });
      
      if (!approved) {
        this.nativeMessaging.sendError(id, 4001, 'User rejected the request');
        return;
      }

      // Sign message
      const signature = await this.keystore.signMessage(message, address);
      this.nativeMessaging.sendResponse(id, signature);

    } catch (err) {
      this.nativeMessaging.sendError(id, -1, err.message);
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down daemon...');
    
    try {
      if (this.keystore) {
        this.keystore.lock();
      }
      
      if (this.sessionManager) {
        this.sessionManager.destroy();
      }
      
      if (this.ipcServer) {
        await this.ipcServer.stop();
      }
      
      console.log('✅ Daemon stopped');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }
}

// Start the daemon
const daemon = new DaemonWalletService();
daemon.start().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});