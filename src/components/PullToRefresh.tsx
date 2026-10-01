import { useEffect, useRef, useState, type ReactNode } from 'react'

// Deslizar hacia abajo para refrescar (como en redes sociales). Solo se activa
// cuando la página está arriba del todo. Llama a onRefresh (p. ej. sincronizar).
const DEADZONE = 24 // px iniciales que se ignoran (para no reaccionar a un desliz normal)
const THRESHOLD = 110 // "altura" del tirón necesaria para disparar el refresco (tirón fuerte)
const MAX = 150 // tope visual del tirón
const FOLLOW = 0.5 // resistencia: el indicador avanza la mitad de lo que mueve el dedo

export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const [dist, setDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      // Solo si estamos arriba del todo y no hay ya un refresco en curso.
      if (window.scrollY <= 0 && !refreshing && e.touches.length === 1) {
        startY.current = e.touches[0].clientY
        active.current = true
      } else {
        active.current = false
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      // Solo cuenta a partir de la zona muerta: así un desliz normal no lo activa.
      if (dy > DEADZONE && window.scrollY <= 0) {
        // Resistencia: cuanto más tiras, menos avanza (sensación física).
        const d = Math.min(MAX, (dy - DEADZONE) * FOLLOW)
        setDist(d)
        if (d > 4 && e.cancelable) e.preventDefault() // evita el rebote nativo
      } else {
        setDist(0)
      }
    }
    const onEnd = async () => {
      if (!active.current) return
      active.current = false
      startY.current = null
      if (dist >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        setDist(THRESHOLD)
        try { await onRefresh() } catch { /* */ }
        // Deja ver el spinner un instante para que no parpadee.
        setTimeout(() => { setRefreshing(false); setDist(0) }, 400)
      } else {
        setDist(0)
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [dist, refreshing, onRefresh])

  const progress = Math.min(1, dist / THRESHOLD)
  const show = dist > 0 || refreshing
  const ready = dist >= THRESHOLD || refreshing // tirón suficiente: listo para soltar

  return (
    <>
      {/* Indicador del tirón */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
        style={{ transform: `translateY(${show ? Math.max(8, dist - 28) : -40}px)`, transition: active.current ? 'none' : 'transform 0.2s ease-out', opacity: show ? 1 : 0 }}
      >
        {/* Cuando el tirón es suficiente, el círculo se pone verde: "suelta para actualizar". */}
        <div className={`grid h-9 w-9 place-items-center rounded-full shadow-md ring-1 ring-black/5 transition-colors ${ready ? 'bg-teal-600' : 'bg-white'}`}>
          <span
            className={ready ? 'text-white' : 'text-slate-400'}
            style={{
              display: 'inline-block',
              transform: `rotate(${refreshing ? 0 : progress * 270}deg)`,
              animation: refreshing ? 'ge-spin 0.8s linear infinite' : 'none',
            }}
          >
            ↻
          </span>
        </div>
      </div>

      {/* Contenido, que se desplaza con el tirón */}
      <div style={{ transform: `translateY(${dist}px)`, transition: active.current ? 'none' : 'transform 0.2s ease-out' }}>
        {children}
      </div>
    </>
  )
}
