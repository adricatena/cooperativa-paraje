/**
 * Mediciones a favor por cliente — solo evidencias firmes:
 * 1) Líneas ARCA sin consumo PAGADO (arca-sin-consumo-pagado.csv)
 * 2) Mismo nro_comprobante presentado 2+ veces (extras = apariciones - 1)
 *
 * NO incluye sospechas por medidor+importe+fecha.
 *
 * Uso:
 *   pnpm reporte:mediciones-a-favor
 */
import type { Consumo, Medidore, Usuario } from '@/payload-types'
import config from '@payload-config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  calcIvaDesdePrecioFinal,
  dniFromCuit,
  loadArcaTxtDirectory,
  roundPrecio,
  type ArcaTxtAppearance,
} from './lib/arca-txt-parse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const DEFAULT_TXT_DIR = path.join(__dirname, '..', 'reportestxtcooperativa')
const EXCLUDED_MONTH = '2026-06'
const PATH_SIN_CONSUMO = path.join(OUTPUT_DIR, 'arca-sin-consumo-pagado.csv')

type Origen = 'nro_comprobante_duplicado' | 'sin_consumo_pagado'

type FavorLine = {
  origen: Origen
  apellido: string
  nombre: string
  cuit: string
  doc_comprador: string
  medidor_id: string
  numero_medidor: string
  consumo_id: string
  nro_comprobante: number
  importe_total: number
  iva: number
  mes_archivo: string
  fecha_linea: string
  archivo: string
  apariciones_nro: number
  notas: string
}

type ClienteAgg = {
  apellido: string
  nombre: string
  cuit: string
  mediciones_a_favor: number
  importe_total_repetido: number
  iva_total_repetido: number
  de_nro_duplicado: number
  de_sin_consumo: number
}

type ClienteInfo = {
  apellido: string
  nombre: string
  cuit: string
  medidor_id: string
  numero_medidor: string
  consumo_id: string
}

function parseArgs(argv: string[]) {
  let txtDir = DEFAULT_TXT_DIR
  let sinConsumoPath = PATH_SIN_CONSUMO
  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--txt-dir=')) txtDir = path.resolve(arg.slice('--txt-dir='.length))
    if (arg.startsWith('--sin-consumo=')) {
      sinConsumoPath = path.resolve(arg.slice('--sin-consumo='.length))
    }
  }
  return { txtDir, sinConsumoPath }
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = cols[i] ?? ''
    }
    return row
  })
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }
    current += char
  }
  fields.push(current)
  return fields
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

function clientKey(cuit: string, doc: string, apellido: string, nombre: string): string {
  if (cuit && cuit !== '0') return `cuit:${cuit}`
  if (doc && doc !== '0') return `doc:${doc}`
  return `nombre:${apellido}|${nombre}`
}

async function loadUsuariosByDoc(): Promise<Map<string, { nombre: string; apellido: string; cuit: string }>> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'usuarios',
    pagination: false,
    depth: 0,
  })

  const byDoc = new Map<string, { nombre: string; apellido: string; cuit: string }>()
  for (const doc of docs as Usuario[]) {
    const datos = doc.datos_personales
    const cuit = String(datos?.cuit ?? '')
    const dni = dniFromCuit(cuit)
    if (!dni || dni === '0') continue
    if (!byDoc.has(dni)) {
      byDoc.set(dni, {
        nombre: datos?.nombre ?? '',
        apellido: datos?.apellido ?? '',
        cuit,
      })
    }
  }
  return byDoc
}

async function loadClientesByNro(nros: number[]): Promise<Map<number, ClienteInfo>> {
  const payload = await getPayload({ config })
  const byNro = new Map<number, ClienteInfo>()
  const batchSize = 100

  for (let i = 0; i < nros.length; i += batchSize) {
    const batch = nros.slice(i, i + batchSize)
    const { docs } = await payload.find({
      collection: 'consumos',
      where: { nro_comprobante: { in: batch } },
      depth: 2,
      pagination: false,
    })

    for (const doc of docs as Consumo[]) {
      if (doc.nro_comprobante == null) continue
      const med = doc.medidor as Medidore | string | null | undefined
      if (!med || typeof med === 'string') continue
      const usuario = med.usuario as Usuario | string | null | undefined
      if (!usuario || typeof usuario === 'string') continue
      const datos = usuario.datos_personales
      byNro.set(doc.nro_comprobante, {
        apellido: datos?.apellido ?? '',
        nombre: datos?.nombre ?? '',
        cuit: String(datos?.cuit ?? ''),
        medidor_id: med.id,
        numero_medidor: String(med.numero_medidor ?? ''),
        consumo_id: doc.id,
      })
    }
  }

  return byNro
}

function extrasFromNroDuplicado(
  appearancesByNro: Map<number, ArcaTxtAppearance[]>,
  clientesByNro: Map<number, ClienteInfo>,
  usuariosByDoc: Map<string, { nombre: string; apellido: string; cuit: string }>,
): FavorLine[] {
  const extras: FavorLine[] = []

  for (const [nro, apps] of appearancesByNro) {
    if (apps.length < 2) continue
    const ordered = apps.toSorted(
      (a, b) =>
        a.mes_archivo.localeCompare(b.mes_archivo) ||
        a.fecha_linea.localeCompare(b.fecha_linea) ||
        a.archivo.localeCompare(b.archivo),
    )
    // Primera aparición = válida; el resto a favor
    for (const app of ordered.slice(1)) {
      const fromNro = clientesByNro.get(nro)
      const fromDoc = usuariosByDoc.get(app.doc_comprador)
      const iva = app.iva || calcIvaDesdePrecioFinal(app.importe_total).iva
      extras.push({
        origen: 'nro_comprobante_duplicado',
        apellido: fromNro?.apellido || fromDoc?.apellido || '',
        nombre: fromNro?.nombre || fromDoc?.nombre || '',
        cuit: fromNro?.cuit || fromDoc?.cuit || '',
        doc_comprador: app.doc_comprador,
        medidor_id: fromNro?.medidor_id ?? '',
        numero_medidor: fromNro?.numero_medidor ?? '',
        consumo_id: fromNro?.consumo_id ?? '',
        nro_comprobante: nro,
        importe_total: roundPrecio(app.importe_total),
        iva: roundPrecio(iva),
        mes_archivo: app.mes_archivo,
        fecha_linea: app.fecha_linea,
        archivo: app.archivo,
        apariciones_nro: apps.length,
        notas: `nro repetido ${apps.length} veces; se conserva 1`,
      })
    }
  }

  return extras
}

function linesFromSinConsumo(
  rows: Record<string, string>[],
  usuariosByDoc: Map<string, { nombre: string; apellido: string; cuit: string }>,
): FavorLine[] {
  return rows.map((row) => {
    const doc = row.doc_comprador || '0'
    const user = usuariosByDoc.get(doc)
    const importe = Number(row.importe_total)
    const iva = row.iva ? Number(row.iva) : calcIvaDesdePrecioFinal(importe).iva
    return {
      origen: 'sin_consumo_pagado' as const,
      apellido: user?.apellido ?? '',
      nombre: user?.nombre ?? '',
      cuit: user?.cuit ?? '',
      doc_comprador: doc,
      medidor_id: '',
      numero_medidor: '',
      consumo_id: '',
      nro_comprobante: Number(row.nro_comprobante),
      importe_total: roundPrecio(importe),
      iva: roundPrecio(iva),
      mes_archivo: row.mes_archivo,
      fecha_linea: row.fecha_linea,
      archivo: row.archivo,
      apariciones_nro: Number(row.apariciones_mismo_nro || 1),
      notas: user ? '' : 'cliente no resuelto por doc_comprador',
    }
  })
}

function aggregateByCliente(lines: FavorLine[]): ClienteAgg[] {
  const map = new Map<string, ClienteAgg>()
  for (const line of lines) {
    const key = clientKey(line.cuit, line.doc_comprador, line.apellido, line.nombre)
    const agg = map.get(key) ?? {
      apellido: line.apellido || '(sin apellido)',
      nombre: line.nombre || (line.doc_comprador ? `doc:${line.doc_comprador}` : '(sin nombre)'),
      cuit: line.cuit || '',
      mediciones_a_favor: 0,
      importe_total_repetido: 0,
      iva_total_repetido: 0,
      de_nro_duplicado: 0,
      de_sin_consumo: 0,
    }
    if (!agg.cuit && line.cuit) agg.cuit = line.cuit
    if (agg.apellido === '(sin apellido)' && line.apellido) agg.apellido = line.apellido
    if (agg.nombre.startsWith('doc:') && line.nombre) agg.nombre = line.nombre

    agg.mediciones_a_favor++
    agg.importe_total_repetido = roundPrecio(agg.importe_total_repetido + line.importe_total)
    agg.iva_total_repetido = roundPrecio(agg.iva_total_repetido + line.iva)
    if (line.origen === 'nro_comprobante_duplicado') agg.de_nro_duplicado++
    else agg.de_sin_consumo++
    map.set(key, agg)
  }

  return [...map.values()].toSorted(
    (a, b) =>
      b.mediciones_a_favor - a.mediciones_a_favor ||
      b.importe_total_repetido - a.importe_total_repetido ||
      a.apellido.localeCompare(b.apellido),
  )
}

async function main() {
  const { txtDir, sinConsumoPath } = parseArgs(process.argv.slice(2))

  console.log(`Cargando ARCA desde ${txtDir} (sin ${EXCLUDED_MONTH})...`)
  const txtIndex = await loadArcaTxtDirectory(txtDir)
  const appearancesByNro = new Map<number, ArcaTxtAppearance[]>()
  for (const [nro, apps] of txtIndex.appearancesByNro) {
    const filtered = apps.filter((a) => a.mes_archivo !== EXCLUDED_MONTH)
    if (filtered.length > 0) appearancesByNro.set(nro, filtered)
  }

  const nrosDuplicados = [...appearancesByNro.entries()]
    .filter(([, apps]) => apps.length >= 2)
    .map(([nro]) => nro)
  console.log(`Nros con 2+ presentaciones: ${nrosDuplicados.length}`)

  console.log(`Leyendo sin-consumo: ${sinConsumoPath}`)
  const sinRows = parseCsv(await readFile(sinConsumoPath, 'utf8'))
  console.log(`Líneas sin consumo PAGADO: ${sinRows.length}`)

  console.log('Resolviendo clientes...')
  const usuariosByDoc = await loadUsuariosByDoc()
  const clientesByNro = await loadClientesByNro(nrosDuplicados)
  console.log(`Usuarios por DNI: ${usuariosByDoc.size}; nros duplicados resueltos: ${clientesByNro.size}`)

  const extrasDup = extrasFromNroDuplicado(appearancesByNro, clientesByNro, usuariosByDoc)
  const extrasSin = linesFromSinConsumo(sinRows, usuariosByDoc)

  const nrosDupSet = new Set(extrasDup.map((r) => r.nro_comprobante))
  const nrosSinSet = new Set(extrasSin.map((r) => r.nro_comprobante))
  const overlap = [...nrosDupSet].filter((n) => nrosSinSet.has(n))
  if (overlap.length > 0) {
    console.warn(`ADVERTENCIA: ${overlap.length} nros en ambos orígenes`)
  }

  const allLines = [...extrasDup, ...extrasSin].toSorted(
    (a, b) =>
      a.cuit.localeCompare(b.cuit) ||
      a.apellido.localeCompare(b.apellido) ||
      a.mes_archivo.localeCompare(b.mes_archivo) ||
      a.nro_comprobante - b.nro_comprobante,
  )
  const porCliente = aggregateByCliente(allLines)
  const sinResolver = allLines.filter((l) => !l.cuit).length

  await mkdir(OUTPUT_DIR, { recursive: true })
  const paths = {
    porCliente: path.join(OUTPUT_DIR, 'arca-mediciones-a-favor-por-cliente.csv'),
    detalle: path.join(OUTPUT_DIR, 'arca-mediciones-a-favor-detalle.csv'),
    maestro: path.join(OUTPUT_DIR, 'arca-mediciones-a-favor.json'),
  }

  await writeFile(
    paths.porCliente,
    rowsToCsv(
      [
        'apellido',
        'nombre',
        'cuit',
        'mediciones_a_favor',
        'importe_total_repetido',
        'iva_total_repetido',
        'de_nro_duplicado',
        'de_sin_consumo',
      ],
      porCliente,
    ),
  )

  await writeFile(
    paths.detalle,
    rowsToCsv(
      [
        'origen',
        'apellido',
        'nombre',
        'cuit',
        'doc_comprador',
        'medidor_id',
        'numero_medidor',
        'consumo_id',
        'nro_comprobante',
        'importe_total',
        'iva',
        'mes_archivo',
        'fecha_linea',
        'archivo',
        'apariciones_nro',
        'notas',
      ],
      allLines,
    ),
  )

  const summary = {
    generated_at: new Date().toISOString(),
    txt_dir: txtDir,
    excluded_month: EXCLUDED_MONTH,
    sin_consumo_csv: sinConsumoPath,
    criterio: {
      nro_comprobante_duplicado:
        'Mismo nro_comprobante en 2+ archivos/meses presentados; se conserva 1, el resto a favor',
      sin_consumo_pagado:
        'Cada línea ARCA cuyo nro no existe en ningún consumo PAGADO cuenta completa a favor',
      excluido: 'No se usan sospechas por medidor+importe+fecha',
    },
    totals: {
      nros_duplicados: nrosDuplicados.length,
      lineas_a_favor: allLines.length,
      de_nro_duplicado: extrasDup.length,
      de_sin_consumo: extrasSin.length,
      clientes: porCliente.length,
      sin_cliente_resuelto: sinResolver,
      overlap_nros: overlap.length,
      importe_total: roundPrecio(allLines.reduce((s, l) => s + l.importe_total, 0)),
      iva_total: roundPrecio(allLines.reduce((s, l) => s + l.iva, 0)),
      importe_nro_duplicado: roundPrecio(extrasDup.reduce((s, l) => s + l.importe_total, 0)),
      iva_nro_duplicado: roundPrecio(extrasDup.reduce((s, l) => s + l.iva, 0)),
      importe_sin_consumo: roundPrecio(extrasSin.reduce((s, l) => s + l.importe_total, 0)),
      iva_sin_consumo: roundPrecio(extrasSin.reduce((s, l) => s + l.iva, 0)),
    },
    paths,
  }
  await writeFile(paths.maestro, `${JSON.stringify(summary, null, 2)}\n`)

  console.log('\n=== Mediciones a favor (solo evidencia firme) ===')
  console.log(`Nros duplicados (extras): ${extrasDup.length}`)
  console.log(`Sin consumo PAGADO:       ${extrasSin.length}`)
  console.log(`Total líneas a favor:     ${allLines.length}`)
  console.log(`Clientes:                 ${porCliente.length}`)
  console.log(`Sin cliente resuelto:     ${sinResolver}`)
  console.log(`Importe total: $${summary.totals.importe_total.toLocaleString('es-AR')}`)
  console.log(`IVA total:     $${summary.totals.iva_total.toLocaleString('es-AR')}`)
  console.log(`\nPor cliente: ${paths.porCliente}`)
  console.log(`Detalle:     ${paths.detalle}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
