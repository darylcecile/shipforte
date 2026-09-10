import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { z } from 'zod'

const schema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_SLUG: z.string().regex(/^[a-z0-9-]+$/),
  GITHUB_WEBHOOK_SECRET: z.string().min(20),
  MODERATOR_GITHUB_IDS: z.string().regex(/^\d+(,\s*\d+)*$/),
})
const path = process.argv[2]
if (!path) throw new Error('Usage: pnpm github:configure /path/to/.dev.vars-or-github-config.json')
const contents = await readFile(path, 'utf8')
const config = schema.parse(contents.trimStart().startsWith('{') ? JSON.parse(contents) : parseEnv(contents))
const existing = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'list'], { encoding: 'utf8' })
if (existing.status !== 0)
  throw new Error('Could not inspect Worker secrets. Run wrangler login and deploy the Worker first.')
const secrets = JSON.parse(existing.stdout) as { name: string }[]
const values: Record<string, string> = { ...config }
if (!secrets.some((s) => s.name === 'TOKEN_ENCRYPTION_KEY'))
  values.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
const result = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'bulk'], {
  input: JSON.stringify(values),
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
})
if (result.status !== 0) {
  console.error(result.stderr)
  process.exit(1)
}
console.log('GitHub configuration saved to Cloudflare. Existing token encryption keys were preserved.')
