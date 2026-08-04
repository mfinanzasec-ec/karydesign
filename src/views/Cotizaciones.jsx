import React, { useEffect, useState, useMemo } from 'react'
import { Search, FileText, Trash2, Minus, Plus, Printer } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import Modal from '../components/Modal.jsx'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function flattenCatalog(products, variantsByProduct) {
  const items = []
  for (const p of products) {
    if (p.has_variants) {
      for (const v of (variantsByProduct[p.id] || [])) {
        items.push({ key: `v-${v.id}`, product_id: p.id, variant_id: v.id, description: `${p.name} — ${v.variant_name}`, price: v.price ?? p.price, stock: v.stock || 0 })
      }
    } else {
      items.push({ key: `p-${p.id}`, product_id: p.id, variant_id: null, description: p.name, price: p.price, stock: p.stock || 0 })
    }
  }
  return items
}

const STATUS_LABEL = { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada', expirada: 'Expirada' }
const STATUS_COLOR = { pendiente: 'text-ochre', aceptada: 'text-moss', rechazada: 'text-plum', expirada: 'text-ink/40' }

export default function Cotizaciones() {
  const { settings } = useBusinessSettings()
  const [products, setProducts] = useState([])
  const [variantsByProduct, setVariantsByProduct] = useState({})
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [discount, setDiscount] = useState('0')
  const [validDays, setValidDays] = useState('8')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [history, setHistory] = useState([])
  const [completedQuote, setCompletedQuote] = useState(null)
  const [viewingQuote, setViewingQuote] = useState(null)

  async function loadCatalog() {
    const { data: prods } = await supabase.from('products').select('*').eq('active', true)
    const { data: variants } = await supabase.from('product_variants').select('*')
    const grouped = {}
    for (const v of variants || []) { grouped[v.product_id] = grouped[v.product_id] || []; grouped[v.product_id].push(v) }
    setProducts(prods || [])
    setVariantsByProduct(grouped)
  }

  async function loadHistory() {
    const { data } = await supabase.from('quotes').select('*').order('quote_number', { ascending: false }).limit(30)
    setHistory(data || [])
  }

  useEffect(() => { loadCatalog(); loadHistory() }, [])

  const catalog = useMemo(() => flattenCatalog(products, variantsByProduct), [products, variantsByProduct])
  const results = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return catalog.filter((i) => i.description.toLowerCase().includes(q)).slice(0, 8)
  }, [search, catalog])

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.key === item.key)
      if (existing) return prev.map((c) => c.key === item.key ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
    setSearch('')
  }
  function updateQty(key, qty) { setCart((prev) => prev.map((c) => c.key === key ? { ...c, qty: Math.max(1, qty), price: c.price } : c)) }
  function updatePrice(key, price) { setCart((prev) => prev.map((c) => c.key === key ? { ...c, price: Math.max(0, price) } : c)) }
  function removeFromCart(key) { setCart((prev) => prev.filter((c) => c.key !== key)) }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountValue = Number(discount) || 0
  const total = Math.max(0, subtotal - discountValue)

  async function handleSaveQuote() {
    if (cart.length === 0) return
    if (!customerName.trim()) { setErr('Ingresa al menos el nombre del cliente o prospecto.'); return }
    setSaving(true); setErr(null)
    try {
      const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + (Number(validDays) || 8))
      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .insert({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          customer_email: customerEmail.trim() || null,
          subtotal, discount: discountValue, total,
          valid_until: validUntil.toISOString().slice(0, 10),
          notes: notes.trim() || null,
        })
        .select().single()
      if (qErr) throw qErr

      for (const c of cart) {
        await supabase.from('quote_items').insert({
          quote_id: quote.id, product_id: c.product_id, variant_id: c.variant_id,
          description: c.description, quantity: c.qty, unit_price: c.price, line_total: c.price * c.qty,
        })
      }

      setCompletedQuote({ quote, items: cart })
      setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setDiscount('0'); setNotes('')
      loadHistory()
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  async function updateStatus(quoteId, status) {
    await supabase.from('quotes').update({ status }).eq('id', quoteId)
    loadHistory()
  }

  async function openQuote(q) {
    const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', q.id)
    const mapped = (items || []).map((it) => ({ key: it.id, description: it.description, price: Number(it.unit_price), qty: it.quantity }))
    setViewingQuote({ quote: q, items: mapped })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-sm bg-ink text-paper flex items-center justify-center"><FileText size={18} /></div>
        <h1 className="font-display text-3xl">Cotizaciones</h1>
      </div>
      <p className="text-ink/50 text-sm mb-8 ml-12">Arma una propuesta de precio — no descuenta stock hasta que se convierta en venta.</p>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2">
          <div className="relative mb-5">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca un producto o variante…" className="input pl-9" />
            {results.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-line rounded-sm shadow-lg mt-1 max-h-64 overflow-auto">
                {results.map((r) => (
                  <button type="button" key={r.key} onClick={() => addToCart(r)} className="w-full text-left px-4 py-2.5 hover:bg-paperdark text-sm flex justify-between items-center">
                    <span>{r.description}</span>
                    <span className="text-ink/40 font-mono text-xs bg-paperdark px-2 py-0.5 rounded-sm">{money(r.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="border border-dashed border-line rounded-sm px-6 py-14 text-center text-ink/40">
              <FileText size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aún no hay productos en la cotización.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((c) => (
                <div key={c.key} className="flex items-center gap-3 border border-line rounded-sm px-4 py-3 bg-white/40">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.description}</div>
                  </div>
                  <div className="flex items-center border border-line rounded-sm overflow-hidden shrink-0">
                    <button onClick={() => updateQty(c.key, c.qty - 1)} className="w-7 h-7 flex items-center justify-center text-ink/50 hover:bg-paperdark"><Minus size={13} /></button>
                    <input type="number" value={c.qty} min={1} onChange={(e) => updateQty(c.key, Number(e.target.value))} className="w-10 text-center text-sm outline-none" />
                    <button onClick={() => updateQty(c.key, c.qty + 1)} className="w-7 h-7 flex items-center justify-center text-ink/50 hover:bg-paperdark"><Plus size={13} /></button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-ink/40">$</span>
                    <input type="number" step="0.01" value={c.price} onChange={(e) => updatePrice(c.key, Number(e.target.value))} className="w-16 text-right border border-line rounded-sm px-1.5 py-1 font-mono text-sm" title="Puedes ajustar el precio para esta cotización" />
                  </div>
                  <div className="w-20 text-right font-mono text-sm shrink-0">{money(c.price * c.qty)}</div>
                  <button onClick={() => removeFromCart(c.key)} className="text-ink/30 hover:text-plum shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-line rounded-sm p-5 h-fit bg-white/40 sticky top-4">
          <h3 className="font-display text-lg mb-4">Cliente / prospecto</h3>
          <div className="space-y-3 mb-5">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre *" className="input" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="input" />
            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" type="email" className="input" />
          </div>

          <div className="stitch mb-4"></div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span className="text-ink/50">Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-ink/50">Descuento</span>
              <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-20 text-right border border-line rounded-sm px-2 py-1 font-mono" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink/50">Válida por (días)</span>
              <input type="number" value={validDays} onChange={(e) => setValidDays(e.target.value)} className="w-20 text-right border border-line rounded-sm px-2 py-1 font-mono" />
            </div>
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2} className="input mb-4 resize-none" />

          <div className="bg-ink text-paper rounded-sm px-4 py-3 flex justify-between items-center mb-4">
            <span className="text-sm">Total</span>
            <span className="font-display text-2xl">{money(total)}</span>
          </div>

          {err && <p className="text-plum text-sm mb-3">{err}</p>}

          <button disabled={saving || cart.length === 0} onClick={handleSaveQuote} className="w-full bg-ochre text-white font-medium py-3 rounded-sm hover:bg-ochre/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <FileText size={16} /> {saving ? 'Guardando…' : 'Generar cotización'}
          </button>
        </div>
      </div>

      <h2 className="font-display text-xl mt-10 mb-3">Historial de cotizaciones</h2>
      {history.length === 0 ? (
        <p className="text-sm text-ink/40">Aún no hay cotizaciones registradas.</p>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2">N°</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Válida hasta</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((q) => (
                <tr key={q.id} className="border-t border-line hover:bg-paperdark/40">
                  <td className="px-4 py-2 font-mono text-ink/60">#{String(q.quote_number).padStart(5, '0')}</td>
                  <td className="px-4 py-2 text-ink/60">{new Date(q.created_at).toLocaleDateString('es-EC')}</td>
                  <td className="px-4 py-2">{q.customer_name}</td>
                  <td className="px-4 py-2 text-ink/60">{q.valid_until ? new Date(q.valid_until).toLocaleDateString('es-EC') : '—'}</td>
                  <td className="px-4 py-2">
                    <select value={q.status} onChange={(e) => updateStatus(q.id, e.target.value)} className={`text-xs font-medium bg-transparent border-none ${STATUS_COLOR[q.status]}`}>
                      {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{money(q.total)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openQuote(q)} className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
                      <Printer size={12} /> Ver / imprimir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {completedQuote && <QuoteReceipt data={completedQuote} settings={settings} onClose={() => setCompletedQuote(null)} />}
      {viewingQuote && <QuoteReceipt data={viewingQuote} settings={settings} onClose={() => setViewingQuote(null)} />}
    </div>
  )
}

function QuoteReceipt({ data, settings, onClose }) {
  const { quote, items } = data
  return (
    <Modal title="Cotización" onClose={onClose}>
      <div className="printable text-sm border border-line">
        <div className="bg-ink text-paper px-6 py-5 flex items-center gap-3">
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 w-12 object-contain rounded-sm bg-white p-1" />}
          <div>
            <div className="font-display text-xl leading-tight">{settings?.business_name || 'Configura el nombre del negocio'}</div>
            <div className="text-[11px] text-paper/60 mt-0.5 space-x-2">
              {settings?.phone && <span>Tel: {settings.phone}</span>}
              {settings?.address && <span>· {settings.address}</span>}
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-between items-baseline mb-4">
            <div className="font-display text-lg">Cotización</div>
            <div className="text-right text-xs text-ink/50">
              <div className="font-mono">N° {String(quote.quote_number).padStart(5, '0')}</div>
              <div>{new Date(quote.created_at).toLocaleDateString('es-EC')}</div>
              {quote.valid_until && <div className="text-ochre">Válida hasta {new Date(quote.valid_until).toLocaleDateString('es-EC')}</div>}
            </div>
          </div>

          <div className="stitch mb-4"></div>

          <div className="mb-4 text-sm">
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/40 mb-1">Para</div>
            <div className="font-medium">{quote.customer_name}</div>
            {quote.customer_phone && <div className="text-ink/60">Tel: {quote.customer_phone}</div>}
            {quote.customer_email && <div className="text-ink/60">{quote.customer_email}</div>}
          </div>

          <div className="stitch mb-4"></div>

          <table className="w-full mb-1">
            <thead>
              <tr className="text-[11px] font-mono uppercase tracking-wide text-ink/40">
                <th className="text-left pb-1">Descripción</th>
                <th className="text-right pb-1">Cant.</th>
                <th className="text-right pb-1">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.key} className="border-t border-line/60">
                  <td className="py-1.5">{it.description}</td>
                  <td className="py-1.5 text-right">{it.qty}</td>
                  <td className="py-1.5 text-right font-mono">{money(it.price * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="stitch my-3"></div>

          <div className="flex justify-between text-xs text-ink/60"><span>Subtotal</span><span className="font-mono">{money(quote.subtotal)}</span></div>
          {quote.discount > 0 && <div className="flex justify-between text-xs text-ink/60"><span>Descuento</span><span className="font-mono">-{money(quote.discount)}</span></div>}
          <div className="flex justify-between font-display text-2xl mt-2 pt-2 border-t border-ink"><span>Total</span><span>{money(quote.total)}</span></div>

          {quote.notes && <div className="text-xs text-ink/50 mt-3 italic">{quote.notes}</div>}
          <div className="text-center text-[11px] text-ink/40 mt-5">Precios sujetos a cambio sin previo aviso. Válida hasta la fecha indicada.</div>
        </div>
      </div>
      <button onClick={() => window.print()} className="w-full mt-5 bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90">
        Imprimir cotización
      </button>
    </Modal>
  )
}
