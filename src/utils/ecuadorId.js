// Validación de cédula y RUC de Ecuador con los algoritmos oficiales (módulo 10 / módulo 11).
// No consulta al SRI en vivo — valida la estructura y el dígito verificador localmente.

function validarCedula(cedula) {
  if (!/^\d{10}$/.test(cedula)) return false
  const digits = cedula.split('').map(Number)
  const province = parseInt(cedula.slice(0, 2), 10)
  if (province < 1 || province > 24) return false
  if (digits[2] > 6) return false
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let val = digits[i] * coef[i]
    if (val > 9) val -= 9
    sum += val
  }
  const verifier = sum % 10 === 0 ? 0 : 10 - (sum % 10)
  return verifier === digits[9]
}

function validarRucNatural(ruc) {
  const base10 = ruc.slice(0, 10)
  if (!validarCedula(base10)) return false
  return ruc.slice(10, 13) !== '000'
}

function validarRucSociedad(ruc) {
  const digits = ruc.split('').map(Number)
  const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += digits[i] * coef[i]
  let verifier = 11 - (sum % 11)
  if (verifier === 11) verifier = 0
  if (verifier === 10) return false
  return verifier === digits[9] && ruc.slice(10, 13) !== '000'
}

function validarRucPublico(ruc) {
  const digits = ruc.split('').map(Number)
  const coef = [3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 8; i++) sum += digits[i] * coef[i]
  let verifier = 11 - (sum % 11)
  if (verifier === 11) verifier = 0
  return verifier === digits[8] && ruc.slice(9, 13) !== '0000'
}

// Devuelve { valid, type, message } — type: 'cedula' | 'ruc_natural' | 'ruc_sociedad' | 'ruc_publico'
export function validarCedulaORuc(value) {
  const clean = (value || '').trim()
  if (!/^\d+$/.test(clean)) {
    return { valid: false, type: null, message: 'Solo debe contener números.' }
  }
  if (clean.length === 10) {
    const ok = validarCedula(clean)
    return { valid: ok, type: 'cedula', message: ok ? null : 'La cédula no es válida (dígito verificador incorrecto).' }
  }
  if (clean.length === 13) {
    const thirdDigit = parseInt(clean[2], 10)
    if (thirdDigit === 6) {
      const ok = validarRucPublico(clean)
      return { valid: ok, type: 'ruc_publico', message: ok ? null : 'El RUC de entidad pública no es válido.' }
    }
    if (thirdDigit === 9) {
      const ok = validarRucSociedad(clean)
      return { valid: ok, type: 'ruc_sociedad', message: ok ? null : 'El RUC de sociedad no es válido.' }
    }
    const ok = validarRucNatural(clean)
    return { valid: ok, type: 'ruc_natural', message: ok ? null : 'El RUC no es válido.' }
  }
  return { valid: false, type: null, message: 'Debe tener 10 dígitos (cédula) o 13 dígitos (RUC).' }
}
