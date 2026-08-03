import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export function useBusinessSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    const { data } = await supabase.from('business_settings').select('*').limit(1)
    setSettings(data && data[0] ? data[0] : null)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  return { settings, loading, reload }
}
