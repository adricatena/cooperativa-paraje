import type { Consumo } from '@/payload-types'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'
import { datosFacturacionKeys } from './restore-datos-facturacion-mp.js'

const require = createRequire(import.meta.url)
const { deserialize } = require(
  path.join(
    process.cwd(),
    'node_modules/.pnpm/bson@6.10.4/node_modules/bson/lib/bson.cjs',
  ),
) as {
  deserialize: (buffer: Buffer, options?: { promoteValues?: boolean }) => Record<string, unknown>
}

export const DEFAULT_DUMP_BSON = 'dump-prod/test/consumos.bson'

/** Fields that identify a complete datos_facturacion (pre-wipe). */
export const TARIFF_FIELDS = [
  'precio_base',
  'consumo_base',
  'precio_litro',
  'consumo_real',
  'precio_regular',
  'dia_primer_vencimiento',
  'precio_primer_vencimiento',
  'dia_segundo_vencimiento',
  'precio_segundo_vencimiento',
] as const

export type DumpDatosFacturacion = NonNullable<Consumo['datos_facturacion']>

export type DumpConsumoSnapshot = {
  id: string
  estado?: string
  nro_comprobante?: number | null
  precio_final?: number | null
  datos_facturacion?: DumpDatosFacturacion | null
}

export type DumpRestoreStatus =
  | 'needs_restore'
  | 'skip_already_complete'
  | 'skip_no_dump'
  | 'skip_dump_incomplete'
  | 'error_db'

export type DumpRestoreRow = {
  consumo_id: string
  status: DumpRestoreStatus
  keys_db: string
  keys_dump: string
  keys_merged: string
  fecha_pago_db: string | null
  fecha_pago_dump: string | null
  fecha_pago_keep: string | null
  error?: string
  merged?: DumpDatosFacturacion
}

export type DumpRestoreArgs = {
  apply: boolean
  dumpPath: string
  ids: string[] | null
  allMissingTariffs: boolean
  countOnly: boolean
}

export function parseDumpRestoreArgs(argv: string[]): DumpRestoreArgs {
  let apply = false
  let dumpPath = DEFAULT_DUMP_BSON
  let ids: string[] | null = null
  let allMissingTariffs = true
  let countOnly = false

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg === '--apply') apply = true
    else if (arg === '--count-only') countOnly = true
    else if (arg === '--all-missing-tariffs') {
      allMissingTariffs = true
      ids = null
    } else if (arg.startsWith('--ids=')) {
      ids = arg
        .slice('--ids='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      allMissingTariffs = false
    } else if (arg.startsWith('--dump=')) {
      dumpPath = arg.slice('--dump='.length)
    }
  }

  return { apply, dumpPath, ids, allMissingTariffs, countOnly }
}

function unwrapBsonValue(value: unknown): unknown {
  if (value == null) return value
  if (typeof value !== 'object') return value

  const obj = value as Record<string, unknown>
  if ('$oid' in obj && typeof obj.$oid === 'string') return obj.$oid
  if ('$date' in obj) {
    const d = obj.$date
    if (typeof d === 'string' || typeof d === 'number') return new Date(d).toISOString()
    if (d && typeof d === 'object' && '$numberLong' in (d as object)) {
      return new Date(Number((d as { $numberLong: string }).$numberLong)).toISOString()
    }
    if (d instanceof Date) return d.toISOString()
  }
  if ('$numberInt' in obj) return Number(obj.$numberInt)
  if ('$numberDouble' in obj) return Number(obj.$numberDouble)
  if ('$numberLong' in obj) return Number(obj.$numberLong)

  if (value instanceof Date) return value.toISOString()

  return value
}

function normalizeDatosFacturacion(
  raw: Record<string, unknown> | null | undefined,
): DumpDatosFacturacion | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'id') continue
    const unwrapped = unwrapBsonValue(value)
    if (unwrapped !== undefined) out[key] = unwrapped
  }
  return out as DumpDatosFacturacion
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  const unwrapped = unwrapBsonValue(value)
  if (typeof unwrapped === 'string') return unwrapped
  return null
}

export function missingTariffFields(
  df: Consumo['datos_facturacion'] | null | undefined,
): string[] {
  if (!df) return [...TARIFF_FIELDS]
  return TARIFF_FIELDS.filter((field) => {
    const v = df[field]
    return v === null || v === undefined || v === ''
  })
}

export function hasCompleteTariffs(
  df: Consumo['datos_facturacion'] | null | undefined,
): boolean {
  return missingTariffFields(df).length === 0
}

/**
 * Read mongodump .bson (concatenated BSON docs) into a map by consumo id.
 */
export async function loadConsumosDump(
  bsonPath: string,
): Promise<Map<string, DumpConsumoSnapshot>> {
  const buf = await readFile(bsonPath)
  const map = new Map<string, DumpConsumoSnapshot>()
  let offset = 0

  while (offset < buf.length) {
    if (offset + 4 > buf.length) break
    const size = buf.readInt32LE(offset)
    if (size < 5 || offset + size > buf.length) {
      throw new Error(`BSON inválido en offset ${offset} (size=${size})`)
    }
    const slice = buf.subarray(offset, offset + size)
    const doc = deserialize(slice, { promoteValues: true }) as Record<string, unknown>
    offset += size

    const idRaw = doc._id
    const id =
      idRaw && typeof idRaw === 'object' && 'toHexString' in idRaw
        ? String((idRaw as { toHexString: () => string }).toHexString())
        : typeof idRaw === 'string'
          ? idRaw
          : null
    if (!id) continue

    const dfRaw = doc.datos_facturacion as Record<string, unknown> | undefined
    const datos_facturacion = normalizeDatosFacturacion(dfRaw)
    if (datos_facturacion?.fecha_pago) {
      datos_facturacion.fecha_pago = toIsoDate(datos_facturacion.fecha_pago) ?? undefined
    }

    map.set(id, {
      id,
      estado: typeof doc.estado === 'string' ? doc.estado : undefined,
      nro_comprobante:
        typeof doc.nro_comprobante === 'number' ? doc.nro_comprobante : null,
      precio_final: typeof doc.precio_final === 'number' ? doc.precio_final : null,
      datos_facturacion,
    })
  }

  return map
}

export async function countMissingTariffs(payload: Payload): Promise<{
  total_pagado: number
  missing_tariffs: number
  missing_ids: string[]
}> {
  const { docs } = await payload.find({
    collection: 'consumos',
    where: { estado: { equals: 'PAGADO' } },
    pagination: false,
    depth: 0,
    select: { datos_facturacion: true },
  })

  const missing = docs.filter((d) => !hasCompleteTariffs(d.datos_facturacion))
  return {
    total_pagado: docs.length,
    missing_tariffs: missing.length,
    missing_ids: missing.map((d) => d.id),
  }
}

/**
 * Prefer corrected fecha_pago from DB (post fecha_pago fix / MP restore).
 * Fill all other datos_facturacion fields from the pre-wipe dump.
 */
export function mergeDumpWithCurrentFechaPago(args: {
  dumpDf: DumpDatosFacturacion
  currentDf: Consumo['datos_facturacion'] | null | undefined
}): DumpDatosFacturacion {
  const { dumpDf, currentDf } = args
  const fechaPagoKeep =
    toIsoDate(currentDf?.fecha_pago) ?? toIsoDate(dumpDf.fecha_pago) ?? undefined

  return {
    ...dumpDf,
    // Keep payment fields already restored if dump somehow incomplete
    id_pago_mp: dumpDf.id_pago_mp ?? currentDf?.id_pago_mp,
    precio_final: dumpDf.precio_final ?? currentDf?.precio_final,
    meses_vencido: dumpDf.meses_vencido ?? currentDf?.meses_vencido,
    fecha_pago: fechaPagoKeep,
  }
}

export async function buildDumpRestoreRow(args: {
  payload: Payload
  consumoId: string
  dump: DumpConsumoSnapshot | undefined
}): Promise<DumpRestoreRow> {
  const { payload, consumoId, dump } = args

  const base: DumpRestoreRow = {
    consumo_id: consumoId,
    status: 'error_db',
    keys_db: '',
    keys_dump: '',
    keys_merged: '',
    fecha_pago_db: null,
    fecha_pago_dump: null,
    fecha_pago_keep: null,
  }

  let consumo: Consumo
  try {
    consumo = await payload.findByID({
      collection: 'consumos',
      id: consumoId,
      depth: 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return { ...base, error: message }
  }

  base.keys_db = datosFacturacionKeys(consumo.datos_facturacion)
  base.fecha_pago_db = toIsoDate(consumo.datos_facturacion?.fecha_pago)

  if (hasCompleteTariffs(consumo.datos_facturacion)) {
    return { ...base, status: 'skip_already_complete' }
  }

  if (!dump?.datos_facturacion) {
    return { ...base, status: 'skip_no_dump', error: 'No está en el dump' }
  }

  base.keys_dump = datosFacturacionKeys(dump.datos_facturacion)
  base.fecha_pago_dump = toIsoDate(dump.datos_facturacion.fecha_pago)

  if (!hasCompleteTariffs(dump.datos_facturacion)) {
    return {
      ...base,
      status: 'skip_dump_incomplete',
      error: 'Dump sin tarifas completas',
    }
  }

  const merged = mergeDumpWithCurrentFechaPago({
    dumpDf: dump.datos_facturacion,
    currentDf: consumo.datos_facturacion,
  })

  return {
    ...base,
    status: 'needs_restore',
    keys_merged: datosFacturacionKeys(merged),
    fecha_pago_keep: toIsoDate(merged.fecha_pago),
    merged,
  }
}

export async function applyDumpRestoreRow(
  payload: Payload,
  row: DumpRestoreRow,
): Promise<void> {
  if (row.status !== 'needs_restore' || !row.merged) {
    throw new Error(`No se puede aplicar status=${row.status}`)
  }

  await payload.db.updateOne({
    collection: 'consumos',
    id: row.consumo_id,
    data: {
      datos_facturacion: row.merged,
      updatedAt: new Date().toISOString(),
    },
    returning: false,
  })
}

export async function applyDumpRestoreRows(
  payload: Payload,
  rows: DumpRestoreRow[],
): Promise<{ applied: string[]; failed: Array<{ consumo_id: string; error: string }>; skipped: string[] }> {
  const applied: string[] = []
  const failed: Array<{ consumo_id: string; error: string }> = []
  const skipped: string[] = []

  for (const row of rows) {
    if (row.status !== 'needs_restore') {
      skipped.push(row.consumo_id)
      continue
    }
    try {
      await applyDumpRestoreRow(payload, row)
      applied.push(row.consumo_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      failed.push({ consumo_id: row.consumo_id, error: message })
    }
  }

  return { applied, failed, skipped }
}

export function summarizeDumpRestoreRows(rows: DumpRestoreRow[]) {
  const summary = {
    total: rows.length,
    needs_restore: 0,
    skip_already_complete: 0,
    skip_no_dump: 0,
    skip_dump_incomplete: 0,
    error_db: 0,
  }
  for (const row of rows) {
    summary[row.status] = (summary[row.status] ?? 0) + 1
  }
  return summary
}

export function dumpRestoreRowsToCsv(rows: DumpRestoreRow[]): string {
  const headers: (keyof DumpRestoreRow)[] = [
    'consumo_id',
    'status',
    'keys_db',
    'keys_dump',
    'keys_merged',
    'fecha_pago_db',
    'fecha_pago_dump',
    'fecha_pago_keep',
    'error',
  ]
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
  return lines.join('\n')
}
