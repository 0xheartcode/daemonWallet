import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DaemonCommands {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
  }

  async checkDaemonAndWallet(requireUnlocked = false) {
    // Add error handler to prevent unhandled errors
    this.ipcClient.on('error', () => {
      // Silently handle to prevent unhandled error events
    });

    try {
      await this.ipcClient.connect();
      const status = await this.ipcClient.requestStatus();
      
      // Check if keystore exists
      if (!status.hasKeystore && status.keystoreCount === 0) {
        return {
          success: false,
          error: 'no_keystore',
          message: 'No wallet found. Create one first: wallet-cli create'
        };
      }

      // Check if unlock is required
      if (requireUnlocked && status.locked) {
        return {
          success: false,
          error: 'locked',
          message: 'Wallet is locked. Unlock first: wallet-cli daemon unlock'
        };
      }

      return { success: true, status };
    } catch (err) {
      return {
        success: false,
        error: 'daemon_not_running',
        message: 'Daemon is not running. Start it: wallet-cli daemon start'
      };
    }
  }

  async status() {
    try {
      console.log(chalk.blue('📊 Checking daemon status...'));
      
      const spinner = ora('Connecting to daemon...').start();
      
      // Add error handler to prevent unhandled errors
      this.ipcClient.on('error', () => {
        // Silently handle to prevent unhandled error events
      });
      
      try {
        await this.ipcClient.connect();
        const status = await this.ipcClient.requestStatus();
        
        spinner.succeed('Connected to daemon');
        
        console.log();
        console.log(chalk.green('✅ Daemon is running'));
        console.log(chalk.blue('🔐 Locked:'), status.locked ? chalk.red('Yes') : chalk.green('No'));
        console.log(chalk.blue('👥 Accounts:'), status.accounts?.length || 0);
        console.log(chalk.blue('🔗 Active sessions:'), status.activeSessions || 0);
        console.log(chalk.blue('🗄️  Keystores on disk:'), status.keystoreCount || 0);
        
        this.ipcClient.disconnect();
        
      } catch (err) {
        spinner.fail('Daemon not running');
        console.log();
        console.log(chalk.red('❌ Daemon is not running'));
        console.log(chalk.yellow('💡 Start the daemon with: wallet-cli daemon start'));
      }
      
    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async unlock() {
    try {
      console.log(chalk.blue('🔓 Unlocking wallet...'));
      
      const spinner = ora('Connecting to daemon...').start();
      
      // Add error handler to prevent unhandled errors
      this.ipcClient.on('error', () => {
        // Silently handle to prevent unhandled error events
      });
      
      try {
        await this.ipcClient.connect();
        spinner.succeed('Connected to daemon');
        
        const { password } = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter wallet password:',
            mask: '*'
          }
        ]);

        const unlockSpinner = ora('Unlocking wallet...').start();
        
        try {
          const result = await this.ipcClient.requestUnlock(password);
          
          if (result.success) {
            unlockSpinner.succeed('Wallet unlocked');
            console.log();
            console.log(chalk.green('✅ Wallet unlocked successfully!'));
            console.log(chalk.blue('👥 Accounts available:'), result.accounts?.length || 0);
          } else {
            unlockSpinner.fail('Unlock failed');
            console.log();
            console.log(chalk.red('❌ Error:'), result.error || 'Unknown error');
            if (result.error?.includes('No keystore found')) {
              console.log(chalk.blue('💡 Create a wallet first: wallet-cli create'));
            }
          }
          
        } catch (err) {
          unlockSpinner.fail('Failed to unlock');
          throw err;
        }
        
        this.ipcClient.disconnect();
        
      } catch (err) {
        spinner.fail('Daemon not running');
        console.log();
        console.log(chalk.red('❌ Daemon is not running'));
        console.log(chalk.yellow('💡 Start the daemon with: wallet-cli daemon start'));
      }
      
    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async lock() {
    try {
      console.log(chalk.blue('🔒 Locking wallet...'));
      
      const spinner = ora('Connecting to daemon...').start();
      
      // Add error handler to prevent unhandled errors
      this.ipcClient.on('error', () => {
        // Silently handle to prevent unhandled error events
      });
      
      try {
        await this.ipcClient.connect();
        spinner.succeed('Connected to daemon');
        
        await this.ipcClient.requestLock();
        
        console.log();
        console.log(chalk.green('✅ Wallet locked successfully'));
        
        this.ipcClient.disconnect();
        
      } catch (err) {
        spinner.fail('Daemon not running');
        console.log();
        console.log(chalk.red('❌ Daemon is not running'));
        console.log(chalk.yellow('💡 Start the daemon with: wallet-cli daemon start'));
      }
      
    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async start() {
    try {
      console.log(chalk.blue('🚀 Starting daemon...'));
      
      // Check if daemon is already running
      try {
        await this.ipcClient.connect();
        this.ipcClient.disconnect();
        console.log(chalk.yellow('⚠️  Daemon is already running'));
        console.log(chalk.blue('💡 Check status with: wallet-cli daemon status'));
        return;
      } catch (err) {
        // Daemon not running, continue with start
      }

      const daemonPath = path.resolve(__dirname, '../../../daemon/bin/daemon-wallet-service');
      
      console.log(chalk.blue('📂 Daemon path:'), daemonPath);
      console.log(chalk.blue('🔄 Starting daemon process...'));
      
      const logFile = path.join(process.env.HOME, '.daemon-wallet', 'daemon.log');
      const scriptPath = path.resolve(__dirname, '../../../scripts/start-daemon-bg.sh');
      
      // Ensure log directory exists
      await fs.mkdir(path.dirname(logFile), { recursive: true });
      
      // Use background script for proper detachment
      const daemon = spawn('bash', [scriptPath, daemonPath, logFile], {
        detached: true,
        stdio: 'ignore'
      });
      
      daemon.unref();
      
      // Wait a moment for daemon to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log();
      console.log(chalk.green('✅ Daemon started successfully!'));
      console.log(chalk.blue('📋 Next steps:'));
      console.log('   1. Check status: wallet-cli daemon status');
      console.log('   2. Unlock wallet: wallet-cli daemon unlock');
      console.log('   3. Install browser extension');
      
    } catch (err) {
      console.log(chalk.red('❌ Error starting daemon:'), err.message);
    }
  }

  async stop() {
    try {
      console.log(chalk.blue('🛑 Stopping daemon...'));
      
      const spinner = ora('Connecting to daemon...').start();
      
      // Add error handler to prevent unhandled errors
      this.ipcClient.on('error', () => {
        // Silently handle to prevent unhandled error events
      });
      
      try {
        await this.ipcClient.connect();
        spinner.succeed('Connected to daemon');
        
        await this.ipcClient.requestShutdown();
        
        console.log();
        console.log(chalk.green('✅ Daemon shutdown requested'));
        
        this.ipcClient.disconnect();
        
      } catch (err) {
        spinner.fail('Daemon not running');
        console.log();
        console.log(chalk.blue('💡 Daemon was not running'));
      }
      
    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }
}