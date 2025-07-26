# CLI

**Command-line wallet management tool for Daemon Wallet**

## Overview

The CLI tool provides wallet management functionality and daemon control. It allows users to:
- Create and import wallets
- List accounts and export keys
- Control the daemon service
- Unlock/lock the wallet remotely

## Installation

```shell
$ npm install
$ chmod +x bin/wallet-cli
```

## Usage

### Wallet Management

```shell
# Create new wallet
$ wallet-cli create

# Import existing wallet
$ wallet-cli import

# List accounts
$ wallet-cli list

# Export private key (dangerous)
$ wallet-cli export 0x1234...

# Delete wallet (dangerous) 
$ wallet-cli delete
```

### Daemon Control

```shell
# Start daemon service
$ wallet-cli daemon start

# Check daemon status
$ wallet-cli daemon status

# Unlock wallet for daemon
$ wallet-cli daemon unlock

# Lock wallet
$ wallet-cli daemon lock

# Stop daemon
$ wallet-cli daemon stop
```

## Commands

### `create`
Creates a new wallet with a generated mnemonic phrase.
- Prompts for password (minimum 8 characters)
- Displays mnemonic phrase (must be saved securely)
- Creates encrypted keystore file

### `import`
Imports an existing wallet from mnemonic phrase or private key.
- Supports 12/24 word mnemonics
- Supports raw private keys (0x prefixed)
- Creates encrypted keystore file

### `list`
Lists all wallet accounts.
- Shows account addresses
- Indicates if wallet is locked/unlocked

### `export <address>`
Exports the private key for a specific address.
- Requires password confirmation
- Shows warnings about security risks

### `delete`
Permanently deletes the wallet.
- Requires multiple confirmations
- Cannot be undone

### `daemon status`
Checks if the daemon is running and its current state.
- Shows lock status
- Shows number of accounts
- Shows active sessions

### `daemon unlock`
Unlocks the wallet for the daemon service.
- Prompts for wallet password
- Enables transaction signing

### `daemon lock`
Locks the wallet immediately.
- Clears keys from daemon memory
- Requires unlock to resume operations

## Configuration

Configuration is stored in `~/.daemon-wallet/config.json` and includes:
- Network settings (RPC endpoints)
- Security settings (timeout, unlock preferences)
- Daemon settings (IPC socket path)

## Security

- Passwords must be at least 8 characters
- Private keys are never displayed without explicit confirmation
- Wallet deletion requires typing "DELETE" to confirm
- All sensitive operations show clear warnings