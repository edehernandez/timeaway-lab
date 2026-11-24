// Purpose: password storage and checking (D-004, D-014, REQ-015) — scrypt hashes from node:crypto with a random salt
// per hash, compared in constant time; a password is kept exactly as typed (no trimming, no Unicode folding).
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// scrypt parameters (RFC 7914): N=2^15, r=8, p=1, a 32-byte key and a 16-byte salt (D-004, D-032).
const N = 32768
const R = 8
const P = 1
const KEYLEN = 32
const OPTIONS: ScryptOptions = { N, r: R, p: P, maxmem: 128 * N * R * 2 }

function derive(password: string, salt: Buffer, opts: ScryptOptions, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(password, 'utf8'), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** A stored form of `password`: "scrypt$N$r$p$<salt b64url>$<key b64url>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, OPTIONS, KEYLEN)
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

// A stored form no password matches, checked when no account answers an email, so an unknown email costs the same
// time as a known one (ROW-235).
let decoy: Promise<string> | null = null
function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(24).toString('base64url'))
  return decoy
}

/** True when `password` is exactly the one `stored` was made from. With stored === null, checks a decoy and answers false. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const form = stored ?? (await decoyHash())
  const parts = form.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltText, keyText] = parts
  const expected = Buffer.from(keyText, 'base64url')
  const opts: ScryptOptions = { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 }
  const key = await derive(password, Buffer.from(saltText, 'base64url'), opts, expected.length)
  return stored !== null && key.length === expected.length && timingSafeEqual(key, expected)
}

/**
 * The rule for a new password (D-014): a string that is not blank (white space only counts as blank, ROW-232) and is
 * at least 8 characters long; kept exactly as typed. Answers the refusal's plain message, or null when it is fine.
 */
export function newPasswordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.trim() === '') return 'A password cannot be blank.'
  const length = [...password].length
  if (length < 8) return 'A password needs at least 8 characters.'
  if (length > 200) return 'A password can be at most 200 characters.'
  return null
}
