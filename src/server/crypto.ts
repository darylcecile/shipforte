import { HttpError } from './context'

export function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}
export async function digest(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : Uint8Array.from(value)
  return Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
}
async function encryptionKey(secret?: string) {
  if (!secret) throw new HttpError(503, 'GitHub connection is being configured. Please try again shortly.')
  const key = Buffer.from(secret, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must contain 32 base64-encoded bytes')
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encrypt(value: string, secret?: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(secret),
    new TextEncoder().encode(value),
  )
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(data).toString('base64')}`
}
export async function decrypt(value: string, secret?: string) {
  const [iv, body] = value.split('.')
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    await encryptionKey(secret),
    Buffer.from(body, 'base64'),
  )
  return new TextDecoder().decode(data)
}
