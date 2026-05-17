// Import necessary functions from Signal library
import {
    KeyHelper,
    SignalProtocolAddress,
    SessionBuilder,
    SessionCipher
} from '@privacyresearch/libsignal-protocol-typescript';

// Initialize type to hold possible UserIds
type UserId = "A" | "B";

// Initialize containers for user's store data and bundle data respectively
const userStore : any = {};
const directory : any = {};

// Function necessary for identity verification. Compares two given parameters at a byte level
function arrayBufferEquals(a: ArrayBuffer, b: ArrayBuffer): boolean {
    if (a.byteLength !== b.byteLength) return false;

    const av = new Uint8Array(a);
    const bv = new Uint8Array(b);

    for (let i = 0; i < av.length; i++) {
      if (av[i] !== bv[i]) return false;
    }
    return true;
}

// Create storage interface required by Signal Library
function createSignalStore(identityKeyPair : any, registrationId : number) {
    // Initialize store object
    const store = new Map<string, any>();

    // Update store with user's identity key pair and registration Id
    store.set("identityKeyPair", identityKeyPair);
    store.set("registrationId", registrationId);

    // Return storage methods expected by Signal library
    return {
        // Extract identity key pair and registrationId
        getIdentityKeyPair : async () => store.get("identityKeyPair"),
        getLocalRegistrationId : async () => store.get("registrationId"),

        // Verify stored identity key with given identity key
        isTrustedIdentity: async (identifier: string, identityKey: ArrayBuffer) => {
          const existing = store.get(`identityKey:${identifier}`);
          if (!existing) {
            return true; 
          }
          return arrayBufferEquals(existing, identityKey);
        },

        // Extract identity key that corresponds to identifier
        loadIdentityKey: async (identifier: string) =>
          store.get(`identityKey:${identifier}`),

        // Store specified user's identity key , or check if it's changed
        saveIdentity: async (identifier: string, identityKey: ArrayBuffer) => {
          const existing = store.get(`identityKey:${identifier}`);

          // If there isn't one stored already, store the new identitykey
          if (!existing) {
            store.set(`identityKey:${identifier}`, identityKey);
            return false; 
          }

          // Check to see if the stored identity key is different than the given one
          const changed = !arrayBufferEquals(existing, identityKey);

          // If they are the same, don't update storage
          if (!changed) {
            return false; 
          }

          // If they are different, leave the old key stored
          return true; 
        },

        // Extract and store one-time prekey
        loadPreKey: async (keyId: number) => store.get(`preKey:${keyId}`),
        storePreKey: async (keyId: number, keyPair: any) => {
          store.set(`preKey:${keyId}`, keyPair);
        },

        // Delete prekey after it's been used
        removePreKey: async (keyId: number) => {
          store.delete(`preKey:${keyId}`);
        },

        // Extract and store signed prekey
        loadSignedPreKey: async (keyId: number) =>
          store.get(`signedPreKey:${keyId}`),
        storeSignedPreKey: async (keyId: number, keyPair: any) => {
          store.set(`signedPreKey:${keyId}`, keyPair);
        },

        // Delete signed prekey 
        removeSignedPreKey: async (keyId: number) => {
          store.delete(`signedPreKey:${keyId}`);
        },

        // Load an existing session with another user
        loadSession: async (identifier: string) =>
          store.get(`session:${identifier}`),

        // Store session record
        storeSession: async (identifier: string, record: any) => {
          store.set(`session:${identifier}`, record);
        },

        // Delete session record
        removeSession: async (identifier: string) => {
          store.delete(`session:${identifier}`);
        },

        // Delete all session records
        removeAllSessions: async (identifier: string) => {
          for (const key of store.keys()) {
            if (key.startsWith(`session:${identifier}`)) {
              store.delete(key);
            }
          }
        }
    };
}

// Handles the initialization of a Signal user
export async function initializeUser(userId : UserId) {
    // Create registrationId and identitykeypair for user
    const registrationId = KeyHelper.generateRegistrationId();
    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();

    // Create one-time prekey. For now, initialize ID with 1
    const preKeyId = 1;
    const preKey = await KeyHelper.generatePreKey(preKeyId);

    // Create signed prekey that will later be used for verification
    const signedPreKeyId = 1;
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

    // Create storage object for user
    const signalStore = createSignalStore(identityKeyPair, registrationId);

    // Store prekey and signed prekey belonging to user
    await signalStore.storePreKey(preKeyId, preKey.keyPair);
    await signalStore.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    // Save user's local Signal store
    userStore[userId] = {
        signalStore
    };

    // Build/store user's public bundle 
    directory[userId] = {
        registrationId,
        identityKey: identityKeyPair.pubKey,
        signedPreKey: {
            keyId: signedPreKeyId,
            publicKey: signedPreKey.keyPair.pubKey,
            signature: signedPreKey.signature
        },
        preKey: {
          keyId: preKeyId,
          publicKey: preKey.keyPair.pubKey
        }
    };
}

// Converts binary key data into base64 text. Necessary since JSON cannon handle raw binary values securely
function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(new Uint8Array(buffer)).toString("base64");
}

// Converts base64 text back into binary data
function fromBase64(base64: string) {
  const buf = Buffer.from(base64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// Handles the extraction of a user's bundle. Utilize tobase64 function to ensure JSON can carry the data
export function getBundle(userId : UserId) {
    const bundle = directory[userId];

  return {
    registrationId: bundle.registrationId,
    identityKey: toBase64(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: toBase64(bundle.signedPreKey.publicKey),
      signature: toBase64(bundle.signedPreKey.signature)
    },
    preKey: {
      keyId: bundle.preKey.keyId,
      publicKey: toBase64(bundle.preKey.publicKey)
    }
  };
}

// Take received bundle and store it locally. Utilize frombase64 function to ensure these components can be utilized by Signal Library 
export function setBundle(userId: UserId, bundle: any) {
  directory[userId] = {
    registrationId: bundle.registrationId,
    identityKey: fromBase64(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: fromBase64(bundle.signedPreKey.publicKey),
      signature: fromBase64(bundle.signedPreKey.signature)
    },
    preKey: {
      keyId: bundle.preKey.keyId,
      publicKey: fromBase64(bundle.preKey.publicKey)
    }
  };
}

// Start Signal session between two users
export async function buildSession(fromUser: UserId, toUser: UserId) {
  // Create objects to store sender's local Signal state and recipient's public bundle
  const sender = userStore[fromUser];
  const bundle = directory[toUser];

  // Create Signal address for recipient
  const address = new SignalProtocolAddress(toUser, 1);

  // Create session builder object
  const sessionBuilder = new SessionBuilder(sender.signalStore as any, address);

  // Feed recipient's public bundle into the builder
  await sessionBuilder.processPreKey({
    registrationId: bundle.registrationId,
    identityKey: bundle.identityKey,
    signedPreKey: bundle.signedPreKey,
    preKey: bundle.preKey
  });
}

// Handles the encryption of messages
export async function encryptMessage(fromUser: UserId, toUser: UserId, plaintext: string) {
  // Set up session cipher using sender's local Signal state and recipient's address
  const sender = userStore[fromUser];
  const address = new SignalProtocolAddress(toUser, 1);
  const cipher = new SessionCipher(sender.signalStore as any, address);

  // Convert plaintext string into bytes and encrypt
  const encoded = new TextEncoder().encode(plaintext);
  const message = await cipher.encrypt(encoded.buffer);

  // Return ciphertext
  return {
    type: message.type,
    body: message.body
  };
}

// Handles the decryption of messages
export async function decryptMessage(receiverUser: UserId, senderUser: UserId, message: any) {
  // Set up session cipher using recipient's local Signal state and sender's address
  const receiver = userStore[receiverUser];
  const address = new SignalProtocolAddress(senderUser, 1);
  const cipher = new SessionCipher(receiver.signalStore as any, address);

  // Decrypt depending on whether message is prekey whisper (message.type ===3) or normal whisper
  const plaintextBuffer =
    message.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(message.body, "binary")
      : await cipher.decryptWhisperMessage(message.body, "binary");

  // Turn decrypted bytes back into string format
  return new TextDecoder().decode(new Uint8Array(plaintextBuffer));
}