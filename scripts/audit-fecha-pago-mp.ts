import config from '@payload-config'
import { Payment } from 'mercadopago'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  applyFixes,
  auditConsumo,
  createMpClient,
  fetchPaidMercadoPagoConsumos,
  loadAuditRowsFromJson,
  parseArgs,
  rowsToCsv,
  sleep,
  summarizeRows,
  type AuditRow,
} from './lib/fecha-pago-mp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')
const CANVAS_DIR =
  '/Users/adriano/.cursor/projects/Users-adriano-dev-paraje-cooperativa-paraje/canvases'
const MP_DELAY_MS = 150

async function writeCanvas(summary: ReturnType<typeof summarizeRows>, rows: AuditRow[]) {
  const monthEntries = Object.entries(summary.monto_por_mes_incorrecto)
  const mismatchByStatus = [
    { label: 'OK', value: summary.ok },
    { label: 'Día distinto', value: summary.mismatch },
    { label: 'Mes distinto', value: summary.mismatch_mes },
    { label: 'Error MP', value: summary.error_mp },
  ]

  const topMismatches = rows
    .filter((r) => r.status === 'mismatch' || r.status === 'mismatch_mes')
    .slice(0, 15)

  const canvas = `import {
  BarChart,
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  H2,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from 'cursor/canvas'

const summary = ${JSON.stringify(summary, null, 2)} as const

const mismatchByStatus = ${JSON.stringify(mismatchByStatus, null, 2)} as const

const monthChart = ${JSON.stringify(
    monthEntries.map(([month, amount]) => ({ month, amount })),
    null,
    2,
  )} as const

const topMismatches = ${JSON.stringify(
    topMismatches.map((r) => ({
      titulo: r.titulo ?? r.consumo_id,
      dia_db: r.dia_db,
      dia_mp: r.dia_mp,
      status: r.status,
      precio_final: r.precio_final ?? 0,
    })),
    null,
    2,
  )} as const

export default function AuditFechaPagoMpCanvas() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Auditoría fecha de pago vs MercadoPago</H1>
        <Text tone="secondary">
          Comparación de datos_facturacion.fecha_pago contra date_approved (timezone AR). Solo pagos
          MercadoPago, últimos 6 meses.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat label="Consumos auditados" value={String(summary.total)} />
        <Stat label="Correctos" value={String(summary.ok)} tone="success" />
        <Stat label="A corregir" value={String(summary.to_fix)} tone="warning" />
        <Stat label="Cambio de mes" value={String(summary.mismatch_mes)} tone="danger" />
      </Grid>

      <Row gap={16}>
        <Card style={{ flex: 1 }}>
          <CardHeader title="Resultado por categoría" />
          <CardBody>
            <BarChart
              data={mismatchByStatus}
              xKey="label"
              series={[{ key: 'value', label: 'Cantidad' }]}
              height={220}
            />
          </CardBody>
        </Card>

        <Card style={{ flex: 1 }}>
          <CardHeader title="Monto con mes incorrecto en DB" />
          <CardBody>
            <BarChart
              data={monthChart}
              xKey="month"
              series={[{ key: 'amount', label: 'Precio final ($)' }]}
              height={220}
            />
          </CardBody>
        </Card>
      </Row>

      <Card>
        <CardHeader title="Primeros mismatches detectados" />
        <CardBody padding={0}>
          <Table
            columns={[
              { key: 'titulo', label: 'Consumo' },
              { key: 'dia_db', label: 'Día DB' },
              { key: 'dia_mp', label: 'Día MP' },
              { key: 'status', label: 'Estado' },
              { key: 'precio_final', label: 'Precio final', align: 'right' },
            ]}
            rows={topMismatches}
          />
        </CardBody>
      </Card>
    </Stack>
  )
}
`

  await mkdir(CANVAS_DIR, { recursive: true })
  await writeFile(path.join(CANVAS_DIR, 'audit-fecha-pago-mp.canvas.tsx'), canvas, 'utf8')
}

async function printSummary(summary: ReturnType<typeof summarizeRows>) {
  console.log('\n--- Resumen ---')
  console.log(`Total:           ${summary.total}`)
  console.log(`OK:              ${summary.ok}`)
  console.log(`Mismatch día:    ${summary.mismatch}`)
  console.log(`Mismatch mes:    ${summary.mismatch_mes}`)
  console.log(`Errores MP:      ${summary.error_mp}`)
  console.log(`A corregir:      ${summary.to_fix}`)
  console.log('\nMonto por mes incorrecto en DB:')
  for (const [mes, monto] of Object.entries(summary.monto_por_mes_incorrecto)) {
    console.log(`  ${mes}: $${monto}`)
  }
}

async function applyRowsFromReport(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rows: AuditRow[],
  sourceLabel: string,
) {
  const summary = summarizeRows(rows)

  if (summary.to_fix === 0) {
    console.log('\nNada que corregir.')
    process.exit(0)
  }

  console.log(`\nAplicando ${summary.to_fix} correcciones desde ${sourceLabel}...`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const { applied, failed } = await applyFixes(payload, rows)
  const logPath = path.join(OUTPUT_DIR, `fix-fecha-pago-applied-${stamp}.json`)
  const result = { source: sourceLabel, applied, failed }
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(logPath, JSON.stringify(result, null, 2), 'utf8')
  console.log(`Correcciones aplicadas: ${applied.length}`)
  if (failed.length > 0) {
    console.log(`Fallidas: ${failed.length}`)
    for (const f of failed.slice(0, 5)) {
      console.log(`  ${f.consumo_id}: ${f.error}`)
    }
    if (failed.length > 5) {
      console.log(`  ... y ${failed.length - 5} más (ver log)`)
    }
  }
  console.log(`Log: ${logPath}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

async function main() {
  const { months, apply, fromJson } = parseArgs(process.argv.slice(2))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  if (fromJson) {
    const jsonPath = path.resolve(fromJson)
    console.log(`Aplicar correcciones desde JSON: ${jsonPath}`)
    console.log(apply ? 'Modo: APPLY (escribe en DB)' : 'Modo: dry-run (solo reporte)')

    const report = await loadAuditRowsFromJson(jsonPath)
    const rows = report.rows
    const summary = report.summary ?? summarizeRows(rows)
    await printSummary(summary)

    if (!apply) {
      console.log('\nPara aplicar correcciones:')
      console.log(`  pnpm fix:fecha-pago -- --from-json=${fromJson}`)
      process.exit(0)
    }

    const payload = await getPayload({ config })
    await applyRowsFromReport(payload, rows, jsonPath)
    return
  }

  console.log(`Auditoría fecha_pago vs MercadoPago (últimos ${months} meses)`)
  console.log(apply ? 'Modo: APPLY (escribe en DB)' : 'Modo: dry-run (solo reporte)')

  const payload = await getPayload({ config })
  const mpClient = createMpClient()
  const paymentClient = new Payment(mpClient)

  const consumos = await fetchPaidMercadoPagoConsumos(payload, months)
  console.log(`Consumos MercadoPago a auditar: ${consumos.length}`)

  const rows: AuditRow[] = []
  for (let i = 0; i < consumos.length; i++) {
    const row = await auditConsumo(consumos[i], paymentClient)
    rows.push(row)
    if ((i + 1) % 25 === 0) {
      console.log(`  Progreso: ${i + 1}/${consumos.length}`)
    }
    if (i < consumos.length - 1) {
      await sleep(MP_DELAY_MS)
    }
  }

  const summary = summarizeRows(rows)

  await mkdir(OUTPUT_DIR, { recursive: true })
  const jsonPath = path.join(OUTPUT_DIR, `audit-fecha-pago-${stamp}.json`)
  const csvPath = path.join(OUTPUT_DIR, `audit-fecha-pago-${stamp}.csv`)

  await writeFile(
    jsonPath,
    JSON.stringify({ generated_at: new Date().toISOString(), months, summary, rows }, null, 2),
    'utf8',
  )
  await writeFile(csvPath, rowsToCsv(rows), 'utf8')
  await writeCanvas(summary, rows)

  await printSummary(summary)
  console.log(`\nJSON: ${jsonPath}`)
  console.log(`CSV:  ${csvPath}`)
  console.log(`Canvas: ${path.join(CANVAS_DIR, 'audit-fecha-pago-mp.canvas.tsx')}`)

  if (apply) {
    await applyRowsFromReport(payload, rows, jsonPath)
  } else if (summary.to_fix > 0) {
    console.log('\nPara aplicar correcciones:')
    console.log('  pnpm fix:fecha-pago -- --months=6')
    console.log(`  pnpm fix:fecha-pago -- --from-json=${jsonPath}`)
  }

  process.exit(0)
}

await main()
