# Core

**Shared libraries for Daemon Wallet**

## Overview

This package contains the core functionality shared between the CLI and daemon components:
- Keystore management with encryption
- Cryptographic utilities
- Configuration management
- IPC communication protocol

## Installation

```shell
$ npm install
```

## Usage

### Keystore

```javascript
import { Keystore } from '@daemon-wallet/core';

const keystore = new Keystore();
await keystore.init();

// Create new wallet
const result = await keystore.createWallet('password123');
console.log(result.address); // 0x...
console.log(result.mnemonic); // twelve word mnemonic phrase

// Import existing wallet
await keystore.importWallet('mnemonic phrase or private key', 'password123');

// Unlock/Lock
await keystore.unlock('password123');
keystore.lock();

// Sign transactions
const signedTx = await keystore.signTransaction(tx, address);
```

### Configuration

```javascript
import { Config } from '@daemon-wallet/core';

const config = new Config();
await config.load();

// Get network settings
const network = config.getDefaultNetwork();
console.log(network.rpc); // RPC endpoint

// Get security settings
const security = config.getSecuritySettings();
console.log(security.unlockTimeout); // 900 seconds
```

### IPC Communication

```javascript
import { IPCClient, IPCServer, IPCMessage } from '@daemon-wallet/core';

// Client (CLI)
const client = new IPCClient(socketPath);
await client.connect();
const status = await client.requestStatus();

// Server (Daemon)
const server = new IPCServer(socketPath);
server.on('message', (message, socket) => {
  // Handle message
});
await server.start();
```

## Security

- Wallet keys are encrypted using AES-256-GCM
- Key derivation uses scrypt with N=262144, r=8, p=1
- All sensitive data is cleared from memory after use
- Keystore files are stored in `~/.daemon-wallet/keystore/`

## API Reference

### Classes

- `Keystore` - Wallet key management
- `CryptoUtils` - Encryption/decryption utilities  
- `Config` - Configuration management
- `IPCServer` - IPC server for daemon
- `IPCClient` - IPC client for CLI
- `IPCMessage` - IPC message format

### Constants

- `IPC_MESSAGE_TYPES` - Available IPC message types