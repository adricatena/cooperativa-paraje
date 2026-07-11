import type { Consumo } from '@/payload-types'
import dayjs from 'dayjs'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { readFile } from 'node:fs/promises'
import type { Payload } from 'payload'

const TZ_AR = 'America/Argentina/Buenos_Aires'

export type AuditStatus = 'ok' | 'mismatch' | 'mismatch_mes' | 'error_mp'

export type AuditRow = {
  consumo_id: string
  titulo: string | null | undefined
  periodo_normalizado: string | null | undefined
  nro_comprobante: number | null | undefined
  precio_final: number | null | undefined
  id_pago_mp: string
  fecha_pago_db: string | null | undefined
  fecha_aprobado_mp: string | null | undefined
  dia_db: string
  dia_mp: string
  mes_db: string
  mes_mp: string
  diff_dias: number | null
  status: AuditStatus
  error?: string
}

export function parseArgs(argv: string[]) {
  let months = 6
  let apply = false
  let fromJson: string | undefined

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--months=')) {
      months = Number(arg.split('=')[1])
    } else if (arg.startsWith('--from-json=')) {
      fromJson = arg.slice('--from-json='.length)
    } else if (arg === '--from-json') {
      throw new Error('Falta la ruta al JSON: --from-json=scripts/output/audit-fecha-pago-....json')
    } else if (arg === '--apply') {
      apply = true
    }
  }

  return { months, apply, fromJson }
}

export type AuditReport = {
  generated_at?: string
  months?: number
  summary?: ReturnType<typeof summarizeRows>
  rows: AuditRow[]
}

export async function loadAuditRowsFromJson(jsonPath: string): Promise<AuditReport> {
  const raw = await readFile(jsonPath, 'utf8')
  const parsed = JSON.parse(raw) as AuditReport

  if (!Array.isArray(parsed.rows)) {
    throw new Error(`JSON inválido: falta el array "rows" en ${jsonPath}`)
  }

  return parsed
}

export function isMercadoPagoPaymentId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^\d+$/.test(id)
}

export function formatDayAR(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function formatMonthAR(iso: string): string {
  return formatDayAR(iso).slice(0, 7)
}

export function diffDaysAR(a: string, b: string): number {
  const dayA = dayjs(formatDayAR(a))
  const dayB = dayjs(formatDayAR(b))
  return dayA.diff(dayB, 'day')
}

export function classifyDates(fechaDb: string, fechaMp: string): AuditStatus {
  const diaDb = formatDayAR(fechaDb)
  const diaMp = formatDayAR(fechaMp)
  if (diaDb === diaMp) return 'ok'
  if (formatMonthAR(fechaDb) !== formatMonthAR(fechaMp)) return 'mismatch_mes'
  return 'mismatch'
}

export function createMpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN no está definido en el entorno')
  }
  return new MercadoPagoConfig({ accessToken })
}

export async function fetchPaidMercadoPagoConsumos(
  payload: Payload,
  months: number,
): Promise<Consumo[]> {
  const since = dayjs().subtract(months, 'month').startOf('day').toISOString()

  const { docs } = await payload.find({
    collection: 'consumos',
    where: {
      and: [
        { estado: { equals: 'PAGADO' } },
        { pago_manual: { not_equals: true } },
        { 'datos_facturacion.fecha_pago': { greater_than_equal: since } },
        { 'datos_facturacion.id_pago_mp': { exists: true } },
      ],
    },
    pagination: false,
    sort: 'datos_facturacion.fecha_pago',
  })

  return docs.filter((consumo) =>
    isMercadoPagoPaymentId(consumo.datos_facturacion?.id_pago_mp),
  )
}

export async function auditConsumo(
  consumo: Consumo,
  paymentClient: Payment,
): Promise<AuditRow> {
  const idPagoMp = consumo.datos_facturacion!.id_pago_mp!
  const fechaPagoDb = consumo.datos_facturacion?.fecha_pago

  const base: AuditRow = {
    consumo_id: consumo.id,
    titulo: consumo.titulo,
    periodo_normalizado: consumo.periodo_normalizado,
    nro_comprobante: consumo.nro_comprobante,
    precio_final: consumo.precio_final ?? consumo.datos_facturacion?.precio_final,
    id_pago_mp: idPagoMp,
    fecha_pago_db: fechaPagoDb,
    fecha_aprobado_mp: null,
    dia_db: fechaPagoDb ? formatDayAR(fechaPagoDb) : '',
    dia_mp: '',
    mes_db: fechaPagoDb ? formatMonthAR(fechaPagoDb) : '',
    mes_mp: '',
    diff_dias: null,
    status: 'error_mp',
  }

  if (!fechaPagoDb) {
    return { ...base, error: 'Sin fecha_pago en DB' }
  }

  try {
    const payment = await paymentClient.get({ id: idPagoMp })
    const dateApproved = payment.date_approved

    if (!dateApproved) {
      return {
        ...base,
        error: 'MercadoPago no devolvió date_approved',
      }
    }

    const status = classifyDates(fechaPagoDb, dateApproved)

    return {
      ...base,
      fecha_aprobado_mp: dateApproved,
      dia_mp: formatDayAR(dateApproved),
      mes_mp: formatMonthAR(dateApproved),
      diff_dias: diffDaysAR(fechaPagoDb, dateApproved),
      status,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return { ...base, error: message }
  }
}

export function summarizeRows(rows: AuditRow[]) {
  const ok = rows.filter((r) => r.status === 'ok')
  const mismatch = rows.filter((r) => r.status === 'mismatch')
  const mismatchMes = rows.filter((r) => r.status === 'mismatch_mes')
  const errorMp = rows.filter((r) => r.status === 'error_mp')
  const toFix = rows.filter((r) => r.status === 'mismatch' || r.status === 'mismatch_mes')

  const montoPorMesIncorrecto = new Map<string, number>()
  for (const row of [...mismatch, ...mismatchMes]) {
    const mes = row.mes_db
    montoPorMesIncorrecto.set(mes, (montoPorMesIncorrecto.get(mes) ?? 0) + (row.precio_final ?? 0))
  }

  return {
    total: rows.length,
    ok: ok.length,
    mismatch: mismatch.length,
    mismatch_mes: mismatchMes.length,
    error_mp: errorMp.length,
    to_fix: toFix.length,
    monto_por_mes_incorrecto: Object.fromEntries(
      [...montoPorMesIncorrecto.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
  }
}

export function rowsToCsv(rows: AuditRow[]): string {
  const headers = [
    'consumo_id',
    'titulo',
    'periodo_normalizado',
    'nro_comprobante',
    'precio_final',
    'id_pago_mp',
    'fecha_pago_db',
    'fecha_aprobado_mp',
    'dia_db',
    'dia_mp',
    'mes_db',
    'mes_mp',
    'diff_dias',
    'status',
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
    lines.push(headers.map((h) => escape(row[h as keyof AuditRow])).join(','))
  }
  return lines.join('\n')
}

export type ApplyFixResult = {
  applied: Array<{ consumo_id: string; from: string; to: string }>
  failed: Array<{ consumo_id: string; error: string }>
}

export async function applyFixes(payload: Payload, rows: AuditRow[]): Promise<ApplyFixResult> {
  const toFix = rows.filter(
    (r) =>
      (r.status === 'mismatch' || r.status === 'mismatch_mes') &&
      r.fecha_aprobado_mp,
  )

  const applied: ApplyFixResult['applied'] = []
  const failed: ApplyFixResult['failed'] = []

  for (const row of toFix) {
    try {
      // db.updateOne evita revalidar relaciones (p. ej. medidor inactivo) al tocar solo fecha_pago
      await payload.db.updateOne({
        collection: 'consumos',
        id: row.consumo_id,
        data: {
          datos_facturacion: {
            fecha_pago: row.fecha_aprobado_mp!,
          },
          updatedAt: new Date().toISOString(),
        },
        returning: false,
      })
      applied.push({
        consumo_id: row.consumo_id,
        from: row.fecha_pago_db ?? '',
        to: row.fecha_aprobado_mp!,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      failed.push({ consumo_id: row.consumo_id, error: message })
    }
  }

  return { applied, failed }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
