# Notificaciones push — pasos de puesta en marcha

El código del cliente (botón "Activar avisos" en Ajustes, service worker) ya está
desplegado. Falta la parte de servidor, que se hace **una sola vez**.

> ⚠️ La **clave privada VAPID** es un secreto y **no** está en este repositorio
> (es público). Claude te la da por el chat. No la subas a GitHub.

## 1. Crear la tabla de suscripciones
En Supabase → **SQL Editor**, ejecuta el archivo [`migracion_push.sql`](./migracion_push.sql).

## 2. Guardar los secretos de la función
Con la CLI de Supabase (o en Project Settings → Edge Functions → Secrets):

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=BErQV_I3optB_4jta8TUoXnqZUH_kvMp2ZZDQvSmV1yMhSTtF7mZDN4R0mcK1Iz0oF_ixwe7oUE5SRLiVUyEHPo \
  VAPID_PRIVATE_KEY=«TE LA DA CLAUDE POR EL CHAT» \
  VAPID_SUBJECT=mailto:tu-correo@ejemplo.com
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta Supabase; no hay que ponerlos.)

## 3. Desplegar la función
```bash
supabase functions deploy notify-request --no-verify-jwt
```

## 4. Conectar la función a las nuevas solicitudes (Database Webhook)
Supabase → **Database → Webhooks → Create a new hook**:
- **Table:** `public.appointments`
- **Events:** `INSERT`
- **Type:** *Supabase Edge Functions* → `notify-request`
- Guardar.

La función solo actúa cuando la solicitud viene del enlace público (`source = 'public'`),
así que marcar/crear citas dentro de la app no genera avisos.

## 5. Activar en el móvil
En la app: **Ajustes → 🔔 Activar avisos** y acepta el permiso.
- **Android (Chrome):** funciona con la app abierta o cerrada.
- **iPhone (Safari, iOS 16.4+):** primero **añade la app a la pantalla de inicio**
  y ábrela desde ahí; luego activa los avisos.

## 6. Probar
Abre tu enlace de reservas (`/#/reservar/<id>`), envía una cita o un pedido de
prueba → el dispositivo del emprendedor recibe la notificación.

---

### Si al desplegar la función fallara `npm:web-push`
Algunos entornos Deno tienen problemas con esa librería. Si ves errores al enviar,
avísame y cambio la función a un envío de web-push nativo de Deno (sin `npm:`).
