import React, { useMemo, useState } from 'react'
import { ECUADOR_PROVINCE_PATHS, ECUADOR_MAP_VIEWBOX, GALAPAGOS_BOX } from '../data/ecuadorMapPaths.js'

// El geojson fuente nombra "Santo Domingo" — lo mapeamos al nombre oficial que usamos en el resto del sistema
const NAME_TO_PATH_KEY = {
  'Santo Domingo de los Tsáchilas': 'Santo Domingo',
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

export default function EcuadorMap({ dataByProvince }) {
  const [hover, setHover] = useState(null) // { province, value, x, y }

  const maxValue = useMemo(() => Math.max(1, ...Object.values(dataByProvince)), [dataByProvince])

  function colorFor(value) {
    if (!value) return '#EDE6D8' // paperdark, sin ventas
    const t = Math.min(1, value / maxValue)
    // interpola de ochre claro a moss oscuro según intensidad
    const from = [230, 200, 150] // claro
    const to = [91, 107, 79] // moss
    const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * t))
    return `rgb(${rgb.join(',')})`
  }

  return (
    <div className="relative">
      <svg viewBox={ECUADOR_MAP_VIEWBOX} className="w-full h-auto max-h-[520px]">
        {Object.entries(ECUADOR_PROVINCE_PATHS).map(([geoName, d]) => {
          const provinceName = Object.keys(NAME_TO_PATH_KEY).find((k) => NAME_TO_PATH_KEY[k] === geoName) || geoName
          const value = dataByProvince[provinceName] || 0
          return (
            <path
              key={geoName}
              d={d}
              fill={colorFor(value)}
              stroke="#F7F3EC"
              strokeWidth={1}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onMouseMove={(e) => setHover({ province: provinceName, value, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
        <rect x={GALAPAGOS_BOX.x - 3} y={GALAPAGOS_BOX.y - 3} width={GALAPAGOS_BOX.w + 6} height={GALAPAGOS_BOX.h + 6} fill="none" stroke="#D8CFBC" strokeDasharray="2 2" />
      </svg>

      {hover && (
        <div
          className="fixed z-50 bg-ink text-paper text-xs px-3 py-2 rounded-sm shadow-lg pointer-events-none"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium">{hover.province}</div>
          <div className="font-mono text-paper/70">{money(hover.value)}</div>
        </div>
      )}
    </div>
  )
}
