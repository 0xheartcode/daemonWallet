import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.daemon-wallet');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  version: 1,
  networks: {
    mainnet: {
      rpc: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      chainId: 1,
      name: 'Ethereum Mainnet'
    },
    sepolia: {
      rpc: 'https://eth-sepolia.g.alchemy.com/v2/demo',
      chainId: 11155111,
      name: 'Sepolia Testnet'
    }
  },
  security: {
    unlockTimeout: 900,        // 15 minutes
    allowBrowserUnlock: false, // Terminal-only by default
    requireApproval: true      // Always require approval
  },
  daemon: {
    port: 8545,
    socket: path.join(CONFIG_DIR, 'daemon.sock')
  },
  defaultNetwork: 'sepolia'
};

export class Config {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  async load() {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      const loadedConfig = JSON.parse(data);
      
      // Merge with defaults to ensure all fields exist
      this.config = this._deepMerge(DEFAULT_CONFIG, loadedConfig);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // No config file yet, save defaults
        await this.save();
      } else {
        console.error('Failed to load config:', err);
      }
    }
  }

  async save() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(
      CONFIG_FILE,
      JSON.stringify(this.config, null, 2),
      'utf8'
    );
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
  }

  getNetwork(name) {
    return this.config.networks[name];
  }

  getDefaultNetwork() {
    return this.config.networks[this.config.defaultNetwork];
  }

  getDaemonSocket() {
    return this.config.daemon.socket;
  }

  getSecuritySettings() {
    return this.config.security;
  }

  _deepMerge(target, source) {
    const output = { ...target };
    
    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  _isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}