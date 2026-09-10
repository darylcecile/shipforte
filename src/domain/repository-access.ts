interface RepositoryIdentity {
  id: number
  private: boolean
  owner: { id: number }
}

export function canSubmitRepository(
  repo: RepositoryIdentity,
  githubUserId: number,
  sharedRepositoryIds: number[],
) {
  return !repo.private && (repo.owner.id === githubUserId || sharedRepositoryIds.includes(repo.id))
}
