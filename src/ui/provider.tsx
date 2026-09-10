import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, X, AlertCircle } from 'lucide-react'
import { api, useData } from './api'
import type { bootstrap } from '../server/queries'

type Session = Awaited<ReturnType<typeof bootstrap>>
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {})
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)
  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={(text, error = false) => setToast({ text, error })}>
        {children}
        {toast && (
          <div
            role={toast.error ? 'alert' : 'status'}
            className="fixed right-4 bottom-4 z-50 flex max-w-md items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-xl"
          >
            {toast.error ? (
              <AlertCircle className="mt-0.5 shrink-0 text-accent" size={18} />
            ) : (
              <CheckCircle2 className="mt-0.5 shrink-0 text-green-700" size={18} />
            )}
            <p className="text-sm leading-6">{toast.text}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
              className="p-1 text-muted"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
}
export function useSession() {
  return useData<Session>('bootstrap')
}
export function useAction() {
  const client = useQueryClient()
  const toast = useContext(ToastContext)
  const [pending, setPending] = useState(false)
  async function run<T>(path: string, body: unknown, success?: string): Promise<T | undefined> {
    if (pending) return
    setPending(true)
    try {
      const result = await api<T>(path, body)
      await client.invalidateQueries()
      if (success) toast(success)
      return result
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Something went wrong.', true)
      return undefined
    } finally {
      setPending(false)
    }
  }
  return { run, pending, toast }
}
