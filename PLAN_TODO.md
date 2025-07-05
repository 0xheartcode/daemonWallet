# Daemon Wallet POC - Native Messaging Implementation Plan

## Overview
Build a CLI Ethereum wallet that communicates with Chrome via Native Messaging API, following the KeePassXC model. The wallet runs as a native application and the browser extension communicates through stdin/stdout.

---

## Phase 1: Native Messaging Foundation

### 1.1 Project Structure Setup
- [ ] Create project directory structure
  ```
  daemonWallet/
  ├── cli/                  # Native host (Node.js CLI wallet)
  │   ├── package.json
  │   ├── src/
  │   │   ├── index.js      # Main entry point
  │   │   ├── wallet.js     # Wallet operations
  │   │   ├── messaging.js  # Native messaging handler
  │   │   └── crypto.js     # Keystore & encryption
  │   └── install/          # Installation scripts
  ├── extension/            # Chrome extension
  │   ├── manifest.json     # Extension manifest v3
  │   ├── background.js     # Service worker
  │   ├── content.js        # Content script
  │   ├── popup/           # Extension popup UI
  │   └── provider.js       # Web3 provider injection
  └── docs/                # Documentation
  ```

### 1.2 Native Host (CLI Wallet) - Core Communication
- [ ] **Setup Node.js project**
  - [ ] Initialize package.json with dependencies (ethers.js)
  - [ ] Create basic CLI entry point

- [ ] **Implement Native Messaging Protocol**
  - [ ] Create stdin/stdout message handler
  - [ ] Implement message length-prefixed protocol (4-byte header + JSON)
  - [ ] Add message ID tracking for request/response matching
  - [ ] Handle connection lifecycle (connect/disconnect)

- [ ] **Basic Message Types**
  ```javascript
  // Incoming from extension
  {
    "id": "unique-id",
    "method": "eth_accounts" | "eth_sendTransaction" | "eth_sign",
    "params": [...] 
  }
  
  // Outgoing to extension
  {
    "id": "unique-id",
    "result": "..." | null,
    "error": { "code": -1, "message": "..." } | null
  }
  ```

### 1.3 Basic Wallet Operations
- [ ] **Wallet Management**
  - [ ] Create new wallet (generate mnemonic)
  - [ ] Import existing wallet (mnemonic/private key)
  - [ ] Encrypted keystore (basic password protection)
  - [ ] Account derivation (BIP-44 path)

- [ ] **Ethereum Operations**
  - [ ] Connect to RPC providers (Infura/Alchemy)
  - [ ] Get account balance
  - [ ] Send ETH transactions
  - [ ] Sign messages
  - [ ] Support Mainnet + Sepolia testnet

- [ ] **CLI Interface (Terminal)**
  ```bash
  # Example interaction
  $ ./daemon-wallet
  📱 Daemon Wallet v0.1.0
  🔗 Waiting for browser connection...
  
  [10:30:15] 🌐 Extension connected
  [10:30:42] 📋 Transaction request:
             Send 0.1 ETH to 0x1234...
             Gas: 21000 (0.0005 ETH)
             Approve? [y/N]: y
  [10:30:45] ✅ Transaction sent: 0xabc123...
  ```

---

## Phase 2: Chrome Extension - Native Messaging Client

### 2.1 Extension Manifest & Permissions
- [ ] **Create manifest.json (v3)**
  ```json
  {
    "manifest_version": 3,
    "name": "Daemon Wallet",
    "version": "0.1.0",
    "permissions": ["nativeMessaging", "activeTab"],
    "host_permissions": ["<all_urls>"],
    "background": {
      "service_worker": "background.js"
    },
    "content_scripts": [{
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start"
    }],
    "action": {
      "default_popup": "popup/popup.html"
    }
  }
  ```

### 2.2 Native Messaging Connection
- [ ] **Background Service Worker (background.js)**
  - [ ] Establish native messaging connection
  - [ ] Handle connection lifecycle
  - [ ] Message routing between content script and native host
  - [ ] Connection retry logic

- [ ] **Connection Flow**
  ```javascript
  // Connect to native host
  const port = chrome.runtime.connectNative('com.daemonwallet.host');
  
  // Handle messages
  port.onMessage.addListener((message) => {
    // Route response back to content script
  });
  
  // Send requests
  port.postMessage({
    id: generateId(),
    method: 'eth_accounts',
    params: []
  });
  ```

### 2.3 Web3 Provider Injection
- [ ] **Content Script (content.js)**
  - [ ] Inject Web3 provider into page
  - [ ] Implement EIP-1193 provider interface
  - [ ] Handle standard methods: eth_accounts, eth_sendTransaction, eth_sign
  - [ ] Event emission (accountsChanged, chainChanged)

- [ ] **Provider Implementation**
  ```javascript
  // Inject into window.ethereum
  window.ethereum = {
    isMetaMask: false,
    isDaemonWallet: true,
    request: async ({ method, params }) => {
      // Send to background → native host
      return new Promise((resolve, reject) => {
        // Implementation
      });
    },
    on: (event, callback) => { /* Event handling */ }
  };
  ```

### 2.4 Basic UI (Popup)
- [ ] **Simple Status Popup**
  - [ ] Show connection status
  - [ ] Display current account
  - [ ] Show balance
  - [ ] Manual transaction form (for testing)

---

## Phase 3: Native Host Installation & Registration

### 3.1 Native Messaging Host Registration
- [ ] **Create host manifest file**
  ```json
  {
    "name": "com.daemonwallet.host",
    "description": "Daemon Wallet Native Host",
    "path": "/path/to/daemon-wallet",
    "type": "stdio",
    "allowed_origins": [
      "chrome-extension://[extension-id]/"
    ]
  }
  ```

- [ ] **Platform-specific installation**
  - [ ] Linux: `~/.config/google-chrome/NativeMessagingHosts/`
  - [ ] macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
  - [ ] Windows: Registry entry + file path

- [ ] **Installation script**
  ```bash
  #!/bin/bash
  # install.sh
  
  # Copy native host manifest
  mkdir -p ~/.config/google-chrome/NativeMessagingHosts/
  cp com.daemonwallet.host.json ~/.config/google-chrome/NativeMessagingHosts/
  
  # Make CLI executable
  chmod +x daemon-wallet
  
  echo "✅ Daemon Wallet installed!"
  echo "Now install the Chrome extension"
  ```

---

## Phase 4: Testing & Integration

### 4.1 Unit Tests
- [ ] **CLI Wallet Tests**
  - [ ] Message protocol parsing
  - [ ] Wallet operations (create, import, sign)
  - [ ] RPC provider integration

- [ ] **Extension Tests**
  - [ ] Native messaging connection
  - [ ] Provider injection
  - [ ] Message routing

### 4.2 Integration Testing
- [ ] **End-to-End Test Flow**
  1. [ ] Start CLI wallet
  2. [ ] Load extension in Chrome
  3. [ ] Connect to test DApp (Remix IDE)
  4. [ ] Request account connection
  5. [ ] Send test transaction
  6. [ ] Verify transaction on blockchain

- [ ] **Test DApps**
  - [ ] Remix Ethereum IDE
  - [ ] Simple HTML page with Web3.js
  - [ ] Uniswap (advanced test)

### 4.3 Error Handling & Edge Cases
- [ ] **Connection Issues**
  - [ ] Native host not running
  - [ ] Extension not installed
  - [ ] Permission denied

- [ ] **Transaction Failures**
  - [ ] Insufficient balance
  - [ ] User rejection
  - [ ] Network errors

---

## Phase 5: Documentation & Polish

### 5.1 User Documentation
- [ ] **Installation Guide**
  - [ ] CLI wallet setup
  - [ ] Extension installation
  - [ ] First wallet creation

- [ ] **Usage Examples**
  - [ ] Connecting to DApps
  - [ ] Sending transactions
  - [ ] Troubleshooting

### 5.2 Developer Documentation
- [ ] **Architecture Overview**
  - [ ] Communication flow diagrams
  - [ ] Message protocol specification
  - [ ] Security considerations

---

## Technical Notes

### Native Messaging Protocol Details
```javascript
// Message format: [length][message]
// Length: 4 bytes, little-endian uint32
// Message: UTF-8 JSON string

function sendMessage(message) {
  const json = JSON.stringify(message);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(Buffer.byteLength(json), 0);
  process.stdout.write(Buffer.concat([length, Buffer.from(json)]));
}

function readMessage() {
  // Read 4-byte length header
  // Read message of specified length
  // Parse JSON
}
```

### Security Considerations
- [ ] Input validation on all messages
- [ ] Rate limiting for requests
- [ ] Secure keystore encryption
- [ ] Audit user approval requirements

### Future Enhancements (Out of Scope for POC)
- [ ] Transaction decoding (4byte.directory)
- [ ] Multi-account support
- [ ] Hardware wallet integration
- [ ] Advanced DeFi features

---

## Success Criteria for POC

✅ **Minimum Viable Demo:**
1. CLI wallet can create/import accounts
2. Chrome extension connects via Native Messaging
3. Can connect account to Remix IDE
4. Can send a transaction with CLI approval
5. Transaction appears on Sepolia testnet

🎯 **Completion Target:** 2-3 weeks for full POC

---

## Getting Started

1. **Day 1-2**: Project structure + native messaging protocol
2. **Day 3-5**: Basic CLI wallet + Ethereum operations  
3. **Day 6-8**: Chrome extension + provider injection
4. **Day 9-10**: Native host registration + installation
5. **Day 11-14**: Testing + documentation + polish

**First milestone**: Get a simple "ping-pong" message working between CLI and extension.