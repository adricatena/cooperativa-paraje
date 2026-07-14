import type { Consumo, Medidore, Usuario } from '@/payload-types'
import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  loadArcaTxtDirectory,
  roundPrecio,
  type ArcaTxtAppearance,
  type ArcaTxtIndex,
} from './lib/arca-txt-parse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const DEFAULT_TXT_DIR = path.join(__dirname, '..', 'reportestxtcooperativa')
const EXCLUDED_MONTH = '2026-06'

type MedidorInfo = {
  medidor_id: string
  numero_medidor: string
  direccion: string
  nombre: string
  apellido: string
  cuit: string
  consumo_id: string
  titulo: string
}

type ArcaLine = ArcaTxtAppearance & {
  line_id: string
}

type SuspicionMotivo = 'nro_duplicado' | 'medidor_importe_fecha'

type DetalleRow = {
  medidor_id: string
  numero_medidor: string
  direccion: string
  nombre: string
  apellido: string
  cuit: string
  consumo_id: string
  titulo: string
  nro_comprobante: number
  importe_total: number
  fecha_linea: string
  mes_archivo: string
  archivo: string
  fuente: string
  motivos: string
  grupo_id: string
  apariciones_en_grupo: number
}

type MedidorSummaryRow = {
  medidor_id: string
  numero_medidor: string
  direccion: string
  nombre: string
  apellido: string
  cuit: string
  ventas_sospechosas: number
  repeticiones_extra: number
  grupos_sospechosos: number
  nros_involucrados: string
  meses_tocados: string
}

type HuerfanoRow = {
  nro_comprobante: number
  importe_total: number
  fecha_linea: string
  mes_archivo: string
  archivo: string
  motivos: string
  grupo_id: string
  apariciones_en_grupo: number
}

class UnionFind {
  private parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index])
    }
    return this.parent[index]
  }

  union(a: number, b: number) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) {
      this.parent[rootB] = rootA
    }
  }
}

function parseReportArgs(argv: string[]) {
  let txtDir = DEFAULT_TXT_DIR

  for (const arg of argv) {
    if (arg === '--') continue
    if (arg.startsWith('--txt-dir=')) {
      txtDir = arg.slice('--txt-dir='.length)
    }
  }

  return { txtDir: path.resolve(txtDir) }
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

function makeLineId(appearance: ArcaTxtAppearance): string {
  return `${appearance.mes_archivo}|${appearance.nro_comprobante}|${appearance.archivo}`
}

function filterIndexExcludingMonth(txtIndex: ArcaTxtIndex, excludedMonth: string): ArcaLine[] {
  const lines: ArcaLine[] = []

  for (const appearances of txtIndex.appearancesByNro.values()) {
    for (const appearance of appearances) {
      if (appearance.mes_archivo === excludedMonth) continue
      lines.push({
        ...appearance,
        line_id: makeLineId(appearance),
      })
    }
  }

  return lines.sort((a, b) => {
    const cmpNro = a.nro_comprobante - b.nro_comprobante
    if (cmpNro !== 0) return cmpNro
    const cmpMes = a.mes_archivo.localeCompare(b.mes_archivo)
    if (cmpMes !== 0) return cmpMes
    return a.fecha_linea.localeCompare(b.fecha_linea)
  })
}

function extractMedidorInfo(consumo: Consumo): MedidorInfo | null {
  const medidor = consumo.medidor
  if (!medidor || typeof medidor === 'string') return null

  const med = medidor as Medidore
  const usuario = med.usuario
  const user = usuario && typeof usuario !== 'string' ? (usuario as Usuario) : null
  const datos = user?.datos_personales

  return {
    medidor_id: med.id,
    numero_medidor: med.numero_medidor ?? '',
    direccion: med.direccion ?? '',
    nombre: datos?.nombre ?? '',
    apellido: datos?.apellido ?? '',
    cuit: String(datos?.cuit) || '',
    consumo_id: consumo.id,
    titulo: consumo.titulo ?? '',
  }
}

async function loadConsumosByNro(nros: number[]): Promise<Map<number, MedidorInfo>> {
  const payload = await getPayload({ config })
  const byNro = new Map<number, MedidorInfo>()
  const batchSize = 100

  for (let i = 0; i < nros.length; i += batchSize) {
    const batch = nros.slice(i, i + batchSize)
    const { docs } = await payload.find({
      collection: 'consumos',
      where: {
        nro_comprobante: {
          in: batch,
        },
      },
      depth: 2,
      limit: batch.length,
      pagination: false,
    })

    for (const doc of docs) {
      if (doc.nro_comprobante == null) continue
      const info = extractMedidorInfo(doc)
      if (!info) continue
      byNro.set(doc.nro_comprobante, info)
    }
  }

  return byNro
}

function importeKey(value: number): string {
  return roundPrecio(value).toFixed(2)
}

function buildSuspicionClusters(
  lines: ArcaLine[],
  medidorByNro: Map<number, MedidorInfo>,
): {
  clusters: Map<number, number[]>
  lineMotivos: Map<number, Set<SuspicionMotivo>>
} {
  const uf = new UnionFind(lines.length)
  const lineMotivos = new Map<number, Set<SuspicionMotivo>>()

  const addMotivo = (index: number, motivo: SuspicionMotivo) => {
    const set = lineMotivos.get(index) ?? new Set<SuspicionMotivo>()
    set.add(motivo)
    lineMotivos.set(index, set)
  }

  const byNro = new Map<number, number[]>()
  for (let i = 0; i < lines.length; i++) {
    const nro = lines[i].nro_comprobante
    const list = byNro.get(nro) ?? []
    list.push(i)
    byNro.set(nro, list)
  }

  for (const indices of byNro.values()) {
    if (indices.length < 2) continue
    for (const index of indices) addMotivo(index, 'nro_duplicado')
    for (let i = 1; i < indices.length; i++) {
      uf.union(indices[0], indices[i])
    }
  }

  const byMedidorImporteFecha = new Map<string, number[]>()
  for (let i = 0; i < lines.length; i++) {
    const medidor = medidorByNro.get(lines[i].nro_comprobante)
    if (!medidor) continue
    const key = `${medidor.medidor_id}|${importeKey(lines[i].importe_total)}|${lines[i].fecha_linea}`
    const list = byMedidorImporteFecha.get(key) ?? []
    list.push(i)
    byMedidorImporteFecha.set(key, list)
  }

  for (const indices of byMedidorImporteFecha.values()) {
    if (indices.length < 2) continue
    for (const index of indices) addMotivo(index, 'medidor_importe_fecha')
    for (let i = 1; i < indices.length; i++) {
      uf.union(indices[0], indices[i])
    }
  }

  const clusters = new Map<number, number[]>()
  for (let i = 0; i < lines.length; i++) {
    if (!lineMotivos.has(i)) continue
    const root = uf.find(i)
    const list = clusters.get(root) ?? []
    list.push(i)
    clusters.set(root, list)
  }

  return { clusters, lineMotivos }
}

function buildGrupoId(clusterIndices: number[], lines: ArcaLine[]): string {
  const nros = [...new Set(clusterIndices.map((i) => lines[i].nro_comprobante))].sort(
    (a, b) => a - b,
  )
  const meses = [...new Set(clusterIndices.map((i) => lines[i].mes_archivo))].sort()
  return `grp:${nros.join('-')}@${meses.join(';')}`
}

function buildOutputs(
  lines: ArcaLine[],
  medidorByNro: Map<number, MedidorInfo>,
  clusters: Map<number, number[]>,
  lineMotivos: Map<number, Set<SuspicionMotivo>>,
): {
  detalle: DetalleRow[]
  porMedidor: MedidorSummaryRow[]
  huerfanos: HuerfanoRow[]
} {
  const detalle: DetalleRow[] = []
  const huerfanos: HuerfanoRow[] = []
  const medidorAgg = new Map<
    string,
    {
      info: MedidorInfo
      lineIds: Set<string>
      repeticionesExtra: number
      grupos: Set<string>
      nros: Set<number>
      meses: Set<string>
    }
  >()

  for (const clusterIndices of clusters.values()) {
    if (clusterIndices.length < 2) continue

    const grupoId = buildGrupoId(clusterIndices, lines)
    const apariciones = clusterIndices.length
    const repeticionesExtra = apariciones - 1
    const medidoresInCluster = new Set<string>()

    for (const index of clusterIndices) {
      const line = lines[index]
      const motivos = [...(lineMotivos.get(index) ?? [])].sort().join(';')
      const medidor = medidorByNro.get(line.nro_comprobante)

      if (!medidor) {
        huerfanos.push({
          nro_comprobante: line.nro_comprobante,
          importe_total: line.importe_total,
          fecha_linea: line.fecha_linea,
          mes_archivo: line.mes_archivo,
          archivo: line.archivo,
          motivos,
          grupo_id: grupoId,
          apariciones_en_grupo: apariciones,
        })
        continue
      }

      medidoresInCluster.add(medidor.medidor_id)

      detalle.push({
        medidor_id: medidor.medidor_id,
        numero_medidor: medidor.numero_medidor,
        direccion: medidor.direccion,
        nombre: medidor.nombre,
        apellido: medidor.apellido,
        cuit: medidor.cuit,
        consumo_id: medidor.consumo_id,
        titulo: medidor.titulo,
        nro_comprobante: line.nro_comprobante,
        importe_total: line.importe_total,
        fecha_linea: line.fecha_linea,
        mes_archivo: line.mes_archivo,
        archivo: line.archivo,
        fuente: line.fuente,
        motivos,
        grupo_id: grupoId,
        apariciones_en_grupo: apariciones,
      })
    }

    if (medidoresInCluster.size === 1) {
      const medidorId = [...medidoresInCluster][0]
      const sample = medidorByNro.get(lines[clusterIndices[0]].nro_comprobante)!
      const agg = medidorAgg.get(medidorId) ?? {
        info: sample,
        lineIds: new Set<string>(),
        repeticionesExtra: 0,
        grupos: new Set<string>(),
        nros: new Set<number>(),
        meses: new Set<string>(),
      }

      agg.repeticionesExtra += repeticionesExtra
      agg.grupos.add(grupoId)

      for (const index of clusterIndices) {
        const line = lines[index]
        if (!medidorByNro.has(line.nro_comprobante)) continue
        agg.lineIds.add(line.line_id)
        agg.nros.add(line.nro_comprobante)
        agg.meses.add(line.mes_archivo)
      }

      medidorAgg.set(medidorId, agg)
    } else if (medidoresInCluster.size > 1) {
      for (const medidorId of medidoresInCluster) {
        const clusterLinesForMedidor = clusterIndices.filter((index) => {
          const medidor = medidorByNro.get(lines[index].nro_comprobante)
          return medidor?.medidor_id === medidorId
        })
        if (clusterLinesForMedidor.length < 2) continue

        const subGrupoId = `${grupoId}#${medidorId}`
        const subApariciones = clusterLinesForMedidor.length
        const sample = medidorByNro.get(lines[clusterLinesForMedidor[0]].nro_comprobante)!
        const agg = medidorAgg.get(medidorId) ?? {
          info: sample,
          lineIds: new Set<string>(),
          repeticionesExtra: 0,
          grupos: new Set<string>(),
          nros: new Set<number>(),
          meses: new Set<string>(),
        }

        agg.repeticionesExtra += subApariciones - 1
        agg.grupos.add(subGrupoId)

        for (const index of clusterLinesForMedidor) {
          const line = lines[index]
          agg.lineIds.add(line.line_id)
          agg.nros.add(line.nro_comprobante)
          agg.meses.add(line.mes_archivo)
        }

        medidorAgg.set(medidorId, agg)
      }
    }
  }

  detalle.sort((a, b) => {
    const cmpMedidor = a.medidor_id.localeCompare(b.medidor_id)
    if (cmpMedidor !== 0) return cmpMedidor
    const cmpFecha = a.fecha_linea.localeCompare(b.fecha_linea)
    if (cmpFecha !== 0) return cmpFecha
    return a.nro_comprobante - b.nro_comprobante
  })

  huerfanos.sort((a, b) => {
    const cmpNro = a.nro_comprobante - b.nro_comprobante
    if (cmpNro !== 0) return cmpNro
    return a.mes_archivo.localeCompare(b.mes_archivo)
  })

  const porMedidor: MedidorSummaryRow[] = [...medidorAgg.entries()]
    .map(([medidorId, agg]) => ({
      medidor_id: medidorId,
      numero_medidor: agg.info.numero_medidor,
      direccion: agg.info.direccion,
      nombre: agg.info.nombre,
      apellido: agg.info.apellido,
      cuit: agg.info.cuit,
      ventas_sospechosas: agg.lineIds.size,
      repeticiones_extra: agg.repeticionesExtra,
      grupos_sospechosos: agg.grupos.size,
      nros_involucrados: [...agg.nros].sort((a, b) => a - b).join(';'),
      meses_tocados: [...agg.meses].sort().join(';'),
    }))
    .sort((a, b) => b.repeticiones_extra - a.repeticiones_extra)

  return { detalle, porMedidor, huerfanos }
}

async function main() {
  const { txtDir } = parseReportArgs(process.argv.slice(2))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  console.log(`Cargando presentaciones ARCA desde ${txtDir}...`)
  const txtIndex = await loadArcaTxtDirectory(txtDir)
  const lines = filterIndexExcludingMonth(txtIndex, EXCLUDED_MONTH)

  const excludedCount = [...txtIndex.appearancesByNro.values()]
    .flat()
    .filter((a) => a.mes_archivo === EXCLUDED_MONTH).length

  const uniqueNros = [...new Set(lines.map((l) => l.nro_comprobante))]
  console.log(`Líneas ARCA (sin ${EXCLUDED_MONTH}): ${lines.length}`)
  console.log(`Líneas excluidas (${EXCLUDED_MONTH}): ${excludedCount}`)
  console.log(`Nros únicos: ${uniqueNros.length}`)

  console.log('Resolviendo medidores en prod...')
  const medidorByNro = await loadConsumosByNro(uniqueNros)
  console.log(`Nros resueltos a medidor: ${medidorByNro.size}/${uniqueNros.length}`)

  const { clusters, lineMotivos } = buildSuspicionClusters(lines, medidorByNro)
  const suspiciousClusters = [...clusters.values()].filter((c) => c.length >= 2)

  const ruleACount = [...lineMotivos.values()].filter((m) => m.has('nro_duplicado')).length
  const ruleBCount = [...lineMotivos.values()].filter((m) => m.has('medidor_importe_fecha')).length

  const { detalle, porMedidor, huerfanos } = buildOutputs(
    lines,
    medidorByNro,
    clusters,
    lineMotivos,
  )

  await mkdir(OUTPUT_DIR, { recursive: true })

  const paths = {
    porMedidor: path.join(OUTPUT_DIR, 'arca-repeticiones-por-medidor.csv'),
    detalle: path.join(OUTPUT_DIR, 'arca-repeticiones-detalle.csv'),
    huerfanos: path.join(OUTPUT_DIR, 'arca-repeticiones-huerfanos.csv'),
    maestro: path.join(OUTPUT_DIR, 'arca-repeticiones.json'),
  }

  await writeFile(
    paths.porMedidor,
    rowsToCsv(
      [
        'medidor_id',
        'numero_medidor',
        'direccion',
        'nombre',
        'apellido',
        'cuit',
        'ventas_sospechosas',
        'repeticiones_extra',
        'grupos_sospechosos',
        'nros_involucrados',
        'meses_tocados',
      ],
      porMedidor,
    ),
  )

  await writeFile(
    paths.detalle,
    rowsToCsv(
      [
        'medidor_id',
        'numero_medidor',
        'direccion',
        'nombre',
        'apellido',
        'cuit',
        'consumo_id',
        'titulo',
        'nro_comprobante',
        'importe_total',
        'fecha_linea',
        'mes_archivo',
        'archivo',
        'fuente',
        'motivos',
        'grupo_id',
        'apariciones_en_grupo',
      ],
      detalle,
    ),
  )

  await writeFile(
    paths.huerfanos,
    rowsToCsv(
      [
        'nro_comprobante',
        'importe_total',
        'fecha_linea',
        'mes_archivo',
        'archivo',
        'motivos',
        'grupo_id',
        'apariciones_en_grupo',
      ],
      huerfanos,
    ),
  )

  const maestro = {
    generated_at: new Date().toISOString(),
    txt_dir: txtDir,
    excluded_month: EXCLUDED_MONTH,
    meses_incluidos: [...new Set(lines.map((l) => l.mes_archivo))].sort(),
    totals: {
      lineas_arca: lines.length,
      lineas_excluidas_junio_2026: excludedCount,
      nros_unicos: uniqueNros.length,
      nros_resueltos: medidorByNro.size,
      clusters_sospechosos: suspiciousClusters.length,
      lineas_sospechosas: lineMotivos.size,
      lineas_regla_a: ruleACount,
      lineas_regla_b: ruleBCount,
      medidores_con_sospechas: porMedidor.length,
      lineas_detalle: detalle.length,
      lineas_huerfanas: huerfanos.length,
      repeticiones_extra_total: porMedidor.reduce((sum, row) => sum + row.repeticiones_extra, 0),
    },
    paths,
  }

  await writeFile(paths.maestro, JSON.stringify(maestro, null, 2))

  console.log('\nReporte de repeticiones ARCA generado:')
  console.log(`  Medidores con sospechas: ${porMedidor.length}`)
  console.log(`  Líneas detalle: ${detalle.length}`)
  console.log(`  Huérfanos: ${huerfanos.length}`)
  console.log(`  Clusters sospechosos: ${suspiciousClusters.length}`)
  console.log(`  Regla A (nro duplicado): ${ruleACount} líneas`)
  console.log(`  Regla B (medidor+importe+fecha): ${ruleBCount} líneas`)
  console.log(`\nArchivos:`)
  for (const [key, filePath] of Object.entries(paths)) {
    console.log(`  ${key}: ${filePath}`)
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
