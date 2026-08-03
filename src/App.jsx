import React, { useState, useEffect } from 'react'
import { Settings, LogOut } from 'lucide-react'
import Inventario from './views/Inventario.jsx'
import Ventas from './views/Ventas.jsx'
import Etiquetas from './views/Etiquetas.jsx'
import Cursos from './views/Cursos.jsx'
import Reportes from './views/Reportes.jsx'
import Clientes from './views/Clientes.jsx'
import Configuracion from './views/Configuracion.jsx'
import Impuestos from './views/Impuestos.jsx'
import Login from './views/Login.jsx'
import { useBusinessSettings } from './hooks/useBusinessSettings.js'
import { useAuth } from './hooks/useAuth.js'

const NAV = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'etiquetas', label: 'Etiquetas' },
  { key: 'cursos', label: 'Cursos' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'impuestos', label: 'Impuestos' },
]

export default function App() {
  const { session, profile, allowedModules, loading, signOut } = useAuth()
  const { settings } = useBusinessSettings()
  const [active, setActive] = useState('inventario')

  const visibleNav = NAV.filter((item) => allowedModules.includes(item.key))
  const canSeeSettings = allowedModules.includes('configuracion')

  useEffect(() => {
    if (!loading && visibleNav.length > 0 && !visibleNav.find((i) => i.key === active)) {
      setActive(visibleNav[0].key)
    }
  }, [loading, allowedModules])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink/40 text-sm">Cargando…</div>
  if (!session) return <Login />

  return (
    <div className="min-h-screen flex">
      {/* Sidebar estilo lomo de agenda */}
      <aside className="w-60 shrink-0 bg-ink text-paper flex flex-col">
        <div className="px-6 py-7 flex items-center gap-3">
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-9 w-9 object-contain rounded-sm bg-white/90 p-1" />}
          <div>
            <div className="font-display text-xl tracking-tight leading-tight">{settings?.business_name || 'Tu negocio'}</div>
            <div className="text-xs text-paper/50 mt-0.5 font-mono uppercase tracking-wider">Panel de control</div>
          </div>
        </div>
        <nav className="flex-1 mt-2">
          {visibleNav.length === 0 ? (
            <div className="px-6 py-3 text-xs text-paper/40">Tu rol aún no tiene módulos asignados. Pide a un administrador que te dé acceso en Configuración.</div>
          ) : visibleNav.map((item) => (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              className={`tab-punch w-full text-left px-6 py-3 text-sm font-medium border-l-2 transition-colors hover:text-white hover:bg-white/5 cursor-pointer
                ${active === item.key ? 'border-ochre bg-white/5 text-white' : 'border-transparent text-paper/60'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {canSeeSettings && (
          <button
            onClick={() => setActive('configuracion')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-t border-white/10 hover:bg-white/5 ${active === 'configuracion' ? 'text-white bg-white/5' : 'text-paper/60'}`}
          >
            <Settings size={15} />
            Configuración
            {!settings?.logo_url && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ochre" title="Falta subir el logo" />}
          </button>
        )}
        <div className="px-6 py-3 border-t border-white/10">
          <div className="text-xs text-paper/70 truncate">{profile?.full_name || profile?.email}</div>
          <div className="text-[10px] text-paper/40 font-mono uppercase mb-2">{profile?.role}</div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-[11px] text-paper/50 hover:text-white">
            <LogOut size={12} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 px-10 py-8 max-w-6xl">
        {active === 'inventario' && allowedModules.includes('inventario') && <Inventario />}
        {active === 'ventas' && allowedModules.includes('ventas') && <Ventas />}
        {active === 'clientes' && allowedModules.includes('clientes') && <Clientes />}
        {active === 'etiquetas' && allowedModules.includes('etiquetas') && <Etiquetas onGoToSettings={() => setActive('configuracion')} />}
        {active === 'cursos' && allowedModules.includes('cursos') && <Cursos />}
        {active === 'reportes' && allowedModules.includes('reportes') && <Reportes />}
        {active === 'impuestos' && allowedModules.includes('impuestos') && <Impuestos />}
        {active === 'configuracion' && canSeeSettings && <Configuracion />}
      </main>
    </div>
  )
}
