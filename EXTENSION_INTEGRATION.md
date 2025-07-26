# Chrome Extension Integration Guide

## Overview
The daemon wallet backend is ready! Here's what your friend needs to know to build the Chrome extension that communicates with our daemon service.

## Architecture Summary

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Browser DApp      │────▶│  Chrome Extension   │────▶│   Daemon Service    │
│                     │◀────│ (Native Messaging)  │◀────│  (Background)       │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## Daemon API Reference

The daemon service is ready and responds to these native messaging methods:

### Core Methods

#### `wallet_status`
Get current wallet status
```javascript
// Request
{
  "id": "unique-id",
  "method": "wallet_status",
  "params": []
}

// Response
{
  "id": "unique-id", 
  "result": {
    "locked": false,
    "accounts": ["0x1234..."],
    "activeSessions": 1,
    "hasKeystore": true
  }
}
```

#### `wallet_unlock`
Request wallet unlock (shows terminal prompt)
```javascript
// Request
{
  "id": "unique-id",
  "method": "wallet_unlock", 
  "params": []
}

// Response (after user enters password in terminal)
{
  "id": "unique-id",
  "result": {
    "success": true,
    "accounts": ["0x1234..."]
  }
}
```

### Ethereum Methods

#### `eth_accounts`
Get connected accounts (requires unlock)
```javascript
// Request
{
  "id": "unique-id",
  "method": "eth_accounts",
  "params": []
}

// Response
{
  "id": "unique-id",
  "result": ["0x1234...", "0x5678..."]
}
```

#### `eth_requestAccounts`
Request account access (shows terminal approval)
```javascript
// Request
{
  "id": "unique-id", 
  "method": "eth_requestAccounts",
  "params": [{"origin": "https://example.com"}]
}

// Response (after user approval)
{
  "id": "unique-id",
  "result": ["0x1234..."]
}
```

#### `eth_sendTransaction`
Send transaction (shows terminal approval)
```javascript
// Request
{
  "id": "unique-id",
  "method": "eth_sendTransaction",
  "params": [{
    "from": "0x1234...",
    "to": "0x5678...",
    "value": "0x38d7ea4c68000", // 0.001 ETH in wei
    "gas": "0x5208",             // 21000
    "gasPrice": "0x174876e800"   // 100 gwei
  }]
}

// Response (after user approval and blockchain confirmation)
{
  "id": "unique-id",
  "result": "0xabc123..." // transaction hash
}
```

#### `personal_sign`
Sign message (shows terminal approval)
```javascript
// Request
{
  "id": "unique-id",
  "method": "personal_sign", 
  "params": ["Hello World", "0x1234..."]
}

// Response (after user approval)
{
  "id": "unique-id",
  "result": "0x..." // signature
}
```

## Error Responses

All errors follow this format:
```javascript
{
  "id": "unique-id",
  "error": {
    "code": -1,
    "message": "Error description"
  }
}
```

Common error codes:
- `4001`: User rejected the request
- `-1`: General error (check message)

## Testing the Daemon

### 1. Create a Wallet (CLI)
```bash
cd packages/cli
./bin/wallet-cli create
# Follow prompts to set password
```

### 2. Start Daemon Service
```bash
cd packages/daemon  
./bin/daemon-wallet-service
# Should show "Waiting for Chrome extension connection..."
```

### 3. Test Native Messaging
The daemon expects native messaging protocol:
- 4-byte length header (little-endian uint32)
- UTF-8 JSON message

## Extension Implementation Notes

### manifest.json Requirements
```json
{
  "manifest_version": 3,
  "permissions": ["nativeMessaging"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_start"
  }]
}
```

### Native Host Manifest
The daemon will need to be registered as a native messaging host:
```json
{
  "name": "com.daemonwallet.host",
  "description": "Daemon Wallet Native Host", 
  "path": "/path/to/daemon-wallet-service",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

### Recommended Flow
1. **background.js**: Handle native messaging connection
2. **content.js**: Inject window.ethereum provider
3. **popup**: Show wallet status and controls

### Sample Connection Code
```javascript
// background.js
const port = chrome.runtime.connectNative('com.daemonwallet.host');

port.onMessage.addListener((message) => {
  // Handle daemon responses
});

function sendToNative(request) {
  port.postMessage(request);
}
```

## Current Status ✅

All backend components are implemented and tested:
- ✅ Core keystore with encryption
- ✅ CLI wallet management tool  
- ✅ Daemon service with native messaging
- ✅ IPC communication for CLI control
- ✅ Terminal-based approval UI
- ✅ Session management and auto-lock

## Next Steps for Extension

1. Create basic manifest.json and background service worker
2. Implement native messaging connection  
3. Create window.ethereum provider injection
4. Test basic wallet connection flow
5. Add transaction and signing support
6. Create popup UI for status/controls

## Testing Together

Once you have a basic extension:
1. Register the native host manifest
2. Load the extension in Chrome
3. Start the daemon service
4. Test connection and basic methods

The daemon will show all activity in the terminal with colored output and approval prompts!