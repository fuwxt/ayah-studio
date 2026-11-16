import { useEffect } from 'react'
import { CheckCircle2, Info, AlertTriangle, Loader2 } from 'lucide-react'
import { useStudio } from '../lib/store'
import { cn } from './ui'

export function Toast() {
  const toast = useStudio((s) => s.toast)
  const set = useStudio((s) => s.set)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => set({ toast: null }), toast.kind === 'error' ? 7000 : 4000)
    return () => clearTimeout(id)
  }, [toast, set])
  if (!toast) return null
  const Icon = toast.kind === 'error' ? AlertTriangle : toast.kind === 'success' ? CheckCircle2 : Info
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[60] flex max-w-xl -translate-x-1/2 items-start gap-2 rounded-lg border border-border bg-panel-2 px-4 py-3 text-sm shadow-2xl">
      <Icon className={cn('mt-0.5 size-4 shrink-0', toast.kind === 'error' ? 'text-destructive' : 'text-primary')} aria-hidden />
      <span className="text-pretty break-words text-foreground">{toast.msg}</span>
    </div>
  )
}

export function BusyOverlay() {
  const busy = useStudio((s) => s.busy)
  if (!busy) return null
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-background/70 backdrop-blur-sm" aria-busy="true">
      <div className="flex w-80 flex-col items-center gap-3 rounded-lg border border-border bg-panel p-6 text-center">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-foreground">{busy.label}</p>
        {busy.progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(busy.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
