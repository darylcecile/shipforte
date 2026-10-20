import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'
import { pack } from 'tar-stream'
import { HttpError, type Context } from '../server/context'
import { snapshot } from '../server/snapshots'

async function tarball(contents: Buffer[]) {
  const archive = pack()
  contents.forEach((bytes, index) => archive.entry({ name: `repo/file-${index}.bin` }, bytes))
  archive.finalize()
  const chunks: Buffer[] = []
  for await (const chunk of archive) {
    assert.ok(Buffer.isBuffer(chunk))
    chunks.push(chunk)
  }
  return gzipSync(Buffer.concat(chunks))
}

function bucket(put: (key: string, bytes: Uint8Array) => Promise<void>) {
  return { env: { ASSETS_BUCKET: { put } } } as unknown as Context
}

function download(t: TestContext, bytes: Buffer, stall = false) {
  const state = { signal: undefined as AbortSignal | undefined, readBytes: 0 }
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    state.signal = init?.signal ?? undefined
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          state.signal?.addEventListener('abort', () => controller.error(state.signal?.reason), {
            once: true,
          })
        },
        pull(controller) {
          if (state.readBytes < bytes.length) {
            const end = Math.min(state.readBytes + 4096, bytes.length)
            controller.enqueue(bytes.subarray(state.readBytes, end))
            state.readBytes = end
          } else if (!stall) controller.close()
        },
      }),
    )
  })
  return state
}

function shortDownloadTimeout(t: TestContext) {
  const original = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, milliseconds?: number) =>
    original(callback, milliseconds === 120_000 ? 50 : milliseconds),
  )
  // Keep native AbortSignal deadlines on the same accelerated clock for the regression case.
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds)
    return controller.signal
  })
}

test('snapshot storage backpressure is bounded and does not consume the download deadline', async (t) => {
  const unique = Array.from({ length: 6 }, () => randomBytes(256 * 1024))
  const contents = [unique[0], unique[0], ...unique.slice(1), unique[0]]
  const bytes = await tarball(contents)
  shortDownloadTimeout(t)
  const network = download(t, bytes)
  let active = 0
  let maxActive = 0
  let pausedBeforeDownloadFinished = false
  const started = new Set<string>()
  const stored = new Map<string, Buffer>()
  const manifest = await snapshot(
    bucket(async (key, value) => {
      assert.equal(started.has(key), false, 'Repeated contents must be uploaded only once per snapshot')
      started.add(key)
      active++
      maxActive = Math.max(maxActive, active)
      if (active === 4) pausedBeforeDownloadFinished ||= network.readBytes < bytes.length
      await delay(100)
      stored.set(key, Buffer.from(value))
      active--
    }),
    'owner/repo',
    'commit',
    'token',
  )
  assert.equal(network.signal?.aborted, false)
  assert.equal(pausedBeforeDownloadFinished, true)
  assert.equal(maxActive, 4)
  assert.equal(active, 0, 'Manifest must wait for every blob write')
  assert.equal(stored.size, unique.length)
  assert.equal(manifest.files.length, contents.length)
  for (const [index, bytes] of contents.entries()) {
    const file = manifest.files[index]
    const hash = createHash('sha256').update(bytes).digest('hex')
    assert.deepEqual(file, {
      path: `file-${index}.bin`,
      hash,
      size: bytes.length,
      binary: true,
      lines: 1,
      type: 'application/octet-stream',
    })
    assert.deepEqual(stored.get(`blobs/${hash}`), bytes)
  }
})

for (const phase of ['headers', 'body']) {
  test(`stalled GitHub ${phase} produce an actionable 504`, async (t) => {
    shortDownloadTimeout(t)
    if (phase === 'body') download(t, Buffer.alloc(0), true)
    else
      t.mock.method(
        globalThis,
        'fetch',
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
          }),
      )
    await assert.rejects(
      snapshot(
        bucket(async () => assert.fail('No files should be stored')),
        'owner/repo',
        'commit',
        'token',
      ),
      (error: unknown) => error instanceof HttpError && error.status === 504 && /retry/i.test(error.message),
    )
  })
}

test('R2 failure aborts an unfinished download and waits for the other started writes', async (t) => {
  const bytes = await tarball(Array.from({ length: 8 }, () => randomBytes(128 * 1024)))
  const network = download(t, bytes, true)
  const failure = new Error('R2 is unavailable')
  let active = 0
  let writes = 0
  let activeAtAbort = 0
  let releaseFailure!: () => void
  const saturated = new Promise<void>((resolve) => {
    releaseFailure = resolve
  })
  const result = snapshot(
    bucket(async () => {
      const first = writes++ === 0
      active++
      if (writes === 4) releaseFailure()
      try {
        if (first) {
          await saturated
          throw failure
        }
        await delay(20)
      } finally {
        active--
      }
    }),
    'owner/repo',
    'commit',
    'token',
  )
  network.signal?.addEventListener('abort', () => {
    activeAtAbort = active
  })
  await assert.rejects(result, (error: unknown) => error === failure)
  assert.equal(network.signal?.aborted, true)
  assert.ok(activeAtAbort > 0, 'Download cancellation must not wait for the other R2 writes')
  assert.equal(active, 0)
  assert.equal(writes, 4)
})
