import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'

export function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger'

export function Button({ variant = 'default', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 cursor-pointer whitespace-nowrap',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-8 px-3 text-sm',
        size === 'icon' && 'h-8 w-8',
        variant === 'default' && 'bg-muted text-foreground hover:bg-border',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:brightness-110',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'outline' && 'border border-border text-foreground hover:bg-muted',
        variant === 'danger' && 'bg-destructive text-foreground hover:brightness-110',
        className,
      )}
    />
  )
}

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between px-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-1 cursor-pointer items-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90 rtl:rotate-90')} aria-hidden />
          {title}
        </button>
        {right}
      </div>
      {open && <div className="flex flex-col gap-3 px-3 pb-4">{children}</div>}
    </section>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format, coalesce }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number, key?: string) => void; format?: (v: number) => string; coalesce?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="text-muted-foreground">
          {label}
        </label>
        <span className="font-mono tabular-nums text-foreground">{format ? format(value) : value.toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value), coalesce ?? label)} className="w-full" />
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
      <span className="flex flex-col">
        <span className="text-foreground">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-foreground transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </label>
      )}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="h-8 rounded-md border border-border bg-panel-2 px-2 text-sm text-foreground outline-none focus:border-primary">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          aria-label={`${label} hex`}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase())
          }}
          className="h-7 w-20 rounded border border-border bg-panel-2 px-1.5 font-mono text-xs uppercase text-foreground outline-none focus:border-primary"
        />
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7" />
      </div>
    </div>
  )
}

export function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full rounded-md border border-border bg-panel-2 px-2 font-mono text-sm text-foreground outline-none focus:border-primary"
      />
    </div>
  )
}

export function Dialog({ open, title, onClose, children, width = 'max-w-lg', footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('flex max-h-[90vh] w-full flex-col rounded-lg border border-border bg-panel shadow-2xl', width)}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; title?: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-md bg-panel-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 cursor-pointer rounded px-2 py-1 text-xs font-medium transition-colors', value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function formatTime(t: number) {
  if (!isFinite(t)) t = 0
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
