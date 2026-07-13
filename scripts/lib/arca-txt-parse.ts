import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

export const COMPROBANTES_LINE_LENGTH = 266
export const ALICUOTAS_LINE_LENGTH = 62

export type ArcaFuente = 'txt' | 'csv_arca'

export type ArcaTxtComprobanteRow = {
  mes_archivo: string
  archivo: string
  fecha_linea: string
  nro_comprobante: number
  importe_total: number
}

export type ArcaTxtAlicuotaRow = {
  mes_archivo: string
  archivo: string
  nro_comprobante: number
  neto: number
  iva: number
}

export type ArcaTxtMonthPair = {
  mes_archivo: string
  fuente: ArcaFuente
  comprobantesFile: string
  alicuotasFile: string
  comprobantes: ArcaTxtComprobanteRow[]
  alicuotas: ArcaTxtAlicuotaRow[]
  iva_declarado: number
}

export type ArcaTxtAppearance = {
  mes_archivo: string
  archivo: string
  fuente: ArcaFuente
  fecha_linea: string
  nro_comprobante: number
  importe_total: number
  neto: number
  iva: number
}

export type ArcaTxtIndex = {
  months: ArcaTxtMonthPair[]
  mesesConTxt: Set<string>
  appearancesByNro: Map<number, ArcaTxtAppearance[]>
  nrosEnTxt: Set<number>
}

const MONTH_RE =
  /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i

const CSV_PERIOD_RE = /comprobantes_periodo_(\d{4})(\d{2})_/i

export function mesDesdeNombreArchivo(filename: string): string | null {
  const match = filename.match(MONTH_RE)
  if (!match) return null
  const mesNum = MESES[match[1].toLowerCase()]
  if (!mesNum) return null
  return `${match[2]}-${mesNum}`
}

export function mesDesdeNombreCsvArchivo(filename: string): string | null {
  const match = filename.match(CSV_PERIOD_RE)
  if (!match) return null
  return `${match[1]}-${match[2]}`
}

function centavosToPesos(centavos: string): number {
  return Number(centavos) / 100
}

function sliceField(line: string, start: number, length: number): string {
  return line.slice(start, start + length)
}

export function parseArcaMoney(value: string): number {
  const trimmed = value.trim().replace(/^"|"$/g, '')
  if (!trimmed) return 0
  return Number(trimmed.replace(/\./g, '').replace(',', '.'))
}

export function fechaCsvToLinea(fecha: string): string {
  return fecha.trim().replace(/-/g, '')
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ';' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }
    current += char
  }

  fields.push(current)
  return fields
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/^"|"$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate)
    if (idx >= 0) return idx
  }
  return -1
}

export function parseComprobantesLine(
  line: string,
  mesArchivo: string,
  archivo: string,
): ArcaTxtComprobanteRow {
  if (line.length !== COMPROBANTES_LINE_LENGTH) {
    throw new Error(
      `Línea Comprobantes inválida en ${archivo}: largo ${line.length}, esperado ${COMPROBANTES_LINE_LENGTH}`,
    )
  }

  const fechaLinea = sliceField(line, 0, 8)
  const nroStr = sliceField(line, 16, 20)
  const importeCent = sliceField(line, 108, 15)

  return {
    mes_archivo: mesArchivo,
    archivo,
    fecha_linea: fechaLinea,
    nro_comprobante: Number(nroStr),
    importe_total: centavosToPesos(importeCent),
  }
}

export function parseAlicuotasLine(
  line: string,
  mesArchivo: string,
  archivo: string,
): ArcaTxtAlicuotaRow {
  if (line.length !== ALICUOTAS_LINE_LENGTH) {
    throw new Error(
      `Línea Alícuotas inválida en ${archivo}: largo ${line.length}, esperado ${ALICUOTAS_LINE_LENGTH}`,
    )
  }

  const nroStr = sliceField(line, 8, 20)
  const netoCent = sliceField(line, 28, 15)
  const ivaCent = sliceField(line, 47, 15)

  return {
    mes_archivo: mesArchivo,
    archivo,
    nro_comprobante: Number(nroStr),
    neto: centavosToPesos(netoCent),
    iva: centavosToPesos(ivaCent),
  }
}

function splitLines(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
}

async function readTxtLines(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, 'latin1')
  return splitLines(content)
}

export function roundPrecio(value: number): number {
  return Math.floor(value * 100) / 100
}

/** Misma fórmula que createAlicuotas en client-export-registros.tsx */
export function calcIvaDesdePrecioFinal(precioFinal: number): { neto: number; iva: number } {
  const importeNetoCent = Math.trunc(roundPrecio(precioFinal / 1.21) * 100)
  const ivaCent = Math.trunc(precioFinal * 100) - importeNetoCent
  return {
    neto: importeNetoCent / 100,
    iva: ivaCent / 100,
  }
}

function addAppearance(
  appearancesByNro: Map<number, ArcaTxtAppearance[]>,
  nrosEnTxt: Set<number>,
  appearance: ArcaTxtAppearance,
) {
  nrosEnTxt.add(appearance.nro_comprobante)
  const list = appearancesByNro.get(appearance.nro_comprobante) ?? []
  list.push(appearance)
  appearancesByNro.set(appearance.nro_comprobante, list)
}

async function loadTxtMonthPair(
  txtDir: string,
  mes: string,
  compFile: string,
  alicFile: string,
  appearancesByNro: Map<number, ArcaTxtAppearance[]>,
  nrosEnTxt: Set<number>,
): Promise<ArcaTxtMonthPair> {
  const compPath = path.join(txtDir, compFile)
  const alicPath = path.join(txtDir, alicFile)

  const compLines = await readTxtLines(compPath)
  const alicLines = await readTxtLines(alicPath)

  if (compLines.length !== alicLines.length) {
    throw new Error(
      `Mes ${mes}: ${compFile} tiene ${compLines.length} líneas, ${alicFile} tiene ${alicLines.length}`,
    )
  }

  const comprobantes = compLines.map((line) => parseComprobantesLine(line, mes, compFile))
  const alicuotas = alicLines.map((line) => parseAlicuotasLine(line, mes, alicFile))
  const alicuotasByNro = new Map(alicuotas.map((a) => [a.nro_comprobante, a]))

  for (const comp of comprobantes) {
    const alic = alicuotasByNro.get(comp.nro_comprobante)
    if (!alic) {
      throw new Error(
        `Mes ${mes}: nro_comprobante ${comp.nro_comprobante} en Comprobantes sin par en Alícuotas`,
      )
    }

    addAppearance(appearancesByNro, nrosEnTxt, {
      mes_archivo: mes,
      archivo: compFile,
      fuente: 'txt',
      fecha_linea: comp.fecha_linea,
      nro_comprobante: comp.nro_comprobante,
      importe_total: comp.importe_total,
      neto: alic.neto,
      iva: alic.iva,
    })
  }

  const ivaDeclarado = alicuotas.reduce((sum, row) => sum + row.iva, 0)

  return {
    mes_archivo: mes,
    fuente: 'txt',
    comprobantesFile: compFile,
    alicuotasFile: alicFile,
    comprobantes,
    alicuotas,
    iva_declarado: roundPrecio(ivaDeclarado),
  }
}

export async function parseArcaCsvFile(
  filePath: string,
  mesArchivo: string,
  archivo: string,
): Promise<ArcaTxtMonthPair> {
  const content = await readFile(filePath, 'latin1')
  const lines = splitLines(content.replace(/^\uFEFF/, ''))
  if (lines.length < 2) {
    throw new Error(`CSV vacío o sin datos: ${archivo}`)
  }

  const headers = parseCsvLine(lines[0])
  const idxFecha = findColumnIndex(headers, ['fecha de emision'])
  const idxNro = findColumnIndex(headers, ['numero de comprobante'])
  const idxImporte = findColumnIndex(headers, ['importe total'])
  const idxIva21 = findColumnIndex(headers, ['importe iva 21%'])
  const idxTotalIva = findColumnIndex(headers, ['total iva'])
  const idxNeto21 = findColumnIndex(headers, ['neto gravado iva 21%'])
  const idxTotalNeto = findColumnIndex(headers, ['total neto gravado'])

  if (idxFecha < 0 || idxNro < 0 || idxImporte < 0) {
    throw new Error(`CSV ${archivo}: faltan columnas obligatorias`)
  }

  const comprobantes: ArcaTxtComprobanteRow[] = []
  const alicuotas: ArcaTxtAlicuotaRow[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    if (cols.length < headers.length) continue

    const nro = Number(cols[idxNro])
    if (!Number.isFinite(nro)) continue

    const importeTotal = parseArcaMoney(cols[idxImporte])
    const iva =
      idxIva21 >= 0 && cols[idxIva21]
        ? parseArcaMoney(cols[idxIva21])
        : idxTotalIva >= 0
          ? parseArcaMoney(cols[idxTotalIva])
          : 0
    const neto =
      idxNeto21 >= 0 && cols[idxNeto21]
        ? parseArcaMoney(cols[idxNeto21])
        : idxTotalNeto >= 0
          ? parseArcaMoney(cols[idxTotalNeto])
          : roundPrecio(importeTotal - iva)

    const fechaLinea = fechaCsvToLinea(cols[idxFecha])

    comprobantes.push({
      mes_archivo: mesArchivo,
      archivo,
      fecha_linea: fechaLinea,
      nro_comprobante: nro,
      importe_total: importeTotal,
    })

    alicuotas.push({
      mes_archivo: mesArchivo,
      archivo,
      nro_comprobante: nro,
      neto,
      iva,
    })
  }

  const ivaDeclarado = alicuotas.reduce((sum, row) => sum + row.iva, 0)

  return {
    mes_archivo: mesArchivo,
    fuente: 'csv_arca',
    comprobantesFile: archivo,
    alicuotasFile: archivo,
    comprobantes,
    alicuotas,
    iva_declarado: roundPrecio(ivaDeclarado),
  }
}

export async function loadArcaTxtDirectory(txtDir: string): Promise<ArcaTxtIndex> {
  const entries = await readdir(txtDir)
  const comprobantesFiles = entries.filter((f) => f.startsWith('VentasComprobantes_'))
  const alicuotasFiles = entries.filter((f) => f.startsWith('VentasAlicuotas_'))
  const csvFiles = entries.filter((f) => /^comprobantes_periodo_\d{6}_/i.test(f) && f.endsWith('.csv'))

  const comprobantesByMes = new Map<string, string>()
  const alicuotasByMes = new Map<string, string>()
  const csvByMes = new Map<string, string>()

  for (const file of comprobantesFiles) {
    const mes = mesDesdeNombreArchivo(file)
    if (!mes) continue
    comprobantesByMes.set(mes, file)
  }

  for (const file of alicuotasFiles) {
    const mes = mesDesdeNombreArchivo(file)
    if (!mes) continue
    alicuotasByMes.set(mes, file)
  }

  for (const file of csvFiles) {
    const mes = mesDesdeNombreCsvArchivo(file)
    if (!mes) continue
    csvByMes.set(mes, file)
  }

  const txtMeses = [...new Set([...comprobantesByMes.keys(), ...alicuotasByMes.keys()])].sort()
  const allMeses = [...new Set([...txtMeses, ...csvByMes.keys()])].sort()

  const months: ArcaTxtMonthPair[] = []
  const appearancesByNro = new Map<number, ArcaTxtAppearance[]>()
  const nrosEnTxt = new Set<number>()

  for (const mes of txtMeses) {
    const compFile = comprobantesByMes.get(mes)
    const alicFile = alicuotasByMes.get(mes)

    if (!compFile || !alicFile) {
      throw new Error(
        `Mes ${mes}: falta par Comprobantes/Alícuotas (comp=${compFile ?? '—'}, alic=${alicFile ?? '—'})`,
      )
    }

    if (csvByMes.has(mes)) {
      console.warn(
        `Mes ${mes}: hay TXT y CSV; se usa TXT (${compFile}) e ignora ${csvByMes.get(mes)}`,
      )
    }

    months.push(
      await loadTxtMonthPair(txtDir, mes, compFile, alicFile, appearancesByNro, nrosEnTxt),
    )
  }

  for (const mes of [...csvByMes.keys()].sort()) {
    if (txtMeses.includes(mes)) continue

    const csvFile = csvByMes.get(mes)!
    const monthPair = await parseArcaCsvFile(path.join(txtDir, csvFile), mes, csvFile)

    for (let i = 0; i < monthPair.comprobantes.length; i++) {
      const comp = monthPair.comprobantes[i]
      const alic = monthPair.alicuotas[i]
      addAppearance(appearancesByNro, nrosEnTxt, {
        mes_archivo: mes,
        archivo: csvFile,
        fuente: 'csv_arca',
        fecha_linea: comp.fecha_linea,
        nro_comprobante: comp.nro_comprobante,
        importe_total: comp.importe_total,
        neto: alic.neto,
        iva: alic.iva,
      })
    }

    months.push(monthPair)
  }

  months.sort((a, b) => a.mes_archivo.localeCompare(b.mes_archivo))

  return {
    months,
    mesesConTxt: new Set(allMeses),
    appearancesByNro,
    nrosEnTxt,
  }
}

export function calcIvaDuplicadosExtra(txtIndex: ArcaTxtIndex): number {
  let extra = 0
  for (const appearances of txtIndex.appearancesByNro.values()) {
    if (appearances.length <= 1) continue
    for (let i = 1; i < appearances.length; i++) {
      extra += appearances[i].iva
    }
  }
  return roundPrecio(extra)
}

export function calcImporteDuplicadosExtra(txtIndex: ArcaTxtIndex): number {
  let extra = 0
  for (const appearances of txtIndex.appearancesByNro.values()) {
    if (appearances.length <= 1) continue
    for (let i = 1; i < appearances.length; i++) {
      extra += appearances[i].importe_total
    }
  }
  return roundPrecio(extra)
}
