import { supabase } from '../lib/supabase'

// Convierte claves de nivel superior camelCase <-> snake_case.
// Los valores jsonb (items, photos, fields, enabledModules) se dejan intactos.
const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())

export function keysToCamel<T = any>(row: Record<string, any>): T {
  const out: Record<string, any> = {}
  for (const k in row) out[toCamel(k)] = row[k]
  return out as T
}
function keysToSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k in obj) {
    if (obj[k] === undefined) continue
    out[toSnake(k)] = obj[k]
  }
  return out
}

// Lista todas las filas de una tabla para un negocio (camelCase).
export async function apiList<T = any>(table: string, businessId: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').eq('business_id', businessId)
  if (error) throw error
  return (data ?? []).map((r) => keysToCamel<T>(r))
}

// Inserta una fila (inyecta business_id). Devuelve la fila creada (camelCase).
export async function apiInsert<T = any>(table: string, businessId: string, obj: Record<string, any>): Promise<T> {
  const { id: _id, ...rest } = obj
  const payload = { ...keysToSnake(rest), business_id: businessId }
  const { data, error } = await supabase.from(table).insert(payload).select().single()
  if (error) throw error
  return keysToCamel<T>(data)
}

export async function apiInsertMany(table: string, businessId: string, rows: Record<string, any>[]) {
  if (!rows.length) return
  const payload = rows.map(({ id: _id, ...rest }) => ({ ...keysToSnake(rest), business_id: businessId }))
  const { error } = await supabase.from(table).insert(payload)
  if (error) throw error
}

export async function apiUpdate(table: string, id: string, patch: Record<string, any>) {
  const { id: _id, business_id: _b, businessId: _b2, ...rest } = patch
  const payload = keysToSnake(rest)
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  if (error) throw error
}

export async function apiRemove(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function apiRemoveWhere(table: string, column: string, value: string) {
  const { error } = await supabase.from(table).delete().eq(toSnake(column), value)
  if (error) throw error
}
