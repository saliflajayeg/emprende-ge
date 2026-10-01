// Edge Function: avisa por push al emprendedor (dueño + empleados) cuando entra
// una solicitud pública (cita o pedido) desde el enlace de reservas.
//
// Se dispara con un Database Webhook sobre INSERT en public.appointments.
// Desplegar con:  supabase functions deploy notify-request --no-verify-jwt
// Secretos necesarios: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los inyecta Supabase).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@gemprende.app'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    // El webhook envía { type, table, record, old_record }. Aceptamos también
    // que nos pasen el registro directamente.
    const record = body.record ?? body
    if (!record || record.source !== 'public') {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    const businessId = record.business_id
    if (!businessId) return new Response(JSON.stringify({ skipped: 'no-business' }), { status: 200 })

    // Destinatarios: dueño + miembros del negocio.
    const [{ data: members }, { data: biz }] = await Promise.all([
      supabase.from('members').select('user_id').eq('business_id', businessId),
      supabase.from('businesses').select('owner_id, name').eq('id', businessId).maybeSingle(),
    ])
    const userIds = new Set<string>((members ?? []).map((m: { user_id: string }) => m.user_id))
    if (biz?.owner_id) userIds.add(biz.owner_id)
    if (userIds.size === 0) return new Response(JSON.stringify({ skipped: 'no-users' }), { status: 200 })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', [...userIds])

    if (!subs || subs.length === 0) return new Response(JSON.stringify({ skipped: 'no-subs' }), { status: 200 })

    const isPedido = String(record.service ?? '').toLowerCase().startsWith('pedido')
    const title = biz?.name ? `Nueva solicitud · ${biz.name}` : 'Nueva solicitud'
    const who = record.client_name || 'Un cliente'
    const when = record.date ? ` para el ${record.date}` : ''
    const bodyText = isPedido ? `${who} ha hecho un pedido${when}.` : `${who} ha pedido una cita${when}.`
    const payload = JSON.stringify({ title, body: bodyText, url: '/#/', tag: `solicitud-${businessId}` })

    let sent = 0
    await Promise.all(
      subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          )
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          // Suscripción caducada o inválida → la borramos.
          if (code === 404 || code === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
        }
      }),
    )

    return new Response(JSON.stringify({ ok: true, sent }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 })
  }
})
