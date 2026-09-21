import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Item } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, moneyPlain } from '../lib/format'
import { Card, Input, StatCard, EmptyState } from '../components/ui'

const KIND_LABEL: Record<string, string> = { product: 'Producto', ingredient: 'Ingrediente', service: 'Servicio' }

export default function Stock() {
  const bid = useBusiness().current?.id ?? ''
  const items = useLiveQuery(
    () => (bid ? ldb.items.where('businessId').equals(bid).filter((i) => i.trackStock).toArray() : []),
    [bid],
  )
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    return (items ?? [])
      .filter((i) => !query || `${i.name} ${i.category}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const la = a.lowStock > 0 && a.stock <= a.lowStock ? 0 : 1
        const lb = b.lowStock > 0 && b.stock <= b.lowStock ? 0 : 1
        return la - lb || a.name.localeCompare(b.name)
      })
  }, [items, query])

  if (!items) return <div className="text-slate-400">Cargando…</div>

  const lowCount = items.filter((i) => i.lowStock > 0 && i.stock <= i.lowStock).length
  const stockValue = items.reduce((s, i) => s + i.stock * i.price, 0)

  async function adjust(it: Item, delta: number) {
    if (!it.id) return
    await ldb.items.update(it.id, { stock: Math.max(0, (it.stock || 0) + delta) })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Stock</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Artículos con stock" value={String(items.length)} />
        <StatCard label="Stock bajo" value={String(lowCount)} tone={lowCount ? 'bad' : 'good'} />
        <StatCard label="Valor del stock" value={money(stockValue)} />
      </div>

      <Card>
        <Input placeholder="Buscar artículo…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Card>

      {list.length === 0 ? (
        <EmptyState
          title="Sin artículos con stock"
          hint="Activa «Controlar stock» en un producto o ingrediente para verlo aquí."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3 text-center">Existencias</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => {
                const low = it.lowStock > 0 && it.stock <= it.lowStock
                return (
                  <tr key={it.id} className={`border-b border-slate-100 last:border-0 ${low ? 'bg-red-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{it.name}</div>
                      <div className="text-xs text-slate-400">{KIND_LABEL[it.kind]}{it.unit ? ` · ${it.unit}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => adjust(it, -1)} className="grid h-7 w-7 place-items-center rounded bg-slate-100 hover:bg-slate-200">−</button>
                        <span className={`w-12 text-center font-semibold ${low ? 'text-red-600' : 'text-slate-800'}`}>{moneyPlain(it.stock)}</span>
                        <button onClick={() => adjust(it, 1)} className="grid h-7 w-7 place-items-center rounded bg-slate-100 hover:bg-slate-200">+</button>
                        {low && <span title="Stock bajo" className="ml-1">⚠️</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{it.price ? money(it.stock * it.price) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
