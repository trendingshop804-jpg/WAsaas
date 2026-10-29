// api/_crypto.js
// AES-GCM decryption and encryption utility matching Supabase Edge Functions SubtleCrypto implementation

const ENCRYPT_SECRET = process.env.INTEGRATION_ENCRYPT_SECRET || process.env.META_APP_SECRET || 'change-me-to-32-char-secret!!!!!';

// Tokens pasted by humans often carry junk that makes Meta reject them with a
// bare 401 ("Invalid or expired access token"): surrounding quotes copied from
// a doc, a trailing newline, or a literal "Bearer " prefix that then gets sent
// as "Authorization: Bearer Bearer <token>". Normalise once, at the boundary.
export function normalizeAccessToken(value) {
  let token = String(value || '').trim();
  token = token.replace(/^["']+|["']+$/g, '').trim();
  token = token.replace(/^bearer\s+/i, '').trim();
  return token;
}

function looksLikePlainMetaToken(token) {
  return token.startsWith('EAAV') || token.startsWith('EAA') || token.startsWith('IGQ');
}

// Like decryptToken, but also reports whether decryption FAILED. Callers that
// send the value to Meta must check `decryptFailed`: silently forwarding an
// undecryptable blob produces a misleading "Invalid or expired access token"
// from Meta instead of telling the user to re-save the token.
export async function decryptTokenInfo(encoded) {
  const stored = normalizeAccessToken(encoded);
  if (!stored) return { token: '', decryptFailed: false };

  // Plain unencrypted token (e.g. EAAV...) -> use directly
  if (looksLikePlainMetaToken(stored)) {
    return { token: stored, decryptFailed: false };
  }

  try {
    const rawData = Buffer.from(stored, 'base64');
    // Too short to be iv + ciphertext: treat as a raw value, not a failure.
    if (rawData.length < 13) return { token: stored, decryptFailed: false };

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

    return { token: normalizeAccessToken(dec.decode(plainBuf)), decryptFailed: false };
  } catch (err) {
    // Wrong key / corrupted value. Returning the raw string keeps older
    // callers working, but the failure is flagged for security-sensitive use.
    console.warn('[_crypto] Decrypt failed, returning raw string:', err.message);
    return { token: stored, decryptFailed: true };
  }
}

export async function decryptToken(encoded) {
  if (!encoded) return '';
  return (await decryptTokenInfo(encoded)).token;
}

export async function encryptToken(plaintext) {
  const plain = normalizeAccessToken(plaintext);
  if (!plain) return '';
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
    enc.encode(plain)
  );

  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return Buffer.from(combined).toString('base64');
}
