import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class WalletCommands {
  constructor(keystore, config) {
    this.keystore = keystore;
    this.config = config;
  }

  async create() {
    console.log(chalk.blue('🔐 Creating new wallet...'));
    console.log();

    try {
      // Check if keystore already exists
      await this.keystore.init();
      if (this.keystore.hasKeystore()) {
        console.log(chalk.red('❌ A wallet already exists!'));
        console.log(chalk.yellow('💡 Only one wallet is allowed at a time'));
        console.log(chalk.blue('   To replace it: make delete-wallet && make create-wallet'));
        console.log(chalk.blue('   To import different: make delete-wallet && make import-wallet'));
        return;
      }

      // Get password
      const { password, confirmPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter wallet password:',
          mask: '*',
          validate: (input) => {
            if (input.length < 8) {
              return 'Password must be at least 8 characters';
            }
            return true;
          }
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          mask: '*'
        }
      ]);

      if (password !== confirmPassword) {
        console.log(chalk.red('❌ Passwords do not match'));
        return;
      }

      const spinner = ora('Creating wallet...').start();

      try {
        const result = await this.keystore.createWallet(password);
        spinner.succeed('Wallet created successfully!');
        
        console.log();
        console.log(chalk.green('✅ Wallet created successfully!'));
        console.log(chalk.blue('📄 Address:'), result.address);
        console.log();
        console.log(chalk.yellow('⚠️  IMPORTANT: Write down your recovery phrase!'));
        console.log(chalk.yellow('   Keep it safe and never share it with anyone.'));
        console.log();
        console.log(chalk.cyan('🔑 Recovery phrase:'));
        console.log(chalk.bold(result.mnemonic));
        console.log();
        console.log(chalk.gray('Press any key to continue...'));
        
        await this._waitForKeypress();
        console.clear();
        
        console.log(chalk.green('✅ Wallet setup complete!'));
        console.log(chalk.blue('📋 Next steps:'));
        console.log('   1. Start the daemon: wallet-cli daemon start');
        console.log('   2. Install the browser extension');
        console.log('   3. Connect to DApps!');
        
      } catch (err) {
        spinner.fail('Failed to create wallet');
        throw err;
      }

    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async import() {
    console.log(chalk.blue('📥 Import existing wallet...'));
    console.log();

    try {
      // Check if keystore already exists
      await this.keystore.init();
      if (this.keystore.hasKeystore()) {
        console.log(chalk.red('❌ A wallet already exists!'));
        console.log(chalk.yellow('💡 Only one wallet is allowed at a time'));
        console.log(chalk.blue('   To replace it: make delete-wallet && make import-wallet'));
        return;
      }

      const { secretType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'secretType',
          message: 'What do you want to import?',
          choices: [
            { name: 'Mnemonic phrase (12/24 words)', value: 'mnemonic' },
            { name: 'Private key (0x...)', value: 'privatekey' }
          ]
        }
      ]);

      const { secret } = await inquirer.prompt([
        {
          type: secretType === 'mnemonic' ? 'input' : 'password',
          name: 'secret',
          message: secretType === 'mnemonic' 
            ? 'Enter your mnemonic phrase:' 
            : 'Enter your private key:',
          validate: (input) => {
            if (secretType === 'mnemonic') {
              const words = input.trim().split(/\s+/);
              if (words.length < 12) {
                return 'Mnemonic must be at least 12 words';
              }
            } else {
              if (!input.startsWith('0x') || input.length !== 66) {
                return 'Private key must start with 0x and be 64 characters long';
              }
            }
            return true;
          }
        }
      ]);

      const { password, confirmPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Set wallet password:',
          mask: '*',
          validate: (input) => {
            if (input.length < 8) {
              return 'Password must be at least 8 characters';
            }
            return true;
          }
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          mask: '*'
        }
      ]);

      if (password !== confirmPassword) {
        console.log(chalk.red('❌ Passwords do not match'));
        return;
      }

      const spinner = ora('Importing wallet...').start();

      try {
        const result = await this.keystore.importWallet(secret, password);
        spinner.succeed('Wallet imported successfully!');
        
        console.log();
        console.log(chalk.green('✅ Wallet imported successfully!'));
        console.log(chalk.blue('📄 Address:'), result.address);
        console.log();
        console.log(chalk.blue('📋 Next steps:'));
        console.log('   1. Start the daemon: wallet-cli daemon start');
        console.log('   2. Install the browser extension');
        console.log('   3. Connect to DApps!');
        
      } catch (err) {
        spinner.fail('Failed to import wallet');
        throw err;
      }

    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async list() {
    try {
      // Try to get status from daemon first
      try {
        const { IPCClient } = await import('@daemon-wallet/core');
        const ipcClient = new IPCClient(this.config.getDaemonSocket());
        
        // Add error handler to prevent unhandled errors
        ipcClient.on('error', () => {
          // Silently handle to prevent unhandled error events
        });
        
        await ipcClient.connect();
        const status = await ipcClient.requestStatus();
        ipcClient.disconnect();
        
        if (status.accounts && status.accounts.length > 0) {
          console.log(chalk.blue('📋 Wallet Accounts:'));
          console.log();
          
          status.accounts.forEach((address, index) => {
            console.log(chalk.green(`${index + 1}.`), chalk.bold(address));
          });

          console.log();
          console.log(chalk.gray(`Total: ${status.accounts.length} account(s)`));
          
          if (status.locked) {
            console.log(chalk.yellow('🔒 Wallet is locked'));
            console.log(chalk.blue('💡 Unlock with: wallet-cli daemon unlock'));
          } else {
            console.log(chalk.green('🔓 Wallet is unlocked'));
          }
          return;
        }
        
        // If daemon shows no accounts but has keystore, it's locked
        if (status.hasKeystore) {
          console.log(chalk.yellow('🔒 Wallet is locked'));
          console.log(chalk.blue('💡 Unlock with: wallet-cli daemon unlock'));
          console.log(chalk.gray('Or check keystore files at: ~/.daemon-wallet/keystore/'));
          return;
        }
        
      } catch (daemonErr) {
        // Daemon not running, fall back to direct keystore access
        console.log(chalk.yellow('⚠️  Daemon not running, checking keystore directly...'));
      }
      
      // Fallback: Direct keystore access
      const accounts = this.keystore.getAccounts();
      
      if (accounts.length === 0) {
        if (this.keystore.hasKeystore()) {
          console.log(chalk.yellow('🔒 Wallet is locked'));
          console.log(chalk.blue('💡 Start daemon and unlock: wallet-cli daemon start'));
          console.log(chalk.gray('Or check keystore files at: ~/.daemon-wallet/keystore/'));
        } else {
          console.log(chalk.yellow('📭 No accounts found'));
          console.log(chalk.blue('💡 Create a wallet with: wallet-cli create'));
        }
        return;
      }

      console.log(chalk.blue('📋 Wallet Accounts:'));
      console.log();
      
      accounts.forEach((address, index) => {
        console.log(chalk.green(`${index + 1}.`), chalk.bold(address));
      });

      console.log();
      console.log(chalk.gray(`Total: ${accounts.length} account(s)`));
      
      if (this.keystore.isLocked) {
        console.log(chalk.yellow('🔒 Wallet is locked'));
        console.log(chalk.blue('💡 Unlock with: wallet-cli daemon unlock'));
      } else {
        console.log(chalk.green('🔓 Wallet is unlocked'));
      }

    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async createAccount() {
    console.log(chalk.blue('➕ Creating additional account...'));
    console.log();

    try {
      // Check if daemon is running and get status through daemon
      try {
        const { IPCClient } = await import('@daemon-wallet/core');
        const ipcClient = new IPCClient(this.config.getDaemonSocket());
        
        // Add error handler to prevent unhandled errors
        ipcClient.on('error', () => {
          // Silently handle to prevent unhandled error events
        });
        
        await ipcClient.connect();
        const status = await ipcClient.requestStatus();
        
        if (status.locked) {
          console.log(chalk.red('❌ Wallet is locked'));
          console.log(chalk.yellow('💡 Unlock first: make unlock-wallet'));
          ipcClient.disconnect();
          return;
        }
        
        if (!status.hasKeystore) {
          console.log(chalk.red('❌ No wallet found'));
          console.log(chalk.yellow('💡 Create a wallet first: make create-wallet'));
          ipcClient.disconnect();
          return;
        }
        
        ipcClient.disconnect();
        
      } catch (daemonErr) {
        console.log(chalk.red('❌ Daemon not running or not responding'));
        console.log(chalk.yellow('💡 Start daemon: make start-daemon'));
        return;
      }

      // Get password to unlock keystore
      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter wallet password to create new account:',
          mask: '*'
        }
      ]);

      // Load and unlock keystore
      await this.keystore.init();
      const unlocked = await this.keystore.unlock(password);
      
      if (!unlocked) {
        console.log(chalk.red('❌ Invalid password'));
        return;
      }

      // Create new account
      const spinner = ora('Creating new account...').start();
      
      try {
        const newAccount = await this.keystore.createNextAccount(password);
        spinner.succeed('Account created successfully!');
        
        console.log();
        console.log(chalk.green('✅ New account created!'));
        console.log(chalk.blue('📄 Address:'), newAccount.address);
        console.log(chalk.blue('🏷️  Label:'), newAccount.label);
        console.log(chalk.blue('🔢 Index:'), newAccount.index);
        console.log();
        console.log(chalk.yellow('💡 The daemon will automatically reload the updated keystore'));
        
      } catch (err) {
        spinner.fail('Failed to create account');
        throw err;
      }

      // Lock keystore after creation
      this.keystore.lock();

    } catch (err) {
      console.log(chalk.red('❌ Account creation failed:'), err.message);
    }
  }

  async exportAll() {
    console.log(chalk.red('⚠️  WARNING: EXPORTING ALL WALLET DATA'));
    console.log(chalk.red('    This will show your mnemonic phrase and ALL private keys!'));
    console.log(chalk.red('    This is extremely dangerous!'));
    console.log();

    try {
      // Check if daemon is running and get status through daemon
      try {
        const { IPCClient } = await import('@daemon-wallet/core');
        const ipcClient = new IPCClient(this.config.getDaemonSocket());
        
        // Add error handler to prevent unhandled errors
        ipcClient.on('error', () => {
          // Silently handle to prevent unhandled error events
        });
        
        await ipcClient.connect();
        const status = await ipcClient.requestStatus();
        
        if (status.locked) {
          console.log(chalk.red('❌ Wallet is locked'));
          console.log(chalk.yellow('💡 Unlock first: make unlock-wallet'));
          ipcClient.disconnect();
          return;
        }
        
        if (!status.hasKeystore) {
          console.log(chalk.red('❌ No wallet found'));
          console.log(chalk.yellow('💡 Create a wallet first: make create-wallet'));
          ipcClient.disconnect();
          return;
        }
        
        ipcClient.disconnect();
        
      } catch (daemonErr) {
        console.log(chalk.red('❌ Daemon not running or not responding'));
        console.log(chalk.yellow('💡 Start daemon: make start-daemon'));
        return;
      }

      // Get password to decrypt keystore directly
      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter wallet password to export all data:',
          mask: '*'
        }
      ]);

      // Load and decrypt keystore directly
      await this.keystore.init();
      const unlocked = await this.keystore.unlock(password);
      
      if (!unlocked) {
        console.log(chalk.red('❌ Invalid password'));
        return;
      }

      console.log();
      console.log(chalk.yellow('📊 WALLET EXPORT DATA'));
      console.log(chalk.yellow('=' .repeat(50)));
      
      // Export mnemonic if available
      if (this.keystore.walletData?.mnemonic) {
        console.log();
        console.log(chalk.cyan('🔑 MNEMONIC PHRASE:'));
        console.log(chalk.bold(this.keystore.walletData.mnemonic));
      }
      
      // Export all accounts
      const accountDetails = this.keystore.getAllAccountDetails(true); // Include hidden
      
      console.log();
      console.log(chalk.cyan(`👥 ACCOUNTS (${accountDetails.length} total):`));
      
      for (const account of accountDetails) {
        console.log();
        console.log(chalk.blue(`Account ${account.index + 1}:`), chalk.bold(account.label));
        console.log(chalk.gray('  Address:     '), account.address);
        console.log(chalk.gray('  Path:        '), account.path);
        console.log(chalk.gray('  Visible:     '), account.visible ? chalk.green('Yes') : chalk.red('No'));
        
        // Get private key
        const wallet = this.keystore.wallets.get(account.address.toLowerCase());
        if (wallet) {
          console.log(chalk.gray('  Private Key: '), chalk.red(wallet.privateKey));
        }
      }
      
      console.log();
      console.log(chalk.yellow('=' .repeat(50)));
      console.log(chalk.red('⚠️  Keep this information secure and never share it!'));
      
      // Lock keystore after export
      this.keystore.lock();

    } catch (err) {
      console.log(chalk.red('❌ Export failed:'), err.message);
    }
  }

  async delete() {
    console.log(chalk.red('⚠️  WARNING: DELETE WALLET'));
    console.log(chalk.red('    This will permanently delete your wallet!'));
    console.log(chalk.red('    Make sure you have backed up your recovery phrase.'));
    console.log();

    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you absolutely sure you want to delete this wallet?',
          default: false
        }
      ]);

      if (!confirmed) {
        console.log(chalk.blue('👍 Deletion cancelled'));
        return;
      }

      const { doubleConfirm } = await inquirer.prompt([
        {
          type: 'input',
          name: 'doubleConfirm',
          message: 'Type "DELETE" to confirm:',
          validate: (input) => {
            return input === 'DELETE' ? true : 'You must type "DELETE" exactly';
          }
        }
      ]);

      const spinner = ora('Deleting wallet...').start();

      try {
        await this.keystore.deleteKeystore();
        spinner.succeed('Wallet deleted');
        
        console.log();
        console.log(chalk.green('✅ Wallet deleted successfully'));
        
      } catch (err) {
        spinner.fail('Failed to delete wallet');
        throw err;
      }

    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
    }
  }

  async _waitForKeypress() {
    return new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    });
  }
}