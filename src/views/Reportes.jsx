import React, { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../supabaseClient.js'
import EcuadorMap from '../components/EcuadorMap.jsx'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

const PHRASES = [
  'Cada pedido despachado es un paso más. Tú puedes con esto.',
  'Lo que hoy es un insumo en una repisa, mañana es una agenda en las manos de alguien feliz.',
  'No se trata de vender mucho un día, sino de no parar ningún día.',
  'Tu negocio crece en cada detalle que cuidas. Se nota.',
  'Vas haciéndolo, vas logrando. Sigue así.',
  'Cada estudiante que enseñas hoy es una clienta que confía en ti mañana.',
  'El orden en tu inventario hoy es la calma de tu negocio mañana.',
  'Un producto bien vendido empieza con un producto bien cuidado. Vas por buen camino.',
]

const CHART_COLORS = ['#5B6B4F', '#C68A3B', '#5B3A4E', '#8A9A7E', '#D9A85F', '#7D5A6E']

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function weekRange(ref = new Date()) {
  const d = startOfDay(ref)
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d); monday.setDate(d.getDate() + diffToMonday)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function monthRange(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

function yearRange(ref = new Date()) {
  const start = new Date(ref.getFullYear(), 0, 1)
  const end = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999)
  return { start, end }
}

export default function Reportes() {
  const [sales, setSales] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [products, setProducts] = useState([])
  const [variants, setVariants] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [phrase] = useState(PHRASES[Math.floor(Math.random() * PHRASES.length)])
  const [periodMode, setPeriodMode] = useState('semana')
  const [metric, setMetric] = useState('ventas') // ventas | pedidos

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: s } = await supabase.from('sales').select('*, customers(province, city)').order('sale_date', { ascending: false })
      const { data: si } = await supabase.from('sale_items').select('*')
      const { data: p } = await supabase.from('products').select('*')
      const { data: v } = await supabase.from('product_variants').select('*')
      const { data: en } = await supabase.from('course_enrollments').select('*, customers(name)')
      setSales(s || []); setSaleItems(si || []); setProducts(p || []); setVariants(v || []); setEnrollments(en || [])
      setLoading(false)
    }
    load()
  }, [])

  const productsMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const variantsMap = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, v])), [variants])
  const salesMap = useMemo(() => Object.fromEntries(sales.map((s) => [s.id, s])), [sales])

  const quickTotals = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30)
    let todayTotal = 0, todayCount = 0, weekTotal = 0, weekCount = 0, monthTotal = 0, monthCount = 0
    for (const s of sales) {
      const d = new Date(s.sale_date)
      if (d >= today) { todayTotal += Number(s.total); todayCount++ }
      if (d >= weekAgo) { weekTotal += Number(s.total); weekCount++ }
      if (d >= monthAgo) { monthTotal += Number(s.total); monthCount++ }
    }
    return { todayTotal, todayCount, weekTotal, weekCount, monthTotal, monthCount }
  }, [sales])

  const { range, chartData, rangeLabel } = useMemo(() => {
    const now = new Date()
    if (periodMode === 'semana') {
      const { start, end } = weekRange(now)
      const days = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i)
        const dayssales = sales.filter((s) => startOfDay(new Date(s.sale_date)).getTime() === startOfDay(d).getTime())
        const total = dayssales.reduce((a, s) => a + Number(s.total), 0)
        days.push({ name: d.toLocaleDateString('es-EC', { weekday: 'short' }), ventas: Number(total.toFixed(2)), pedidos: dayssales.length })
      }
      return { range: { start, end }, chartData: days, rangeLabel: `${start.toLocaleDateString('es-EC')} — ${end.toLocaleDateString('es-EC')}` }
    }
    if (periodMode === 'mes') {
      const { start, end } = monthRange(now)
      const daysInMonth = end.getDate()
      const days = []
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), i)
        const dayssales = sales.filter((s) => startOfDay(new Date(s.sale_date)).getTime() === startOfDay(d).getTime())
        const total = dayssales.reduce((a, s) => a + Number(s.total), 0)
        days.push({ name: String(i), ventas: Number(total.toFixed(2)), pedidos: dayssales.length })
      }
      return { range: { start, end }, chartData: days, rangeLabel: start.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }) }
    }
    const { start, end } = yearRange(now)
    const months = []
    for (let m = 0; m < 12; m++) {
      const mStart = new Date(start.getFullYear(), m, 1)
      const mEnd = new Date(start.getFullYear(), m + 1, 0, 23, 59, 59, 999)
      const monthsales = sales.filter((s) => { const d = new Date(s.sale_date); return d >= mStart && d <= mEnd })
      const total = monthsales.reduce((a, s) => a + Number(s.total), 0)
      months.push({ name: mStart.toLocaleDateString('es-EC', { month: 'short' }), ventas: Number(total.toFixed(2)), pedidos: monthsales.length })
    }
    return { range: { start, end }, chartData: months, rangeLabel: String(start.getFullYear()) }
  }, [periodMode, sales])

  const salesInRange = useMemo(() => sales.filter((s) => { const d = new Date(s.sale_date); return d >= range.start && d <= range.end }), [sales, range])
  const enrollmentsInRange = useMemo(() => enrollments.filter((e) => { const d = new Date(e.created_at); return d >= range.start && d <= range.end }), [enrollments, range])

  const byPayment = useMemo(() => {
    const map = { efectivo: 0, transferencia: 0, tarjeta: 0 }
    for (const s of salesInRange) map[s.payment_method] = (map[s.payment_method] || 0) + Number(s.total)
    return map
  }, [salesInRange])

  const inventoryRevenue = salesInRange.reduce((a, s) => a + Number(s.total), 0)
  const coursesRevenue = enrollmentsInRange.reduce((a, e) => a + Number(e.amount_paid || 0), 0)
  const consolidatedRevenue = inventoryRevenue + coursesRevenue

  const profitability = useMemo(() => {
    let revenue = 0, cost = 0
    for (const it of saleItems) {
      const sale = salesMap[it.sale_id]
      if (!sale || sale.status === 'anulada') continue
      revenue += Number(it.line_total)
      if (it.cost_at_sale && it.cost_at_sale > 0) {
        cost += Number(it.cost_at_sale)
      } else {
        const avgCost = it.variant_id ? (variantsMap[it.variant_id]?.avg_cost || 0) : (productsMap[it.product_id]?.avg_cost || 0)
        cost += avgCost * it.quantity
      }
    }
    return { revenue, cost, margin: revenue - cost, marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 }
  }, [saleItems, salesMap, productsMap, variantsMap])

  const rotation = useMemo(() => {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
    const qtyByItem = {}
    for (const it of saleItems) {
      const sale = salesMap[it.sale_id]
      if (!sale || new Date(sale.sale_date) < monthAgo) continue
      const key = it.variant_id || it.product_id
      qtyByItem[key] = qtyByItem[key] || { description: it.description, qty: 0 }
      qtyByItem[key].qty += it.quantity
    }
    const moved = Object.values(qtyByItem).sort((a, b) => b.qty - a.qty)
    const movedKeys = new Set(Object.keys(qtyByItem))
    const noMovement = []
    for (const p of products) {
      if (p.has_variants) {
        for (const v of variants.filter((v) => v.product_id === p.id)) {
          if (!movedKeys.has(v.id)) noMovement.push(`${p.name} — ${v.variant_name}`)
        }
      } else if (!movedKeys.has(p.id)) {
        noMovement.push(p.name)
      }
    }
    return { top: moved.slice(0, 6), noMovement: noMovement.slice(0, 8) }
  }, [saleItems, salesMap, products, variants])

  const coursesFinanceAllTime = useMemo(() => {
    let collected = 0, pending = 0
    const pendingList = []
    for (const e of enrollments) {
      const due = Number(e.total_due ?? e.amount_paid ?? 0)
      const paid = Number(e.amount_paid || 0)
      collected += paid
      const balance = Math.max(0, due - paid)
      pending += balance
      if (balance > 0) pendingList.push({ name: e.customers?.name || 'Estudiante', balance })
    }
    return { collected, pending, pendingList: pendingList.sort((a, b) => b.balance - a.balance).slice(0, 8) }
  }, [enrollments])

  const geoStats = useMemo(() => {
    const byProvince = {}
    const byCanton = {}
    for (const s of sales) {
      if (s.status === 'anulada') continue
      const prov = s.customers?.province
      const canton = s.customers?.city
      if (prov) byProvince[prov] = (byProvince[prov] || 0) + Number(s.total)
      if (canton) byCanton[canton] = (byCanton[canton] || 0) + Number(s.total)
    }
    const topCantones = Object.entries(byCanton).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { byProvince, topCantones }
  }, [sales])

  if (loading) return <div className="text-ink/40 text-sm">Cargando reportes…</div>

  return (
    <div>
      <h1 className="font-display text-3xl mb-1">Reportes</h1>
      <p className="text-ink/50 text-sm mb-6">Cómo va el negocio, de un vistazo.</p>

      <div className="bg-moss/10 border border-moss/30 text-moss text-sm px-5 py-3 rounded-sm mb-8 font-display text-base">
        {phrase}
      </div>

      <h2 className="font-display text-xl mb-3">Ventas</h2>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Hoy" value={money(quickTotals.todayTotal)} sub={`${quickTotals.todayCount} venta(s)`} />
        <SummaryCard label="Últimos 7 días" value={money(quickTotals.weekTotal)} sub={`${quickTotals.weekCount} venta(s)`} />
        <SummaryCard label="Últimos 30 días" value={money(quickTotals.monthTotal)} sub={`${quickTotals.monthCount} venta(s)`} />
      </div>

      <div className="border border-line rounded-sm p-4 mb-8 bg-white/40">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40">
            {metric === 'ventas' ? 'Ventas' : 'Pedidos generados'} por período — <span className="text-ink/60">{rangeLabel}</span>
            <span className="ml-3 text-ink/80 font-sans normal-case text-sm">{metric === 'pedidos' ? `${chartData.reduce((a, d) => a + d.pedidos, 0)} pedido(s) en total` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex border border-line rounded-sm overflow-hidden">
              {[['ventas', '$'], ['pedidos', '# Pedidos']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMetric(key)}
                  className={`px-3 py-1.5 text-xs font-medium ${metric === key ? 'bg-ochre text-white' : 'bg-transparent text-ink/50 hover:bg-paperdark'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex border border-line rounded-sm overflow-hidden">
              {[['semana', 'Semana'], ['mes', 'Mes'], ['año', 'Año']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriodMode(key)}
                  className={`px-3 py-1.5 text-xs font-medium ${periodMode === key ? 'bg-ink text-paper' : 'bg-transparent text-ink/50 hover:bg-paperdark'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#D8CFBC" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#232323' }} axisLine={{ stroke: '#D8CFBC' }} tickLine={false} interval={periodMode === 'mes' ? 2 : 0} />
            <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} width={40} allowDecimals={metric === 'ventas'} />
            <Tooltip formatter={(v) => metric === 'ventas' ? money(v) : `${v} pedido(s)`} contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: '#D8CFBC' }} />
            <Bar dataKey={metric} fill={metric === 'ventas' ? '#C68A3B' : '#5B6B4F'} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {metric === 'pedidos' && (
          <p className="text-[11px] text-ink/40 mt-2">Útil como referencia de volumen para negociar tarifas con tu operador logístico (ej. Servientrega).</p>
        )}
      </div>

      <h2 className="font-display text-xl mb-3">Ingresos por forma de pago <span className="text-ink/40 text-sm font-normal">({rangeLabel})</span></h2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="Efectivo" value={money(byPayment.efectivo)} />
        <SummaryCard label="Transferencia" value={money(byPayment.transferencia)} />
        <SummaryCard label="Tarjeta" value={money(byPayment.tarjeta)} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <SummaryCard label="Inventario (ventas)" value={money(inventoryRevenue)} />
        <SummaryCard label="Cursos (cobrado)" value={money(coursesRevenue)} accent />
      </div>
      <div className="border border-moss/30 bg-moss/10 rounded-sm px-5 py-3 mb-8 flex justify-between items-center">
        <span className="text-sm text-moss font-medium">Consolidado del período (inventario + cursos)</span>
        <span className="font-display text-2xl text-moss">{money(consolidatedRevenue)}</span>
      </div>

      <h2 className="font-display text-xl mb-3">Rentabilidad</h2>
      <div className="grid grid-cols-3 gap-4 mb-1">
        <SummaryCard label="Ingresos totales" value={money(profitability.revenue)} />
        <SummaryCard label="Costo real (FIFO)" value={money(profitability.cost)} />
        <SummaryCard label="Ganancia bruta" value={`${money(profitability.margin)} (${profitability.marginPct.toFixed(0)}%)`} accent />
      </div>
      <p className="text-[11px] text-ink/40 mb-8">
        * El costo usa el valor real de los lotes consumidos (FIFO). Ventas registradas antes de activar FIFO usan el costo promedio como referencia.
      </p>

      <h2 className="font-display text-xl mb-3">Cursos — cuentas por cobrar (histórico)</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="Cobrado" value={money(coursesFinanceAllTime.collected)} accent />
        <SummaryCard label="Pendiente por cobrar" value={money(coursesFinanceAllTime.pending)} />
      </div>
      {coursesFinanceAllTime.pendingList.length > 0 && (
        <div className="border border-line rounded-sm overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2">Estudiante</th>
                <th className="px-4 py-2 text-right">Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {coursesFinanceAllTime.pendingList.map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-ochre">{money(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="font-display text-xl mb-3">Ventas por provincia y cantón</h2>
      {Object.keys(geoStats.byProvince).length === 0 ? (
        <p className="text-sm text-ink/40 mb-8">Aún no hay ventas con provincia registrada.</p>
      ) : (
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="col-span-2 border border-line rounded-sm p-4 bg-white/40">
            <EcuadorMap dataByProvince={geoStats.byProvince} />
          </div>
          <div>
            <div className="text-xs font-mono uppercase text-ink/40 mb-2">Top cantones</div>
            <ul className="space-y-1.5">
              {geoStats.topCantones.map(([canton, total], i) => (
                <li key={i} className="flex justify-between text-sm border-b border-line/60 pb-1.5">
                  <span>{canton}</span><span className="font-mono text-moss">{money(total)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-ink/40 mt-3">El color de cada provincia en el mapa refleja el total vendido — pasa el cursor para ver el monto exacto.</p>
          </div>
        </div>
      )}

      <h2 className="font-display text-xl mb-3">Rotación de inventario (últimos 30 días)</h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-line rounded-sm p-4 bg-white/40">
          <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40 mb-3">Más vendidos</div>
          {rotation.top.length === 0 ? <p className="text-sm text-ink/40">Sin ventas en este período.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(160, rotation.top.length * 34)}>
              <BarChart data={rotation.top} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="description" type="category" width={140} tick={{ fontSize: 11, fill: '#232323' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${v} und.`} contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: '#D8CFBC' }} />
                <Bar dataKey="qty" radius={[0, 3, 3, 0]}>
                  {rotation.top.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div>
          <div className="text-xs font-mono uppercase text-ink/40 mb-2">Sin movimiento (evita sobre-stockear)</div>
          {rotation.noMovement.length === 0 ? <p className="text-sm text-ink/40">Todo tu catálogo se movió este mes.</p> : (
            <ul className="space-y-1.5">
              {rotation.noMovement.map((name, i) => (
                <li key={i} className="text-sm text-plum border-b border-line/60 pb-1.5">{name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div className="border border-line rounded-sm px-5 py-4 bg-white/40">
      <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40 mb-1">{label}</div>
      <div className={`font-display text-2xl ${accent ? 'text-moss' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-ink/40 mt-0.5">{sub}</div>}
    </div>
  )
}
