import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  applyDumpRestoreRows,
  buildDumpRestoreRow,
  countMissingTariffs,
  dumpRestoreRowsToCsv,
  loadConsumosDump,
  parseDumpRestoreArgs,
  summarizeDumpRestoreRows,
  type DumpRestoreRow,
} from './lib/restore-datos-facturacion-dump.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')

function printSummary(summary: ReturnType<typeof summarizeDumpRestoreRows>) {
  console.log('\n--- Resumen restore desde dump ---')
  console.log(`Total:              ${summary.total}`)
  console.log(`Needs restore:      ${summary.needs_restore}`)
  console.log(`Already complete:   ${summary.skip_already_complete}`)
  console.log(`No en dump:         ${summary.skip_no_dump}`)
  console.log(`Dump incompleto:    ${summary.skip_dump_incomplete}`)
  console.log(`Errores DB:         ${summary.error_db}`)
}

async function main() {
  const args = parseDumpRestoreArgs(process.argv.slice(2))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.resolve(args.dumpPath)

  console.log('Restaurar datos_facturacion COMPLETO desde dump mongodump')
  console.log(args.apply ? 'Modo: APPLY (escribe en DB)' : 'Modo: dry-run (solo reporte)')
  console.log(`Dump BSON: ${dumpPath}`)
  console.log('Preserva fecha_pago actual (corregida); resto desde dump pre-wipe.')

  console.log('\nCargando dump...')
  const dumpMap = await loadConsumosDump(dumpPath)
  console.log(`  Consumos en dump: ${dumpMap.size}`)

  const payload = await getPayload({ config })

  console.log('\nContando PAGADO sin tarifas completas...')
  const count = await countMissingTariffs(payload)
  console.log(`  Total PAGADO: ${count.total_pagado}`)
  console.log(`  Sin tarifas completas: ${count.missing_tariffs}`)

  if (args.countOnly) {
    await mkdir(OUTPUT_DIR, { recursive: true })
    const out = path.join(OUTPUT_DIR, `missing-tariffs-${stamp}.json`)
    await writeFile(out, JSON.stringify({ generated_at: new Date().toISOString(), ...count }, null, 2))
    console.log(`\nIDs: ${out}`)
    process.exit(0)
  }

  const ids = args.ids ?? count.missing_ids
  console.log(`\nIDs a procesar: ${ids.length}`)

  if (ids.length === 0) {
    console.log('Nada que procesar.')
    process.exit(0)
  }

  const rows: DumpRestoreRow[] = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    rows.push(
      await buildDumpRestoreRow({
        payload,
        consumoId: id,
        dump: dumpMap.get(id),
      }),
    )
    if ((i + 1) % 250 === 0) {
      console.log(`  Progreso: ${i + 1}/${ids.length}`)
    }
  }

  const summary = summarizeDumpRestoreRows(rows)
  await mkdir(OUTPUT_DIR, { recursive: true })
  const jsonPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-dump-${stamp}.json`)
  const csvPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-dump-${stamp}.csv`)
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        dump: dumpPath,
        summary,
        missing_tariffs: count.missing_tariffs,
        rows: rows.map(({ merged, ...rest }) => rest),
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(csvPath, dumpRestoreRowsToCsv(rows), 'utf8')

  printSummary(summary)
  console.log(`\nJSON: ${jsonPath}`)
  console.log(`CSV:  ${csvPath}`)

  for (const row of rows.filter((r) => r.status === 'needs_restore').slice(0, 5)) {
    console.log(
      `  ${row.consumo_id}: db=[${row.keys_db}] → merged=[${row.keys_merged}] fecha_keep=${row.fecha_pago_keep}`,
    )
  }

  if (!args.apply) {
    if (summary.needs_restore > 0) {
      console.log('\nPara aplicar:')
      console.log(`  pnpm fix:datos-facturacion-dump -- --dump=${args.dumpPath}`)
    }
    process.exit(0)
  }

  console.log(`\nAplicando ${summary.needs_restore} restores desde dump...`)
  const result = await applyDumpRestoreRows(payload, rows)
  const logPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-dump-applied-${stamp}.json`)
  await writeFile(logPath, JSON.stringify(result, null, 2), 'utf8')
  console.log(`Aplicados: ${result.applied.length}`)
  console.log(`Omitidos:  ${result.skipped.length}`)
  console.log(`Fallidos:  ${result.failed.length}`)
  console.log(`Log: ${logPath}`)

  if (result.applied.length > 0) {
    console.log('\nVerificando muestra...')
    for (const id of result.applied.slice(0, 5)) {
      const doc = await payload.findByID({ collection: 'consumos', id, depth: 0 })
      const df = doc.datos_facturacion
      console.log(
        `  ${id}: base=${df?.precio_base} real=${df?.consumo_real} id_mp=${df?.id_pago_mp} fecha=${df?.fecha_pago} precio=${df?.precio_final}`,
      )
    }
  }

  if (result.failed.length > 0) {
    for (const f of result.failed.slice(0, 10)) {
      console.log(`  FAIL ${f.consumo_id}: ${f.error}`)
    }
  }

  process.exit(result.failed.length > 0 ? 1 : 0)
}

await main()
