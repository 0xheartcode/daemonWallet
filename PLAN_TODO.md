# Daemon Wallet POC - Native Messaging Implementation Plan

## Overview
Build a daemon-based Ethereum wallet that communicates with Chrome via Native Messaging API, following the KeePassXC model. The architecture separates the daemon service (handles Chrome requests) from the CLI management tool (wallet operations).

---

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Browser DApp      │────▶│  Chrome Extension   │────▶│   Daemon Service    │
│                     │◀────│ (Native Messaging)  │◀────│  (Background)       │
└─────────────────────┘     └─────────────────────┘     └──────────┬──────────┘
                                                                    │
                           ┌─────────────────────┐                 │ IPC/Socket
                           │   CLI Management    │─────────────────┘
                           │   (wallet-cli)      │
                           └─────────────────────┘
```

### Component Responsibilities:
- **Daemon Service**: Handles Chrome requests, manages sessions, terminal approval UI
- **CLI Tool**: Wallet creation/import, keystore management, daemon control
- **Chrome Extension**: Web3 provider, native messaging client (handled by your friend)
- **Shared Core**: Keystore operations, crypto utilities, IPC protocol

---

## Phase 1: Core Infrastructure (Days 1-2)

### 1.1 Project Structure
- [ ] Create new directory structure:
  ```
  daemonWallet/
  ├── packages/
  │   ├── core/                    # Shared libraries
  │   │   ├── package.json
  │   │   ├── src/
  │   │   │   ├── keystore.js     # Keystore operations
  │   │   │   ├── crypto.js       # Encryption utilities
  │   │   │   ├── ipc.js          # IPC protocol
  │   │   │   └── config.js       # Configuration management
  │   │   └── index.js            # Core exports
  │   ├── cli/                     # Management CLI
  │   │   ├── package.json
  │   │   ├── bin/
  │   │   │   └── wallet-cli      # CLI entry point
  │   │   └── src/
  │   │       ├── commands/        # CLI commands
  │   │       ├── index.js
  │   │       └── daemon-control.js
  │   ├── daemon/                  # Background service
  │   │   ├── package.json
  │   │   ├── bin/
  │   │   │   └── daemon-wallet-service
  │   │   └── src/
  │   │       ├── index.js
  │   │       ├── messaging.js    # Native messaging
  │   │       ├── approval.js     # Terminal UI
  │   │       ├── session.js      # Session management
  │   │       └── ipc-server.js   # IPC server
  │   └── extension/              # Chrome extension (your friend's work)
  │       └── (extension files)
  └── scripts/
      ├── install.sh            # Installation script
      └── build-all.sh          # Build all packages
  ```

### 1.2 Core Keystore Module
- [ ] **Implement secure keystore** (`packages/core/src/keystore.js`)
  ```javascript
  class Keystore {
    // Create new wallet with mnemonic
    async createWallet(password) { }
    
    // Import from mnemonic or private key
    async importWallet(secretData, password) { }
    
    // Load encrypted keystore from disk
    async load() { }
    
    // Save encrypted keystore to disk
    async save() { }
    
    // Unlock keystore with password
    async unlock(password) { }
    
    // Lock keystore (clear from memory)
    lock() { }
    
    // Get account addresses (public info)
    getAccounts() { }
    
    // Sign transaction (requires unlocked)
    async signTransaction(tx, address) { }
    
    // Sign message (requires unlocked)
    async signMessage(message, address) { }
  }
  ```

- [ ] **Encryption implementation** (`packages/core/src/crypto.js`)
  - Use scrypt for key derivation
  - AES-256-GCM for encryption
  - Secure random IV generation
  - Authentication tag verification

### 1.3 Configuration System
- [ ] **Config module** (`packages/core/src/config.js`)
  ```javascript
  // Default config structure
  {
    "version": 1,
    "networks": {
      "mainnet": { "rpc": "...", "chainId": 1 },
      "sepolia": { "rpc": "...", "chainId": 11155111 }
    },
    "security": {
      "unlockTimeout": 900,        // 15 minutes
      "allowBrowserUnlock": false, // Terminal-only by default
      "requireApproval": true      // Always require approval
    },
    "daemon": {
      "port": 8545,               // IPC port
      "socket": "~/.daemon-wallet/daemon.sock"
    }
  }
  ```

### 1.4 IPC Protocol
- [ ] **Define IPC messages** (`packages/core/src/ipc.js`)
  ```javascript
  // CLI → Daemon messages
  {
    "type": "unlock_keystore",
    "password": "...",
    "duration": 900
  }
  
  // Daemon → CLI responses
  {
    "type": "status",
    "locked": false,
    "accounts": ["0x..."],
    "activeSessions": 1
  }
  ```

---

## Phase 2: CLI Management Tool (Days 3-4)

### 2.1 CLI Implementation
- [ ] **Main CLI entry** (`packages/cli/bin/wallet-cli`)
  ```bash
  #!/usr/bin/env node
  wallet-cli <command> [options]
  
  Commands:
    create          Create new wallet
    import          Import from mnemonic/key
    list            List accounts
    unlock          Unlock keystore for daemon
    lock            Lock keystore
    status          Check daemon status
    export          Export private key (danger!)
    delete          Remove account
    daemon start    Start daemon service
    daemon stop     Stop daemon service
  ```

### 2.2 CLI Commands
- [ ] **Wallet operations** (`packages/cli/src/commands/wallet.js`)
  - Create: Generate mnemonic, derive keys, save keystore
  - Import: Accept mnemonic/key, derive addresses, save
  - List: Show public addresses only
  - Export: Require password, show warnings

- [ ] **Daemon control** (`packages/cli/src/commands/daemon.js`)
  - Start/stop daemon process
  - Check status via IPC
  - Send unlock/lock commands
  - Monitor active sessions

### 2.3 User Experience
- [ ] **Interactive prompts**
  - Password input (hidden)
  - Mnemonic phrase display/input
  - Confirmation prompts
  - Progress indicators

---

## Phase 3: Daemon Service (Days 5-7)

### 3.1 Native Messaging Protocol
- [ ] **Message handler** (`packages/daemon/src/messaging.js`)
  ```javascript
  // Chrome Native Messaging format
  // [4-byte length][JSON message]
  
  class NativeMessaging {
    constructor() {
      this.setupStdinReader();
      this.setupStdoutWriter();
    }
    
    // Read length-prefixed messages from stdin
    async readMessage() { }
    
    // Write length-prefixed messages to stdout
    sendMessage(message) { }
    
    // Handle incoming requests
    async handleRequest(request) {
      switch(request.method) {
        case 'eth_accounts':
          return this.getAccounts();
        case 'eth_sendTransaction':
          return this.sendTransaction(request.params);
        case 'eth_sign':
          return this.signMessage(request.params);
      }
    }
  }
  ```

### 3.2 Session Management
- [ ] **Session tracking** (`packages/daemon/src/session.js`)
  - Track active Chrome connections
  - Auto-lock timer implementation
  - Session-based permissions
  - Connection lifecycle handling

### 3.3 Approval System
- [ ] **Terminal UI** (`packages/daemon/src/approval.js`)
  ```javascript
  // Example approval prompt
  async function promptApproval(request) {
    console.clear();
    console.log(chalk.yellow('⚠️  Transaction Approval Request'));
    console.log('─'.repeat(50));
    console.log(`From:     ${request.from}`);
    console.log(`To:       ${request.to}`);
    console.log(`Value:    ${formatEther(request.value)} ETH`);
    console.log(`Gas:      ${request.gas}`);
    console.log('─'.repeat(50));
    
    const answer = await inquirer.prompt([{
      type: 'confirm',
      name: 'approve',
      message: 'Approve this transaction?',
      default: false
    }]);
    
    return answer.approve;
  }
  ```

### 3.4 IPC Server
- [ ] **Handle CLI communications** (`packages/daemon/src/ipc-server.js`)
  - Unix socket server (Mac/Linux)
  - Named pipe server (Windows)
  - Handle unlock/lock/status commands
  - Security: Check caller permissions

---

## Phase 4: Native Host Registration (Days 8-9)

### 4.1 Native Messaging Manifest
- [ ] **Create host manifest**
  ```json
  {
    "name": "com.daemonwallet.host",
    "description": "Daemon Wallet Native Host",
    "path": "/usr/local/bin/daemon-wallet-service",
    "type": "stdio",
    "allowed_origins": [
      "chrome-extension://[extension-id]/"
    ]
  }
  ```

### 4.2 Installation Script
- [ ] **Multi-platform installer** (`scripts/install.sh`)
  ```bash
  #!/bin/bash
  # Detect platform
  # Copy binaries to appropriate locations
  # Register native messaging host
  # Set up service (systemd/launchd)
  # Create config directory
  ```

---

## Phase 5: Integration & Testing (Days 10-12)

### 5.1 Integration Testing
- [ ] **End-to-end test scenarios**
  1. Create wallet via CLI
  2. Start daemon
  3. Extension connects
  4. Request unlock from extension
  5. Approve in terminal
  6. Send test transaction
  7. Verify on blockchain

### 5.2 Security Testing
- [ ] **Security scenarios**
  - Daemon crash recovery
  - Multiple unlock attempts
  - Session timeout
  - Malformed messages
  - Permission checks

### 5.3 Documentation
- [ ] **User guide**
  - Installation instructions
  - First-time setup
  - Daily usage
  - Troubleshooting

- [ ] **Developer docs**
  - Architecture overview
  - API reference
  - Security model
  - Extension integration guide

---

## Implementation Action Plan

### Week 1: Foundation
1. **Day 1-2**: Core keystore module + encryption
2. **Day 3-4**: CLI tool with wallet operations
3. **Day 5-7**: Daemon service with native messaging

### Week 2: Integration
1. **Day 8-9**: IPC communication + unlock flow
2. **Day 10-11**: Terminal approval UI + session management
3. **Day 12-14**: Testing + documentation + polish

---

## First Milestone Checklist

✅ **Milestone 1: Working Keystore + CLI** (Days 1-4)
- [ ] Create wallet via CLI
- [ ] Import wallet via CLI
- [ ] List accounts
- [ ] Keystore properly encrypted
- [ ] Basic daemon start/stop

✅ **Milestone 2: Daemon Communication** (Days 5-9)
- [ ] Daemon receives Chrome messages
- [ ] Terminal unlock prompt works
- [ ] Transaction approval flow
- [ ] IPC between CLI and daemon

✅ **Milestone 3: Full Integration** (Days 10-14)
- [ ] Extension can unlock wallet
- [ ] DApp transactions work
- [ ] Proper error handling
- [ ] Installation script works

---

## Security Considerations

1. **Keystore Security**
   - Keys encrypted at rest
   - Memory cleared after lock
   - No key transmission

2. **Communication Security**
   - Local IPC only
   - Permission checks
   - Message validation

3. **User Control**
   - Terminal-only approval
   - Explicit unlock required
   - Session timeouts

---

## Notes for Extension Developer (Your Friend)

The daemon will expose these methods via native messaging:
- `eth_accounts`: Get account list (requires unlock)
- `eth_sendTransaction`: Send transaction (requires approval)
- `eth_sign`: Sign message (requires approval)
- `wallet_status`: Check if locked/unlocked
- `wallet_unlock`: Request unlock (shows terminal prompt)

Message format: Standard Chrome native messaging (4-byte length + JSON)

The daemon handles all security prompts - the extension just needs to forward requests and handle responses.