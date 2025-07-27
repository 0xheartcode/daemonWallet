import net from 'node:net';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';

export const IPC_MESSAGE_TYPES = {
  // CLI → Daemon
  UNLOCK_KEYSTORE: 'unlock_keystore',
  LOCK_KEYSTORE: 'lock_keystore',
  GET_STATUS: 'get_status',
  SHUTDOWN: 'shutdown',
  
  // Daemon → CLI
  STATUS_RESPONSE: 'status_response',
  UNLOCK_RESPONSE: 'unlock_response',
  ERROR: 'error'
};

export class IPCMessage {
  constructor(type, data = {}) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.data = data;
    this.timestamp = Date.now();
  }

  static fromJSON(json) {
    const obj = JSON.parse(json);
    const msg = new IPCMessage(obj.type, obj.data);
    msg.id = obj.id;
    msg.timestamp = obj.timestamp;
    return msg;
  }

  toJSON() {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp
    });
  }
}

export class IPCServer extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPath = socketPath;
    this.server = null;
    this.clients = new Set();
  }

  async start() {
    // Remove existing socket file
    try {
      await fs.unlink(this.socketPath);
      console.log('🧹 Cleaned up existing socket file');
    } catch (err) {
      // File doesn't exist, that's OK
      if (err.code !== 'ENOENT') {
        console.warn('Warning: Could not remove socket file:', err.message);
      }
    }

    this.server = net.createServer();
    
    this.server.on('connection', (socket) => {
      this.clients.add(socket);
      
      socket.on('data', (data) => {
        try {
          const message = IPCMessage.fromJSON(data.toString());
          this.emit('message', message, socket);
        } catch (err) {
          this.emit('error', err);
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
      });

      socket.on('error', (err) => {
        this.emit('error', err);
        this.clients.delete(socket);
      });
    });

    return new Promise((resolve, reject) => {
      this.server.on('error', (err) => {
        console.error('IPC Server error:', err);
        reject(err);
      });
      
      this.server.listen(this.socketPath, (err) => {
        if (err) {
          console.error('Failed to listen on socket:', err);
          reject(err);
        } else {
          console.log('📡 IPC server listening on:', this.socketPath);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      // Close all client connections
      for (const client of this.clients) {
        client.end();
      }
      this.clients.clear();

      // Close server
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  sendToClient(socket, message) {
    if (socket && !socket.destroyed) {
      socket.write(message.toJSON());
    }
  }

  broadcast(message) {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }
}

export class IPCClient extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPath = socketPath;
    this.socket = null;
    this.connected = false;
    this.pendingResponses = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);
      
      let resolved = false;

      const cleanup = () => {
        if (this.socket) {
          this.socket.removeAllListeners('connect');
          this.socket.removeAllListeners('error');
        }
      };

      this.socket.on('connect', () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        
        this.connected = true;
        this.emit('connect');
        resolve();
      });

      this.socket.on('data', (data) => {
        try {
          const message = IPCMessage.fromJSON(data.toString());
          
          // Check if this is a response to a pending request
          if (this.pendingResponses.has(message.id)) {
            const { resolve: resolvePending } = this.pendingResponses.get(message.id);
            this.pendingResponses.delete(message.id);
            resolvePending(message);
          } else {
            this.emit('message', message);
          }
        } catch (err) {
          // Only emit error if we have listeners to prevent unhandled errors
          if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnect');
        
        // Reject pending responses
        for (const [id, { reject: rejectPending }] of this.pendingResponses) {
          rejectPending(new Error('Connection closed'));
        }
        this.pendingResponses.clear();
      });

      this.socket.on('error', (err) => {
        if (resolved) {
          // Connection was established but later errored
          this.connected = false;
          // Only emit error if we have listeners
          if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
          
          // Reject pending responses
          for (const [id, { reject: rejectPending }] of this.pendingResponses) {
            rejectPending(err);
          }
          this.pendingResponses.clear();
        } else {
          // Connection failed
          resolved = true;
          cleanup();
          this.connected = false;
          reject(err);
        }
      });

      // Add connection timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          this.socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.connected = false;
    }
  }

  async send(message, waitForResponse = false) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to daemon');
    }

    if (waitForResponse) {
      return new Promise((resolve, reject) => {
        this.pendingResponses.set(message.id, { resolve, reject });
        
        // Set timeout
        setTimeout(() => {
          if (this.pendingResponses.has(message.id)) {
            this.pendingResponses.delete(message.id);
            reject(new Error('IPC request timeout'));
          }
        }, 5000);

        this.socket.write(message.toJSON());
      });
    } else {
      this.socket.write(message.toJSON());
    }
  }

  async requestStatus() {
    const message = new IPCMessage(IPC_MESSAGE_TYPES.GET_STATUS);
    const response = await this.send(message, true);
    return response.data;
  }

  async requestUnlock(password) {
    const message = new IPCMessage(IPC_MESSAGE_TYPES.UNLOCK_KEYSTORE, { password });
    const response = await this.send(message, true);
    return response.data;
  }

  async requestLock() {
    const message = new IPCMessage(IPC_MESSAGE_TYPES.LOCK_KEYSTORE);
    await this.send(message, false);
  }

  async requestShutdown() {
    const message = new IPCMessage(IPC_MESSAGE_TYPES.SHUTDOWN);
    await this.send(message, false);
  }
}