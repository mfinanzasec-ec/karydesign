import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Modal from '../components/Modal.jsx'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'

export default function Etiquetas({ onGoToSettings }) {
  const { settings } = useBusinessSettings()
  const [sales, setSales] = useState([])
  const [labelsBySale, setLabelsBySale] = useState({})
  const [loading, setLoading] = useState(true)
  const [labelFor, setLabelFor] = useState(null) // sale row

  async function loadAll() {
    setLoading(true)
    const { data: salesRows } = await supabase
      .from('sales')
      .select('*, customers(name, phone, address, city)')
      .order('sale_date', { ascending: false })
      .limit(30)
    setSales(salesRows || [])

    const { data: labelRows } = await supabase.from('shipping_labels').select('*')
    const byS = {}
    for (const l of labelRows || []) byS[l.sale_id] = l
    setLabelsBySale(byS)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl">Etiquetas de envío</h1>
          <p className="text-ink/50 text-sm mt-1">Genera la etiqueta para el cartón, lista para imprimir en hoja carta.</p>
        </div>
        <button
          onClick={onGoToSettings}
          className="border border-line text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-paperdark flex items-center gap-2"
        >
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="logo" className="h-5 w-5 object-contain" />
          ) : null}
          {settings ? 'Editar datos del negocio' : 'Configurar logo y negocio'}
        </button>
      </div>

      {!settings?.logo_url && (
        <div className="bg-ochre/10 border border-ochre/30 text-ochre text-sm px-4 py-3 rounded-sm mb-6">
          Aún no has subido el logo del negocio. Click en "Configurar logo y negocio" arriba para que salga en las etiquetas.
        </div>
      )}

      {loading ? (
        <div className="text-ink/40 text-sm">Cargando ventas…</div>
      ) : sales.length === 0 ? (
        <div className="border border-dashed border-line rounded-sm px-6 py-10 text-center text-ink/50">
          Aún no hay ventas registradas. Las etiquetas se generan a partir de una venta.
        </div>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5">N°</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Destino</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-line hover:bg-paperdark/40">
                  <td className="px-4 py-3 font-mono text-ink/60">#{s.sale_number}</td>
                  <td className="px-4 py-3 text-ink/60">{new Date(s.sale_date).toLocaleDateString('es-EC')}</td>
                  <td className="px-4 py-3">{s.customers?.name || '—'}</td>
                  <td className="px-4 py-3 text-ink/60">{s.customers?.city || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">${Number(s.total).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setLabelFor(s)} className="text-xs font-medium text-ochre hover:underline">
                      {labelsBySale[s.id] ? 'Ver / reimprimir' : 'Generar etiqueta'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {labelFor && (
        <LabelModal
          sale={labelFor}
          existingLabel={labelsBySale[labelFor.id]}
          settings={settings}
          onClose={() => setLabelFor(null)}
          onSaved={() => { setLabelFor(null); loadAll() }}
        />
      )}
    </div>
  )
}

function LabelModal({ sale, existingLabel, settings, onClose, onSaved }) {
  const c = sale.customers || {}
  const [recipientName, setRecipientName] = useState(existingLabel?.recipient_name || c.name || '')
  const [recipientCedula, setRecipientCedula] = useState(existingLabel?.recipient_cedula || c.cedula || '')
  const [recipientPhone, setRecipientPhone] = useState(existingLabel?.recipient_phone || c.phone || '')
  const [recipientAddress, setRecipientAddress] = useState(existingLabel?.recipient_address || c.address || '')
  const [recipientCity, setRecipientCity] = useState(existingLabel?.recipient_city || c.city || '')
  const [recipientReference, setRecipientReference] = useState(existingLabel?.recipient_reference || '')
  const [contents, setContents] = useState(existingLabel?.package_contents || '')
  const [packageCount, setPackageCount] = useState(existingLabel?.package_count || 1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!existingLabel)
  const [err, setErr] = useState(null)

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        sale_id: sale.id,
        sender_name: settings?.business_name || null,
        sender_phone: settings?.phone || null,
        recipient_name: recipientName,
        recipient_cedula: recipientCedula || null,
        recipient_phone: recipientPhone,
        recipient_address: recipientAddress,
        recipient_city: recipientCity,
        recipient_reference: recipientReference || null,
        package_contents: contents,
        package_count: Number(packageCount) || 1,
      }
      if (existingLabel?.id) {
        const { error } = await supabase.from('shipping_labels').update(payload).eq('id', existingLabel.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('shipping_labels').insert(payload)
        if (error) throw error
      }
      setSaved(true)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Etiqueta — venta #${sale.sale_number}`} onClose={onClose}>
      {!saved ? (
        <div className="space-y-3">
          <Field label="Nombre destinatario">
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="input" />
          </Field>
          <Field label="Cédula destinatario">
            <input value={recipientCedula} onChange={(e) => setRecipientCedula(e.target.value)} className="input" />
          </Field>
          <Field label="Teléfono destinatario">
            <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className="input" />
          </Field>
          <Field label="Dirección">
            <input value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad">
              <input value={recipientCity} onChange={(e) => setRecipientCity(e.target.value)} className="input" />
            </Field>
            <Field label="Referencia (opcional)">
              <input value={recipientReference} onChange={(e) => setRecipientReference(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Contenido del paquete">
            <input value={contents} onChange={(e) => setContents(e.target.value)} className="input" placeholder="Ej: 2 láminas + 1 cartulina" />
          </Field>
          <Field label="N° de bultos">
            <input type="number" min={1} value={packageCount} onChange={(e) => setPackageCount(e.target.value)} className="input" />
          </Field>
          {err && <p className="text-plum text-sm">{err}</p>}
          <button disabled={saving} onClick={handleSave} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar y ver etiqueta'}
          </button>
        </div>
      ) : (
        <LabelPrintView
          settings={settings}
          data={{ recipientName, recipientCedula, recipientPhone, recipientAddress, recipientCity, recipientReference, contents, packageCount, saleNumber: sale.sale_number }}
        />
      )}
    </Modal>
  )
}

function LabelPrintView({ settings, data }) {
  return (
    <div>
      <div id="label-print" className="printable border-2 border-ink rounded-sm p-6">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-line">
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 object-contain" />}
          <div>
            <div className="font-display text-lg">{settings?.business_name || 'Configura el nombre del negocio'}</div>
            {settings?.phone && <div className="text-xs text-ink/50">Tel: {settings.phone}</div>}
          </div>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wide text-ink/40 mb-1">Destinatario</div>
        <div className="font-display text-2xl mb-1">{data.recipientName}</div>
        {data.recipientCedula && <div className="text-sm mb-1">C.I.: {data.recipientCedula}</div>}
        <div className="text-sm mb-1">{data.recipientAddress}</div>
        <div className="text-sm mb-1">{data.recipientCity}{data.recipientReference ? ` — ${data.recipientReference}` : ''}</div>
        <div className="text-sm mb-4">Tel: {data.recipientPhone}</div>
        <div className="stitch mb-4"></div>
        <div className="flex justify-between text-sm">
          <span>Contenido: {data.contents || '—'}</span>
          <span>Bultos: {data.packageCount}</span>
        </div>
        <div className="text-right text-xs text-ink/40 mt-2 font-mono">Pedido #{data.saleNumber}</div>
      </div>
      <button
        onClick={() => window.print()}
        className="w-full mt-5 bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90"
      >
        Imprimir etiqueta
      </button>
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
