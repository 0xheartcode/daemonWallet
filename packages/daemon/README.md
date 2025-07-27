# Daemon

**Background service for Chrome native messaging**

## Overview

The daemon service handles communication between the Chrome extension and the wallet. It:
- Processes Web3 requests from the browser
- Shows approval prompts in the terminal
- Manages wallet sessions and auto-lock
- Communicates with the CLI via IPC

## Installation

```shell
$ npm install
$ chmod +x bin/daemon-wallet-service
```

## Usage

### Starting the Daemon

```shell
# Start in foreground
$ ./bin/daemon-wallet-service

# Start via CLI
$ wallet-cli daemon start
```

### Native Messaging Protocol

The daemon implements Chrome's native messaging protocol:
- 4-byte message length header (little-endian)
- UTF-8 encoded JSON messages
- Request/response pattern with unique IDs

## Supported Methods

### Wallet Methods

#### `wallet_status`
Returns current wallet and daemon status.

#### `wallet_unlock`
Shows password prompt in terminal to unlock the wallet.

### Ethereum Methods

#### `eth_accounts`
Returns array of account addresses (requires unlock).

#### `eth_requestAccounts`  
Requests permission to access accounts (shows approval prompt).

#### `eth_sendTransaction`
Signs and broadcasts a transaction (shows detailed approval prompt).

#### `eth_sign`
Signs a message with eth_sign (shows approval prompt).

#### `personal_sign`
Signs a message with personal_sign (shows approval prompt).

## Terminal UI

The daemon displays all activity in the terminal:
- Connection status updates
- Transaction approval requests with details
- Message signing requests
- Error messages

Example transaction prompt:
```
⚠️  Transaction Approval Request
──────────────────────────────────────────────────
From:     0x1234...
To:       0x5678...
Value:    0.1 ETH
Gas:      21000
──────────────────────────────────────────────────
? Approve this transaction? (y/N)
```

## Session Management

- Sessions are created when Chrome connects
- Wallet auto-locks after 15 minutes of inactivity
- Lock timeout is reduced to 1 minute with no active sessions
- Sessions are tracked and displayed in status

## IPC Server

The daemon runs an IPC server for CLI communication:
- Unix socket on Linux/macOS: `~/.daemon-wallet/daemon.sock`
- Handles unlock/lock commands from CLI
- Provides status information
- Allows graceful shutdown

## Security

- Private keys are never exposed to Chrome
- All operations require explicit terminal approval
- Wallet locks automatically after timeout
- Password entry only happens in terminal
- No sensitive data is logged

## Configuration

Uses the shared configuration from `~/.daemon-wallet/config.json`:
- `security.unlockTimeout` - Auto-lock timeout in seconds
- `security.allowBrowserUnlock` - Allow unlock from browser (default: false)
- `security.requireApproval` - Require approval for all operations
- `daemon.socket` - IPC socket path

## Error Handling

All errors are returned in standard format:
```json
{
  "id": "request-id",
  "error": {
    "code": 4001,
    "message": "User rejected the request"
  }
}
```

Common error codes:
- `4001` - User rejected request
- `-1` - General error
- `-32700` - Parse error
- `-32601` - Method not found