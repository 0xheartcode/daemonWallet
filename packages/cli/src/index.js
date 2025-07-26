import { Command } from 'commander';
import chalk from 'chalk';
import { Keystore, Config, IPCClient } from '@daemon-wallet/core';
import { WalletCommands } from './commands/wallet.js';
import { DaemonCommands } from './commands/daemon.js';

const program = new Command();

program
  .name('wallet-cli')
  .description('Daemon Wallet CLI Management Tool')
  .version('0.1.0');

// Create global instances
const keystore = new Keystore();
const config = new Config();

// Initialize
await config.load();
await keystore.init();

// Create IPC client
const ipcClient = new IPCClient(config.getDaemonSocket());

// Initialize command modules
const walletCommands = new WalletCommands(keystore, config);
const daemonCommands = new DaemonCommands(ipcClient);

// Wallet commands
program
  .command('create')
  .description('Create a new wallet')
  .action(async () => {
    await walletCommands.create();
  });

program
  .command('import')
  .description('Import wallet from mnemonic or private key')
  .action(async () => {
    await walletCommands.import();
  });

program
  .command('list')
  .description('List wallet accounts')
  .action(async () => {
    await walletCommands.list();
  });

program
  .command('export-wallet')
  .description('Export all wallet data including mnemonic and private keys (extremely dangerous!)')
  .action(async () => {
    await walletCommands.exportAll();
  });

program
  .command('create-account')
  .description('Create additional account (HD derivation)')
  .action(async () => {
    await walletCommands.createAccount();
  });

program
  .command('delete')
  .description('Delete wallet (dangerous!)')
  .action(async () => {
    await walletCommands.delete();
  });

// Daemon commands
const daemonCmd = program
  .command('daemon')
  .description('Daemon control commands');

daemonCmd
  .command('status')
  .description('Check daemon status')
  .action(async () => {
    await daemonCommands.status();
  });

daemonCmd
  .command('unlock')
  .description('Unlock wallet for daemon')
  .action(async () => {
    await daemonCommands.unlock();
  });

daemonCmd
  .command('lock')
  .description('Lock wallet')
  .action(async () => {
    await daemonCommands.lock();
  });

daemonCmd
  .command('start')
  .description('Start daemon service')
  .action(async () => {
    await daemonCommands.start();
  });

daemonCmd
  .command('stop')
  .description('Stop daemon service')
  .action(async () => {
    await daemonCommands.stop();
  });

// Error handling
program.exitOverride();

try {
  await program.parseAsync();
} catch (err) {
  if (err.code === 'commander.help' || err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
}