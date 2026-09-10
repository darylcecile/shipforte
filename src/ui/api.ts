import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
  )
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('The server could not complete this request. Please try again.')
  }
  const result = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Could not complete this request. Please try again.')
  return result
}
export function useData<T>(
  path: string,
  enabled = true,
  options: Pick<UseQueryOptions<T>, 'refetchOnWindowFocus' | 'refetchInterval'> = {},
) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
    ...options,
  })
}
