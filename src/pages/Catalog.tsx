import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Item, type ItemKind } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, moneyPlain } from '../lib/format'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState, IconButton } from '../components/ui'
import { Plus, Minus, MagnifyingGlass, Storefront, Trash } from '@phosphor-icons/react'

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
    if (!id || !confirm('¿Eliminar este elemento?')) return false
    await removeRow('items', id)
    return true
  }
  async function adjust(it: Item, delta: number) {
    if (!it.id) return
    await ldb.items.update(it.id, { stock: Math.max(0, (it.stock || 0) + delta) })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight text-slate-900">{cfg.title}</h1>
          <p className="text-sm text-slate-500">{items.length} en tu lista</p>
        </div>
        <Button onClick={() => setModal({})} className="shrink-0"><Plus size={18} weight="bold" /> Nuevo</Button>
      </div>

      {items.length > 0 && (
        <div className="relative">
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
      )}

      {cfg.kind !== 'ingredient' && list.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Storefront size={16} weight="duotone" className="shrink-0 text-teal-700" /><span>Pulsa la tienda para publicar un artículo en <b>Mercado Semu</b>.</span></p>
      )}

      {list.length === 0 ? (
        <EmptyState
          title={items.length ? 'Nada con ese nombre' : `Añade tus ${cfg.title.toLowerCase()}`}
          hint={items.length ? 'Prueba con otra palabra.' : `Con tus ${cfg.title.toLowerCase()} y precios guardados, hacer una factura es tocar y listo.`}
          action={items.length ? undefined : <Button onClick={() => setModal({})}><Plus size={18} weight="bold" /> Nuevo {cfg.singular.toLowerCase()}</Button>}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {list.map((it) => {
              const low = it.trackStock && it.lowStock > 0 && it.stock <= it.lowStock
              return (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setModal({ item: it })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 font-display text-base font-bold text-teal-800">
                      {it.name.trim().slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-slate-900">{it.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        <span className="ge-nums font-semibold text-slate-700">{it.price ? money(it.price) : 'Sin precio'}</span>
                        {[it.unit && `/ ${it.unit}`, it.category].filter(Boolean).map((x) => ` · ${x}`).join('')}
                      </span>
                    </span>
                  </button>
                  {it.trackStock && (
                    <div className={`flex shrink-0 items-center rounded-xl ring-1 ${low ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200'}`}>
                      <button onClick={() => adjust(it, -1)} aria-label="Quitar uno" className="grid h-9 w-8 place-items-center text-slate-600 active:scale-90"><Minus size={14} weight="bold" /></button>
                      <span className={`ge-nums min-w-7 text-center text-sm font-bold ${low ? 'text-red-600' : 'text-slate-800'}`} title={low ? 'Quedan pocos' : 'Existencias'}>{moneyPlain(it.stock)}</span>
                      <button onClick={() => adjust(it, 1)} aria-label="Añadir uno" className="grid h-9 w-8 place-items-center text-slate-600 active:scale-90"><Plus size={14} weight="bold" /></button>
                    </div>
                  )}
                  <div className="flex shrink-0">
                    {cfg.kind !== 'ingredient' && (
                      <IconButton onClick={() => publishToSemu(it)} title="Publicar en Mercado Semu" className="text-teal-700"><Storefront size={20} weight="duotone" /></IconButton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.item ? `Editar ${cfg.singular.toLowerCase()}` : `Nuevo ${cfg.singular.toLowerCase()}`}>
        {modal && <ItemForm cfg={cfg} existing={modal.item} onDone={() => setModal(null)} />}
        {modal?.item && canDelete && (
          <button onClick={async () => { if (await remove(modal.item?.id)) setModal(null) }} className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-semibold text-red-600">
            <Trash size={16} /> Eliminar {cfg.singular.toLowerCase()}
          </button>
        )}
      </Modal>
    </div>
  )
}

export const CATALOG_SERVICES: CatalogConfig = { kind: 'service', title: 'Servicios', singular: 'Servicio', stockByDefault: false }
export const CATALOG_PRODUCTS: CatalogConfig = { kind: 'product', title: 'Productos', singular: 'Producto', stockByDefault: true }
export const CATALOG_INGREDIENTS: CatalogConfig = { kind: 'ingredient', title: 'Ingredientes', singular: 'Ingrediente', stockByDefault: true }
