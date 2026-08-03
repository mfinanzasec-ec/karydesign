import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabaseClient.js'
import Modal from '../components/Modal.jsx'
import { useBusinessSettings } from '../hooks/useBusinessSettings.js'

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

export default function Cursos() {
  const { settings } = useBusinessSettings()
  const [tab, setTab] = useState('cursos') // cursos | estudiantes
  const [courses, setCourses] = useState([])
  const [sessionsByCourse, setSessionsByCourse] = useState({})
  const [enrollByCession, setEnrollBySession] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [expandedSession, setExpandedSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [showNewSession, setShowNewSession] = useState(null) // course
  const [showEnroll, setShowEnroll] = useState(null) // { session, course }
  const [showAbono, setShowAbono] = useState(null) // enrollment

  async function loadAll() {
    setLoading(true)
    const { data: courseRows } = await supabase.from('courses').select('*').order('created_at')
    const { data: sessionRows } = await supabase.from('course_sessions').select('*').order('session_date', { ascending: false })
    const { data: enrollRows } = await supabase.from('course_enrollments').select('*, customers(name, phone, cedula)')

    const sByC = {}
    for (const s of sessionRows || []) { sByC[s.course_id] = sByC[s.course_id] || []; sByC[s.course_id].push(s) }
    const eByS = {}
    for (const e of enrollRows || []) { eByS[e.session_id] = eByS[e.session_id] || []; eByS[e.session_id].push(e) }

    setCourses(courseRows || [])
    setSessionsByCourse(sByC)
    setEnrollBySession(eByS)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // Base de datos de estudiantes: todas las inscripciones, agrupadas por estudiante (para armar la comunidad)
  const studentsList = useMemo(() => {
    const all = Object.values(enrollByCession).flat()
    const byCustomer = {}
    for (const e of all) {
      const cid = e.customer_id
      if (!cid) continue
      byCustomer[cid] = byCustomer[cid] || { name: e.customers?.name, phone: e.customers?.phone, cedula: e.customers?.cedula, courses: new Set(), totalPaid: 0 }
      byCustomer[cid].totalPaid += Number(e.amount_paid || 0)
    }
    // Asocia cada inscripción a su curso, para contar cuántos cursos distintos tomó cada quien
    for (const s of Object.values(sessionsByCourse).flat()) {
      for (const e of (enrollByCession[s.id] || [])) {
        if (byCustomer[e.customer_id]) byCustomer[e.customer_id].courses.add(s.course_id)
      }
    }
    return Object.values(byCustomer).map((s) => ({ ...s, courseCount: s.courses.size }))
  }, [enrollByCession, sessionsByCourse])

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl">Cursos</h1>
          <p className="text-ink/50 text-sm mt-1">Registra aquí tus cursos online y presenciales, sus sesiones e inscripciones.</p>
        </div>
      </div>

      <div className="flex border border-line rounded-sm overflow-hidden w-fit mb-6">
        {[['cursos', 'Cursos'], ['estudiantes', 'Estudiantes']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium ${tab === key ? 'bg-ink text-paper' : 'bg-transparent text-ink/50 hover:bg-paperdark'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'estudiantes' ? (
        <StudentsView students={studentsList} />
      ) : (
        <CoursesView
          courses={courses}
          sessionsByCourse={sessionsByCourse}
          enrollByCession={enrollByCession}
          expanded={expanded}
          setExpanded={setExpanded}
          expandedSession={expandedSession}
          setExpandedSession={setExpandedSession}
          loading={loading}
          setShowNewCourse={setShowNewCourse}
          setShowNewSession={setShowNewSession}
          setShowEnroll={setShowEnroll}
          setShowAbono={setShowAbono}
        />
      )}

      {showNewCourse && <NewCourseModal onClose={() => setShowNewCourse(false)} onCreated={() => { setShowNewCourse(false); loadAll() }} />}
      {showNewSession && <NewSessionModal course={showNewSession} onClose={() => setShowNewSession(null)} onCreated={() => { setShowNewSession(null); loadAll() }} />}
      {showEnroll && <NewEnrollmentModal session={showEnroll.session} course={showEnroll.course} settings={settings} onClose={() => setShowEnroll(null)} onCreated={() => loadAll()} />}
      {showAbono && <AbonoModal enrollment={showAbono} settings={settings} onClose={() => setShowAbono(null)} onSaved={() => loadAll()} />}
    </div>
  )
}

function StudentsView({ students }) {
  const [search, setSearch] = useState('')
  const filtered = students.filter((s) => !search.trim() || s.name?.toLowerCase().includes(search.toLowerCase()) || s.cedula?.includes(search))

  return (
    <div>
      <p className="text-sm text-ink/50 mb-4">Base de datos de todas las estudiantes inscritas, para tu comunidad de cursos.</p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca por nombre o cédula…" className="input mb-4 max-w-md" />
      {filtered.length === 0 ? (
        <p className="text-sm text-ink/40">Aún no hay estudiantes inscritas.</p>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paperdark text-left text-ink/60 font-mono text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Cédula</th>
                <th className="px-4 py-2.5">Teléfono</th>
                <th className="px-4 py-2.5 text-right">Cursos tomados</th>
                <th className="px-4 py-2.5 text-right">Total pagado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{s.name || 'Estudiante'}</td>
                  <td className="px-4 py-3 text-ink/60 font-mono">{s.cedula || '—'}</td>
                  <td className="px-4 py-3 text-ink/60">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.courseCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-moss">{money(s.totalPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CoursesView({ courses, sessionsByCourse, enrollByCession, expanded, setExpanded, expandedSession, setExpandedSession, loading, setShowNewCourse, setShowNewSession, setShowEnroll, setShowAbono }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNewCourse(true)} className="bg-ink text-paper text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-ink/90">
          + Nuevo curso
        </button>
      </div>

      {loading ? (
        <div className="text-ink/40 text-sm">Cargando…</div>
      ) : courses.length === 0 ? (
        <div className="border border-dashed border-line rounded-sm px-6 py-10 text-center text-ink/50">
          Aún no hay cursos creados. Crea los 4 temas con "+ Nuevo curso".
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => {
            const sessions = sessionsByCourse[course.id] || []
            const isOpen = expanded === course.id
            const allEnrolls = sessions.flatMap((s) => enrollByCession[s.id] || [])
            const totalCollected = allEnrolls.reduce((a, e) => a + Number(e.amount_paid || 0), 0)
            const totalPending = allEnrolls.reduce((a, e) => a + Math.max(0, Number(e.total_due ?? e.amount_paid ?? 0) - Number(e.amount_paid || 0)), 0)
            return (
              <div key={course.id} className="border border-line rounded-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 bg-white/40 cursor-pointer" onClick={() => setExpanded(isOpen ? null : course.id)}>
                  <div>
                    <div className="font-display text-lg">{course.name} <span className="text-ink/30 text-sm">{isOpen ? '▾' : '▸'}</span></div>
                    <div className="text-xs text-ink/50">{sessions.length} sesión(es) · {money(course.price)} por inscripción</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide font-mono text-ink/40">Cobrado {totalPending > 0 && <span className="text-ochre">· pendiente {money(totalPending)}</span>}</div>
                    <div className="font-display text-lg text-moss">{money(totalCollected)}</div>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-5 py-4 border-t border-line">
                    <button onClick={() => setShowNewSession(course)} className="text-xs font-medium text-ochre hover:underline mb-3">
                      + agregar sesión
                    </button>
                    {sessions.length === 0 ? (
                      <p className="text-sm text-ink/40">Sin sesiones aún.</p>
                    ) : (
                      <div className="space-y-2">
                        {sessions.map((s) => {
                          const enrolls = enrollByCession[s.id] || []
                          const revenue = enrolls.reduce((a, e) => a + Number(e.amount_paid || 0), 0)
                          const sOpen = expandedSession === s.id
                          return (
                            <div key={s.id} className="border border-line/60 rounded-sm bg-paper/60">
                              <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer" onClick={() => setExpandedSession(sOpen ? null : s.id)}>
                                <div className="text-sm">
                                  <span className="font-medium">{new Date(s.session_date).toLocaleDateString('es-EC')}</span>
                                  <span className="text-ink/50 ml-2">{enrolls.length} inscrito(s) {sOpen ? '▾' : '▸'}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-mono text-sm text-moss">{money(revenue)}</span>
                                  <button onClick={(e) => { e.stopPropagation(); setShowEnroll({ session: s, course }) }} className="text-xs font-medium text-ochre hover:underline">
                                    + inscripción
                                  </button>
                                </div>
                              </div>
                              {sOpen && enrolls.length > 0 && (
                                <div className="px-4 pb-3 space-y-1.5">
                                  {enrolls.map((e) => {
                                    const due = Number(e.total_due ?? e.amount_paid ?? 0)
                                    const paid = Number(e.amount_paid || 0)
                                    const balance = Math.max(0, due - paid)
                                    return (
                                      <div key={e.id} className="flex items-center justify-between text-xs border-t border-line/50 pt-1.5">
                                        <span>{e.customers?.name || 'Estudiante'}</span>
                                        <div className="flex items-center gap-3 font-mono">
                                          <span className="text-ink/50">pagado {money(paid)} / {money(due)}</span>
                                          {balance > 0 ? (
                                            <>
                                              <span className="text-ochre">saldo {money(balance)}</span>
                                              <button onClick={() => setShowAbono({ ...e, _courseName: course.name, _sessionDate: s.session_date })} className="text-ochre hover:underline font-sans">+ abono</button>
                                            </>
                                          ) : (
                                            <span className="text-moss">pagado</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewCourseModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      const { data: existing, error: dupErr } = await supabase.from('courses').select('id').ilike('name', name.trim()).limit(1)
      if (dupErr) throw dupErr
      if (existing && existing.length > 0) throw new Error('Ya existe un curso con este nombre.')

      const { error } = await supabase.from('courses').insert({ name: name.trim(), description, price: Number(price) || 0 })
      if (error) throw error
      onCreated()
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Nuevo curso" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre del curso">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ej: Emprendedoras de Agenda" />
        </Field>
        <Field label="Descripción (opcional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </Field>
        <Field label="Precio de inscripción">
          <input required type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
        </Field>
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear curso'}
        </button>
      </form>
    </Modal>
  )
}

function NewSessionModal({ course, onClose, onCreated }) {
  const [date, setDate] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      const { error } = await supabase.from('course_sessions').insert({
        course_id: course.id,
        session_date: date,
        capacity: capacity ? Number(capacity) : null,
      })
      if (error) throw error
      onCreated()
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={`Nueva sesión — ${course.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Fecha de la sesión">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </Field>
        <Field label="Cupo (opcional)">
          <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="input" />
        </Field>
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear sesión'}
        </button>
      </form>
    </Modal>
  )
}

function NewEnrollmentModal({ session, course, settings, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [cedula, setCedula] = useState('')
  const [phone, setPhone] = useState('')
  const [totalDue, setTotalDue] = useState(course?.price || '')
  const [amountPaid, setAmountPaid] = useState('')
  const [attended, setAttended] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [found, setFound] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const balance = Math.max(0, (Number(totalDue) || 0) - (Number(amountPaid) || 0))

  async function handleCedulaLookup(value) {
    setCedula(value)
    setFound(false)
    if (value.trim().length < 5) return
    const { data } = await supabase.from('customers').select('*').eq('cedula', value.trim()).limit(1)
    if (data && data.length > 0) {
      setFound(true)
      setName(data[0].name || '')
      setPhone(data[0].phone || '')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      if (!cedula.trim()) throw new Error('Ingresa la cédula de la estudiante.')
      let customerId = null
      const { data: existingCust } = await supabase.from('customers').select('id').eq('cedula', cedula.trim()).limit(1)
      if (existingCust && existingCust.length > 0) customerId = existingCust[0].id
      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase
          .from('customers').insert({ name: name.trim(), cedula: cedula.trim(), phone: phone.trim() || null }).select().single()
        if (custErr) throw custErr
        customerId = newCust.id
      } else {
        await supabase.from('customers').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', customerId)
      }

      const { error } = await supabase.from('course_enrollments').insert({
        session_id: session.id,
        customer_id: customerId,
        total_due: Number(totalDue) || 0,
        amount_paid: Number(amountPaid) || 0,
        attended,
      })
      if (error) throw error
      onCreated()
      setReceipt({
        studentName: name.trim(), cedula: cedula.trim(), courseName: course.name,
        sessionDate: session.session_date, amountNow: Number(amountPaid) || 0,
        totalDue: Number(totalDue) || 0, balance: Math.max(0, (Number(totalDue) || 0) - (Number(amountPaid) || 0)),
      })
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  if (receipt) {
    return (
      <Modal title="Inscripción registrada" onClose={onClose}>
        <CoursePaymentReceipt settings={settings} data={receipt} />
      </Modal>
    )
  }

  return (
    <Modal title="Nueva inscripción" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Cédula de la estudiante">
          <input required value={cedula} onChange={(e) => handleCedulaLookup(e.target.value)} className="input" />
        </Field>
        {found && <p className="text-[11px] text-moss font-mono -mt-2">✓ Estudiante ya registrada, datos autocompletados</p>}
        <Field label="Nombre de la estudiante">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <Field label="Teléfono">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto total del curso">
            <input required type="number" step="0.01" value={totalDue} onChange={(e) => setTotalDue(e.target.value)} className="input" />
          </Field>
          <Field label="Abono / monto pagado ahora">
            <input required type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="input" />
          </Field>
        </div>
        <p className={`text-xs font-mono ${balance > 0 ? 'text-ochre' : 'text-moss'}`}>
          {balance > 0 ? `Queda un saldo pendiente de ${money(balance)}` : 'Curso pagado por completo'}
        </p>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={attended} onChange={(e) => setAttended(e.target.checked)} />
          Asistió a la sesión
        </label>
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar inscripción'}
        </button>
      </form>
    </Modal>
  )
}

// Comprobante de pago imprimible para un pago o abono de curso
function CoursePaymentReceipt({ settings, data }) {
  return (
    <div>
      <div className="printable text-sm border border-line">
        <div className="bg-ink text-paper px-6 py-5 flex items-center gap-3">
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 w-12 object-contain rounded-sm bg-white p-1" />}
          <div>
            <div className="font-display text-xl leading-tight">{settings?.business_name || 'Configura el nombre del negocio'}</div>
            <div className="text-[11px] text-paper/60 mt-0.5 space-x-2">
              {settings?.phone && <span>Tel: {settings.phone}</span>}
              {settings?.address && <span>· {settings.address}</span>}
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="font-display text-lg mb-4">Comprobante de pago — Curso</div>
          <div className="stitch mb-4"></div>
          <div className="text-sm space-y-1 mb-4">
            <div><span className="text-ink/50">Estudiante:</span> <span className="font-medium">{data.studentName}</span></div>
            {data.cedula && <div><span className="text-ink/50">C.I.:</span> {data.cedula}</div>}
            <div><span className="text-ink/50">Curso:</span> {data.courseName}</div>
            <div><span className="text-ink/50">Sesión:</span> {new Date(data.sessionDate).toLocaleDateString('es-EC')}</div>
            <div><span className="text-ink/50">Fecha de pago:</span> {new Date().toLocaleString('es-EC')}</div>
          </div>
          <div className="stitch mb-4"></div>
          <div className="flex justify-between text-xs text-ink/60"><span>Monto total del curso</span><span className="font-mono">{money(data.totalDue)}</span></div>
          <div className="flex justify-between font-display text-2xl mt-1 pt-2 border-t border-ink"><span>Pagado ahora</span><span>{money(data.amountNow)}</span></div>
          <div className={`flex justify-between text-xs mt-2 ${data.balance > 0 ? 'text-ochre' : 'text-moss'}`}>
            <span>{data.balance > 0 ? 'Saldo pendiente' : 'Estado'}</span>
            <span className="font-mono">{data.balance > 0 ? money(data.balance) : 'Pagado por completo'}</span>
          </div>
          <div className="text-center text-[11px] text-ink/40 mt-5">Documento interno de la empresa, no válido como factura tributaria.</div>
        </div>
      </div>
      <button onClick={() => window.print()} className="w-full mt-5 bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90">
        Imprimir comprobante
      </button>
    </div>
  )
}

function AbonoModal({ enrollment, settings, onClose, onSaved }) {
  const due = Number(enrollment.total_due ?? enrollment.amount_paid ?? 0)
  const currentPaid = Number(enrollment.amount_paid || 0)
  const currentBalance = Math.max(0, due - currentPaid)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [receipt, setReceipt] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      const abono = Number(amount) || 0
      if (abono <= 0) throw new Error('El abono debe ser mayor a 0')
      const newPaid = currentPaid + abono
      const { error } = await supabase.from('course_enrollments').update({ amount_paid: newPaid }).eq('id', enrollment.id)
      if (error) throw error
      onSaved()
      setReceipt({
        studentName: enrollment.customers?.name || 'Estudiante', cedula: enrollment.customers?.cedula,
        courseName: enrollment._courseName || '—', sessionDate: enrollment._sessionDate || new Date(),
        amountNow: abono, totalDue: due, balance: Math.max(0, due - newPaid),
      })
    } catch (e2) { setErr(e2.message) } finally { setSaving(false) }
  }

  if (receipt) {
    return (
      <Modal title="Abono registrado" onClose={onClose}>
        <CoursePaymentReceipt settings={settings} data={receipt} />
      </Modal>
    )
  }

  return (
    <Modal title={`Registrar abono — ${enrollment.customers?.name || 'Estudiante'}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-xs text-ink/50 font-mono bg-paperdark px-3 py-2 rounded-sm">
          Total: {money(due)} · Pagado: {money(currentPaid)} · Saldo actual: {money(currentBalance)}
        </div>
        <Field label="Monto del abono">
          <input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </Field>
        {err && <p className="text-plum text-sm">{err}</p>}
        <button disabled={saving} className="w-full bg-ink text-paper font-medium py-2.5 rounded-sm hover:bg-ink/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar abono'}
        </button>
      </form>
    </Modal>
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
