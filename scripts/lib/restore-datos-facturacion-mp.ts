import type { Consumo } from '@/payload-types'
import { Payment } from 'mercadopago'
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes'
import type { Payload } from 'payload'
import {
  createMpClient,
  isMercadoPagoPaymentId,
  loadAuditRowsFromJson,
  sleep,
  type AuditRow,
} from './fecha-pago-mp.js'

export const KNOWN_WIPED_IDS = [
  '67a3cc767688d6b7d1f2b4f1',
  '67edd46dd78083b92545eda0',
  '67ce48c04510cafbffb0f805',
  '67ce4da3e6705fde98a8f258',
] as const

export const DEFAULT_AUDIT_JSON =
  'scripts/output/audit-fecha-pago-2026-07-13T15-29-32-693Z.json'

export const MP_DELAY_MS = 150

export type RestoreStatus =
  | 'ok'
  | 'needs_restore'
  | 'error_mp'
  | 'error_db'
  | 'skip_already_complete'
  | 'skip_metadata_mismatch'

export type RestoreRow = {
  consumo_id: string
  titulo: string | null | undefined
  periodo_normalizado: string | null | undefined
  status: RestoreStatus
  estado_db: string | null | undefined
  nro_comprobante_db: number | null | undefined
  nro_comprobante_audit: number | null | undefined
  precio_final_top_db: number | null | undefined
  precio_final_grupo_db: number | null | undefined
  id_pago_mp_db: string | null | undefined
  fecha_pago_db: string | null | undefined
  meses_vencido_db: number | null | undefined
  datos_facturacion_keys: string
  id_pago_mp_restore: string | null
  fecha_pago_restore: string | null
  precio_final_restore: number | null
  meses_vencido_restore: number | null
  nro_comprobante_restore: number | null
  error?: string
}

export type RestoreArgs = {
  apply: boolean
  ids: string[] | null
  fromJson: string
  countOnly: boolean
  allIncomplete: boolean
}

export function parseRestoreArgs(argv: string[]): RestoreArgs {
  let apply = false
  let fromJson = DEFAULT_AUDIT_JSON
  let ids: string[] | null = [...KNOWN_WIPED_IDS]
  let countOnly = false
  let allIncomplete = false

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--count-only') {
      countOnly = true
      ids = null
    } else if (arg === '--all-incomplete') {
      allIncomplete = true
      ids = null
    } else if (arg.startsWith('--ids=')) {
      ids = arg
        .slice('--ids='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (arg.startsWith('--from-json=')) {
      fromJson = arg.slice('--from-json='.length)
    }
  }

  return { apply, ids, fromJson, countOnly, allIncomplete }
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

export function isDatosFacturacionIncomplete(
  consumo: Pick<Consumo, 'datos_facturacion'>,
): boolean {
  const df = consumo.datos_facturacion
  if (!df) return true
  return !isMercadoPagoPaymentId(df.id_pago_mp) || !isPresent(df.precio_final)
}

export function datosFacturacionKeys(
  df: Consumo['datos_facturacion'] | null | undefined,
): string {
  if (!df || typeof df !== 'object') return ''
  return Object.entries(df)
    .filter(([, v]) => isPresent(v))
    .map(([k]) => k)
    .sort()
    .join('|')
}

export async function countIncompletePagadoMp(payload: Payload): Promise<{
  total_pagado_no_manual: number
  incomplete: number
  incomplete_ids: string[]
}> {
  const { docs } = await payload.find({
    collection: 'consumos',
    where: {
      and: [{ estado: { equals: 'PAGADO' } }, { pago_manual: { not_equals: true } }],
    },
    pagination: false,
    depth: 0,
    select: {
      datos_facturacion: true,
      nro_comprobante: true,
      precio_final: true,
      titulo: true,
    },
  })

  const incomplete = docs.filter(isDatosFacturacionIncomplete)
  return {
    total_pagado_no_manual: docs.length,
    incomplete: incomplete.length,
    incomplete_ids: incomplete.map((d) => d.id),
  }
}

function parseMpNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function extractPaymentRestoreFields(
  payment: PaymentResponse,
  consumoId: string,
  auditRow: AuditRow | undefined,
): {
  id_pago_mp: string
  fecha_pago: string
  precio_final: number
  meses_vencido: number
  nro_comprobante: number | null
} {
  if (payment.status !== 'approved') {
    throw new Error(`Pago MP status=${payment.status ?? 'unknown'}, esperado approved`)
  }

  const metadata = (payment.metadata ?? {}) as Record<string, unknown>
  const metaConsumoId = metadata.consumo_id != null ? String(metadata.consumo_id) : null
  if (metaConsumoId && metaConsumoId !== consumoId) {
    throw new Error(
      `metadata.consumo_id mismatch: MP=${metaConsumoId} vs consumo=${consumoId}`,
    )
  }

  const dateApproved = payment.date_approved
  if (!dateApproved) {
    throw new Error('Pago sin date_approved')
  }

  const precioFinal =
    parseMpNumber(metadata.precio_final) ??
    parseMpNumber(payment.transaction_amount) ??
    auditRow?.precio_final ??
    null

  if (precioFinal == null) {
    throw new Error('No se pudo determinar precio_final desde MP ni audit')
  }

  const mesesVencido = parseMpNumber(metadata.meses_vencido) ?? 0

  const idPagoMp = payment.id != null ? String(payment.id) : auditRow?.id_pago_mp
  if (!isMercadoPagoPaymentId(idPagoMp)) {
    throw new Error('Pago sin id numérico de MercadoPago')
  }

  return {
    id_pago_mp: idPagoMp,
    fecha_pago: dateApproved,
    precio_final: precioFinal,
    meses_vencido: mesesVencido,
    nro_comprobante: auditRow?.nro_comprobante ?? null,
  }
}

export async function buildRestoreRow(args: {
  payload: Payload
  paymentClient: Payment
  consumoId: string
  auditRow?: AuditRow
}): Promise<RestoreRow> {
  const { payload, paymentClient, consumoId, auditRow } = args

  const base: RestoreRow = {
    consumo_id: consumoId,
    titulo: auditRow?.titulo,
    periodo_normalizado: auditRow?.periodo_normalizado,
    status: 'error_db',
    estado_db: null,
    nro_comprobante_db: null,
    nro_comprobante_audit: auditRow?.nro_comprobante ?? null,
    precio_final_top_db: null,
    precio_final_grupo_db: null,
    id_pago_mp_db: null,
    fecha_pago_db: null,
    meses_vencido_db: null,
    datos_facturacion_keys: '',
    id_pago_mp_restore: auditRow?.id_pago_mp ?? null,
    fecha_pago_restore: auditRow?.fecha_aprobado_mp ?? null,
    precio_final_restore: auditRow?.precio_final ?? null,
    meses_vencido_restore: null,
    nro_comprobante_restore: auditRow?.nro_comprobante ?? null,
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
    return { ...base, status: 'error_db', error: message }
  }

  const df = consumo.datos_facturacion
  base.titulo = consumo.titulo ?? base.titulo
  base.periodo_normalizado = consumo.periodo_normalizado ?? base.periodo_normalizado
  base.estado_db = consumo.estado
  base.nro_comprobante_db = consumo.nro_comprobante
  base.precio_final_top_db = consumo.precio_final
  base.precio_final_grupo_db = df?.precio_final
  base.id_pago_mp_db = df?.id_pago_mp
  base.fecha_pago_db = df?.fecha_pago
  base.meses_vencido_db = df?.meses_vencido
  base.datos_facturacion_keys = datosFacturacionKeys(df)

  if (!isDatosFacturacionIncomplete(consumo)) {
    return { ...base, status: 'skip_already_complete' }
  }

  const idPagoMp = auditRow?.id_pago_mp
  if (!isMercadoPagoPaymentId(idPagoMp)) {
    return {
      ...base,
      status: 'error_mp',
      error: 'Sin id_pago_mp en audit para consultar MercadoPago',
    }
  }

  try {
    const payment = await paymentClient.get({ id: idPagoMp })
    const restore = extractPaymentRestoreFields(payment, consumoId, auditRow)
    return {
      ...base,
      status: 'needs_restore',
      id_pago_mp_restore: restore.id_pago_mp,
      fecha_pago_restore: restore.fecha_pago,
      precio_final_restore: restore.precio_final,
      meses_vencido_restore: restore.meses_vencido,
      nro_comprobante_restore: restore.nro_comprobante ?? consumo.nro_comprobante ?? null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    if (message.includes('metadata.consumo_id mismatch')) {
      return { ...base, status: 'skip_metadata_mismatch', error: message }
    }
    return { ...base, status: 'error_mp', error: message }
  }
}

/**
 * Merge payment fields into existing datos_facturacion without dropping tariff fields.
 * Writes the full merged group so Mongo/Payload never replaces with a partial object.
 */
export async function applyRestoreRow(
  payload: Payload,
  row: RestoreRow,
): Promise<void> {
  if (row.status !== 'needs_restore') {
    throw new Error(`No se puede aplicar status=${row.status}`)
  }
  if (
    !row.id_pago_mp_restore ||
    !row.fecha_pago_restore ||
    row.precio_final_restore == null
  ) {
    throw new Error('Faltan campos restore para aplicar')
  }

  const consumo = await payload.findByID({
    collection: 'consumos',
    id: row.consumo_id,
    depth: 0,
  })

  const existing = { ...(consumo.datos_facturacion ?? {}) }
  const mergedDatosFacturacion = {
    ...existing,
    id_pago_mp: row.id_pago_mp_restore,
    fecha_pago: row.fecha_pago_restore,
    precio_final: row.precio_final_restore,
    meses_vencido: row.meses_vencido_restore ?? existing.meses_vencido ?? 0,
  }

  const data: Record<string, unknown> = {
    datos_facturacion: mergedDatosFacturacion,
    updatedAt: new Date().toISOString(),
  }

  if (
    (consumo.precio_final == null || consumo.precio_final === 0) &&
    row.precio_final_restore != null
  ) {
    data.precio_final = row.precio_final_restore
  }

  if (consumo.nro_comprobante == null && row.nro_comprobante_restore != null) {
    data.nro_comprobante = row.nro_comprobante_restore
  }

  await payload.db.updateOne({
    collection: 'consumos',
    id: row.consumo_id,
    data,
    returning: false,
  })
}

export type ApplyRestoreResult = {
  applied: string[]
  failed: Array<{ consumo_id: string; error: string }>
  skipped: string[]
}

export async function applyRestoreRows(
  payload: Payload,
  rows: RestoreRow[],
): Promise<ApplyRestoreResult> {
  const applied: string[] = []
  const failed: Array<{ consumo_id: string; error: string }> = []
  const skipped: string[] = []

  for (const row of rows) {
    if (row.status !== 'needs_restore') {
      skipped.push(row.consumo_id)
      continue
    }
    try {
      await applyRestoreRow(payload, row)
      applied.push(row.consumo_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      failed.push({ consumo_id: row.consumo_id, error: message })
    }
  }

  return { applied, failed, skipped }
}

export function summarizeRestoreRows(rows: RestoreRow[]) {
  const counts = {
    total: rows.length,
    needs_restore: 0,
    skip_already_complete: 0,
    skip_metadata_mismatch: 0,
    error_mp: 0,
    error_db: 0,
    ok: 0,
  }
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

export function restoreRowsToCsv(rows: RestoreRow[]): string {
  const headers: (keyof RestoreRow)[] = [
    'consumo_id',
    'titulo',
    'periodo_normalizado',
    'status',
    'estado_db',
    'nro_comprobante_db',
    'nro_comprobante_audit',
    'precio_final_top_db',
    'precio_final_grupo_db',
    'id_pago_mp_db',
    'fecha_pago_db',
    'meses_vencido_db',
    'datos_facturacion_keys',
    'id_pago_mp_restore',
    'fecha_pago_restore',
    'precio_final_restore',
    'meses_vencido_restore',
    'nro_comprobante_restore',
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

export async function loadAuditIndex(jsonPath: string): Promise<Map<string, AuditRow>> {
  const report = await loadAuditRowsFromJson(jsonPath)
  const map = new Map<string, AuditRow>()
  for (const row of report.rows) {
    map.set(row.consumo_id, row)
  }
  return map
}

export async function buildRestoreRowsForIds(args: {
  payload: Payload
  ids: string[]
  auditIndex: Map<string, AuditRow>
}): Promise<RestoreRow[]> {
  const { payload, ids, auditIndex } = args
  const mpClient = createMpClient()
  const paymentClient = new Payment(mpClient)
  const rows: RestoreRow[] = []

  for (let i = 0; i < ids.length; i++) {
    const consumoId = ids[i]
    const row = await buildRestoreRow({
      payload,
      paymentClient,
      consumoId,
      auditRow: auditIndex.get(consumoId),
    })
    rows.push(row)
    if ((i + 1) % 25 === 0) {
      console.log(`  Progreso: ${i + 1}/${ids.length}`)
    }
    if (i < ids.length - 1) {
      await sleep(MP_DELAY_MS)
    }
  }

  return rows
}
