import React, { useState, useEffect } from 'react'
import { Upload, Check, ScanBarcode } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'
import UsersAndRoles from '../components/UsersAndRoles.jsx'

export default function Configuracion() {
  const { settings, loading, reload } = useBusinessSettings()
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [barcodeScannerEnabled, setBarcodeScannerEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name || '')
      setPhone(settings.phone || '')
      setAddress(settings.address || '')
      setPreview(settings.logo_url || null)
      setBarcodeScannerEnabled(!!settings.barcode_scanner_enabled)
    }
  }, [settings])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setErr(null); setSaved(false)
    try {
      let logoUrl = settings?.logo_url || null
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logo-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('logos').upload(path, logoFile, { upsert: true })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)
        logoUrl = pub.publicUrl
      }
      const payload = { business_name: businessName, phone: phone || null, address: address || null, logo_url: logoUrl, barcode_scanner_enabled: barcodeScannerEnabled, updated_at: new Date().toISOString() }
      if (settings?.id) {
        const { error } = await supabase.from('business_settings').update(payload).eq('id', settings.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('business_settings').insert(payload)
        if (error) throw error
      }
      await reload()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="text-ink/40 text-sm">Cargando…</div>

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl mb-1">Configuración</h1>
      <p className="text-ink/50 text-sm mb-8">El logo y los datos de contacto aparecen en la nota de venta, las etiquetas de envío y los comprobantes de curso.</p>

      <form onSubmit={handleSave} className="border border-line rounded-sm p-6 bg-white/40 space-y-5">
        <div>
          <span className="block text-xs font-mono uppercase tracking-wide text-ink/50 mb-2">Logo del negocio</span>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 border border-line rounded-sm bg-paper flex items-center justify-center overflow-hidden">
              {preview ? <img src={preview} alt="logo" className="h-full w-full object-contain p-1" /> : <span className="text-[10px] text-ink/30 text-center px-2">Sin logo</span>}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-ochre border border-ochre/40 rounded-sm px-4 py-2 cursor-pointer hover:bg-ochre/10">
              <Upload size={15} />
              Subir logo
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>

        <div>
          <span className="block text-xs font-mono uppercase tracking-wide text-ink/50 mb-1">Nombre del negocio</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" placeholder="Ej: Kary Design" />
        </div>
        <div>
          <span className="block text-xs font-mono uppercase tracking-wide text-ink/50 mb-1">Teléfono</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </div>
        <div>
          <span className="block text-xs font-mono uppercase tracking-wide text-ink/50 mb-1">Dirección</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
        </div>

        <div className="border border-line rounded-sm p-4 bg-paperdark/50">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={barcodeScannerEnabled}
              onChange={(e) => setBarcodeScannerEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <ScanBarcode size={16} className="text-ink/50" /> Modo lector de código de barras en Ventas
              </span>
              <span className="block text-xs text-ink/50 mt-1">
                Actívalo cuando vendas en un punto de venta físico con lector de código de barras conectado. El buscador de productos en Ventas
                queda listo para recibir el código escaneado y agregar el producto directo al carrito, sin tener que escribir el nombre.
                Ya puedes registrar el código de barras de cada producto desde Inventario.
              </span>
            </span>
          </label>
        </div>

        {err && <p className="text-plum text-sm">{err}</p>}

        <button disabled={saving} className="bg-ink text-paper font-medium px-5 py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50 flex items-center gap-2">
          {saved && <Check size={16} />}
          {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}
        </button>
      </form>

      <div className="mt-10">
        <UsersAndRoles />
      </div>
    </div>
  )
}
