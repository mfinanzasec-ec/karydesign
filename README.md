# Kary Design — Panel (MVP Inventario)

## Correr en tu computadora
```bash
npm install
cp .env.example .env
npm run dev
```
Abre http://localhost:5173

## Desplegar en Netlify
1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: "Add new site" → "Import an existing project" → conecta el repo.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. En **Site settings → Environment variables**, agrega:
   - `VITE_SUPABASE_URL` = https://jvmqjlvakvatryxeclil.supabase.co
   - `VITE_SUPABASE_KEY` = sb_publishable_riTIGEHedgysk7dE1D6NnQ_Ldf4LCA8

## Qué incluye esta fase
- Módulo de **Inventario**: crear productos simples o con variantes, registrar compras (entradas de stock) con costo, cálculo automático de costo promedio ponderado y margen por producto/variante.
- Los demás módulos (Ventas, Etiquetas, Cursos, Reportes) están en el menú marcados como "pronto" — se activan en las siguientes fases.

## Próximo paso
Módulo de **Ventas**: registrar una venta descuenta stock automáticamente y genera la nota de venta imprimible.
