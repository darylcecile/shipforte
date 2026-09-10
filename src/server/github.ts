import { githubHeaders, userToken } from './auth'
import { HttpError, requireUser, type Context } from './context'
import { canSubmitRepository } from '../domain/repository-access'

export interface Repository {
  id: number
  full_name: string
  private: boolean
  fork: boolean
  default_branch: string
  source?: { id: number }
  owner: { id: number }
  permissions?: { push: boolean }
  installationId: number | null
}

// Public reads never confer ownership or permission to submit a repository.
// Those checks happen separately in verifiedRepository.
export async function githubResponse(token: string, path: string, publicRead = false, timeout = 30_000) {
  const url = `https://api.github.com${path}`
  let response = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(timeout) })
  const permissionFailure = response.status === 403 || response.status === 404
  const rateLimited =
    response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')
  if (publicRead && permissionFailure && !rateLimited) {
    await response.body?.cancel()
    response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(timeout) })
  }
  if (response.ok) return response
  await response.body?.cancel()
  if (response.status === 401) throw new HttpError(401, 'Your GitHub connection expired. Please reconnect.')
  if (
    response.status === 429 ||
    response.headers.get('x-ratelimit-remaining') === '0' ||
    response.headers.has('retry-after')
  ) {
    throw new HttpError(429, 'GitHub is limiting requests. Please try again shortly.')
  }
  if (response.status === 403)
    throw new HttpError(
      403,
      'GitHub could not grant access to this repository. Check your account or organization access.',
    )
  if (response.status === 404)
    throw new HttpError(404, 'Repository or commit not found. Check that the repository is public.')
  if (response.status === 409)
    throw new HttpError(409, 'This repository has no commits yet. Push your project to GitHub first.')
  throw new HttpError(502, 'GitHub could not complete this request. Please try again.')
}

export async function github<T>(token: string, path: string, publicRead = false): Promise<T> {
  const response = await githubResponse(token, path, publicRead)
  return response.json() as Promise<T>
}

function summary(repo: Repository, installationId: number | null): Repository {
  return {
    id: repo.id,
    full_name: repo.full_name,
    private: repo.private,
    fork: repo.fork,
    default_branch: repo.default_branch,
    owner: { id: repo.owner.id },
    source: repo.source ? { id: repo.source.id } : undefined,
    permissions: repo.permissions ? { push: repo.permissions.push } : undefined,
    installationId,
  }
}

async function ownedRepositories(c: Context, token: string) {
  const user = requireUser(c)
  const repos: Repository[] = []
  for (let page = 1; ; page++) {
    const result = await github<Repository[]>(
      token,
      `/users/${encodeURIComponent(user.login)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`,
      true,
    )
    repos.push(
      ...result.filter((r) => !r.private && r.owner.id === user.githubId).map((r) => summary(r, null)),
    )
    if (result.length < 100) break
  }
  return repos
}

async function installedRepositories(c: Context, token: string) {
  const user = requireUser(c)
  const repos: Repository[] = []
  for (let page = 1; ; page++) {
    const { installations } = await github<{ installations: { id: number }[] }>(
      token,
      `/user/installations?per_page=100&page=${page}`,
    )
    for (const installation of installations) {
      for (let repoPage = 1; ; repoPage++) {
        const result = await github<{ repositories: Repository[] }>(
          token,
          `/user/installations/${installation.id}/repositories?per_page=100&page=${repoPage}`,
        )
        repos.push(
          ...result.repositories
            .filter((r) => !r.private && (r.permissions?.push || r.owner.id === user.githubId))
            .map((r) => summary(r, installation.id)),
        )
        if (result.repositories.length < 100) break
      }
    }
    if (installations.length < 100) break
  }
  return repos
}

export async function repositories(c: Context) {
  const token = await userToken(c)
  const [owned, installed] = await Promise.all([ownedRepositories(c, token), installedRepositories(c, token)])
  return [...new Map([...owned, ...installed].map((r) => [r.id, r])).values()]
}

export async function verifiedRepository(c: Context, repoId: number) {
  const user = requireUser(c)
  const token = await userToken(c)
  const repo = await github<Repository>(token, `/repositories/${repoId}`, true)
  if (repo.private) throw new HttpError(400, 'Only public repositories can be submitted.')
  const publicRead = repo.owner.id === user.githubId
  const installed = publicRead ? [] : await installedRepositories(c, token)
  if (
    !canSubmitRepository(
      repo,
      user.githubId,
      installed.map((r) => r.id),
    )
  ) {
    throw new HttpError(
      403,
      'Choose a public repository you own, or connect the GitHub App to an organization repository you can push to.',
    )
  }
  return { repo, token, publicRead }
}

export async function commits(c: Context, repoId: number) {
  const { repo, token, publicRead } = await verifiedRepository(c, repoId)
  return github<{ sha: string; commit: { message: string; author: { date: string } } }[]>(
    token,
    `/repos/${repo.full_name}/commits?per_page=30`,
    publicRead,
  )
}

export function defaultBranchCommit(
  token: string,
  repo: Pick<Repository, 'full_name' | 'default_branch'>,
  publicRead: boolean,
) {
  return github<{ sha: string }>(
    token,
    `/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`,
    publicRead,
  )
}
