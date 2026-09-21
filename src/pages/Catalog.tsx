import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Item, type ItemKind } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, moneyPlain } from '../lib/format'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState } from '../components/ui'

interface CatalogConfig {
  kind: ItemKind
  title: string
  singular: string
  stockByDefault: boolean
}

const MERCADO_SEMU_URL = 'https://mercadosemu.com'

function publishToSemu(it: Item) {
  const params = new URLSearchParams({ from: 'gemprende', title: it.name })
  if (it.price) params.set('price', String(it.price))
  const desc = it.notes || it.category || ''
  if (desc) params.set('desc', desc)
  window.open(`${MERCADO_SEMU_URL}/vender?${params.toString()}`, '_blank', 'noopener')
}

function ItemForm({ cfg, existing, onDone }: { cfg: CatalogConfig; existing?: Item; onDone: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    price: existing?.price ? String(existing.price) : '',
    category: existing?.category ?? '',
    unit: existing?.unit ?? '',
    trackStock: existing?.trackStock ?? cfg.stockByDefault,
    stock: existing?.stock ? String(existing.stock) : '',
    lowStock: existing?.lowStock ? String(existing.lowStock) : '',
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    const rec = {
      kind: cfg.kind,
      name: form.name.trim(),
      price: Number(form.price) || 0,
      category: form.category.trim(),
      unit: form.unit.trim(),
      trackStock: form.trackStock,
      stock: Number(form.stock) || 0,
      lowStock: Number(form.lowStock) || 0,
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.items.update(existing.id, rec)
    else await ldb.items.add(rec as Item)
    onDone()
  }

  return (
    <div className="space-y-4">
      <Field label="Nombre *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={cfg.singular} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio"><Input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" /></Field>
        <Field label="Unidad"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="unidad, kg, corte…" /></Field>
      </div>
      <Field label="Categoría"><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Opcional" /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.trackStock} onChange={(e) => set('trackStock', e.target.checked)} />
        Controlar stock (existencias)
      </label>
      {form.trackStock && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Existencias actuales"><Input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} placeholder="0" /></Field>
          <Field label="Aviso si baja de"><Input type="number" value={form.lowStock} onChange={(e) => set('lowStock', e.target.value)} placeholder="0" /></Field>
        </div>
      )}
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1" disabled={!form.name.trim()}>{existing ? 'Guardar' : 'Añadir'}</Button>
      </div>
    </div>
  )
}

export default function Catalog({ cfg }: { cfg: CatalogConfig }) {
  const bid = useBusiness().current?.id ?? ''
  const { canDelete } = usePerms()
  const items = useLiveQuery(() => (bid ? ldb.items.where('businessId').equals(bid).filter((i) => i.kind === cfg.kind).toArray() : []), [bid, cfg.kind])
  const [modal, setModal] = useState<null | { item?: Item }>(null)
  const [query, setQuery] = useState('')

  const list = useMemo(
    () => (items ?? []).filter((i) => !query || `${i.name} ${i.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [items, query],
  )

  if (!items) return <div className="text-slate-400">Cargando…</div>

  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este elemento?')) await removeRow('items', id)
  }
  async function adjust(it: Item, delta: number) {
    if (!it.id) return
    await ldb.items.update(it.id, { stock: Math.max(0, (it.stock || 0) + delta) })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{cfg.title}</h1>
        <Button onClick={() => setModal({})}>+ Nuevo {cfg.singular.toLowerCase()}</Button>
      </div>

      <Card><Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} /></Card>

      {cfg.kind !== 'ingredient' && list.length > 0 && (
        <p className="text-xs text-slate-400">🏪 Pulsa el icono de tienda en un artículo para publicarlo en <b>Mercado Semu</b>.</p>
      )}

      {list.length === 0 ? (
        <EmptyState title={`Sin ${cfg.title.toLowerCase()}`} hint={`Añade tu primer ${cfg.singular.toLowerCase()}.`} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => {
                const low = it.trackStock && it.lowStock > 0 && it.stock <= it.lowStock
                return (
                  <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{it.name}</div>
                      <div className="text-xs text-slate-400">{[it.category, it.unit].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{it.price ? money(it.price) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {it.trackStock ? (
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => adjust(it, -1)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 hover:bg-slate-200">−</button>
                          <span className={`w-10 text-center font-medium ${low ? 'text-red-600' : 'text-slate-700'}`}>{moneyPlain(it.stock)}</span>
                          <button onClick={() => adjust(it, 1)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 hover:bg-slate-200">+</button>
                          {low && <span title="Stock bajo">⚠️</span>}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {cfg.kind !== 'ingredient' && (
                        <button onClick={() => publishToSemu(it)} className="mr-2 text-slate-400 hover:text-teal-600" title="Publicar en Mercado Semu">🏪</button>
                      )}
                      <button onClick={() => setModal({ item: it })} className="mr-2 text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                      {canDelete && <button onClick={() => remove(it.id)} className="text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.item ? `Editar ${cfg.singular.toLowerCase()}` : `Nuevo ${cfg.singular.toLowerCase()}`}>
        {modal && <ItemForm cfg={cfg} existing={modal.item} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}

export const CATALOG_SERVICES: CatalogConfig = { kind: 'service', title: 'Servicios', singular: 'Servicio', stockByDefault: false }
export const CATALOG_PRODUCTS: CatalogConfig = { kind: 'product', title: 'Productos', singular: 'Producto', stockByDefault: true }
export const CATALOG_INGREDIENTS: CatalogConfig = { kind: 'ingredient', title: 'Ingredientes', singular: 'Ingrediente', stockByDefault: true }
