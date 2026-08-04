import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import Modal from '../components/Modal.jsx'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'

const IVA_RATE = 0.15

const BASE_CATEGORIES = ['Hojas', 'Cartulinas', 'Anillos', 'Láminas', 'Herramientas', 'Otro']

function capitalizeWords(s) {
  return (s || '').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// El prefijo del código sale de las primeras letras de la categoría (funciona con cualquier categoría, incluidas las nuevas)
function categoryPrefix(category) {
  const clean = (category || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase()
  return clean.slice(0, 3) || 'PRD'
}

// Genera un código único tipo PREFIJO-0001 buscando el último número usado para ese prefijo.
async function generateProductSku(category) {
  const prefix = categoryPrefix(category)
  const { data, error } = await supabase
    .from('products')
    .select('sku')
    .like('sku', `${prefix}-%`)
    .order('sku', { ascending: false })
    .limit(1)
  if (error) throw error
  let next = 1
  if (data && data[0] && data[0].sku) {
    const match = data[0].sku.match(/-(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `${prefix}-${String(next).padStart(4, '0')}`
}

// Genera el código de una variante a partir del SKU del producto padre: SKU-PADRE-V01
async function generateVariantSku(productSku, productId) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('sku')
    .eq('product_id', productId)
    .order('sku', { ascending: false })
    .limit(1)
  if (error) throw error
  let next = 1
  if (data && data[0] && data[0].sku) {
    const match = data[0].sku.match(/-V(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `${productSku}-V${String(next).padStart(2, '0')}`
}


// Registra un lote de inventario (para poder consumir por FIFO al momento de vender)
async function insertBatch(productId, variantId, qty, cost) {
  if (!qty || qty <= 0) return
  await supabase.from('stock_batches').insert({
    product_id: productId,
    variant_id: variantId,
    quantity_received: qty,
    quantity_remaining: qty,
    unit_cost: cost || 0,
  })
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

export default function Inventario() {
  const { settings } = useBusinessSettings()
  const recoversIvaCredit = settings?.recovers_iva_credit !== false
  const [products, setProducts] = useState([])
  const [variantsByProduct, setVariantsByProduct] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [showStockEntry, setShowStockEntry] = useState(null) // { product, variant | null }
  const [showNewVariant, setShowNewVariant] = useState(null) // product
  const [showCountSheet, setShowCountSheet] = useState(false)
  const [recentSaleQty, setRecentSaleQty] = useState({}) // key -> unidades vendidas en 30 días
  const [showHistory, setShowHistory] = useState(null) // { product, variant | null }

  async function loadAll() {
    setLoading(true)
    setError(null)
    const { data: prods, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    if (prodErr) { setError(prodErr.message); setLoading(false); return }

    const { data: variants, error: varErr } = await supabase
      .from('product_variants')
      .select('*')
      .order('created_at', { ascending: false })
    if (varErr) { setError(varErr.message); setLoading(false); return }

    const grouped = {}
    for (const v of variants || []) {
      grouped[v.product_id] = grouped[v.product_id] || []
      grouped[v.product_id].push(v)
    }
    setProducts(prods || [])
    setVariantsByProduct(grouped)

    // Rotación: unidades vendidas en los últimos 30 días, por producto/variante
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, variant_id, quantity, created_at')
      .eq('movement_type', 'salida')
      .gte('created_at', monthAgo.toISOString())
    const qtyMap = {}
    for (const m of movements || []) {
      const key = m.variant_id || m.product_id
      qtyMap[key] = (qtyMap[key] || 0) + m.quantity
    }
    setRecentSaleQty(qtyMap)

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const categoryOptions = useMemo(() => {
    const used = products.map((p) => capitalizeWords(p.category)).filter(Boolean)
    return Array.from(new Set([...BASE_CATEGORIES, ...used]))
  }, [products])

  const totals = useMemo(() => {
    let invValue = 0
    let lowStock = 0
    for (const p of products) {
      if (p.has_variants) {
        for (const v of (variantsByProduct[p.id] || [])) {
          invValue += (v.stock || 0) * (v.avg_cost || 0)
          if ((v.stock || 0) <= 3) lowStock++
        }
      } else {
        invValue += (p.stock || 0) * (p.avg_cost || 0)
        if ((p.stock || 0) <= 3) lowStock++
      }
    }
    return { invValue, lowStock, count: products.length }
  }, [products, variantsByProduct])

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl">Inventario</h1>
          <p className="text-ink/50 text-sm mt-1">Insumos, láminas y herramientas para agendas personalizadas.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCountSheet(true)}
            className="border border-line text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-paperdark"
          >
            Hoja de conteo
          </button>
          <button
            onClick={() => setShowNewProduct(true)}
            className="bg-ink text-paper text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-ink/90"
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SummaryCard label="Valor de inventario" value={money(totals.invValue)} />
        <SummaryCard label="Productos activos" value={totals.count} />
        <SummaryCard label="Con stock bajo (≤3)" value={totals.lowStock} accent={totals.lowStock > 0} />
      </div>

      {error && (
        <div className="bg-plum/10 border border-plum/30 text-plum text-sm px-4 py-3 rounded-sm mb-4">
          Error cargando datos: {error}. Verifica que el proyecto Supabase y las llaves en <code>.env</code> sean correctas.
        </div>
      )}

      {loading ? (
        <div className="text-ink/40 text-sm">Cargando inventario…</div>
      ) : products.length === 0 ? (
        <div className="border border-dashed border-line rounded-sm px-6 py-10 text-center text-ink/50">
          Aún no hay productos. Crea el primero con "+ Nuevo producto".
        </div>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5">Categoría</th>
                <th className="px-4 py-2.5 text-right">Stock</th>
                <th className="px-4 py-2.5 text-right">Costo prom.</th>
                <th className="px-4 py-2.5 text-right">Precio</th>
                <th className="px-4 py-2.5 text-right">Margen</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  variants={variantsByProduct[p.id] || []}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onAddStock={(variant) => setShowStockEntry({ product: p, variant: variant || null })}
                  onAddVariant={() => setShowNewVariant(p)}
                  onShowHistory={(variant) => setShowHistory({ product: p, variant: variant || null })}
                  recentSaleQty={recentSaleQty}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewVariant && (
        <NewVariantModal
          product={showNewVariant}
          recoversIvaCredit={recoversIvaCredit}
          onClose={() => setShowNewVariant(null)}
          onCreated={() => { setShowNewVariant(null); loadAll() }}
        />
      )}

      {showNewProduct && (
        <NewProductModal
          categoryOptions={categoryOptions}
          recoversIvaCredit={recoversIvaCredit}
          onClose={() => setShowNewProduct(false)}
          onCreated={() => { setShowNewProduct(false); loadAll() }}
        />
      )}

      {showStockEntry && (
        <StockEntryModal
          product={showStockEntry.product}
          variant={showStockEntry.variant}
          recoversIvaCredit={recoversIvaCredit}
          onClose={() => setShowStockEntry(null)}
          onSaved={() => { setShowStockEntry(null); loadAll() }}
        />
      )}

      {showHistory && (
        <PurchaseHistoryModal
          product={showHistory.product}
          variant={showHistory.variant}
          onClose={() => setShowHistory(null)}
        />
      )}
      {showCountSheet && (
        <CountSheetModal
          products={products}
          variantsByProduct={variantsByProduct}
          onClose={() => setShowCountSheet(false)}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className="border border-line rounded-sm px-5 py-4 bg-white/40">
      <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40 mb-1">{label}</div>
      <div className={`font-display text-2xl ${accent ? 'text-ochre' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function ProductRow({ product, variants, expanded, onToggle, onAddStock, onAddVariant, onShowHistory, recentSaleQty }) {
  const p = product
  if (!p.has_variants) {
    const margin = (p.price || 0) - (p.avg_cost || 0)
    const sold30 = recentSaleQty[p.id] || 0
    return (
      <tr className="border-t border-line hover:bg-paperdark/40">
        <td className="px-4 py-3 font-medium">
          {p.name}
          {p.sku && <span className="text-ink/30 text-xs ml-2 font-mono">{p.sku}</span>}
          {sold30 >= 10 && <span title={`${sold30} unidades vendidas en 30 días`} className="ml-2 text-[10px] bg-moss/15 text-moss px-1.5 py-0.5 rounded-sm font-mono">🔥 alta rotación</span>}
        </td>
        <td className="px-4 py-3 text-ink/60">{p.category ? capitalizeWords(p.category) : '—'}</td>
        <td className="px-4 py-3 text-right font-mono">{p.stock ?? 0}</td>
        <td className="px-4 py-3 text-right font-mono">{money(p.avg_cost)}</td>
        <td className="px-4 py-3 text-right font-mono">{money(p.price)}</td>
        <td className={`px-4 py-3 text-right font-mono ${margin < 0 ? 'text-plum' : 'text-moss'}`}>{money(margin)}</td>
        <td className="px-4 py-3 text-right space-x-2">
          <button onClick={() => onShowHistory(null)} title="Ver historial de compras de este producto" className="text-xs font-medium text-ink/40 hover:underline">
            historial
          </button>
          <button onClick={() => onAddStock(null)} title="Registra una compra nueva: suma cantidad al stock y actualiza el costo" className="text-xs font-medium text-ochre hover:underline">
            + compra
          </button>
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr className="border-t border-line hover:bg-paperdark/40 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-medium">
          {p.name}
          {p.sku && <span className="text-ink/30 text-xs ml-2 font-mono">{p.sku}</span>}
          {' '}<span className="text-ink/30 text-xs ml-1 font-mono">{variants.length} variante(s) {expanded ? '▾' : '▸'}</span>
        </td>
        <td className="px-4 py-3 text-ink/60">{p.category ? capitalizeWords(p.category) : '—'}</td>
        <td className="px-4 py-3 text-right font-mono">
          {variants.reduce((s, v) => s + (v.stock || 0), 0)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-ink/30">—</td>
        <td className="px-4 py-3 text-right font-mono text-ink/30">—</td>
        <td className="px-4 py-3 text-right font-mono text-ink/30">—</td>
        <td className="px-4 py-3"></td>
        <td className="px-4 py-3"></td>
      </tr>
      {variants.length === 0 && (
        <tr className="border-t border-line/60 bg-ochre/10">
          <td colSpan={7} className="px-4 py-2.5 pl-8">
            <span className="text-xs text-ochre">Sin variantes creadas todavía — agrega una para poder registrarle compras y stock. </span>
            <button
              onClick={(e) => { e.stopPropagation(); onAddVariant() }}
              title="Crea la primera presentación de este producto (ej. un tamaño o color) con su propio stock y costo"
              className="text-xs font-semibold text-ochre hover:underline"
            >
              + agregar variante
            </button>
          </td>
        </tr>
      )}
      {expanded && variants.map((v) => {
        const price = v.price ?? p.price
        const margin = (price || 0) - (v.avg_cost || 0)
        const sold30 = recentSaleQty[v.id] || 0
        return (
          <tr key={v.id} className="border-t border-line/60 bg-paper/60 text-[13px]">
            <td className="px-4 py-2 pl-8 text-ink/70">
              ↳ {v.variant_name}
              {v.sku && <span className="text-ink/30 text-xs ml-2 font-mono">{v.sku}</span>}
              {sold30 >= 10 && <span title={`${sold30} unidades vendidas en 30 días`} className="ml-2 text-[10px] bg-moss/15 text-moss px-1.5 py-0.5 rounded-sm font-mono">🔥 alta rotación</span>}
            </td>
            <td className="px-4 py-2 text-ink/40">{p.category ? capitalizeWords(p.category) : '—'}</td>
            <td className="px-4 py-2 text-right font-mono">{v.stock ?? 0}</td>
            <td className="px-4 py-2 text-right font-mono">{money(v.avg_cost)}</td>
            <td className="px-4 py-2 text-right font-mono">{money(price)}</td>
            <td className={`px-4 py-2 text-right font-mono ${margin < 0 ? 'text-plum' : 'text-moss'}`}>{money(margin)}</td>
            <td className="px-4 py-2 text-right space-x-2">
              <button onClick={(e) => { e.stopPropagation(); onShowHistory(v) }} title="Ver historial de compras de esta variante" className="text-xs font-medium text-ink/40 hover:underline">
                historial
              </button>
              <button onClick={(e) => { e.stopPropagation(); onAddStock(v) }} title="Registra una compra nueva para esta variante: suma cantidad al stock y actualiza el costo" className="text-xs font-medium text-ochre hover:underline">
                + compra
              </button>
            </td>
          </tr>
        )
      })}
      {expanded && (
        <tr className="border-t border-line/60 bg-paper/60">
          <td colSpan={7} className="px-4 py-2 pl-8">
            <button onClick={(e) => { e.stopPropagation(); onAddVariant() }} className="text-xs font-medium text-ochre hover:underline">
              + agregar variante
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

function NewProductModal({ categoryOptions, recoversIvaCredit, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categoryOptions[0] || 'Otro')
  const [newCategory, setNewCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [price, setPrice] = useState('')
  const [barcode, setBarcode] = useState('')
  const [hasVariants, setHasVariants] = useState(false)
  const [initialStock, setInitialStock] = useState('')
  const [initialCost, setInitialCost] = useState('')
  const [includesIva, setIncludesIva] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const finalCategory = addingCategory ? capitalizeWords(newCategory) : category
  const enteredUnit = Number(initialCost) || 0
  const unitNet = includesIva ? enteredUnit / (1 + IVA_RATE) : enteredUnit
  const unitIva = includesIva ? enteredUnit - unitNet : 0
  const costForInventory = includesIva ? (recoversIvaCredit ? unitNet : enteredUnit) : enteredUnit

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      if (addingCategory && !newCategory.trim()) throw new Error('Escribe el nombre de la nueva categoría.')

      // Valida que no exista ya un producto con el mismo nombre (sin importar mayúsculas/espacios)
      const { data: existing, error: dupErr } = await supabase
        .from('products')
        .select('id')
        .ilike('name', name.trim())
        .limit(1)
      if (dupErr) throw dupErr
      if (existing && existing.length > 0) {
        throw new Error('Ya existe un producto con este nombre. Si es el mismo ítem, usa "+ compra" en su fila en vez de crearlo de nuevo.')
      }

      const sku = await generateProductSku(finalCategory)

      const { data: created, error: insErr } = await supabase
        .from('products')
        .insert({
          name: name.trim(),
          sku,
          barcode: barcode.trim() || null,
          category: finalCategory,
          price: Number(price) || 0,
          has_variants: hasVariants,
          stock: hasVariants ? 0 : Number(initialStock) || 0,
          avg_cost: hasVariants ? 0 : costForInventory,
        })
        .select()
        .single()
      if (insErr) throw insErr

      if (!hasVariants && Number(initialStock) > 0) {
        await supabase.from('stock_movements').insert({
          product_id: created.id,
          movement_type: 'entrada',
          quantity: Number(initialStock),
          unit_cost: costForInventory,
          iva_amount: Number((unitIva * Number(initialStock)).toFixed(2)),
          reason: 'compra',
        })
        await insertBatch(created.id, null, Number(initialStock), costForInventory)
      }
      onCreated()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo producto" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ej: Lámina holográfica A4" />
        </Field>

        <Field label="Categoría">
          {!addingCategory ? (
            <div className="flex gap-2">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={() => setAddingCategory(true)} className="text-xs font-medium text-ochre hover:underline whitespace-nowrap px-2" title="Crear una categoría nueva que no está en la lista">
                + nueva
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="input" placeholder="Nombre de la categoría nueva" />
              <button type="button" onClick={() => { setAddingCategory(false); setNewCategory('') }} className="text-xs font-medium text-ink/50 hover:underline whitespace-nowrap px-2">
                cancelar
              </button>
            </div>
          )}
        </Field>
        <p className="text-[11px] text-ink/40 font-mono -mt-2">
          El código se genera solo (ej: {categoryPrefix(finalCategory)}-0001) al guardar.
        </p>

        <Field label="Código de barras (opcional)">
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="input" placeholder="Escanea o escribe el código EAN/UPC" />
        </Field>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
            Este producto tiene variantes (talla, color, tipo)
            <span title="Actívalo si el mismo producto se vende en distintas presentaciones (ej. tamaño A4 y A5, o varios colores). Cada variante lleva su propio stock, costo y precio por separado. Si lo activas, después de crear el producto tendrás que agregarle al menos una variante para poder registrarle compras." className="text-ink/30 border border-ink/30 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] cursor-help">?</span>
          </label>
          {hasVariants && (
            <p className="text-[11px] text-ochre mt-1">
              Después de crear el producto, tendrás que agregarle al menos una variante (ej. "A4", "Rojo") antes de poder registrarle compras y stock.
            </p>
          )}
        </div>

        <Field label="Precio de venta">
          <input required type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
        </Field>

        {!hasVariants && (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock inicial">
                <input type="number" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className="input" />
              </Field>
              <Field label={includesIva ? 'Costo de compra c/u (con IVA)' : 'Costo de compra (c/u)'}>
                <input type="number" step="0.01" value={initialCost} onChange={(e) => setInitialCost(e.target.value)} className="input" />
              </Field>
            </div>
            {Number(initialCost) > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink/70 mt-2">
                <input type="checkbox" checked={includesIva} onChange={(e) => setIncludesIva(e.target.checked)} />
                El costo incluye IVA (15%)
              </label>
            )}
            {includesIva && Number(initialCost) > 0 && (
              <p className="text-[11px] text-ink/50 font-mono bg-paperdark px-3 py-2 rounded-sm mt-2">
                Neto: {money(unitNet)} c/u · IVA: {money(unitIva)} c/u · {recoversIvaCredit
                  ? 'se registra el costo NETO (recuperas el IVA como crédito tributario).'
                  : 'se registra el costo CON IVA (no lo recuperas, es Negocio Popular).'}
              </p>
            )}
          </div>
        )}

        {err && <p className="text-plum text-sm">{err}</p>}

        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear producto'}
        </button>
      </form>
    </Modal>
  )
}

function NewVariantModal({ product, recoversIvaCredit, onClose, onCreated }) {
  const [variantName, setVariantName] = useState('')
  const [price, setPrice] = useState('')
  const [barcode, setBarcode] = useState('')
  const [initialStock, setInitialStock] = useState('')
  const [initialCost, setInitialCost] = useState('')
  const [includesIva, setIncludesIva] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const enteredUnit = Number(initialCost) || 0
  const unitNet = includesIva ? enteredUnit / (1 + IVA_RATE) : enteredUnit
  const unitIva = includesIva ? enteredUnit - unitNet : 0
  const costForInventory = includesIva ? (recoversIvaCredit ? unitNet : enteredUnit) : enteredUnit

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      // Valida que no exista ya una variante con el mismo nombre para este producto
      const { data: existing, error: dupErr } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', product.id)
        .ilike('variant_name', variantName.trim())
        .limit(1)
      if (dupErr) throw dupErr
      if (existing && existing.length > 0) {
        throw new Error('Ya existe esta variante para este producto. Usa "+ compra" en su fila en vez de crearla de nuevo.')
      }

      const sku = await generateVariantSku(product.sku || product.name.slice(0, 3).toUpperCase(), product.id)

      const { data: created, error: insErr } = await supabase
        .from('product_variants')
        .insert({
          product_id: product.id,
          variant_name: variantName.trim(),
          sku,
          barcode: barcode.trim() || null,
          price: price ? Number(price) : null,
          stock: Number(initialStock) || 0,
          avg_cost: costForInventory,
        })
        .select()
        .single()
      if (insErr) throw insErr

      if (Number(initialStock) > 0) {
        await supabase.from('stock_movements').insert({
          product_id: product.id,
          variant_id: created.id,
          movement_type: 'entrada',
          quantity: Number(initialStock),
          unit_cost: costForInventory,
          iva_amount: Number((unitIva * Number(initialStock)).toFixed(2)),
          reason: 'compra',
        })
        await insertBatch(product.id, created.id, Number(initialStock), costForInventory)
      }
      onCreated()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Nueva variante — ${product.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre de la variante">
          <input required value={variantName} onChange={(e) => setVariantName(e.target.value)} className="input" placeholder="Ej: Vinilo textil rojo" />
        </Field>
        <p className="text-[11px] text-ink/40 font-mono -mt-2">El código se genera solo a partir de {product.sku || 'el producto'}.</p>
        <Field label="Código de barras (opcional)">
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="input" placeholder="Escanea o escribe el código EAN/UPC" />
        </Field>
        <Field label={`Precio (base: ${money(product.price)})`}>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" placeholder="Opcional" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock inicial">
            <input type="number" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className="input" />
          </Field>
          <Field label={includesIva ? 'Costo de compra c/u (con IVA)' : 'Costo de compra (c/u)'}>
            <input type="number" step="0.01" value={initialCost} onChange={(e) => setInitialCost(e.target.value)} className="input" />
          </Field>
        </div>
        {Number(initialCost) > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={includesIva} onChange={(e) => setIncludesIva(e.target.checked)} />
            El costo incluye IVA (15%)
          </label>
        )}
        {includesIva && Number(initialCost) > 0 && (
          <p className="text-[11px] text-ink/50 font-mono bg-paperdark px-3 py-2 rounded-sm">
            Neto: {money(unitNet)} c/u · IVA: {money(unitIva)} c/u · {recoversIvaCredit
              ? 'se registra el costo NETO (recuperas el IVA como crédito tributario).'
              : 'se registra el costo CON IVA (no lo recuperas, es Negocio Popular).'}
          </p>
        )}
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear variante'}
        </button>
      </form>
    </Modal>
  )
}

function StockEntryModal({ product, variant, recoversIvaCredit, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [includesIva, setIncludesIva] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const target = variant || product
  const currentStock = target.stock || 0
  const currentAvgCost = target.avg_cost || 0

  // Si el precio incluye IVA: separa el neto del impuesto.
  // Si el negocio recupera crédito tributario, el costo para el inventario es el NETO (sin IVA).
  // Si no lo recupera (Negocio Popular), el IVA pagado se queda como parte del costo.
  const enteredUnit = Number(unitCost) || 0
  const unitNet = includesIva ? enteredUnit / (1 + IVA_RATE) : enteredUnit
  const unitIva = includesIva ? enteredUnit - unitNet : 0
  const costForInventory = includesIva ? (recoversIvaCredit ? unitNet : enteredUnit) : enteredUnit

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const qty = Number(quantity)
      if (!qty || qty <= 0) throw new Error('La cantidad debe ser mayor a 0')

      const newStock = currentStock + qty
      const newAvgCost = ((currentStock * currentAvgCost) + (qty * costForInventory)) / newStock

      const table = variant ? 'product_variants' : 'products'
      const { error: updErr } = await supabase
        .from(table)
        .update({ stock: newStock, avg_cost: Number(newAvgCost.toFixed(4)) })
        .eq('id', target.id)
      if (updErr) throw updErr

      const { error: movErr } = await supabase.from('stock_movements').insert({
        product_id: product.id,
        variant_id: variant ? variant.id : null,
        movement_type: 'entrada',
        quantity: qty,
        unit_cost: costForInventory,
        iva_amount: Number((unitIva * qty).toFixed(2)),
        reason: 'compra',
      })
      if (movErr) throw movErr
      await insertBatch(product.id, variant ? variant.id : null, qty, costForInventory)

      onSaved()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Registrar compra — ${product.name}${variant ? ' / ' + variant.variant_name : ''}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-xs text-ink/50 font-mono bg-paperdark px-3 py-2 rounded-sm">
          Stock actual: {currentStock} · Costo promedio actual: {money(currentAvgCost)}
        </div>
        <Field label="Cantidad que compró">
          <input required type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" />
        </Field>
        <Field label={includesIva ? 'Precio pagado por unidad (con IVA)' : 'Precio pagado por unidad'}>
          <input required type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="input" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={includesIva} onChange={(e) => setIncludesIva(e.target.checked)} />
          El precio de arriba incluye IVA (15%)
        </label>
        {includesIva && (
          <p className="text-[11px] text-ink/50 font-mono bg-paperdark px-3 py-2 rounded-sm">
            Neto: {money(unitNet)} c/u · IVA: {money(unitIva)} c/u · {recoversIvaCredit
              ? 'el costo que se registra es el NETO, porque tu negocio recupera el IVA como crédito tributario.'
              : 'el costo que se registra incluye el IVA, porque tu negocio no lo recupera (Negocio Popular).'}
          </p>
        )}
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar compra'}
        </button>
      </form>
    </Modal>
  )
}

function PurchaseHistoryModal({ product, variant, onClose }) {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      let query = supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', product.id)
        .eq('movement_type', 'entrada')
        .order('created_at', { ascending: false })
      query = variant ? query.eq('variant_id', variant.id) : query.is('variant_id', null)
      const { data } = await query
      setMovements(data || [])
      setLoading(false)
    }
    load()
  }, [product.id, variant?.id])

  const title = `Historial de compras — ${product.name}${variant ? ' / ' + variant.variant_name : ''}`

  return (
    <Modal title={title} onClose={onClose}>
      {loading ? (
        <p className="text-sm text-ink/40">Cargando…</p>
      ) : movements.length === 0 ? (
        <p className="text-sm text-ink/40">Sin compras registradas todavía para este ítem.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {movements.map((m) => (
            <div key={m.id} className="flex justify-between items-center border-b border-line/60 pb-2 text-sm">
              <span className="text-ink/60">{new Date(m.created_at).toLocaleDateString('es-EC')}</span>
              <span>{m.quantity} unidades</span>
              <span className="font-mono text-ink/70">{money(m.unit_cost)} c/u</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function CountSheetModal({ products, variantsByProduct, onClose }) {
  const rows = []
  for (const p of products) {
    if (p.has_variants) {
      for (const v of (variantsByProduct[p.id] || [])) {
        rows.push({ name: `${p.name} — ${v.variant_name}`, sku: v.sku, category: p.category, stock: v.stock || 0 })
      }
    } else {
      rows.push({ name: p.name, sku: p.sku, category: p.category, stock: p.stock || 0 })
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
      <div className="bg-paper border border-line rounded-sm shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="font-display text-lg">Hoja de conteo físico</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 overflow-auto">
          <div className="printable">
            <div className="text-center mb-4">
              <div className="font-display text-xl">Toma física de inventario</div>
              <div className="text-xs text-ink/50">Fecha: ____ / ____ / ______ &nbsp;&nbsp;·&nbsp;&nbsp; Contado por: ______________________</div>
            </div>
            <table className="w-full text-sm border border-line">
              <thead>
                <tr className="bg-paperdark text-left text-[11px] font-mono uppercase tracking-wide">
                  <th className="px-3 py-2 border-b border-line">Producto</th>
                  <th className="px-3 py-2 border-b border-line">Código</th>
                  <th className="px-3 py-2 border-b border-line text-right">Sistema</th>
                  <th className="px-3 py-2 border-b border-line text-right">Conteo físico</th>
                  <th className="px-3 py-2 border-b border-line text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-ink/50">{r.sku || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.stock}</td>
                    <td className="px-3 py-2 text-right">&nbsp;</td>
                    <td className="px-3 py-2 text-right">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line">
          <button onClick={() => window.print()} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90">
            Imprimir hoja de conteo
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wide text-ink/50 mb-1">{label}</span>
      {children}
    </label>
  )
}
