import { EventEmitter } from 'node:events';

export class NativeMessaging extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.setupStdinReader();
  }

  setupStdinReader() {
    // Only set up stdin reading in native messaging mode
    if (!process.stdin.isTTY) {
      process.stdin.on('readable', () => {
        this.readMessages();
      });

      process.stdin.on('end', () => {
        this.connected = false;
        this.emit('disconnect');
      });
    }
  }

  readMessages() {
    while (true) {
      // Read the 4-byte length header
      const lengthBuffer = process.stdin.read(4);
      if (!lengthBuffer) {
        break;
      }

      // Parse length (little-endian uint32)
      const messageLength = lengthBuffer.readUInt32LE(0);
      
      // Read the message content
      const messageBuffer = process.stdin.read(messageLength);
      if (!messageBuffer) {
        // Put the length back for next read
        process.stdin.unshift(lengthBuffer);
        break;
      }

      try {
        const message = JSON.parse(messageBuffer.toString('utf8'));
        this.emit('message', message);
      } catch (err) {
        this.emit('error', new Error(`Invalid JSON message: ${err.message}`));
      }
    }
  }

  sendMessage(message) {
    if (!this.connected) {
      return false;
    }

    try {
      const json = JSON.stringify(message);
      const jsonBuffer = Buffer.from(json, 'utf8');
      
      // Create length header (4 bytes, little-endian)
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
      
      // Write length + message
      process.stdout.write(lengthBuffer);
      process.stdout.write(jsonBuffer);
      
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  sendResponse(requestId, result = null, error = null) {
    return this.sendMessage({
      id: requestId,
      result,
      error
    });
  }

  sendError(requestId, code, message) {
    return this.sendResponse(requestId, null, {
      code,
      message
    });
  }

  connect() {
    this.connected = true;
    this.emit('connect');
  }

  disconnect() {
    this.connected = false;
    this.emit('disconnect');
  }
}