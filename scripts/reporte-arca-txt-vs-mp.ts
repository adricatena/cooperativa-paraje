import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calcIvaDesdePrecioFinal,
  calcIvaDuplicadosExtra,
  calcImporteDuplicadosExtra,
  loadArcaTxtDirectory,
  roundPrecio,
  type ArcaTxtAppearance,
  type ArcaTxtIndex,
} from './lib/arca-txt-parse.js'
import { loadAuditRowsFromJson, type AuditRow } from './lib/fecha-pago-mp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const DEFAULT_TXT_DIR = path.join(__dirname, '..', 'reportestxtcooperativa')
const DEFAULT_AUDIT_JSON = path.join(
  OUTPUT_DIR,
  'audit-fecha-pago-2026-07-11T19-20-40-879Z.json',
)

type ReconcileStatus =
  | 'ok'
  | 'mes_incorrecto'
  | 'duplicado'
  | 'faltante_en_txt'
  | 'sin_cobertura_txt'
  | 'solo_txt'

type ReconcileRow = {
  nro_comprobante: number
  clasificacion: ReconcileStatus
  mes_mp: string
  meses_txt: string
  incluye_mes_correcto: boolean | ''
  monto_distinto: boolean
  importe_txt: number | ''
  precio_final_audit: number | ''
  consumo_id: string
  titulo: string
  id_pago_mp: string
  fecha_linea: string
  apariciones: number
}

type SobrefacturacionRow = {
  mes: string
  lineas_arca: number
  comprobantes_unicos_mp: number
  importe_declarado_arca: number
  importe_correcto_mp: number
  delta_importe: number
  iva_declarado_arca: number
  iva_correcto_mp: number
  delta_iva: number
  iva_duplicados_extra: number
  importe_solo_txt: number
  iva_solo_txt: number
}

type SobrefacturacionTotales = {
  lineas_arca: number
  comprobantes_unicos_mp: number
  importe_declarado_arca: number
  importe_correcto_mp: number
  delta_importe: number
  iva_declarado_arca: number
  iva_correcto_mp: number
  delta_iva: number
  iva_duplicados_extra: number
  importe_solo_txt: number
  iva_solo_txt: number
  sobrefacturacion_neta_vs_mp: boolean
}

type MonthlySummaryRow = {
  mes: string
  tiene_txt: boolean
  fuente: string
  comprobantes_txt: number
  iva_declarado: number
  comprobantes_correctos_mp: number
  iva_correcto_mp: number
  delta_iva: number
  ok: number
  mes_incorrecto: number
  duplicado: number
  faltante_en_txt: number
  sin_cobertura_txt: number
  solo_txt: number
  monto_distinto: number
}

function parseReportArgs(argv: string[]) {
  let txtDir = DEFAULT_TXT_DIR
  let fromJson = DEFAULT_AUDIT_JSON

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--txt-dir=')) {
      txtDir = arg.slice('--txt-dir='.length)
    } else if (arg.startsWith('--from-json=')) {
      fromJson = arg.slice('--from-json='.length)
    }
  }

  return {
    txtDir: path.resolve(txtDir),
    fromJson: path.resolve(fromJson),
  }
}

function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','))
  }
  return lines.join('\n')
}

function montoDistinto(importeTxt: number, precioAudit: number | null | undefined): boolean {
  if (precioAudit == null) return false
  return Math.abs(importeTxt - precioAudit) > 0.01
}

function formatAppearances(appearances: ArcaTxtAppearance[]): string {
  return appearances.map((a) => a.mes_archivo).join(';')
}

function buildReconcileRows(
  auditRows: AuditRow[],
  txtIndex: Awaited<ReturnType<typeof loadArcaTxtDirectory>>,
): ReconcileRow[] {
  const rows: ReconcileRow[] = []
  const auditByNro = new Map<number, AuditRow>()

  for (const row of auditRows) {
    if (row.nro_comprobante == null || row.status === 'error_mp') continue
    auditByNro.set(row.nro_comprobante, row)
  }

  const processedNros = new Set<number>()

  for (const [nro, appearances] of txtIndex.appearancesByNro) {
    processedNros.add(nro)
    const audit = auditByNro.get(nro)
    const mesesTxt = formatAppearances(appearances)
    const first = appearances[0]
    const importeTxt = first.importe_total

    let clasificacion: ReconcileStatus
    if (appearances.length > 1) {
      clasificacion = 'duplicado'
    } else if (!audit) {
      clasificacion = 'solo_txt'
    } else if (appearances[0].mes_archivo === audit.mes_mp) {
      clasificacion = 'ok'
    } else {
      clasificacion = 'mes_incorrecto'
    }

    const mesMp = audit?.mes_mp ?? ''
    const incluyeMesCorrecto =
      appearances.length > 1 && mesMp ? appearances.some((a) => a.mes_archivo === mesMp) : ''

    rows.push({
      nro_comprobante: nro,
      clasificacion,
      mes_mp: mesMp,
      meses_txt: mesesTxt,
      incluye_mes_correcto: incluyeMesCorrecto,
      monto_distinto: audit ? montoDistinto(importeTxt, audit.precio_final) : false,
      importe_txt: importeTxt,
      precio_final_audit: audit?.precio_final ?? '',
      consumo_id: audit?.consumo_id ?? '',
      titulo: audit?.titulo ?? '',
      id_pago_mp: audit?.id_pago_mp ?? '',
      fecha_linea: first.fecha_linea,
      apariciones: appearances.length,
    })
  }

  for (const audit of auditByNro.values()) {
    const nro = audit.nro_comprobante!
    if (processedNros.has(nro)) continue

    const mesMp = audit.mes_mp
    const clasificacion: ReconcileStatus = txtIndex.mesesConTxt.has(mesMp)
      ? 'faltante_en_txt'
      : 'sin_cobertura_txt'

    rows.push({
      nro_comprobante: nro,
      clasificacion,
      mes_mp: mesMp,
      meses_txt: '',
      incluye_mes_correcto: '',
      monto_distinto: false,
      importe_txt: '',
      precio_final_audit: audit.precio_final ?? '',
      consumo_id: audit.consumo_id,
      titulo: audit.titulo ?? '',
      id_pago_mp: audit.id_pago_mp,
      fecha_linea: '',
      apariciones: 0,
    })
  }

  return rows.sort((a, b) => {
    const cmp = a.clasificacion.localeCompare(b.clasificacion)
    if (cmp !== 0) return cmp
    return a.nro_comprobante - b.nro_comprobante
  })
}

function findDuplicateNrosInAudit(auditRows: AuditRow[]): number[] {
  const counts = new Map<number, number>()
  for (const row of auditRows) {
    if (row.nro_comprobante == null) continue
    counts.set(row.nro_comprobante, (counts.get(row.nro_comprobante) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([nro]) => nro)
}

function buildMonthlySummary(
  reconcileRows: ReconcileRow[],
  txtIndex: Awaited<ReturnType<typeof loadArcaTxtDirectory>>,
  auditRows: AuditRow[],
): MonthlySummaryRow[] {
  const auditValid = auditRows.filter(
    (r) => r.nro_comprobante != null && r.status !== 'error_mp' && r.precio_final != null,
  )

  const allMeses = new Set<string>([
    ...txtIndex.mesesConTxt,
    ...auditValid.map((r) => r.mes_mp),
  ])

  const summaries: MonthlySummaryRow[] = []

  for (const mes of [...allMeses].sort()) {
    const tieneTxt = txtIndex.mesesConTxt.has(mes)
    const monthPair = txtIndex.months.find((m) => m.mes_archivo === mes)

    const ivaDeclarado = monthPair?.iva_declarado ?? 0
    const comprobantesTxt = monthPair?.comprobantes.length ?? 0

    const auditEnMes = auditValid.filter((r) => r.mes_mp === mes)
    const ivaCorrecto = roundPrecio(
      auditEnMes.reduce((sum, r) => sum + calcIvaDesdePrecioFinal(r.precio_final!).iva, 0),
    )

    const rowsEnMes = reconcileRows.filter((r) => {
      if (r.mes_mp === mes) return true
      if (r.meses_txt.split(';').includes(mes)) return true
      return false
    })

    const countBy = (status: ReconcileStatus) =>
      rowsEnMes.filter((r) => r.clasificacion === status).length

    summaries.push({
      mes,
      tiene_txt: tieneTxt,
      fuente: monthPair?.fuente ?? '',
      comprobantes_txt: comprobantesTxt,
      iva_declarado: ivaDeclarado,
      comprobantes_correctos_mp: auditEnMes.length,
      iva_correcto_mp: ivaCorrecto,
      delta_iva: roundPrecio(ivaDeclarado - ivaCorrecto),
      ok: countBy('ok'),
      mes_incorrecto: countBy('mes_incorrecto'),
      duplicado: countBy('duplicado'),
      faltante_en_txt: countBy('faltante_en_txt'),
      sin_cobertura_txt: countBy('sin_cobertura_txt'),
      solo_txt: countBy('solo_txt'),
      monto_distinto: rowsEnMes.filter((r) => r.monto_distinto).length,
    })
  }

  return summaries
}

function buildDuplicadosExtraByMes(txtIndex: ArcaTxtIndex): Map<string, number> {
  const byMes = new Map<string, number>()
  for (const appearances of txtIndex.appearancesByNro.values()) {
    for (let i = 1; i < appearances.length; i++) {
      const mes = appearances[i].mes_archivo
      byMes.set(mes, roundPrecio((byMes.get(mes) ?? 0) + appearances[i].iva))
    }
  }
  return byMes
}

function buildSoloTxtByMes(
  reconcileRows: ReconcileRow[],
  txtIndex: ArcaTxtIndex,
): Map<string, { importe: number; iva: number }> {
  const byMes = new Map<string, { importe: number; iva: number }>()
  const soloNros = new Set(
    reconcileRows.filter((r) => r.clasificacion === 'solo_txt').map((r) => r.nro_comprobante),
  )

  for (const nro of soloNros) {
    const apps = txtIndex.appearancesByNro.get(nro) ?? []
    for (const app of apps) {
      const current = byMes.get(app.mes_archivo) ?? { importe: 0, iva: 0 }
      current.importe = roundPrecio(current.importe + app.importe_total)
      current.iva = roundPrecio(current.iva + app.iva)
      byMes.set(app.mes_archivo, current)
    }
  }

  return byMes
}

function buildSobrefacturacionSummary(
  txtIndex: ArcaTxtIndex,
  auditRows: AuditRow[],
  reconcileRows: ReconcileRow[],
): { rows: SobrefacturacionRow[]; totales: SobrefacturacionTotales } {
  const auditValid = auditRows.filter(
    (r) => r.nro_comprobante != null && r.status !== 'error_mp' && r.precio_final != null,
  )
  const duplicadosByMes = buildDuplicadosExtraByMes(txtIndex)
  const soloTxtByMes = buildSoloTxtByMes(reconcileRows, txtIndex)
  const rows: SobrefacturacionRow[] = []

  for (const monthPair of txtIndex.months) {
    const mes = monthPair.mes_archivo
    const auditEnMes = auditValid.filter((r) => r.mes_mp === mes)
    const importeDeclarado = roundPrecio(
      monthPair.comprobantes.reduce((sum, c) => sum + c.importe_total, 0),
    )
    const importeCorrecto = roundPrecio(
      auditEnMes.reduce((sum, r) => sum + r.precio_final!, 0),
    )
    const ivaCorrecto = roundPrecio(
      auditEnMes.reduce((sum, r) => sum + calcIvaDesdePrecioFinal(r.precio_final!).iva, 0),
    )
    const soloTxt = soloTxtByMes.get(mes) ?? { importe: 0, iva: 0 }

    rows.push({
      mes,
      lineas_arca: monthPair.comprobantes.length,
      comprobantes_unicos_mp: auditEnMes.length,
      importe_declarado_arca: importeDeclarado,
      importe_correcto_mp: importeCorrecto,
      delta_importe: roundPrecio(importeDeclarado - importeCorrecto),
      iva_declarado_arca: monthPair.iva_declarado,
      iva_correcto_mp: ivaCorrecto,
      delta_iva: roundPrecio(monthPair.iva_declarado - ivaCorrecto),
      iva_duplicados_extra: duplicadosByMes.get(mes) ?? 0,
      importe_solo_txt: soloTxt.importe,
      iva_solo_txt: soloTxt.iva,
    })
  }

  const totalesBase = rows.reduce(
    (acc, row) => ({
      lineas_arca: acc.lineas_arca + row.lineas_arca,
      comprobantes_unicos_mp: acc.comprobantes_unicos_mp + row.comprobantes_unicos_mp,
      importe_declarado_arca: roundPrecio(acc.importe_declarado_arca + row.importe_declarado_arca),
      importe_correcto_mp: roundPrecio(acc.importe_correcto_mp + row.importe_correcto_mp),
      delta_importe: roundPrecio(acc.delta_importe + row.delta_importe),
      iva_declarado_arca: roundPrecio(acc.iva_declarado_arca + row.iva_declarado_arca),
      iva_correcto_mp: roundPrecio(acc.iva_correcto_mp + row.iva_correcto_mp),
      delta_iva: roundPrecio(acc.delta_iva + row.delta_iva),
      iva_duplicados_extra: roundPrecio(acc.iva_duplicados_extra + row.iva_duplicados_extra),
      importe_solo_txt: roundPrecio(acc.importe_solo_txt + row.importe_solo_txt),
      iva_solo_txt: roundPrecio(acc.iva_solo_txt + row.iva_solo_txt),
    }),
    {
      lineas_arca: 0,
      comprobantes_unicos_mp: 0,
      importe_declarado_arca: 0,
      importe_correcto_mp: 0,
      delta_importe: 0,
      iva_declarado_arca: 0,
      iva_correcto_mp: 0,
      delta_iva: 0,
      iva_duplicados_extra: 0,
      importe_solo_txt: 0,
      iva_solo_txt: 0,
    },
  )

  const totales: SobrefacturacionTotales = {
    ...totalesBase,
    iva_duplicados_extra: calcIvaDuplicadosExtra(txtIndex),
    sobrefacturacion_neta_vs_mp:
      totalesBase.delta_iva > 0.01 || totalesBase.delta_importe > 0.01,
  }

  rows.push({
    mes: 'TOTAL',
    ...totalesBase,
    iva_duplicados_extra: totales.iva_duplicados_extra,
  })

  return { rows, totales }
}

function detectMissingTxtMonths(txtIndex: Awaited<ReturnType<typeof loadArcaTxtDirectory>>): string[] {
  const meses = [...txtIndex.mesesConTxt].sort()
  if (meses.length < 2) return []

  const missing: string[] = []
  const [firstYear, firstMonth] = meses[0].split('-').map(Number)
  const [lastYear, lastMonth] = meses[meses.length - 1].split('-').map(Number)

  let y = firstYear
  let m = firstMonth

  while (y < lastYear || (y === lastYear && m <= lastMonth)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (!txtIndex.mesesConTxt.has(key)) {
      missing.push(key)
    }
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  return missing
}

async function main() {
  const { txtDir, fromJson } = parseReportArgs(process.argv.slice(2))

  console.log('Reconciliación TXT ARCA vs MercadoPago')
  console.log(`TXT:   ${txtDir}`)
  console.log(`Audit: ${fromJson}`)

  const [txtIndex, auditReport] = await Promise.all([
    loadArcaTxtDirectory(txtDir),
    loadAuditRowsFromJson(fromJson),
  ])

  const auditRows = auditReport.rows
  const reconcileRows = buildReconcileRows(auditRows, txtIndex)
  const monthlySummary = buildMonthlySummary(reconcileRows, txtIndex, auditRows)
  const { rows: sobrefacturacionRows, totales: sobrefacturacionTotales } =
    buildSobrefacturacionSummary(txtIndex, auditRows, reconcileRows)
  const duplicateAuditNros = findDuplicateNrosInAudit(auditRows)
  const missingTxtMonths = detectMissingTxtMonths(txtIndex)
  const importeDuplicadosExtra = calcImporteDuplicadosExtra(txtIndex)

  const counts = {
    ok: reconcileRows.filter((r) => r.clasificacion === 'ok').length,
    mes_incorrecto: reconcileRows.filter((r) => r.clasificacion === 'mes_incorrecto').length,
    duplicado: reconcileRows.filter((r) => r.clasificacion === 'duplicado').length,
    faltante_en_txt: reconcileRows.filter((r) => r.clasificacion === 'faltante_en_txt').length,
    sin_cobertura_txt: reconcileRows.filter((r) => r.clasificacion === 'sin_cobertura_txt').length,
    solo_txt: reconcileRows.filter((r) => r.clasificacion === 'solo_txt').length,
    monto_distinto: reconcileRows.filter((r) => r.monto_distinto).length,
  }

  const detailHeaders = [
    'nro_comprobante',
    'clasificacion',
    'mes_mp',
    'meses_txt',
    'incluye_mes_correcto',
    'monto_distinto',
    'importe_txt',
    'precio_final_audit',
    'consumo_id',
    'titulo',
    'id_pago_mp',
    'fecha_linea',
    'apariciones',
  ]

  await mkdir(OUTPUT_DIR, { recursive: true })

  const paths = {
    resumenMensual: path.join(OUTPUT_DIR, 'arca-txt-resumen-mensual.csv'),
    duplicados: path.join(OUTPUT_DIR, 'arca-txt-duplicados.csv'),
    mesIncorrecto: path.join(OUTPUT_DIR, 'arca-txt-mes-incorrecto.csv'),
    faltantes: path.join(OUTPUT_DIR, 'arca-txt-faltantes.csv'),
    sinCobertura: path.join(OUTPUT_DIR, 'arca-txt-sin-cobertura.csv'),
    soloTxt: path.join(OUTPUT_DIR, 'arca-txt-solo-txt.csv'),
    sobrefacturacion: path.join(OUTPUT_DIR, 'arca-txt-sobrefacturacion.csv'),
    maestro: path.join(OUTPUT_DIR, 'arca-txt-reconciliacion.json'),
  }

  const monthlyHeaders = [
    'mes',
    'tiene_txt',
    'fuente',
    'comprobantes_txt',
    'iva_declarado',
    'comprobantes_correctos_mp',
    'iva_correcto_mp',
    'delta_iva',
    'ok',
    'mes_incorrecto',
    'duplicado',
    'faltante_en_txt',
    'sin_cobertura_txt',
    'solo_txt',
    'monto_distinto',
  ]

  const sobrefacturacionHeaders = [
    'mes',
    'lineas_arca',
    'comprobantes_unicos_mp',
    'importe_declarado_arca',
    'importe_correcto_mp',
    'delta_importe',
    'iva_declarado_arca',
    'iva_correcto_mp',
    'delta_iva',
    'iva_duplicados_extra',
    'importe_solo_txt',
    'iva_solo_txt',
  ]

  await Promise.all([
    writeFile(paths.resumenMensual, rowsToCsv(monthlyHeaders, monthlySummary), 'utf8'),
    writeFile(
      paths.duplicados,
      rowsToCsv(
        detailHeaders,
        reconcileRows.filter((r) => r.clasificacion === 'duplicado'),
      ),
      'utf8',
    ),
    writeFile(
      paths.mesIncorrecto,
      rowsToCsv(
        detailHeaders,
        reconcileRows.filter((r) => r.clasificacion === 'mes_incorrecto'),
      ),
      'utf8',
    ),
    writeFile(
      paths.faltantes,
      rowsToCsv(
        detailHeaders,
        reconcileRows.filter((r) => r.clasificacion === 'faltante_en_txt'),
      ),
      'utf8',
    ),
    writeFile(
      paths.sinCobertura,
      rowsToCsv(
        detailHeaders,
        reconcileRows.filter((r) => r.clasificacion === 'sin_cobertura_txt'),
      ),
      'utf8',
    ),
    writeFile(
      paths.soloTxt,
      rowsToCsv(
        detailHeaders,
        reconcileRows.filter((r) => r.clasificacion === 'solo_txt'),
      ),
      'utf8',
    ),
    writeFile(
      paths.sobrefacturacion,
      rowsToCsv(sobrefacturacionHeaders, sobrefacturacionRows),
      'utf8',
    ),
    writeFile(
      paths.maestro,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          txt_dir: txtDir,
          audit_json: fromJson,
          meses_con_txt: [...txtIndex.mesesConTxt].sort(),
          meses_sin_txt_en_rango: missingTxtMonths,
          duplicate_nro_comprobante_en_audit: duplicateAuditNros,
          counts,
          sobrefacturacion: {
            ...sobrefacturacionTotales,
            importe_duplicados_extra: importeDuplicadosExtra,
          },
          paths,
        },
        null,
        2,
      ),
      'utf8',
    ),
  ])

  console.log('\n--- Resumen ---')
  console.log(`Meses con TXT: ${txtIndex.mesesConTxt.size}`)
  if (missingTxtMonths.length > 0) {
    console.log(`Meses sin TXT en el rango: ${missingTxtMonths.join(', ')}`)
  }
  console.log(`Comprobantes únicos en TXT: ${txtIndex.nrosEnTxt.size}`)
  console.log(`OK:              ${counts.ok}`)
  console.log(`Mes incorrecto:  ${counts.mes_incorrecto}`)
  console.log(`Duplicados:      ${counts.duplicado}`)
  console.log(`Faltante en TXT: ${counts.faltante_en_txt}`)
  console.log(`Sin cobertura:   ${counts.sin_cobertura_txt}`)
  console.log(`Solo TXT:        ${counts.solo_txt}`)
  console.log(`Monto distinto:  ${counts.monto_distinto}`)

  console.log('\n--- Sobrefacturación vs MercadoPago (meses con evidencia ARCA) ---')
  console.log(
    `IVA declarado ARCA:  $${sobrefacturacionTotales.iva_declarado_arca.toLocaleString('es-AR')}`,
  )
  console.log(
    `IVA correcto MP:     $${sobrefacturacionTotales.iva_correcto_mp.toLocaleString('es-AR')}`,
  )
  console.log(
    `Delta IVA (ARCA-MP): $${sobrefacturacionTotales.delta_iva.toLocaleString('es-AR')} ${sobrefacturacionTotales.delta_iva > 0 ? '(SOBREFACTURACIÓN)' : sobrefacturacionTotales.delta_iva < 0 ? '(subfacturación)' : ''}`,
  )
  console.log(
    `Delta importe:       $${sobrefacturacionTotales.delta_importe.toLocaleString('es-AR')}`,
  )
  console.log(
    `IVA extra duplicados: $${sobrefacturacionTotales.iva_duplicados_extra.toLocaleString('es-AR')} (importe: $${importeDuplicadosExtra.toLocaleString('es-AR')})`,
  )
  console.log(
    `Masa solo_txt (no MP): IVA $${sobrefacturacionTotales.iva_solo_txt.toLocaleString('es-AR')}, importe $${sobrefacturacionTotales.importe_solo_txt.toLocaleString('es-AR')}`,
  )
  console.log(
    `¿Sobrefacturamos vs MP? ${sobrefacturacionTotales.sobrefacturacion_neta_vs_mp ? 'SÍ' : 'NO'} (líneas ARCA: ${sobrefacturacionTotales.lineas_arca}, comprobantes MP únicos: ${sobrefacturacionTotales.comprobantes_unicos_mp})`,
  )

  if (duplicateAuditNros.length > 0) {
    console.log(`\nADVERTENCIA: nro_comprobante duplicados en audit: ${duplicateAuditNros.join(', ')}`)
  }

  console.log('\n--- Archivos ---')
  for (const [key, filePath] of Object.entries(paths)) {
    console.log(`${key}: ${filePath}`)
  }

  process.exit(0)
}

await main()
