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
      const accounts = this.keystore.getAccounts();
      
      if (accounts.length === 0) {
        console.log(chalk.yellow('📭 No accounts found'));
        console.log(chalk.blue('💡 Create a wallet with: wallet-cli create'));
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

  async export(address) {
    console.log(chalk.red('⚠️  WARNING: EXPORTING PRIVATE KEY'));
    console.log(chalk.red('    This is extremely dangerous!'));
    console.log(chalk.red('    Only do this if you know what you\'re doing.'));
    console.log();

    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure you want to export the private key?',
          default: false
        }
      ]);

      if (!confirmed) {
        console.log(chalk.blue('👍 Export cancelled'));
        return;
      }

      if (this.keystore.isLocked) {
        const { password } = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter wallet password:',
            mask: '*'
          }
        ]);

        const unlocked = await this.keystore.unlock(password);
        if (!unlocked) {
          console.log(chalk.red('❌ Invalid password'));
          return;
        }
      }

      // TODO: Implement export functionality
      console.log(chalk.yellow('🚧 Export functionality coming soon...'));

    } catch (err) {
      console.log(chalk.red('❌ Error:'), err.message);
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