import Link from 'next/link'
import type { ServerProps } from 'payload'
import { ExportarTablaConsumos } from './exportar-tabla/exportar-tabla-consumos'

export function BeforeListTableConsumos({ user }: ServerProps) {
  if (!user || user?.rol === 'CLIENTE') return null

  return (
    <section
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 25 }}
    >
      <ExportarTablaConsumos />
      <Link href="/admin/consumos/exportar-registros">Ir a Exportar Registros</Link>
    </section>
  )
}
