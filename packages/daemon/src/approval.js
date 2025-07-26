import inquirer from 'inquirer';
import chalk from 'chalk';
import { ethers } from 'ethers';

export class ApprovalUI {
  constructor() {
    this.currentRequest = null;
  }

  async promptUnlock() {
    console.clear();
    console.log(chalk.blue('🔓 Wallet Unlock Request'));
    console.log(chalk.gray('Chrome extension is requesting to unlock the wallet'));
    console.log('─'.repeat(50));
    
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter wallet password:',
        mask: '*'
      }
    ]);

    return password;
  }

  async promptTransactionApproval(txRequest) {
    console.clear();
    console.log(chalk.yellow('⚠️  Transaction Approval Request'));
    console.log('─'.repeat(50));
    
    try {
      console.log(chalk.blue('From:     '), txRequest.from || 'Unknown');
      console.log(chalk.blue('To:       '), txRequest.to || 'Contract Creation');
      
      if (txRequest.value) {
        const valueEth = ethers.formatEther(txRequest.value);
        console.log(chalk.blue('Value:    '), `${valueEth} ETH`);
      }
      
      if (txRequest.gas) {
        console.log(chalk.blue('Gas Limit:'), txRequest.gas.toString());
      }
      
      if (txRequest.gasPrice) {
        const gasPriceGwei = ethers.formatUnits(txRequest.gasPrice, 'gwei');
        console.log(chalk.blue('Gas Price:'), `${gasPriceGwei} Gwei`);
      }
      
      if (txRequest.data && txRequest.data !== '0x') {
        console.log(chalk.blue('Data:     '), `${txRequest.data.slice(0, 42)}...`);
      }
      
    } catch (err) {
      console.log(chalk.red('⚠️ Error parsing transaction details'));
      console.log('Raw transaction:', JSON.stringify(txRequest, null, 2));
    }
    
    console.log('─'.repeat(50));
    
    const { approve } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approve',
        message: 'Approve this transaction?',
        default: false
      }
    ]);

    return approve;
  }

  async promptMessageSignature(signRequest) {
    console.clear();
    console.log(chalk.cyan('✍️  Message Signature Request'));
    console.log('─'.repeat(50));
    
    console.log(chalk.blue('Account:  '), signRequest.address || 'Unknown');
    console.log(chalk.blue('Message:  '));
    console.log();
    
    // Display the message nicely
    const message = signRequest.message || signRequest.data;
    if (typeof message === 'string') {
      // Try to format as JSON if possible
      try {
        const parsed = JSON.parse(message);
        console.log(chalk.white(JSON.stringify(parsed, null, 2)));
      } catch {
        console.log(chalk.white(message));
      }
    } else {
      console.log(chalk.white(JSON.stringify(message, null, 2)));
    }
    
    console.log();
    console.log('─'.repeat(50));
    
    const { approve } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approve',
        message: 'Sign this message?',
        default: false
      }
    ]);

    return approve;
  }

  async promptAccountAccess(origin) {
    console.clear();
    console.log(chalk.green('🔗 Account Access Request'));
    console.log('─'.repeat(50));
    
    console.log(chalk.blue('Website:  '), origin || 'Unknown');
    console.log(chalk.gray('This website wants to connect to your wallet'));
    console.log();
    console.log('─'.repeat(50));
    
    const { approve } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approve',
        message: 'Allow this website to see your accounts?',
        default: true
      }
    ]);

    return approve;
  }

  showConnectionStatus(connected) {
    const timestamp = new Date().toLocaleTimeString();
    
    if (connected) {
      console.log();
      console.log(chalk.green(`[${timestamp}] 🌐 Chrome extension connected`));
    } else {
      console.log();
      console.log(chalk.yellow(`[${timestamp}] 📴 Chrome extension disconnected`));
    }
  }

  showTransactionResult(success, txHash = null, error = null) {
    const timestamp = new Date().toLocaleTimeString();
    
    if (success && txHash) {
      console.log();
      console.log(chalk.green(`[${timestamp}] ✅ Transaction sent: ${txHash}`));
    } else if (error) {
      console.log();
      console.log(chalk.red(`[${timestamp}] ❌ Transaction failed: ${error}`));
    } else {
      console.log();
      console.log(chalk.yellow(`[${timestamp}] 🚫 Transaction rejected by user`));
    }
  }

  showError(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log();
    console.log(chalk.red(`[${timestamp}] ❌ Error: ${message}`));
  }

  showWelcome() {
    console.clear();
    console.log(chalk.blue('🦊 Daemon Wallet Service'));
    console.log(chalk.gray('v0.1.0'));
    console.log();
    console.log(chalk.green('✅ Service started'));
    console.log(chalk.blue('🔗 Waiting for Chrome extension connection...'));
    console.log();
    console.log(chalk.gray('Press Ctrl+C to stop'));
  }
}