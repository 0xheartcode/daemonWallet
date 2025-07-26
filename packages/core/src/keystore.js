import { ethers } from 'ethers';
import { CryptoUtils } from './crypto.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const KEYSTORE_VERSION = '1.0.0';
const KEYSTORE_DIR = path.join(os.homedir(), '.daemon-wallet', 'keystore');

export class Keystore {
  constructor() {
    this.isLocked = true;
    this.wallets = new Map(); // address -> wallet instance
    this.encryptedData = null;
    this.keystorePath = null;
  }

  async init() {
    await fs.mkdir(KEYSTORE_DIR, { recursive: true });
    await this.load();
  }

  async createWallet(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Generate a random wallet - this already gives us the first account
    const account = ethers.Wallet.createRandom();
    const mnemonic = account.mnemonic;
    
    // Store wallet data
    const walletData = {
      mnemonic: mnemonic.phrase,
      nextAccountIndex: 1, // Next account to generate
      accounts: [{
        address: account.address,
        path: account.path || "m/44'/60'/0'/0/0",
        privateKey: account.privateKey,
        index: 0,
        visible: true,
        label: 'Account 1'
      }]
    };

    // Encrypt and save
    await this._saveWalletData(walletData, password);
    
    // Keep in memory if unlocked
    this.wallets.set(account.address.toLowerCase(), account);
    this.isLocked = false;
    
    return {
      address: account.address,
      mnemonic: mnemonic.phrase // Return mnemonic only on creation
    };
  }

  async importWallet(secretData, password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    let wallet;
    let mnemonic = null;

    // Check if it's a mnemonic or private key
    if (secretData.split(' ').length >= 12) {
      // It's a mnemonic
      mnemonic = secretData.trim();
      const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
      wallet = hdNode.derivePath("m/44'/60'/0'/0/0");
    } else if (secretData.startsWith('0x') && secretData.length === 66) {
      // It's a private key
      wallet = new ethers.Wallet(secretData);
    } else {
      throw new Error('Invalid mnemonic phrase or private key');
    }

    // Prepare wallet data
    const walletData = {
      mnemonic,
      accounts: [{
        address: wallet.address,
        path: mnemonic ? "m/44'/60'/0'/0/0" : null,
        privateKey: wallet.privateKey
      }]
    };

    // Encrypt and save
    await this._saveWalletData(walletData, password);
    
    // Keep in memory
    this.wallets.set(wallet.address.toLowerCase(), wallet);
    this.isLocked = false;
    
    return {
      address: wallet.address
    };
  }

  async unlock(password) {
    if (!this.encryptedData) {
      throw new Error('No keystore found');
    }

    try {
      const decrypted = await CryptoUtils.decrypt(this.encryptedData.crypto, password);
      const walletData = JSON.parse(decrypted);
      
      // Store wallet data for account management
      this.walletData = walletData;
      
      // Restore wallets
      this.wallets.clear();
      
      for (const account of walletData.accounts) {
        const wallet = new ethers.Wallet(account.privateKey);
        this.wallets.set(wallet.address.toLowerCase(), wallet);
      }
      
      this.isLocked = false;
      return true;
    } catch (err) {
      if (err.message.includes('Invalid password')) {
        return false;
      }
      throw err;
    }
  }

  lock() {
    // Clear sensitive data from memory
    for (const [, wallet] of this.wallets) {
      if (wallet._signingKey) {
        CryptoUtils.clearSensitiveData(wallet._signingKey());
      }
    }
    this.wallets.clear();
    this.walletData = null; // Clear wallet data
    this.isLocked = true;
  }

  getAccounts(includeHidden = false) {
    if (this.isLocked) {
      // When locked, try to get addresses from encrypted data if available
      if (this.encryptedData) {
        // We can't decrypt without password, but we could store addresses separately
        // For now, return empty but indicate keystore exists
        return [];
      }
      return [];
    }
    
    // Return only visible accounts unless includeHidden is true
    const accounts = Array.from(this.wallets.keys());
    if (includeHidden || !this.walletData) {
      return accounts;
    }
    
    // Filter by visibility
    return accounts.filter(address => {
      const accountData = this.walletData.accounts.find(
        acc => acc.address.toLowerCase() === address.toLowerCase()
      );
      return accountData?.visible !== false;
    });
  }

  hasKeystore() {
    return !!this.encryptedData;
  }

  async signTransaction(tx, address) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    const wallet = this.wallets.get(address.toLowerCase());
    if (!wallet) {
      throw new Error(`Account ${address} not found`);
    }

    // Sign the transaction
    const signedTx = await wallet.signTransaction(tx);
    return signedTx;
  }

  async signMessage(message, address) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    const wallet = this.wallets.get(address.toLowerCase());
    if (!wallet) {
      throw new Error(`Account ${address} not found`);
    }

    // Sign the message
    const signature = await wallet.signMessage(message);
    return signature;
  }

  async load() {
    try {
      const files = await fs.readdir(KEYSTORE_DIR);
      const keystoreFile = files.find(f => f.endsWith('.json'));
      
      if (keystoreFile) {
        this.keystorePath = path.join(KEYSTORE_DIR, keystoreFile);
        const data = await fs.readFile(this.keystorePath, 'utf8');
        this.encryptedData = JSON.parse(data);
      }
    } catch (err) {
      // No keystore yet, that's OK
      if (err.code !== 'ENOENT') {
        console.error('Failed to load keystore:', err);
      }
    }
  }

  async _saveWalletData(walletData, password) {
    const dataToEncrypt = JSON.stringify(walletData);
    const encrypted = await CryptoUtils.encrypt(dataToEncrypt, password);
    
    const keystoreData = {
      version: KEYSTORE_VERSION,
      id: crypto.randomUUID(),
      crypto: encrypted
    };

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `keystore-${timestamp}.json`;
    this.keystorePath = path.join(KEYSTORE_DIR, filename);
    
    await fs.writeFile(
      this.keystorePath,
      JSON.stringify(keystoreData, null, 2),
      'utf8'
    );
    
    this.encryptedData = keystoreData;
  }

  async createNextAccount(password) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }
    
    if (!this.walletData?.mnemonic) {
      throw new Error('No mnemonic found - wallet may have been imported from private key');
    }

    const nextIndex = this.walletData.nextAccountIndex || 1;
    const derivationPath = `m/44'/60'/0'/0/${nextIndex}`;
    
    // Derive new account
    const hdNode = ethers.HDNodeWallet.fromPhrase(this.walletData.mnemonic);
    const newAccount = hdNode.derivePath(derivationPath);
    
    // Add to wallet data
    const accountData = {
      address: newAccount.address,
      path: derivationPath,
      privateKey: newAccount.privateKey,
      index: nextIndex,
      visible: true,
      label: `Account ${nextIndex + 1}`
    };
    
    this.walletData.accounts.push(accountData);
    this.walletData.nextAccountIndex = nextIndex + 1;
    
    // Save updated wallet data
    await this._saveWalletData(this.walletData, password);
    
    // Add to memory
    this.wallets.set(newAccount.address.toLowerCase(), newAccount);
    
    return {
      address: newAccount.address,
      index: nextIndex,
      label: accountData.label
    };
  }

  async hideAccount(address, password) {
    return await this._setAccountVisibility(address, false, password);
  }

  async showAccount(address, password) {
    return await this._setAccountVisibility(address, true, password);
  }

  async setAccountLabel(address, label, password) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    const accountData = this.walletData.accounts.find(
      acc => acc.address.toLowerCase() === address.toLowerCase()
    );
    
    if (!accountData) {
      throw new Error('Account not found');
    }

    accountData.label = label;
    await this._saveWalletData(this.walletData, password);
    
    return true;
  }

  async _setAccountVisibility(address, visible, password) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    const accountData = this.walletData.accounts.find(
      acc => acc.address.toLowerCase() === address.toLowerCase()
    );
    
    if (!accountData) {
      throw new Error('Account not found');
    }

    // Cannot hide the first account (index 0)
    if (accountData.index === 0 && !visible) {
      throw new Error('Cannot hide the primary account');
    }

    accountData.visible = visible;
    await this._saveWalletData(this.walletData, password);
    
    return true;
  }

  getAccountDetails(address) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    const accountData = this.walletData?.accounts.find(
      acc => acc.address.toLowerCase() === address.toLowerCase()
    );
    
    return accountData ? {
      address: accountData.address,
      path: accountData.path,
      index: accountData.index,
      visible: accountData.visible,
      label: accountData.label
    } : null;
  }

  getAllAccountDetails(includeHidden = false) {
    if (this.isLocked) {
      throw new Error('Keystore is locked');
    }

    if (!this.walletData?.accounts) {
      return [];
    }

    return this.walletData.accounts
      .filter(acc => includeHidden || acc.visible !== false)
      .map(acc => ({
        address: acc.address,
        path: acc.path,
        index: acc.index,
        visible: acc.visible,
        label: acc.label
      }));
  }

  async deleteKeystore() {
    this.lock();
    if (this.keystorePath) {
      await fs.unlink(this.keystorePath);
      this.keystorePath = null;
      this.encryptedData = null;
    }
  }
}