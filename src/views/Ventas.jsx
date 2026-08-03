import React, { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import { Search, ShoppingBag, Trash2, Minus, Plus, User, Printer, Receipt, ScanBarcode } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import Modal from '../components/Modal.jsx'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'
import { ECUADOR_LOCATIONS, PROVINCES } from '../data/ecuadorLocations.js'
import { validarCedulaORuc } from '../utils/ecuadorId.js'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

// Consume los lotes más antiguos primero (FIFO) y devuelve el costo real total consumido
async function consumeFifo(productId, variantId, qty) {
  let query = supabase
    .from('stock_batches')
    .select('*')
    .eq('product_id', productId)
    .gt('quantity_remaining', 0)
    .order('received_at', { ascending: true })
  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
  const { data: batches } = await query

  let remaining = qty
  let totalCost = 0
  for (const b of batches || []) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.quantity_remaining)
    totalCost += take * Number(b.unit_cost)
    remaining -= take
    await supabase.from('stock_batches').update({ quantity_remaining: b.quantity_remaining - take }).eq('id', b.id)
  }
  // Si no hay lotes suficientes (ej. stock cargado antes de tener FIFO), el resto se valora en $0
  return totalCost
}

// Aplana productos y variantes en una sola lista "comprable"
function flattenCatalog(products, variantsByProduct) {
  const items = []
  for (const p of products) {
    if (p.has_variants) {
      for (const v of (variantsByProduct[p.id] || [])) {
        items.push({
          key: `v-${v.id}`,
          product_id: p.id,
          variant_id: v.id,
          description: `${p.name} — ${v.variant_name}`,
          price: v.price ?? p.price,
          stock: v.stock || 0,
          barcode: v.barcode || null,
        })
      }
    } else {
      items.push({
        key: `p-${p.id}`,
        product_id: p.id,
        variant_id: null,
        description: p.name,
        price: p.price,
        stock: p.stock || 0,
        barcode: p.barcode || null,
      })
    }
  }
  return items
}

export default function Ventas() {
  const { settings } = useBusinessSettings()
  const [products, setProducts] = useState([])
  const [variantsByProduct, setVariantsByProduct] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([]) // { key, product_id, variant_id, description, price, qty, stock }
  const [customerName, setCustomerName] = useState('')
  const [customerCedula, setCustomerCedula] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerProvince, setCustomerProvince] = useState('')
  const [customerCity, setCustomerCity] = useState('')
  const [foundCustomer, setFoundCustomer] = useState(null)
  const [applyIva, setApplyIva] = useState(false)
  const IVA_RATE = 0.15
  const [discount, setDiscount] = useState('0')
  const [shippingFee, setShippingFee] = useState('0')
  const [showShippingOnReceipt, setShowShippingOnReceipt] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [completedSale, setCompletedSale] = useState(null) // { sale, items, customer }
  const [history, setHistory] = useState([])
  const [historyCount, setHistoryCount] = useState(0)
  const [historySearch, setHistorySearch] = useState('')
  const [dateFilter, setDateFilter] = useState('mes') // hoy | semana | mes | todo | personalizado
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [historyPage, setHistoryPage] = useState(0)
  const PAGE_SIZE = 15
  const [viewingSale, setViewingSale] = useState(null)

  async function loadCatalog() {
    setLoading(true)
    const { data: prods } = await supabase.from('products').select('*').eq('active', true)
    const { data: variants } = await supabase.from('product_variants').select('*')
    const grouped = {}
    for (const v of variants || []) {
      grouped[v.product_id] = grouped[v.product_id] || []
      grouped[v.product_id].push(v)
    }
    setProducts(prods || [])
    setVariantsByProduct(grouped)
    setLoading(false)
  }

  function dateRangeFor(filter) {
    const now = new Date()
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
    if (filter === 'hoy') return { from: startOfDay(now), to: now }
    if (filter === 'semana') { const from = startOfDay(now); from.setDate(from.getDate() - 7); return { from, to: now } }
    if (filter === 'mes') { const from = startOfDay(now); from.setDate(from.getDate() - 30); return { from, to: now } }
    if (filter === 'personalizado') return { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(customTo + 'T23:59:59') : null }
    return { from: null, to: null } // todo
  }

  async function loadHistory(page = historyPage) {
    const { from, to } = dateRangeFor(dateFilter)
    let query = supabase
      .from('sales')
      .select('*, customers(name, cedula, phone, address, city)', { count: 'exact' })
      .order('sale_date', { ascending: false })
    if (from) query = query.gte('sale_date', from.toISOString())
    if (to) query = query.lte('sale_date', to.toISOString())
    query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    const { data, count } = await query
    setHistory(data || [])
    setHistoryCount(count || 0)
  }

  async function openReceipt(saleRow) {
    const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', saleRow.id)
    const mapped = (items || []).map((it) => ({ key: it.id, description: it.description, price: Number(it.unit_price), qty: it.quantity }))
    setViewingSale({ sale: saleRow, items: mapped, customer: saleRow.customers })
  }

  useEffect(() => { loadCatalog(); loadHistory(0) }, [])
  useEffect(() => { setHistoryPage(0); loadHistory(0) }, [dateFilter, customFrom, customTo])
  useEffect(() => { loadHistory(historyPage) }, [historyPage])

  const catalog = useMemo(() => flattenCatalog(products, variantsByProduct), [products, variantsByProduct])

  const idValidation = useMemo(() => customerCedula.trim() ? validarCedulaORuc(customerCedula) : null, [customerCedula])

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history
    const q = historySearch.toLowerCase()
    return history.filter((s) =>
      s.customers?.name?.toLowerCase().includes(q) ||
      s.customers?.cedula?.includes(q) ||
      String(s.sale_number).includes(q)
    )
  }, [history, historySearch])

  const results = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return catalog.filter((i) => (i.description.toLowerCase().includes(q) || i.barcode?.includes(search.trim())) && i.stock > 0).slice(0, 8)
  }, [search, catalog])

  function handleSearchKeyDown(e) {
    if (e.key !== 'Enter') return
    const code = search.trim()
    if (!code) return
    // Con el lector conectado, el código llega seguido de Enter — si coincide exacto, agrega directo sin mostrar la lista
    const match = catalog.find((i) => i.barcode && i.barcode === code)
    if (match && match.stock > 0) {
      e.preventDefault()
      addToCart(match)
    }
  }

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.key === item.key)
      if (existing) {
        if (existing.qty + 1 > item.stock) return prev
        return prev.map((c) => c.key === item.key ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { ...item, qty: 1 }]
    })
    setSearch('')
  }

  function updateQty(key, qty) {
    setCart((prev) => prev.map((c) => c.key === key ? { ...c, qty: Math.max(1, Math.min(qty, c.stock)) } : c))
  }

  async function handleCedulaLookup(value) {
    setCustomerCedula(value)
    setFoundCustomer(null)
    if (value.trim().length < 5) return
    const { data } = await supabase.from('customers').select('*').eq('cedula', value.trim()).limit(1)
    if (data && data.length > 0) {
      const c = data[0]
      setFoundCustomer(c)
      setCustomerName(c.name || '')
      setCustomerPhone(c.phone || '')
      setCustomerEmail(c.email || '')
      setCustomerAddress(c.address || '')
      setCustomerProvince(c.province || '')
      setCustomerCity(c.city || '')
    }
  }

  function removeFromCart(key) {
    setCart((prev) => prev.filter((c) => c.key !== key))
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountValue = Number(discount) || 0
  const shippingValue = Number(shippingFee) || 0
  const ivaValue = applyIva ? Number(((subtotal - discountValue) * IVA_RATE).toFixed(2)) : 0
  const total = Math.max(0, subtotal - discountValue + shippingValue + ivaValue)

  async function handleCompleteSale() {
    if (cart.length === 0) return
    if (!customerName.trim()) { setErr('Ingresa al menos el nombre del cliente.'); return }
    if (!customerCedula.trim()) { setErr('Ingresa la cédula (10 dígitos) o RUC (13 dígitos) del cliente.'); return }
    if (!/^\d{10}$|^\d{13}$/.test(customerCedula.trim())) { setErr('La cédula debe tener 10 dígitos o el RUC 13 dígitos, solo números.'); return }
    if (!customerPhone.trim()) { setErr('El número de celular es obligatorio.'); return }
    if (!customerProvince) { setErr('Selecciona la provincia — es obligatoria.'); return }
    if (!customerCity) { setErr('Selecciona el cantón — es obligatorio.'); return }
    setSaving(true)
    setErr(null)
    try {
      // 1. Cliente: la cédula es el dato base — busca por cédula, si no existe lo crea; si existe, actualiza sus datos
      let customerId = null
      const { data: existingCust } = await supabase
        .from('customers')
        .select('*')
        .eq('cedula', customerCedula.trim())
        .limit(1)
      if (existingCust && existingCust.length > 0) customerId = existingCust[0].id

      let customerRecord = null
      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            name: customerName.trim(),
            cedula: customerCedula.trim(),
            phone: customerPhone.trim() || null,
            email: customerEmail.trim() || null,
            address: customerAddress.trim() || null,
            province: customerProvince || null,
            city: customerCity || null,
          })
          .select()
          .single()
        if (custErr) throw custErr
        customerId = newCust.id
        customerRecord = newCust
      } else {
        const { data: cRec, error: updErr } = await supabase
          .from('customers')
          .update({
            name: customerName.trim(),
            phone: customerPhone.trim() || null,
            email: customerEmail.trim() || null,
            address: customerAddress.trim() || null,
            province: customerProvince || null,
            city: customerCity || null,
          })
          .eq('id', customerId)
          .select()
          .single()
        if (updErr) throw updErr
        customerRecord = cRec
      }

      // 2. Venta
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          customer_id: customerId,
          subtotal,
          discount: discountValue,
          shipping_fee: shippingValue,
          show_shipping_on_receipt: showShippingOnReceipt,
          apply_iva: applyIva,
          iva_amount: ivaValue,
          total,
          payment_method: paymentMethod,
          status: 'completada',
        })
        .select()
        .single()
      if (saleErr) throw saleErr

      // 3. Ítems + descuento de stock + movimiento de inventario + costo real (FIFO)
      for (const c of cart) {
        const costAtSale = await consumeFifo(c.product_id, c.variant_id, c.qty)

        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          product_id: c.product_id,
          variant_id: c.variant_id,
          description: c.description,
          quantity: c.qty,
          unit_price: c.price,
          line_total: c.price * c.qty,
          cost_at_sale: costAtSale,
        })

        const table = c.variant_id ? 'product_variants' : 'products'
        const newStock = c.stock - c.qty
        await supabase.from(table).update({ stock: newStock }).eq('id', c.variant_id || c.product_id)

        await supabase.from('stock_movements').insert({
          product_id: c.product_id,
          variant_id: c.variant_id,
          movement_type: 'salida',
          quantity: c.qty,
          reason: 'venta',
          reference_id: sale.id,
        })
      }

      setCompletedSale({ sale, items: cart, customer: customerRecord })
      setCart([])
      setCustomerName(''); setCustomerCedula(''); setCustomerPhone(''); setCustomerEmail('')
      setCustomerAddress(''); setCustomerProvince(''); setCustomerCity('')
      setFoundCustomer(null)
      setApplyIva(false)
      setDiscount('0')
      setShippingFee('0')
      setShowShippingOnReceipt(true)
      loadCatalog()
      setHistoryPage(0)
      loadHistory(0)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-sm bg-ink text-paper flex items-center justify-center"><ShoppingBag size={18} /></div>
        <h1 className="font-display text-3xl">Nueva venta</h1>
      </div>
      <p className="text-ink/50 text-sm mb-8 ml-12">Arma el pedido, se descuenta el stock automáticamente.</p>

      <div className="grid grid-cols-3 gap-8">
        {/* Buscador + carrito */}
        <div className="col-span-2">
          <div className="relative mb-5">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={settings?.barcode_scanner_enabled ? 'Escanea el código de barras o busca por nombre…' : 'Busca un producto o variante para agregar…'}
              className="input pl-9"
            />
            {settings?.barcode_scanner_enabled && (
              <span title="Modo lector de código de barras activo" className="absolute right-3 top-1/2 -translate-y-1/2 text-moss">
                <ScanBarcode size={16} />
              </span>
            )}
            {results.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-line rounded-sm shadow-lg mt-1 max-h-64 overflow-auto">
                {results.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    onClick={() => addToCart(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-paperdark text-sm flex justify-between items-center"
                  >
                    <span>{r.description}</span>
                    <span className="text-ink/40 font-mono text-xs bg-paperdark px-2 py-0.5 rounded-sm">{money(r.price)} · stock {r.stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="border border-dashed border-line rounded-sm px-6 py-14 text-center text-ink/40">
              <ShoppingBag size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aún no hay productos en el pedido.</p>
              <p className="text-xs mt-1">Búscalos arriba para agregarlos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((c) => (
                <div key={c.key} className="flex items-center gap-4 border border-line rounded-sm px-4 py-3 bg-white/40">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.description}</div>
                    <div className="text-xs text-ink/40 font-mono">{money(c.price)} c/u</div>
                  </div>
                  <div className="flex items-center border border-line rounded-sm overflow-hidden shrink-0">
                    <button onClick={() => updateQty(c.key, c.qty - 1)} className="w-7 h-7 flex items-center justify-center text-ink/50 hover:bg-paperdark"><Minus size={13} /></button>
                    <input
                      type="number"
                      value={c.qty}
                      min={1}
                      max={c.stock}
                      onChange={(e) => updateQty(c.key, Number(e.target.value))}
                      className="w-10 text-center text-sm outline-none"
                    />
                    <button onClick={() => updateQty(c.key, c.qty + 1)} className="w-7 h-7 flex items-center justify-center text-ink/50 hover:bg-paperdark"><Plus size={13} /></button>
                  </div>
                  <div className="w-20 text-right font-mono text-sm shrink-0">{money(c.price * c.qty)}</div>
                  <button onClick={() => removeFromCart(c.key)} className="text-ink/30 hover:text-plum shrink-0" title="Quitar del pedido">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel de cliente + totales */}
        <div className="border border-line rounded-sm p-5 h-fit bg-white/40 sticky top-4">
          <h3 className="font-display text-lg mb-4 flex items-center gap-2"><User size={16} className="text-ink/40" /> Cliente</h3>
          <div className="space-y-3 mb-1">
            <input
              value={customerCedula}
              onChange={(e) => handleCedulaLookup(e.target.value.replace(/\D/g, '').slice(0, 13))}
              placeholder="Cédula (10 díg.) o RUC (13 díg.) *"
              inputMode="numeric"
              className="input"
            />
            {idValidation && !idValidation.valid && (
              <p className="text-[11px] text-plum">{idValidation.message}</p>
            )}
            {idValidation && idValidation.valid && (
              <p className="text-[11px] text-moss font-mono">✓ {idValidation.type === 'cedula' ? 'Cédula válida' : 'RUC válido'}</p>
            )}
          </div>
          {foundCustomer && (
            <p className="text-[11px] text-moss font-mono mb-2">✓ Cliente ya registrado, datos autocompletados</p>
          )}
          <div className="space-y-3 mb-5 mt-2">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre *" className="input" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Celular *" className="input" />
            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" type="email" className="input" />
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Dirección" className="input" />
            <select
              value={customerProvince}
              onChange={(e) => { setCustomerProvince(e.target.value); setCustomerCity('') }}
              className="input"
            >
              <option value="">Provincia *</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={customerCity}
              onChange={(e) => setCustomerCity(e.target.value)}
              disabled={!customerProvince}
              className="input disabled:opacity-50"
            >
              <option value="">{customerProvince ? 'Cantón *' : 'Elige provincia primero'}</option>
              {(ECUADOR_LOCATIONS[customerProvince] || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="stitch mb-4"></div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span className="text-ink/50">Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-ink/50">Descuento</span>
              <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-20 text-right border border-line rounded-sm px-2 py-1 font-mono" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink/50">Costo de envío</span>
              <input type="number" step="0.01" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="w-20 text-right border border-line rounded-sm px-2 py-1 font-mono" />
            </div>
            {Number(shippingFee) > 0 && (
              <label className="flex items-center justify-end gap-2 text-xs text-ink/50">
                <input type="checkbox" checked={showShippingOnReceipt} onChange={(e) => setShowShippingOnReceipt(e.target.checked)} />
                Mostrar el envío en la nota de venta
              </label>
            )}
            <label className="flex items-center justify-between text-xs text-ink/50 pt-1">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={applyIva} onChange={(e) => setApplyIva(e.target.checked)} />
                Vender con IVA (15%)
              </span>
              {applyIva && <span className="font-mono text-ink/70">{money(ivaValue)}</span>}
            </label>
          </div>

          <div className="bg-ink text-paper rounded-sm px-4 py-3 flex justify-between items-center mb-4">
            <span className="text-sm">Total</span>
            <span className="font-display text-2xl">{money(total)}</span>
          </div>

          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input mb-4">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
          </select>

          {err && <p className="text-plum text-sm mb-3">{err}</p>}

          <button
            disabled={saving || cart.length === 0}
            onClick={handleCompleteSale}
            className="w-full bg-ochre text-white font-medium py-3 rounded-sm hover:bg-ochre/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Receipt size={16} />
            {saving ? 'Registrando…' : 'Registrar venta'}
          </button>
        </div>
      </div>

      <h2 className="font-display text-xl mt-10 mb-3">Historial de ventas</h2>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex border border-line rounded-sm overflow-hidden">
          {[['hoy', 'Hoy'], ['semana', '7 días'], ['mes', '30 días'], ['todo', 'Todo'], ['personalizado', 'Personalizado']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium ${dateFilter === key ? 'bg-ink text-paper' : 'bg-transparent text-ink/50 hover:bg-paperdark'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {dateFilter === 'personalizado' && (
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-line rounded-sm px-2 py-1.5" />
            <span className="text-ink/40">a</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-line rounded-sm px-2 py-1.5" />
          </div>
        )}
      </div>

      <input
        value={historySearch}
        onChange={(e) => setHistorySearch(e.target.value)}
        placeholder="Busca por cédula, nombre o N° de pedido (en esta página)…"
        className="input mb-4 max-w-md"
      />
      {filteredHistory.length === 0 ? (
        <p className="text-sm text-ink/40">{history.length === 0 ? 'Aún no hay ventas registradas.' : 'Sin resultados para esa búsqueda.'}</p>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2">N°</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Cédula</th>
                <th className="px-4 py-2">Pago</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((s) => (
                <tr key={s.id} className="border-t border-line hover:bg-paperdark/40">
                  <td className="px-4 py-2 font-mono text-ink/60">#{String(s.sale_number).padStart(5, '0')}</td>
                  <td className="px-4 py-2 text-ink/60">{new Date(s.sale_date).toLocaleDateString('es-EC')}</td>
                  <td className="px-4 py-2">{s.customers?.name || '—'}</td>
                  <td className="px-4 py-2 text-ink/60 font-mono">{s.customers?.cedula || '—'}</td>
                  <td className="px-4 py-2 text-ink/60 capitalize">{s.payment_method}</td>
                  <td className="px-4 py-2 text-right font-mono">{money(s.total)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openReceipt(s)} className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
                      <Printer size={12} /> Ver / reimprimir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-xs text-ink/50">
          <span>
            Mostrando {historyPage * PAGE_SIZE + 1}–{Math.min((historyPage + 1) * PAGE_SIZE, historyCount)} de {historyCount}
          </span>
          <div className="flex gap-2">
            <button disabled={historyPage === 0} onClick={() => setHistoryPage((p) => p - 1)} className="px-3 py-1.5 border border-line rounded-sm disabled:opacity-30 hover:bg-paperdark">
              ← Anterior
            </button>
            <button disabled={(historyPage + 1) * PAGE_SIZE >= historyCount} onClick={() => setHistoryPage((p) => p + 1)} className="px-3 py-1.5 border border-line rounded-sm disabled:opacity-30 hover:bg-paperdark">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {completedSale && (
        <ReceiptModal data={completedSale} settings={settings} onClose={() => setCompletedSale(null)} />
      )}
      {viewingSale && (
        <ReceiptModal data={viewingSale} settings={settings} onClose={() => setViewingSale(null)} />
      )}
    </div>
  )
}

function ReceiptModal({ data, settings, onClose }) {
  const { sale, items, customer } = data
  const [qrDataUrl, setQrDataUrl] = useState(null)

  useEffect(() => {
    const payload = JSON.stringify({
      pedido: sale.sale_number,
      fecha: sale.sale_date,
      cliente: customer?.name,
      items: items.map((it) => `${it.description} x${it.qty}`),
      total: sale.total,
    })
    QRCode.toDataURL(payload, { margin: 1, width: 120, color: { dark: '#232323', light: '#F7F3EC' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [sale.id])

  return (
    <Modal title="Venta registrada" onClose={onClose}>
      <div id="receipt-print" className="printable text-sm border border-line">
        <div className="bg-ink text-paper px-6 py-5 flex items-center gap-3">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="logo" className="h-12 w-12 object-contain rounded-sm bg-white p-1" />
          )}
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
            <div className="font-display text-lg">Nota de venta</div>
            <div className="text-right text-xs text-ink/50">
              <div className="font-mono">N° {String(sale.sale_number).padStart(5, '0')}</div>
              <div>{new Date(sale.sale_date).toLocaleString('es-EC')}</div>
            </div>
          </div>

          <div className="stitch mb-4"></div>

          <div className="mb-4 text-sm">
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/40 mb-1">Cliente</div>
            <div className="font-medium">{customer?.name}</div>
            {customer?.cedula && <div className="text-ink/60">C.I.: {customer.cedula}</div>}
            {customer?.phone && <div className="text-ink/60">Tel: {customer.phone}</div>}
            {customer?.address && <div className="text-ink/60">{customer.address}{customer.city ? `, ${customer.city}` : ''}</div>}
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

          <div className="flex justify-between text-xs text-ink/60"><span>Subtotal</span><span className="font-mono">{money(sale.subtotal)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between text-xs text-ink/60"><span>Descuento</span><span className="font-mono">-{money(sale.discount)}</span></div>}
          {sale.shipping_fee > 0 && sale.show_shipping_on_receipt && (
            <div className="flex justify-between text-xs text-ink/60"><span>Envío</span><span className="font-mono">{money(sale.shipping_fee)}</span></div>
          )}
          {sale.apply_iva && sale.iva_amount > 0 && (
            <div className="flex justify-between text-xs text-ink/60"><span>IVA (15%)</span><span className="font-mono">{money(sale.iva_amount)}</span></div>
          )}
          <div className="flex justify-between text-xs text-ink/60"><span>Forma de pago</span><span className="capitalize">{sale.payment_method}</span></div>
          <div className="flex justify-between font-display text-2xl mt-2 pt-2 border-t border-ink"><span>Total</span><span>{money(sale.total)}</span></div>

          <div className="flex items-end justify-between mt-5">
            <div className="text-[11px] text-ink/40 max-w-[70%]">Documento interno de la empresa, no válido como factura tributaria.</div>
            {qrDataUrl && (
              <div className="text-center">
                <img src={qrDataUrl} alt="QR del pedido" className="h-16 w-16" />
                <div className="text-[9px] text-ink/40 font-mono mt-0.5">ref. pedido</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => window.print()}
        className="w-full mt-5 bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90"
      >
        Imprimir nota de venta
      </button>
    </Modal>
  )
}
