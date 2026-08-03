import React, { useEffect, useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../supabaseClient.js'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function downloadCsv(customers, statsByCustomer) {
  const headers = ['Nombre', 'Cédula', 'Email', 'Teléfono', 'Provincia', 'Cantón', 'Dirección', 'Compras', 'Total comprado', 'Última compra']
  const rows = customers.map((c) => {
    const s = statsByCustomer[c.id] || { count: 0, total: 0, last: null }
    return [
      c.name || '', c.cedula || '', c.email || '', c.phone || '', c.province || '', c.city || '', c.address || '',
      s.count, s.total.toFixed(2), s.last ? new Date(s.last).toLocaleDateString('es-EC') : '',
    ]
  })
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Clientes() {
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: c } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
      const { data: s } = await supabase.from('sales').select('customer_id, total, sale_date')
      setCustomers(c || [])
      setSales(s || [])
      setLoading(false)
    }
    load()
  }, [])

  const statsByCustomer = useMemo(() => {
    const map = {}
    for (const s of sales) {
      if (!s.customer_id) continue
      map[s.customer_id] = map[s.customer_id] || { count: 0, total: 0, last: null }
      map[s.customer_id].count++
      map[s.customer_id].total += Number(s.total)
      if (!map[s.customer_id].last || new Date(s.sale_date) > new Date(map[s.customer_id].last)) {
        map[s.customer_id].last = s.sale_date
      }
    }
    return map
  }, [sales])

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.city?.toLowerCase().includes(q) ||
      c.cedula?.includes(q) || c.email?.toLowerCase().includes(q) || c.province?.toLowerCase().includes(q)
    )
  }, [customers, search])

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl mb-1">Clientes</h1>
          <p className="text-ink/50 text-sm">Base de datos de clientes y su historial de compras.</p>
        </div>
        {customers.length > 0 && (
          <button
            onClick={() => downloadCsv(customers, statsByCustomer)}
            className="border border-line text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-paperdark flex items-center gap-2"
          >
            <Download size={15} /> Descargar CSV
          </button>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Busca por cédula, nombre, email, teléfono o provincia…"
        className="input mb-6 max-w-md"
      />

      {loading ? (
        <div className="text-ink/40 text-sm">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-line rounded-sm px-6 py-10 text-center text-ink/50">
          {customers.length === 0 ? 'Aún no hay clientes. Se crean automáticamente al registrar una venta o inscripción.' : 'Sin resultados para esa búsqueda.'}
        </div>
      ) : (
        <div className="border border-line rounded-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Cédula</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Teléfono</th>
                <th className="px-4 py-2.5">Provincia / Cantón</th>
                <th className="px-4 py-2.5 text-right">Compras</th>
                <th className="px-4 py-2.5 text-right">Total comprado</th>
                <th className="px-4 py-2.5">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const stats = statsByCustomer[c.id] || { count: 0, total: 0, last: null }
                return (
                  <tr key={c.id} className="border-t border-line hover:bg-paperdark/40">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-ink/60 font-mono">{c.cedula || '—'}</td>
                    <td className="px-4 py-3 text-ink/60">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-ink/60">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink/60">{c.province ? `${c.province} / ${c.city || '—'}` : (c.city || '—')}</td>
                    <td className="px-4 py-3 text-right font-mono">{stats.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-moss">{money(stats.total)}</td>
                    <td className="px-4 py-3 text-ink/60">{stats.last ? new Date(stats.last).toLocaleDateString('es-EC') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
