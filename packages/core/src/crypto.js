import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_N = 16384; // 2^14 (reduced from 2^18 for lower memory usage)
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export class CryptoUtils {
  static async deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, KEY_LENGTH, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 256 * 1024 * 1024
      }, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  static async encrypt(data, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await this.deriveKey(password, salt);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    const result = {
      encrypted: encrypted.toString('hex'),
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM,
      scrypt: {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P
      }
    };
    
    return result;
  }

  static async decrypt(encryptedData, password) {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const encrypted = Buffer.from(encryptedData.encrypted, 'hex');
    
    const key = await this.deriveKey(password, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    try {
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (err) {
      if (err.message.includes('Unsupported state or unable to authenticate data')) {
        throw new Error('Invalid password or corrupted data');
      }
      throw err;
    }
  }

  static generateMnemonic() {
    const entropy = crypto.randomBytes(16); // 128 bits for 12-word mnemonic
    return { entropy: entropy.toString('hex') };
  }

  static clearSensitiveData(obj) {
    if (Buffer.isBuffer(obj)) {
      obj.fill(0);
    } else if (typeof obj === 'string') {
      // Strings are immutable in JS, best we can do is return empty
      return '';
    } else if (obj && typeof obj === 'object') {
      for (const key in obj) {
        obj[key] = this.clearSensitiveData(obj[key]);
      }
    }
    return obj;
  }
}