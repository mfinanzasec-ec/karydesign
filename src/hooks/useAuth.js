import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = cargando, null = sin sesión
  const [profile, setProfile] = useState(null)
  const [allowedModules, setAllowedModules] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) { setProfile(null); setAllowedModules([]); setLoadingProfile(false); return }
      setLoadingProfile(true)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(prof || null)
      if (prof?.role) {
        const { data: mods } = await supabase.from('role_modules').select('module_key').eq('role', prof.role)
        setAllowedModules((mods || []).map((m) => m.module_key))
      } else {
        setAllowedModules([])
      }
      setLoadingProfile(false)
    }
    if (session !== undefined) loadProfile()
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { session, profile, allowedModules, loading: session === undefined || loadingProfile, signOut }
}
