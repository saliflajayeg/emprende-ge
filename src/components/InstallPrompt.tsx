import { useEffect, useState } from 'react'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'emprende-install-dismissed'

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Si ya está instalada (modo standalone), no mostrar nada
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS
      window.navigator.standalone === true
    if (standalone) return

    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      /* sin localStorage */
    }
    if (dismissed) return

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setShow(false)
    setDeferred(null)
  }

  if (!show || !deferred) return null

  return (
    <div className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-teal-200 bg-white p-3 shadow-lg sm:left-auto sm:right-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-600 font-bold text-white">E</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800">Instala EmprendeGE</div>
          <div className="text-xs text-slate-500">Ábrela como app desde tu pantalla de inicio, funciona sin conexión.</div>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={install} className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
          📲 Instalar
        </button>
        <button onClick={dismiss} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
          Ahora no
        </button>
      </div>
    </div>
  )
}
