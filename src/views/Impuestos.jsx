import React, { useEffect, useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

const IVA_RATE = 0.15

function monthRange(year, month) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export default function Impuestos() {
  const { settings } = useBusinessSettings()
  const recoversIvaCredit = settings?.recovers_iva_credit !== false
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('sales').select('*').order('sale_date', { ascending: true })
      const { data: mov } = await supabase.from('stock_movements').select('*').eq('movement_type', 'entrada').order('created_at', { ascending: true })
      setSales(data || [])
      setPurchases(mov || [])
      setLoading(false)
    }
    load()
  }, [])

  const { start, end } = monthRange(year, month)

  const monthSales = useMemo(
    () => sales.filter((s) => { const d = new Date(s.sale_date); return d >= start && d <= end && s.status !== 'anulada' }),
    [sales, year, month]
  )

  const monthPurchases = useMemo(
    () => purchases.filter((p) => { const d = new Date(p.created_at); return d >= start && d <= end }),
    [purchases, year, month]
  )

  const ivaCredit = useMemo(() => monthPurchases.reduce((a, p) => a + Number(p.iva_amount || 0), 0), [monthPurchases])

  const summary = useMemo(() => {
    let taxedBase = 0, ivaCollected = 0, exemptSales = 0
    for (const s of monthSales) {
      const base = Number(s.subtotal) - Number(s.discount || 0) + Number(s.shipping_fee || 0)
      if (s.apply_iva) {
        taxedBase += base
        ivaCollected += Number(s.iva_amount || 0)
      } else {
        exemptSales += base
      }
    }
    return { taxedBase, ivaCollected, exemptSales, total: taxedBase + ivaCollected + exemptSales, count: monthSales.length }
  }, [monthSales])

  const dailyBreakdown = useMemo(() => {
    const map = {}
    for (const s of monthSales) {
      const day = new Date(s.sale_date).getDate()
      map[day] = map[day] || { taxed: 0, iva: 0, exempt: 0 }
      const base = Number(s.subtotal) - Number(s.discount || 0) + Number(s.shipping_fee || 0)
      if (s.apply_iva) { map[day].taxed += base; map[day].iva += Number(s.iva_amount || 0) }
      else map[day].exempt += base
    }
    return Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [monthSales])

  function downloadCsv() {
    const monthLabel = start.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })
    const headers = ['Día', 'Base gravada 15%', 'IVA generado', 'Ventas exentas/sin IVA', 'Total del día']
    const rows = dailyBreakdown.map(([day, d]) => [day, d.taxed.toFixed(2), d.iva.toFixed(2), d.exempt.toFixed(2), (d.taxed + d.iva + d.exempt).toFixed(2)])
    rows.push([])
    rows.push(['TOTAL MES', summary.taxedBase.toFixed(2), summary.ivaCollected.toFixed(2), summary.exemptSales.toFixed(2), summary.total.toFixed(2)])
    if (recoversIvaCredit) {
      rows.push([])
      rows.push(['IVA en compras (crédito tributario)', ivaCredit.toFixed(2)])
      rows.push([summary.ivaCollected - ivaCredit >= 0 ? 'IVA neto a pagar' : 'Crédito a favor', Math.abs(summary.ivaCollected - ivaCredit).toFixed(2)])
    }
    const csv = [[`Resumen de IVA — ${monthLabel}`], headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iva_${year}_${String(month + 1).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  return (
    <div>
      <h1 className="font-display text-3xl mb-1">Impuestos — Resumen de IVA</h1>
      <p className="text-ink/50 text-sm mb-4">Insumo mensual para tu declaración, tarifa general vigente 15%.</p>

      <div className="bg-ochre/10 border border-ochre/30 text-ochre text-sm px-4 py-3 rounded-sm mb-6">
        Esto es un resumen informativo de tus ventas y compras, no una declaración presentada al SRI — no reemplaza el
        Formulario 104, pásaselo a tu contador como base de trabajo. {recoversIvaCredit
          ? 'Configuraste que tu negocio SÍ recupera crédito tributario de IVA en compras — por eso se muestra el neto a pagar.'
          : 'Configuraste que tu negocio NO recupera crédito tributario (Negocio Popular) — el IVA de tus compras ya está incluido como costo, no como crédito.'} Verifica siempre la tarifa vigente y las reglas aplicables a tu caso antes de declarar.
      </div>

      <div className="flex items-center gap-3 mb-6">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-auto">
          {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-auto">
          {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {summary.count > 0 && (
          <button onClick={downloadCsv} className="ml-auto border border-line text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-paperdark flex items-center gap-2">
            <Download size={15} /> Descargar CSV para el contador
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-ink/40 text-sm">Cargando…</div>
      ) : summary.count === 0 ? (
        <div className="border border-dashed border-line rounded-sm px-6 py-10 text-center text-ink/50">
          No hay ventas registradas en {monthNames[month]} {year}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <SummaryCard label="Base gravada (15%)" value={money(summary.taxedBase)} />
            <SummaryCard label="IVA generado (ventas)" value={money(summary.ivaCollected)} accent />
            <SummaryCard label="Ventas sin IVA" value={money(summary.exemptSales)} />
            <SummaryCard label="Total facturado" value={money(summary.total)} sub={`${summary.count} venta(s)`} />
          </div>

          {recoversIvaCredit && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <SummaryCard label="IVA en compras (crédito)" value={money(ivaCredit)} />
              <SummaryCard
                label={summary.ivaCollected - ivaCredit >= 0 ? 'IVA neto a pagar' : 'Crédito tributario a favor'}
                value={money(Math.abs(summary.ivaCollected - ivaCredit))}
                accent
              />
              <SummaryCard label="Compras del mes" value={`${monthPurchases.length} registro(s)`} />
            </div>
          )}
          {!recoversIvaCredit && <div className="mb-8" />}

          <div className="border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2">Día</th>
                  <th className="px-4 py-2 text-right">Base gravada</th>
                  <th className="px-4 py-2 text-right">IVA</th>
                  <th className="px-4 py-2 text-right">Sin IVA</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.map(([day, d]) => (
                  <tr key={day} className="border-t border-line">
                    <td className="px-4 py-2 font-mono">{day}</td>
                    <td className="px-4 py-2 text-right font-mono">{money(d.taxed)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ochre">{money(d.iva)}</td>
                    <td className="px-4 py-2 text-right font-mono">{money(d.exempt)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium">{money(d.taxed + d.iva + d.exempt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div className="border border-line rounded-sm px-5 py-4 bg-white/40">
      <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40 mb-1">{label}</div>
      <div className={`font-display text-2xl ${accent ? 'text-ochre' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-ink/40 mt-0.5">{sub}</div>}
    </div>
  )
}
