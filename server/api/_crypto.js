// api/_crypto.js
// AES-GCM decryption and encryption utility matching Supabase Edge Functions SubtleCrypto implementation

const ENCRYPT_SECRET = process.env.INTEGRATION_ENCRYPT_SECRET || process.env.META_APP_SECRET || 'change-me-to-32-char-secret!!!!!';

export async function decryptToken(encoded) {
  if (!encoded) return '';
  // If plain unencrypted token (e.g. EAAV...), return directly
  if (encoded.startsWith('EAAV') || encoded.startsWith('EAA') || encoded.startsWith('IGQ')) {
    return encoded;
  }

  try {
    const rawData = Buffer.from(encoded, 'base64');
    if (rawData.length < 13) return encoded; // Too short to be iv + ciphertext

    const iv = rawData.subarray(0, 12);
    const cipherBuf = rawData.subarray(12);

    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const keyData = enc.encode(ENCRYPT_SECRET.padEnd(32, '0').slice(0, 32));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBuf
    );

    return dec.decode(plainBuf);
  } catch (err) {
    // If decryption fails, it might be raw or legacy token, fallback safely
    console.warn('[_crypto] Decrypt failed, returning raw string:', err.message);
    return encoded;
  }
}

export async function encryptToken(plaintext) {
  if (!plaintext) return '';
  const enc = new TextEncoder();
  const keyData = enc.encode(ENCRYPT_SECRET.padEnd(32, '0').slice(0, 32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return Buffer.from(combined).toString('base64');
}
