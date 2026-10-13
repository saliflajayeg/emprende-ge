import { ldb, type Category, type Contact, type Invoice, type Item, type Transaction } from './localdb'
import { addInvoicePayment, syncInvoiceLedger } from '../lib/invoiceLedger'

// ============================================================
//  MODO DEMO — SOLO EN DESARROLLO (npm run dev). Sirve para revisar el diseño
//  con datos realistas sin tocar Supabase. En producción DEMO es siempre false.
//  Activar:  http://localhost:3050/?demo   (se recuerda en este navegador)
//  Salir:    http://localhost:3050/?nodemo
// ============================================================

function detect(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    const q = location.search
    if (q.includes('nodemo')) localStorage.removeItem('ge-demo')
    else if (q.includes('demo')) localStorage.setItem('ge-demo', '1')
    return localStorage.getItem('ge-demo') === '1'
  } catch {
    return false
  }
}

export const DEMO = detect()
export const DEMO_USER_ID = 'demo-user'
export const DEMO_BIZ_ID = 'demo-biz-0001'

export const DEMO_BUSINESS = {
  id: DEMO_BIZ_ID,
  ownerId: DEMO_USER_ID,
  name: 'Buñuelos Mama Rosa',
  ownerName: 'Rosa Nchama',
  sector: 'Puesto de comida',
  businessType: 'foodstall',
  enabledModules: null,
  currency: 'XAF',
  phone: '+240 222 418 307',
  address: 'Mercado de Banapá, Malabo',
  taxRate: 0,
  recordsLabel: 'Fichas',
  logo: null,
  createdAt: '2026-01-10T09:00:00.000Z',
}

const iso = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

// Rellena la base local con un negocio de ejemplo (una sola vez).
export async function seedDemo(bid: string) {
  if (!DEMO || bid !== DEMO_BIZ_ID) return
  if ((await ldb.invoices.where('businessId').equals(bid).count()) > 0) return

  const products: [string, number][] = [['Buñuelos (docena)', 1000], ['Bocadillo de huevo', 1000], ['Bocadillo de sardina', 1500], ['Zumo de bisap', 500], ['Té con leche', 300]]
  for (const [name, price] of products) {
    await ldb.items.add({ kind: 'product', name, price, category: '', unit: '', trackStock: false, stock: 0, lowStock: 0, notes: '', createdAt: new Date().toISOString() } as Item)
  }
  const people: [string, string][] = [['Juana Mbá', '+240 222 310 455'], ['Pedro Nguema', '+240 555 207 118'], ['Marta Obiang', '+240 222 684 902'], ['Ana Bindang', '+240 551 093 274'], ['Lucía Esono', '+240 222 775 630']]
  const ids: string[] = []
  for (const [name, phone] of people) {
    ids.push((await ldb.contacts.add({ type: 'client', name, phone, email: '', notes: '', createdAt: new Date().toISOString() } as Contact)) as string)
  }
  const cats: [string, string][] = [['Ingredientes', '#f97316'], ['Gas / Carbón', '#ef4444'], ['Transporte', '#0ea5e9']]
  const catIds: Record<string, string> = {}
  for (const [name, color] of cats) catIds[name] = (await ldb.categories.add({ kind: 'expense', name, color } as Category)) as string

  // ~26 facturas en los últimos 55 días (deterministas)
  let n = 1
  for (let k = 0; k < 26; k++) {
    const day = Math.round(k * 2.1)
    const ci = k % 7
    const who = ci < 5 ? people[ci][0] : 'Cliente de mostrador'
    const contactId = ci < 5 ? ids[ci] : undefined
    const items = [
      { description: products[k % 5][0], qty: 6 + ((k * 3) % 9), price: products[k % 5][1] },
      ...(k % 3 === 0 ? [{ description: products[(k + 2) % 5][0], qty: 4, price: products[(k + 2) % 5][1] }] : []),
    ]
    const id = (await ldb.invoices.add({
      docType: 'invoice', number: `2026-${String(n++).padStart(3, '0')}`, clientName: who, clientDetails: '', contactId,
      date: iso(day), items, taxRate: 0, notes: '', status: 'pending', origin: 'app', createdAt: new Date(Date.now() - day * 864e5).toISOString(),
    } as Invoice)) as string
    const inv = (await ldb.invoices.get(id)) as Invoice
    const total = items.reduce((s, i) => s + i.qty * i.price, 0)
    if (k % 5 === 1 && contactId) await syncInvoiceLedger(bid, inv) // a deber
    else if (k % 7 === 3 && contactId) await addInvoicePayment(bid, inv, Math.round(total / 2), { date: iso(day) }) // abono
    else await addInvoicePayment(bid, inv, total, { date: iso(day) })
  }

  // Gastos
  const exp: [number, string, string, number][] = [
    [0, 'Harina y aceite', 'Ingredientes', 6500], [2, 'Huevos (bandeja)', 'Ingredientes', 4500], [3, 'Bombona de gas', 'Gas / Carbón', 9000],
    [5, 'Taxi al mercado', 'Transporte', 1500], [8, 'Harina, azúcar, levadura', 'Ingredientes', 12000], [12, 'Sardinas en lata', 'Ingredientes', 7500],
    [16, 'Taxi al mercado', 'Transporte', 1500], [21, 'Bombona de gas', 'Gas / Carbón', 9000], [26, 'Aceite (garrafa)', 'Ingredientes', 15000],
    [33, 'Pan para bocadillos', 'Ingredientes', 8000], [40, 'Taxi al mercado', 'Transporte', 2000], [47, 'Bombona de gas', 'Gas / Carbón', 9000],
  ]
  for (const [d, description, cat, amount] of exp) {
    await ldb.transactions.add({ kind: 'expense', date: iso(d), amount, description, categoryId: catIds[cat], paymentMethod: 'Efectivo', status: 'paid', createdAt: new Date().toISOString() } as Transaction)
  }
}
