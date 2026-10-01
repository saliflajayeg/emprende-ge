import { supabase } from './supabase'

// Clave PÚBLICA VAPID (no es secreta; identifica a quién envía el push). La
// privada vive solo en la Edge Function de Supabase.
export const VAPID_PUBLIC_KEY = 'BErQV_I3optB_4jta8TUoXnqZUH_kvMp2ZZDQvSmV1yMhSTtF7mZDN4R0mcK1Iz0oF_ixwe7oUE5SRLiVUyEHPo'

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied'

export function pushSupported(): boolean {
  try {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  } catch {
    return false
  }
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushState
}

// ¿Hay ya una suscripción activa en este dispositivo?
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Activa los avisos: pide permiso, se suscribe y guarda la suscripción en la nube.
export async function enablePush(businessId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: perm }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, reason: 'invalid-subscription' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      business_id: businessId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

// Desactiva los avisos en este dispositivo.
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
  } catch { /* */ }
}
