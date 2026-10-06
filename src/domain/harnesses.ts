export const harnesses = ['copilot', 'opencode', 'claude-code', 'codex', 'cursor', 'other'] as const
export type Harness = (typeof harnesses)[number]
export const harnessNames: Record<Harness, string> = {
  copilot: 'GitHub Copilot CLI',
  opencode: 'OpenCode',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  other: 'Unrecognized harness',
}

export function harnessForClient(name: string): Harness | null {
  const normalized = name.toLowerCase().replace(/[ _-]+/g, '')
  if (['copilot', 'copilotcli', 'githubcopilot', 'githubcopilotcli'].includes(normalized)) return 'copilot'
  if (normalized === 'opencode') return 'opencode'
  if (normalized === 'claudecode') return 'claude-code'
  if (normalized === 'codex' || normalized === 'codexcli') return 'codex'
  if (normalized === 'cursor' || normalized === 'cursorvscode') return 'cursor'
  return null
}

export function harnessForLink(value: string): Harness | null {
  const url = new URL(value)
  if (['cursor.com', 'www.cursor.com'].includes(url.hostname) && /^\/s\/[^/]+/.test(url.pathname))
    return 'cursor'
  if (url.hostname === 'github.com' && url.pathname.startsWith('/copilot/cli/')) return 'copilot'
  return null
}
