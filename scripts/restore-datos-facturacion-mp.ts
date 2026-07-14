import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import {
  applyRestoreRows,
  buildRestoreRowsForIds,
  countIncompletePagadoMp,
  loadAuditIndex,
  parseRestoreArgs,
  restoreRowsToCsv,
  summarizeRestoreRows,
  type RestoreRow,
} from './lib/restore-datos-facturacion-mp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')

function printSummary(summary: ReturnType<typeof summarizeRestoreRows>) {
  console.log('\n--- Resumen restore ---')
  console.log(`Total:                 ${summary.total}`)
  console.log(`Needs restore:         ${summary.needs_restore}`)
  console.log(`Already complete:      ${summary.skip_already_complete}`)
  console.log(`Metadata mismatch:     ${summary.skip_metadata_mismatch}`)
  console.log(`Errores MP:            ${summary.error_mp}`)
  console.log(`Errores DB:            ${summary.error_db}`)
}

async function writeOutputs(stamp: string, rows: RestoreRow[], extra?: Record<string, unknown>) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const summary = summarizeRestoreRows(rows)
  const jsonPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-${stamp}.json`)
  const csvPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-${stamp}.csv`)

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        summary,
        ...extra,
        rows,
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(csvPath, restoreRowsToCsv(rows), 'utf8')
  return { jsonPath, csvPath, summary }
}

async function main() {
  const args = parseRestoreArgs(process.argv.slice(2))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPathResolved = path.resolve(args.fromJson)

  console.log('Restaurar datos_facturacion desde audit JSON + MercadoPago')
  console.log(args.apply ? 'Modo: APPLY (escribe en DB)' : 'Modo: dry-run (solo reporte)')
  console.log(`Audit JSON: ${jsonPathResolved}`)

  const payload = await getPayload({ config })

  console.log('\nContando PAGADO no-manual con datos_facturacion incompleto...')
  const count = await countIncompletePagadoMp(payload)
  console.log(`  Total PAGADO no-manual: ${count.total_pagado_no_manual}`)
  console.log(`  Incompletos (sin id_pago_mp o precio_final grupo): ${count.incomplete}`)

  if (args.countOnly) {
    const samplePath = path.join(OUTPUT_DIR, `incomplete-pagado-mp-${stamp}.json`)
    await mkdir(OUTPUT_DIR, { recursive: true })
    await writeFile(
      samplePath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          ...count,
        },
        null,
        2,
      ),
      'utf8',
    )
    console.log(`\nIDs incompletos: ${samplePath}`)
    process.exit(0)
  }

  let ids: string[]
  if (args.allIncomplete) {
    ids = count.incomplete_ids
    console.log(`\nModo --all-incomplete: ${ids.length} consumos`)
  } else if (args.ids) {
    ids = args.ids
    console.log(`\nIDs a procesar: ${ids.length}`)
  } else {
    ids = count.incomplete_ids
    console.log(`\nSin --ids: usando todos los incompletos (${ids.length})`)
  }

  if (ids.length === 0) {
    console.log('\nNada que procesar.')
    process.exit(0)
  }

  const auditIndex = await loadAuditIndex(jsonPathResolved)
  const missingAudit = ids.filter((id) => !auditIndex.has(id))
  if (missingAudit.length > 0) {
    console.log(
      `\nAdvertencia: ${missingAudit.length} IDs no están en el audit JSON (se intentará igual si hay id_pago_mp en DB):`,
    )
    for (const id of missingAudit.slice(0, 10)) {
      console.log(`  ${id}`)
    }
  }

  console.log('\nConsultando DB + MercadoPago...')
  const rows = await buildRestoreRowsForIds({ payload, ids, auditIndex })
  const { jsonPath, csvPath, summary } = await writeOutputs(stamp, rows, {
    incomplete_count: count.incomplete,
    total_pagado_no_manual: count.total_pagado_no_manual,
  })

  printSummary(summary)
  console.log(`\nJSON: ${jsonPath}`)
  console.log(`CSV:  ${csvPath}`)

  for (const row of rows.filter((r) => r.status === 'needs_restore').slice(0, 10)) {
    console.log(
      `  ${row.consumo_id}: keys=[${row.datos_facturacion_keys}] → id_pago_mp=${row.id_pago_mp_restore} precio=${row.precio_final_restore} fecha=${row.fecha_pago_restore}`,
    )
  }

  if (!args.apply) {
    if (summary.needs_restore > 0) {
      console.log('\nPara aplicar:')
      if (args.allIncomplete) {
        console.log(`  pnpm fix:datos-facturacion -- --all-incomplete --from-json=${args.fromJson}`)
      } else {
        console.log(
          `  pnpm fix:datos-facturacion -- --ids=${ids.join(',')} --from-json=${args.fromJson}`,
        )
      }
    }
    process.exit(0)
  }

  console.log(`\nAplicando ${summary.needs_restore} restores...`)
  const result = await applyRestoreRows(payload, rows)
  const applyLogPath = path.join(OUTPUT_DIR, `restore-datos-facturacion-applied-${stamp}.json`)
  await writeFile(applyLogPath, JSON.stringify(result, null, 2), 'utf8')
  console.log(`Aplicados: ${result.applied.length}`)
  console.log(`Omitidos:  ${result.skipped.length}`)
  console.log(`Fallidos:  ${result.failed.length}`)
  console.log(`Log: ${applyLogPath}`)

  if (result.applied.length > 0) {
    console.log('\nVerificando docs restaurados...')
    for (const id of result.applied.slice(0, 20)) {
      const doc = await payload.findByID({ collection: 'consumos', id, depth: 0 })
      const df = doc.datos_facturacion
      console.log(
        `  ${id}: id_pago_mp=${df?.id_pago_mp} precio_final=${df?.precio_final} fecha_pago=${df?.fecha_pago} nro=${doc.nro_comprobante}`,
      )
    }
  }

  process.exit(result.failed.length > 0 ? 1 : 0)
}

await main()
