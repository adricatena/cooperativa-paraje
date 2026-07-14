/**
 * Detecta comprobantes "fantasma por renumeración":
 * un nro presentado a ARCA que ya no existe en DB (huérfano), linkeado al consumo
 * actual que quedó con un nro mayor tras reintentos del webhook (mismo cliente + importe).
 *
 * Uso:
 *   pnpm reporte:fantasmas-renumeracion
 *   pnpm reporte:fantasmas-renumeracion -- --txt-dir=reportestxtcooperativa --audit-json=scripts/output/audit-....json
 */
import type { Consumo, Medidore, Usuario } from '@/payload-types'
import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
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
import { loadAuditRowsFromJson, type AuditRow } from './lib/fecha-pago-mp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const DEFAULT_TXT_DIR = path.join(__dirname, '..', 'reportestxtcooperativa')
/** Aún no presentado a ARCA — excluir aunque reaparezca el archivo. */
const EXCLUDED_MONTH = '2026-06'
const DEFAULT_AUDIT_JSON = path.join(
  OUTPUT_DIR,
  'audit-fecha-pago-2026-07-13T15-29-32-693Z.json',
)

type ConsumoActual = {
  consumo_id: string
  titulo: string
  nro_comprobante: number
  precio_final: number
  id_pago_mp: string
  pago_manual: boolean
  fecha_pago: string
  mes_db: string
  medidor_id: string
  numero_medidor: string
  direccion: string
  nombre: string
  apellido: string
  cuit: string
  doc_comprador: string
}

type MatchConfidence = 'alto' | 'probable' | 'medio' | 'ambiguo' | 'sin_candidato'

type FantasmaRow = {
  confianza: MatchConfidence
  nro_fantasma: number
  mes_fantasma: string
  fecha_linea_fantasma: string
  archivo_fantasma: string
  importe_fantasma: number
  iva_fantasma: number
  doc_comprador: string
  candidatos: number
  nro_gap: number | ''
  diff_meses: number | ''
  nro_actual: number | ''
  mes_presentacion_actual: string
  consumo_id: string
  titulo: string
  id_pago_mp: string
  mes_mp: string
  mes_db: string
  precio_final: number | ''
  medidor_id: string
  numero_medidor: string
  direccion: string
  nombre: string
  apellido: string
  cuit: string
  score: number | ''
  notas: string
}

function parseArgs(argv: string[]) {
  let txtDir = DEFAULT_TXT_DIR
  let auditJson = DEFAULT_AUDIT_JSON

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--txt-dir=')) txtDir = path.resolve(arg.slice('--txt-dir='.length))
    if (arg.startsWith('--audit-json=')) {
      auditJson = path.resolve(arg.slice('--audit-json='.length))
    }
  }

  return { txtDir, auditJson }
}

function importeKey(value: number): string {
  return roundPrecio(value).toFixed(2)
}

function mesFromIso(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
    })
      .format(new Date(iso))
      .slice(0, 7)
  } catch {
    return ''
  }
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

function extractConsumoActual(doc: Consumo): ConsumoActual | null {
  if (doc.nro_comprobante == null) return null
  const med = doc.medidor as Medidore | string | null | undefined
  if (!med || typeof med === 'string') return null
  const usuario = med.usuario as Usuario | string | null | undefined
  if (!usuario || typeof usuario === 'string') return null
  const datos = usuario.datos_personales
  const cuit = String(datos?.cuit ?? '')
  const precio =
    doc.precio_final ?? doc.datos_facturacion?.precio_final ?? 0

  return {
    consumo_id: doc.id,
    titulo: doc.titulo ?? '',
    nro_comprobante: doc.nro_comprobante,
    precio_final: precio,
    id_pago_mp: String(doc.datos_facturacion?.id_pago_mp ?? ''),
    pago_manual: Boolean(doc.pago_manual),
    fecha_pago: doc.datos_facturacion?.fecha_pago ?? '',
    mes_db: mesFromIso(doc.datos_facturacion?.fecha_pago),
    medidor_id: med.id,
    numero_medidor: String(med.numero_medidor ?? ''),
    direccion: med.direccion ?? '',
    nombre: datos?.nombre ?? '',
    apellido: datos?.apellido ?? '',
    cuit,
    doc_comprador: dniFromCuit(cuit),
  }
}

async function loadConsumosConNro(): Promise<{
  byNro: Map<number, ConsumoActual>
  all: ConsumoActual[]
}> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'consumos',
    where: {
      and: [
        { estado: { equals: 'PAGADO' } },
        { nro_comprobante: { exists: true } },
      ],
    },
    depth: 2,
    pagination: false,
  })

  const byNro = new Map<number, ConsumoActual>()
  const all: ConsumoActual[] = []

  for (const doc of docs) {
    const info = extractConsumoActual(doc)
    if (!info) continue
    byNro.set(info.nro_comprobante, info)
    all.push(info)
  }

  return { byNro, all }
}

function buildIndexByDocImporte(consumos: ConsumoActual[]) {
  const map = new Map<string, ConsumoActual[]>()
  for (const c of consumos) {
    if (!c.doc_comprador || c.doc_comprador === '0') continue
    const key = `${c.doc_comprador}|${importeKey(c.precio_final)}`
    const list = map.get(key) ?? []
    list.push(c)
    map.set(key, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.nro_comprobante - b.nro_comprobante)
  }
  return map
}

function mesesPresentacionNro(
  appearancesByNro: Map<number, ArcaTxtAppearance[]>,
  nro: number,
): string[] {
  const apps = appearancesByNro.get(nro) ?? []
  return [...new Set(apps.map((a) => a.mes_archivo))].sort()
}

function monthDiff(fromMes: string, toMes: string): number {
  const [y1, m1] = fromMes.split('-').map(Number)
  const [y2, m2] = toMes.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/** Primer mes en que el nro actual aparece en ARCA; si no aparece, mes_db del consumo. */
function anclaMesActual(mesesActual: string[], mesDb: string): string {
  if (mesesActual.length > 0) return mesesActual[0]
  return mesDb
}

type ScoredCandidate = {
  candidate: ConsumoActual
  mesesActual: string[]
  anclaMes: string
  diffMeses: number
  score: number
}

const MAX_DIFF_MESES = 2

function scoreCandidate(args: {
  orphan: ArcaTxtAppearance
  candidate: ConsumoActual
  mesesActual: string[]
  diffMeses: number
}): number {
  const { orphan, candidate, mesesActual, diffMeses } = args
  let score = 0
  const gap = candidate.nro_comprobante - orphan.nro_comprobante

  score += Math.max(0, 50 - diffMeses * 20)
  score += Math.max(0, 30 - Math.floor(Math.min(gap, 800) / 20))

  if (mesesActual.some((m) => m > orphan.mes_archivo)) score += 25
  if (mesesActual.includes(orphan.mes_archivo)) score -= 40

  if (!candidate.pago_manual && /^\d+$/.test(candidate.id_pago_mp)) score += 20
  else score -= 10

  return score
}

function classifyMatch(
  orphan: ArcaTxtAppearance,
  scored: ScoredCandidate[],
): {
  confianza: MatchConfidence
  best: ScoredCandidate | null
  notas: string
} {
  if (scored.length === 0) {
    return {
      confianza: 'sin_candidato',
      best: null,
      notas: `sin candidato (doc+importe, nro mayor, ancla en ≤${MAX_DIFF_MESES} meses)`,
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.diffMeses - b.diffMeses ||
      a.candidate.nro_comprobante - b.candidate.nro_comprobante,
  )
  const best = scored[0]
  const second = scored[1]

  if (second && best.score < second.score + 8) {
    return {
      confianza: 'ambiguo',
      best,
      notas: `empate/cercano con nros ${scored
        .slice(0, 3)
        .map((s) => s.candidate.nro_comprobante)
        .join(';')}`,
    }
  }

  const isMp = !best.candidate.pago_manual && /^\d+$/.test(best.candidate.id_pago_mp)
  const posterior = best.mesesActual.some((m) => m > orphan.mes_archivo)

  if (isMp && posterior && best.diffMeses <= 1) {
    return { confianza: 'alto', best, notas: '' }
  }

  // Mismo patrón que "alto", pero el nro nuevo solo existe en DB / mes aún no presentado (ej. 2026-06)
  if (isMp && best.diffMeses <= 1 && !posterior) {
    return {
      confianza: 'probable',
      best,
      notas:
        best.mesesActual.length === 0
          ? `nro_actual aún no presentado en TXT (ancla ${best.anclaMes}; ${EXCLUDED_MONTH} excluido)`
          : 'nro_actual sin presentación en TXT posterior al fantasma',
    }
  }

  if (isMp && best.diffMeses <= MAX_DIFF_MESES) {
    return {
      confianza: 'medio',
      best,
      notas: posterior ? '' : 'ventana >1 mes o sin presentación posterior clara',
    }
  }
  return {
    confianza: 'medio',
    best,
    notas: isMp ? '' : 'candidato no es pago MP',
  }
}

async function main() {
  const { txtDir, auditJson } = parseArgs(process.argv.slice(2))

  console.log(`Cargando ARCA desde ${txtDir}...`)
  const txtIndex = await loadArcaTxtDirectory(txtDir)
  const allAppearances = [...txtIndex.appearancesByNro.values()]
    .flat()
    .filter((a) => a.mes_archivo !== EXCLUDED_MONTH)
  const excludedCount = [...txtIndex.appearancesByNro.values()]
    .flat()
    .filter((a) => a.mes_archivo === EXCLUDED_MONTH).length
  console.log(`Líneas ARCA (sin ${EXCLUDED_MONTH}): ${allAppearances.length}`)
  if (excludedCount > 0) {
    console.log(`Líneas excluidas (${EXCLUDED_MONTH}): ${excludedCount}`)
  }

  // Índice de apariciones sin el mes excluido (para anclar nro_actual solo a lo presentado)
  const appearancesByNro = new Map<number, ArcaTxtAppearance[]>()
  for (const app of allAppearances) {
    const list = appearancesByNro.get(app.nro_comprobante) ?? []
    list.push(app)
    appearancesByNro.set(app.nro_comprobante, list)
  }

  console.log('Cargando consumos PAGADO con nro_comprobante (dump)...')
  const { byNro, all: consumos } = await loadConsumosConNro()
  console.log(`Consumos con nro en DB: ${consumos.length}`)

  let auditByConsumo = new Map<string, AuditRow>()
  try {
    const audit = await loadAuditRowsFromJson(auditJson)
    auditByConsumo = new Map(audit.rows.map((r) => [r.consumo_id, r]))
    console.log(`Audit MP cargado: ${audit.rows.length} filas (${path.basename(auditJson)})`)
  } catch (error) {
    console.warn(`No se pudo cargar audit JSON (${auditJson}):`, error)
  }

  const byDocImporte = buildIndexByDocImporte(consumos)

  const orphanAppearances = allAppearances.filter((a) => !byNro.has(a.nro_comprobante))
  const orphanByNro = new Map<number, ArcaTxtAppearance>()
  for (const app of orphanAppearances.toSorted(
    (a, b) =>
      a.mes_archivo.localeCompare(b.mes_archivo) ||
      a.fecha_linea.localeCompare(b.fecha_linea) ||
      a.nro_comprobante - b.nro_comprobante,
  )) {
    if (!orphanByNro.has(app.nro_comprobante)) {
      orphanByNro.set(app.nro_comprobante, app)
    }
  }

  console.log(`Nros huérfanos en TXT (no en DB): ${orphanByNro.size}`)

  const rows: FantasmaRow[] = []
  const counts: Record<MatchConfidence, number> = {
    alto: 0,
    probable: 0,
    medio: 0,
    ambiguo: 0,
    sin_candidato: 0,
  }
  let importeAlto = 0
  let ivaAlto = 0
  let importeProbable = 0
  let ivaProbable = 0

  for (const orphan of orphanByNro.values()) {
    const key = `${orphan.doc_comprador}|${importeKey(orphan.importe_total)}`
    const pool = byDocImporte.get(key) ?? []

    const scored: ScoredCandidate[] = []
    for (const candidate of pool) {
      if (candidate.nro_comprobante <= orphan.nro_comprobante) continue
      const mesesActual = mesesPresentacionNro(appearancesByNro, candidate.nro_comprobante)
      const anclaMes = anclaMesActual(mesesActual, candidate.mes_db)
      if (!anclaMes) continue
      const diffMeses = monthDiff(orphan.mes_archivo, anclaMes)
      // El nro actual debe “nacer” en ARCA/DB en el mes del fantasma o hasta 2 meses después
      if (diffMeses < 0 || diffMeses > MAX_DIFF_MESES) continue
      // Si el nro actual ya estaba en el mismo mes del fantasma, no es renumeración de esa línea
      if (mesesActual.includes(orphan.mes_archivo)) continue

      scored.push({
        candidate,
        mesesActual,
        anclaMes,
        diffMeses,
        score: scoreCandidate({ orphan, candidate, mesesActual, diffMeses }),
      })
    }

    const { confianza, best, notas } = classifyMatch(orphan, scored)
    counts[confianza]++

    const audit = best ? auditByConsumo.get(best.candidate.consumo_id) : undefined
    const ivaFantasma = orphan.iva || calcIvaDesdePrecioFinal(orphan.importe_total).iva

    if (confianza === 'alto' && best) {
      importeAlto += orphan.importe_total
      ivaAlto += ivaFantasma
    }
    if (confianza === 'probable' && best) {
      importeProbable += orphan.importe_total
      ivaProbable += ivaFantasma
    }

    rows.push({
      confianza,
      nro_fantasma: orphan.nro_comprobante,
      mes_fantasma: orphan.mes_archivo,
      fecha_linea_fantasma: orphan.fecha_linea,
      archivo_fantasma: orphan.archivo,
      importe_fantasma: roundPrecio(orphan.importe_total),
      iva_fantasma: roundPrecio(ivaFantasma),
      doc_comprador: orphan.doc_comprador,
      candidatos: scored.length,
      nro_gap: best ? best.candidate.nro_comprobante - orphan.nro_comprobante : '',
      diff_meses: best?.diffMeses ?? '',
      nro_actual: best?.candidate.nro_comprobante ?? '',
      mes_presentacion_actual: best?.mesesActual.join(';') ?? '',
      consumo_id: best?.candidate.consumo_id ?? '',
      titulo: best?.candidate.titulo ?? '',
      id_pago_mp: best?.candidate.id_pago_mp ?? '',
      mes_mp: audit?.mes_mp ?? '',
      mes_db: best?.candidate.mes_db ?? '',
      precio_final: best ? roundPrecio(best.candidate.precio_final) : '',
      medidor_id: best?.candidate.medidor_id ?? '',
      numero_medidor: best?.candidate.numero_medidor ?? '',
      direccion: best?.candidate.direccion ?? '',
      nombre: best?.candidate.nombre ?? '',
      apellido: best?.candidate.apellido ?? '',
      cuit: best?.candidate.cuit ?? '',
      score: best?.score ?? '',
      notas,
    })
  }

  // Un consumo no debería absorber fantasmas de meses lejanos: si hay varios, quedarse
  // con los del mes inmediatamente anterior a la ancla del nro actual (reintentos).
  const byConsumo = new Map<string, FantasmaRow[]>()
  for (const row of rows) {
    if (
      !row.consumo_id ||
      (row.confianza !== 'alto' && row.confianza !== 'probable' && row.confianza !== 'medio')
    ) {
      continue
    }
    const list = byConsumo.get(row.consumo_id) ?? []
    list.push(row)
    byConsumo.set(row.consumo_id, list)
  }
  for (const list of byConsumo.values()) {
    if (list.length <= 1) continue
    const ancla =
      String(list[0].mes_presentacion_actual).split(';').filter(Boolean).sort()[0] ||
      list[0].mes_db
    if (!ancla) continue
    const preferred = list.filter((r) => monthDiff(r.mes_fantasma, ancla) <= 1)
    const keep = new Set(
      (preferred.length > 0 ? preferred : list)
        .toSorted((a, b) => Number(b.nro_fantasma) - Number(a.nro_fantasma))
        .slice(0, 3)
        .map((r) => r.nro_fantasma),
    )
    for (const row of list) {
      if (keep.has(row.nro_fantasma)) continue
      row.confianza = 'ambiguo'
      row.notas = `descartado: mismo consumo ya tiene fantasma(s) más cercanos (${[...keep].join(';')})`
    }
  }

  // Recontar después del filter por consumo
  counts.alto = rows.filter((r) => r.confianza === 'alto').length
  counts.probable = rows.filter((r) => r.confianza === 'probable').length
  counts.medio = rows.filter((r) => r.confianza === 'medio').length
  counts.ambiguo = rows.filter((r) => r.confianza === 'ambiguo').length
  counts.sin_candidato = rows.filter((r) => r.confianza === 'sin_candidato').length
  importeAlto = 0
  ivaAlto = 0
  importeProbable = 0
  ivaProbable = 0
  for (const row of rows) {
    if (row.confianza === 'alto') {
      importeAlto += row.importe_fantasma
      ivaAlto += row.iva_fantasma
    }
    if (row.confianza === 'probable') {
      importeProbable += row.importe_fantasma
      ivaProbable += row.iva_fantasma
    }
  }

  rows.sort((a, b) => {
    const confOrder: Record<MatchConfidence, number> = {
      alto: 0,
      probable: 1,
      medio: 2,
      ambiguo: 3,
      sin_candidato: 4,
    }
    const cmp = confOrder[a.confianza] - confOrder[b.confianza]
    if (cmp !== 0) return cmp
    return a.nro_fantasma - b.nro_fantasma
  })

  await mkdir(OUTPUT_DIR, { recursive: true })

  const paths = {
    detalle: path.join(OUTPUT_DIR, 'arca-fantasmas-renumeracion.csv'),
    altos: path.join(OUTPUT_DIR, 'arca-fantasmas-renumeracion-altos.csv'),
    probables: path.join(OUTPUT_DIR, 'arca-fantasmas-renumeracion-probables.csv'),
    maestro: path.join(OUTPUT_DIR, 'arca-fantasmas-renumeracion.json'),
  }

  const headers = [
    'confianza',
    'nro_fantasma',
    'mes_fantasma',
    'fecha_linea_fantasma',
    'archivo_fantasma',
    'importe_fantasma',
    'iva_fantasma',
    'doc_comprador',
    'candidatos',
    'nro_gap',
    'diff_meses',
    'nro_actual',
    'mes_presentacion_actual',
    'consumo_id',
    'titulo',
    'id_pago_mp',
    'mes_mp',
    'mes_db',
    'precio_final',
    'medidor_id',
    'numero_medidor',
    'direccion',
    'nombre',
    'apellido',
    'cuit',
    'score',
    'notas',
  ]

  await writeFile(paths.detalle, rowsToCsv(headers, rows))
  await writeFile(
    paths.altos,
    rowsToCsv(
      headers,
      rows.filter((r) => r.confianza === 'alto'),
    ),
  )
  await writeFile(
    paths.probables,
    rowsToCsv(
      headers,
      rows.filter((r) => r.confianza === 'probable' || r.confianza === 'alto'),
    ),
  )

  const summary = {
    generated_at: new Date().toISOString(),
    txt_dir: txtDir,
    audit_json: auditJson,
    excluded_month: EXCLUDED_MONTH,
    criterio: {
      huerfano: 'nro en TXT que ya no existe en ningún consumo PAGADO de la DB',
      match: 'mismo doc comprador + mismo importe + nro_actual > nro_fantasma',
      ventana_meses: `ancla del nro_actual (1er mes TXT o mes_db) entre 0 y ${MAX_DIFF_MESES} meses después del fantasma`,
      alto: 'pago MP + diff_meses≤1 + nro_actual presentado en mes posterior al fantasma',
      probable:
        'mismo patrón que alto pero nro_actual aún no figura en TXT presentados (p.ej. ancla en mes excluido)',
      excluido: `${EXCLUDED_MONTH} no presentado aún a ARCA`,
    },
    totals: {
      lineas_arca: allAppearances.length,
      lineas_excluidas: excludedCount,
      nros_en_txt: appearancesByNro.size,
      nros_en_db: byNro.size,
      nros_huerfanos: orphanByNro.size,
      match_alto: counts.alto,
      match_probable: counts.probable,
      match_medio: counts.medio,
      match_ambiguo: counts.ambiguo,
      sin_candidato: counts.sin_candidato,
      importe_fantasmas_alto: roundPrecio(importeAlto),
      iva_fantasmas_alto: roundPrecio(ivaAlto),
      importe_fantasmas_probable: roundPrecio(importeProbable),
      iva_fantasmas_probable: roundPrecio(ivaProbable),
    },
    paths,
  }

  await writeFile(paths.maestro, `${JSON.stringify(summary, null, 2)}\n`)

  console.log('\n=== Fantasmas por renumeración ===')
  console.log(`Excluido: ${EXCLUDED_MONTH}`)
  console.log(`Huérfanos TXT: ${orphanByNro.size}`)
  console.log(`Match alto:      ${counts.alto}`)
  console.log(`Match probable:  ${counts.probable}`)
  console.log(`Match medio:     ${counts.medio}`)
  console.log(`Match ambiguo:   ${counts.ambiguo}`)
  console.log(`Sin candidato:   ${counts.sin_candidato}`)
  console.log(`Importe (probable): $${roundPrecio(importeProbable).toLocaleString('es-AR')}`)
  console.log(`IVA (probable):     $${roundPrecio(ivaProbable).toLocaleString('es-AR')}`)
  console.log(`\nCSV todos:      ${paths.detalle}`)
  console.log(`CSV probables:  ${paths.probables}`)
  console.log(`JSON:           ${paths.maestro}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
