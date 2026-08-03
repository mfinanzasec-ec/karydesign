import React, { useState } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '../supabaseClient.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr('Correo o contraseña incorrectos.')
    setSaving(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-line rounded-sm p-8 bg-white/40">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-sm bg-ink text-paper flex items-center justify-center"><LogIn size={16} /></div>
          <h1 className="font-display text-2xl">Iniciar sesión</h1>
        </div>
        <div className="space-y-3 mb-5">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" className="input" />
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" className="input" />
        </div>
        {err && <p className="text-plum text-sm mb-4">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
