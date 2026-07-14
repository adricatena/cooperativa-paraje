/**
 * Ventas presentadas a ARCA (TXT/CSV) cuyo nro_comprobante no existe en ningún
 * consumo PAGADO de la DB (ni manual ni MercadoPago).
 *
 * Uso:
 *   pnpm reporte:arca-sin-consumo
 */
import type { Consumo } from '@/payload-types'
import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  calcIvaDesdePrecioFinal,
  loadArcaTxtDirectory,
  roundPrecio,
  type ArcaTxtAppearance,
} from './lib/arca-txt-parse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const DEFAULT_TXT_DIR = path.join(__dirname, '..', 'reportestxtcooperativa')
/** Aún no presentado a ARCA. */
const EXCLUDED_MONTH = '2026-06'

type Row = {
  nro_comprobante: number
  mes_archivo: string
  fecha_linea: string
  archivo: string
  fuente: string
  doc_comprador: string
  importe_total: number
  iva: number
  neto: number
  apariciones_mismo_nro: number
  meses_mismo_nro: string
}

function parseArgs(argv: string[]) {
  let txtDir = DEFAULT_TXT_DIR
  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--txt-dir=')) txtDir = path.resolve(arg.slice('--txt-dir='.length))
  }
  return { txtDir }
}

function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown) => {
    const str = value == null ? '' : String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return `${lines.join('\n')}\n`
}

async function loadNrosPagados(): Promise<{
  nrosPagados: Set<number>
  totalConsumosPagadosConNro: number
}> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'consumos',
    where: {
      and: [{ estado: { equals: 'PAGADO' } }, { nro_comprobante: { exists: true } }],
    },
    depth: 0,
    pagination: false,
    select: {
      nro_comprobante: true,
      pago_manual: true,
    },
  })

  const nrosPagados = new Set<number>()
  for (const doc of docs as Pick<Consumo, 'nro_comprobante'>[]) {
    if (doc.nro_comprobante != null) nrosPagados.add(doc.nro_comprobante)
  }

  return { nrosPagados, totalConsumosPagadosConNro: docs.length }
}

async function main() {
  const { txtDir } = parseArgs(process.argv.slice(2))

  console.log(`Cargando ARCA desde ${txtDir}...`)
  const txtIndex = await loadArcaTxtDirectory(txtDir)
  const appearances = [...txtIndex.appearancesByNro.values()]
    .flat()
    .filter((a) => a.mes_archivo !== EXCLUDED_MONTH)
  const excludedCount = [...txtIndex.appearancesByNro.values()]
    .flat()
    .filter((a) => a.mes_archivo === EXCLUDED_MONTH).length

  console.log(`Líneas ARCA (sin ${EXCLUDED_MONTH}): ${appearances.length}`)
  if (excludedCount > 0) console.log(`Excluidas (${EXCLUDED_MONTH}): ${excludedCount}`)

  console.log('Cargando nros de consumos PAGADO (manuales + MP)...')
  const { nrosPagados, totalConsumosPagadosConNro } = await loadNrosPagados()
  console.log(`Consumos PAGADO con nro: ${totalConsumosPagadosConNro}`)
  console.log(`Nros únicos en DB: ${nrosPagados.size}`)

  const byNro = new Map<number, ArcaTxtAppearance[]>()
  for (const app of appearances) {
    const list = byNro.get(app.nro_comprobante) ?? []
    list.push(app)
    byNro.set(app.nro_comprobante, list)
  }

  const sinMatch: Row[] = []
  for (const [nro, apps] of [...byNro.entries()].sort((a, b) => a[0] - b[0])) {
    if (nrosPagados.has(nro)) continue

    const ordered = apps.toSorted(
      (a, b) =>
        a.mes_archivo.localeCompare(b.mes_archivo) || a.fecha_linea.localeCompare(b.fecha_linea),
    )
    // Una fila por aparición (si el mismo nro salió en 2 meses, se listan las dos)
    for (const app of ordered) {
      const iva = app.iva || calcIvaDesdePrecioFinal(app.importe_total).iva
      const neto = app.neto || calcIvaDesdePrecioFinal(app.importe_total).neto
      sinMatch.push({
        nro_comprobante: nro,
        mes_archivo: app.mes_archivo,
        fecha_linea: app.fecha_linea,
        archivo: app.archivo,
        fuente: app.fuente,
        doc_comprador: app.doc_comprador,
        importe_total: roundPrecio(app.importe_total),
        iva: roundPrecio(iva),
        neto: roundPrecio(neto),
        apariciones_mismo_nro: apps.length,
        meses_mismo_nro: [...new Set(apps.map((a) => a.mes_archivo))].sort().join(';'),
      })
    }
  }

  const nrosUnicos = new Set(sinMatch.map((r) => r.nro_comprobante))
  const importe = sinMatch.reduce((s, r) => s + r.importe_total, 0)
  const iva = sinMatch.reduce((s, r) => s + r.iva, 0)

  const porMes = new Map<
    string,
    { lineas: number; nros: Set<number>; importe: number; iva: number }
  >()
  for (const row of sinMatch) {
    const bucket = porMes.get(row.mes_archivo) ?? {
      lineas: 0,
      nros: new Set<number>(),
      importe: 0,
      iva: 0,
    }
    bucket.lineas++
    bucket.nros.add(row.nro_comprobante)
    bucket.importe += row.importe_total
    bucket.iva += row.iva
    porMes.set(row.mes_archivo, bucket)
  }

  const resumenMensual = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, b]) => ({
      mes,
      lineas: b.lineas,
      nros_unicos: b.nros.size,
      importe: roundPrecio(b.importe),
      iva: roundPrecio(b.iva),
    }))

  await mkdir(OUTPUT_DIR, { recursive: true })
  const paths = {
    detalle: path.join(OUTPUT_DIR, 'arca-sin-consumo-pagado.csv'),
    resumenMensual: path.join(OUTPUT_DIR, 'arca-sin-consumo-pagado-resumen-mensual.csv'),
    maestro: path.join(OUTPUT_DIR, 'arca-sin-consumo-pagado.json'),
  }

  await writeFile(
    paths.detalle,
    rowsToCsv(
      [
        'nro_comprobante',
        'mes_archivo',
        'fecha_linea',
        'archivo',
        'fuente',
        'doc_comprador',
        'importe_total',
        'iva',
        'neto',
        'apariciones_mismo_nro',
        'meses_mismo_nro',
      ],
      sinMatch,
    ),
  )
  await writeFile(
    paths.resumenMensual,
    rowsToCsv(['mes', 'lineas', 'nros_unicos', 'importe', 'iva'], resumenMensual),
  )

  const summary = {
    generated_at: new Date().toISOString(),
    txt_dir: txtDir,
    excluded_month: EXCLUDED_MONTH,
    criterio:
      'Línea ARCA cuyo nro_comprobante no existe en ningún consumo estado=PAGADO (manual o MP)',
    totals: {
      lineas_arca: appearances.length,
      nros_arca: byNro.size,
      consumos_pagados_con_nro: totalConsumosPagadosConNro,
      nros_pagados_db: nrosPagados.size,
      lineas_sin_match: sinMatch.length,
      nros_sin_match: nrosUnicos.size,
      importe_sin_match: roundPrecio(importe),
      iva_sin_match: roundPrecio(iva),
    },
    resumen_mensual: resumenMensual,
    paths,
  }
  await writeFile(paths.maestro, `${JSON.stringify(summary, null, 2)}\n`)

  console.log('\n=== ARCA sin consumo PAGADO ===')
  console.log(`Nros sin match:   ${nrosUnicos.size}`)
  console.log(`Líneas sin match: ${sinMatch.length}`)
  console.log(`Importe: $${roundPrecio(importe).toLocaleString('es-AR')}`)
  console.log(`IVA:     $${roundPrecio(iva).toLocaleString('es-AR')}`)
  console.log(`\nCSV: ${paths.detalle}`)
  console.log(`Resumen mensual: ${paths.resumenMensual}`)
  console.log(`JSON: ${paths.maestro}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
