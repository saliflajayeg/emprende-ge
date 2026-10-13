import { useEffect, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

// Superficie base: blanca, esquinas suaves y sombra tintada cálida (sin borde duro).
const surface = 'rounded-2xl bg-white shadow-[0_1px_2px_rgba(43,39,34,0.05),0_8px_24px_-12px_rgba(43,39,34,0.16)] ring-1 ring-slate-200/70'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${surface} p-4 ${className}`}>{children}</div>
}

export function StatCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad'
  hint?: string
}) {
  const toneClass = tone === 'good' ? 'text-teal-700' : tone === 'bad' ? 'text-red-600' : 'text-slate-900'
  return (
    <Card>
      <div className="truncate text-xs font-semibold text-slate-500">{label}</div>
      <div className={`ge-nums mt-1 break-words text-xl font-extrabold leading-tight sm:text-2xl ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  )
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  className = '',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost' | 'danger' | 'outline'
  className?: string
  disabled?: boolean
}) {
  const styles: Record<string, string> = {
    primary: 'bg-teal-700 text-white shadow-[0_6px_16px_-6px_rgba(15,118,110,0.55)] hover:bg-teal-800',
    ghost: 'text-slate-600 hover:bg-slate-100',
    outline: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white shadow-[0_6px_16px_-6px_rgba(220,38,38,0.5)] hover:bg-red-700',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// Botón de icono para acciones de fila (editar, borrar, marcar…). Área de toque
// cómoda (~40px) y respuesta al pulsar; el color se pasa por className.
export function IconButton({
  children,
  onClick,
  title,
  className = 'text-slate-400 hover:text-teal-700',
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-[color,background-color,transform] duration-100 ease-out hover:bg-slate-100 active:scale-90 ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

// 16px en el móvil: así iPhone no hace zoom al tocar un campo.
const inputCls =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15 sm:text-sm'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

// Ventana: en el móvil es una hoja que sube desde abajo y ocupa casi toda la
// pantalla (por encima de la barra inferior); en ordenador, un diálogo centrado.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  // Bloquea el scroll de la página mientras está abierta
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="ge-scrim fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ge-sheet flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 sm:hidden"><div className="h-1.5 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-2 sm:pt-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition-transform hover:text-slate-800 active:scale-90" aria-label="Cerrar">
            <X size={18} weight="bold" />
          </button>
        </div>
        {/* Sin padding inferior en el contenedor que hace scroll: así una barra fija
            (sticky bottom-0) de un formulario queda pegada al borde real. */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
          <div className="pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function Badge({ status }: { status: 'paid' | 'pending' }) {
  return status === 'paid' ? (
    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Pagado</span>
  ) : (
    <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Pendiente</span>
  )
}

// Estado vacío con ilustración opcional y una acción: invita, no se disculpa.
export function EmptyState({ title, hint, image, action }: { title: string; hint?: string; image?: string; action?: ReactNode }) {
  return (
    <div className={`${surface} flex flex-col items-center px-6 py-8 text-center`}>
      {image && <img src={image} alt="" className="mb-4 h-40 w-auto max-w-full select-none object-contain" draggable={false} />}
      <p className="font-display text-lg font-bold text-slate-800">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
