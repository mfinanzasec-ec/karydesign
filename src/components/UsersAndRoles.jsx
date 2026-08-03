import React, { useEffect, useState } from 'react'
import { Users, ShieldCheck } from 'lucide-react'
import { supabase } from '../supabaseClient.js'

const MODULES = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'etiquetas', label: 'Etiquetas' },
  { key: 'cursos', label: 'Cursos' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'impuestos', label: 'Impuestos' },
  { key: 'configuracion', label: 'Configuración' },
]

export default function UsersAndRoles() {
  const [profiles, setProfiles] = useState([])
  const [roleModules, setRoleModules] = useState({}) // role -> Set(module_key)
  const [loading, setLoading] = useState(true)
  const [newRoleName, setNewRoleName] = useState('')
  const [err, setErr] = useState(null)

  async function loadAll() {
    setLoading(true)
    const { data: profs } = await supabase.from('profiles').select('*').order('created_at')
    const { data: rm } = await supabase.from('role_modules').select('*')
    const grouped = {}
    for (const r of rm || []) {
      grouped[r.role] = grouped[r.role] || new Set()
      grouped[r.role].add(r.module_key)
    }
    setProfiles(profs || [])
    setRoleModules(grouped)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const roles = Array.from(new Set([...Object.keys(roleModules), ...profiles.map((p) => p.role)])).sort()

  async function updateUserRole(userId, role) {
    setErr(null)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) { setErr(error.message); return }
    loadAll()
  }

  async function toggleModule(role, moduleKey, currentlyOn) {
    setErr(null)
    if (currentlyOn) {
      const { error } = await supabase.from('role_modules').delete().eq('role', role).eq('module_key', moduleKey)
      if (error) { setErr(error.message); return }
    } else {
      const { error } = await supabase.from('role_modules').insert({ role, module_key: moduleKey })
      if (error) { setErr(error.message); return }
    }
    loadAll()
  }

  async function addRole() {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!name) return
    setErr(null)
    // Un rol "existe" en cuanto tiene al menos un módulo asignado — le damos uno inicial
    const { error } = await supabase.from('role_modules').insert({ role: name, module_key: 'ventas' })
    if (error) { setErr(error.message); return }
    setNewRoleName('')
    loadAll()
  }

  if (loading) return <div className="text-ink/40 text-sm">Cargando usuarios…</div>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl mb-1 flex items-center gap-2"><Users size={18} className="text-ink/40" /> Usuarios</h2>
        <p className="text-ink/50 text-sm mb-4">
          Para crear un usuario nuevo, hazlo desde el panel de Supabase (Authentication → Users → Add user). En cuanto esa
          persona inicie sesión aquí, aparecerá en esta lista para asignarle su rol.
        </p>
        {profiles.length === 0 ? (
          <p className="text-sm text-ink/40">Aún no hay usuarios registrados además de ti.</p>
        ) : (
          <div className="border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="px-4 py-2.5">Rol</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{p.full_name || '—'}</div>
                      <div className="text-xs text-ink/40">{p.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={p.role} onChange={(e) => updateUserRole(p.id, e.target.value)} className="input w-auto">
                        {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-xl mb-1 flex items-center gap-2"><ShieldCheck size={18} className="text-ink/40" /> Roles y accesos</h2>
        <p className="text-ink/50 text-sm mb-4">Marca qué módulos puede ver cada rol. Por ejemplo: "admin" con todo marcado, "ventas" solo con Ventas y Cursos.</p>

        <div className="border border-line rounded-sm overflow-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5">Rol</th>
                {MODULES.map((m) => <th key={m.key} className="px-3 py-2.5 text-center">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{role}</td>
                  {MODULES.map((m) => {
                    const on = roleModules[role]?.has(m.key)
                    return (
                      <td key={m.key} className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={!!on} onChange={() => toggleModule(role, m.key, on)} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Nombre del rol nuevo (ej: cursos)" className="input max-w-xs" />
          <button onClick={addRole} className="text-sm font-medium text-ochre hover:underline px-2">+ crear rol</button>
        </div>
      </div>

      {err && <p className="text-plum text-sm">{err}</p>}
    </div>
  )
}
