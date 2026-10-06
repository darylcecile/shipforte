import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { extract } from 'tar-stream'
import { eq } from 'drizzle-orm'
import { uploads } from '../db/schema'
import { screenshotType } from '../domain/rules'
import { githubResponse } from './github'
import { digest } from './crypto'
import { ensure, HttpError, limitedBody, requireUser, type Context } from './context'
import { readSubmission } from './submission-access'

export interface SnapshotFile {
  path: string
  hash: string
  size: number
  binary: boolean
  lines: number
  type: string
}
export interface Manifest {
  files: SnapshotFile[]
  fingerprint: string
  codeHashes: string[]
}
const maxExpanded = 40 * 1024 * 1024
function byteLimit(limit: number) {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      callback(
        total > limit
          ? new HttpError(
              413,
              'This repository exceeds the 40 MB snapshot limit. Remove generated build output and large assets from Git.',
            )
          : null,
        chunk,
      )
    },
  })
}
function fileType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  return (
    (
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        pdf: 'application/pdf',
      } as Record<string, string>
    )[ext || ''] || 'application/octet-stream'
  )
}
export async function snapshot(
  c: Context,
  repoName: string,
  commit: string,
  token: string,
  publicRead = false,
): Promise<Manifest> {
  const response = await githubResponse(token, `/repos/${repoName}/tarball/${commit}`, publicRead, 120_000)
  if (!response.ok || !response.body)
    throw new HttpError(502, 'Could not download the repository snapshot from GitHub. Please retry.')
  const files: SnapshotFile[] = []
  const codeHashes: string[] = []
  const archive = extract()
  archive.on('entry', (header, stream, next) => {
    async function store() {
      const parts: Buffer[] = []
      let size = 0
      for await (const chunk of stream) {
        if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected archive stream data')
        size += chunk.length
        if (size > 8 * 1024 * 1024)
          throw new HttpError(
            413,
            'Individual repository files must be 8 MB or smaller. Keep large binary assets outside Git.',
          )
        parts.push(chunk)
      }
      const path = header.name.split('/').slice(1).join('/')
      if (!path || header.type === 'directory') return
      if (path.split('/').includes('..') || path.startsWith('/'))
        throw new HttpError(400, 'Invalid repository path.')
      if (files.length >= 5000)
        throw new HttpError(
          413,
          'Repositories may contain up to 5,000 files. Remove vendored dependencies and generated output.',
        )
      const bytes =
        header.type === 'symlink' ? Buffer.from(`Symlink: ${header.linkname}`) : Buffer.concat(parts)
      const hash = await digest(bytes)
      const binary = bytes.includes(0)
      const text = binary ? '' : bytes.toString('utf8')
      if (
        !binary &&
        /\.(tsx?|jsx?|py|rs|go|swift|java|kt|rb|php|vue|svelte|c|cpp|h|html|css|sql)$/.test(path) &&
        bytes.length >= 80
      ) {
        codeHashes.push(await digest(text.replace(/\s+/g, '')))
      }
      files.push({
        path,
        hash,
        size: bytes.length,
        binary,
        lines: text.split('\n').length,
        type: fileType(path),
      })
      await c.env.ASSETS_BUCKET.put(`blobs/${hash}`, bytes)
    }
    store().then(
      () => next(),
      (error) => {
        archive.destroy(error as Error)
      },
    )
  })
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    byteLimit(maxExpanded),
    createGunzip(),
    byteLimit(maxExpanded),
    archive,
  )
  if (!files.length) throw new HttpError(400, 'The submitted repository is empty.')
  files.sort((a, b) => a.path.localeCompare(b.path))
  const fingerprint = await digest(
    files
      .map((f) => f.hash)
      .sort()
      .join('\n'),
  )
  return { files, fingerprint, codeHashes: [...new Set(codeHashes)] }
}
export async function loadManifest(c: Context, key: string) {
  const stored = ensure(await c.env.ASSETS_BUCKET.get(key), 'The code snapshot is temporarily unavailable.')
  return stored.json<Manifest>()
}
export async function uploadScreenshot(c: Context) {
  requireUser(c)
  const max = 10 * 1024 * 1024
  if (Number(c.request.headers.get('Content-Length')) > max + 4096)
    throw new HttpError(413, 'Screenshots must be 10 MB or smaller.')
  const bytesRead = await limitedBody(c.request, max + 16_384)
  const body = await new Response(bytesRead, {
    headers: { 'Content-Type': c.request.headers.get('Content-Type') || '' },
  }).formData()
  const file = body.get('file')
  if (!(file instanceof File) || !file.size || file.size > max)
    throw new HttpError(400, 'Choose a PNG, JPEG, or WebP image up to 10 MB.')
  return saveScreenshot(c, file)
}
export async function saveScreenshot(c: Context, file: File) {
  const user = requireUser(c)
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new HttpError(400, 'Choose a PNG, JPEG, or WebP image up to 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = screenshotType(bytes)
  if (!mime) throw new HttpError(400, 'This file is not a PNG, JPEG, or WebP image.')
  const id = crypto.randomUUID()
  const key = `screenshots/${id}`
  await c.env.ASSETS_BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } })
  try {
    await c.db.insert(uploads).values({
      id,
      userId: user.id,
      key,
      name: file.name.slice(0, 200),
      mime,
      size: file.size,
      createdAt: Date.now(),
    })
  } catch (error) {
    await c.env.ASSETS_BUCKET.delete(key)
    throw error
  }
  return { id, name: file.name, url: `/api/images/${id}` }
}
export async function image(c: Context, id: string) {
  const row = ensure(await c.db.select().from(uploads).where(eq(uploads.id, id)).get())
  if (!row.submissionId && c.user?.id !== row.userId) throw new HttpError(404, 'Image not found.')
  const submission = row.submissionId ? await readSubmission(c, row.submissionId) : null
  const stored = ensure(await c.env.ASSETS_BUCKET.get(row.key))
  return new Response(stored.body, {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control':
        submission?.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
