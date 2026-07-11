/**
 * Aplica correcciones de fecha_pago desde MercadoPago.
 * Equivalente a: pnpm audit:fecha-pago -- --apply
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const auditScript = path.join(__dirname, 'audit-fecha-pago-mp.ts')
const extraArgs = process.argv.slice(2).filter((a) => a !== '--apply')

const child = spawn(
  'pnpm',
  ['exec', 'tsx', auditScript, '--apply', ...extraArgs],
  { stdio: 'inherit', shell: true, cwd: path.join(__dirname, '..') },
)

child.on('exit', (code) => process.exit(code ?? 1))
