import Link from 'next/link'
import type { ServerProps } from 'payload'
import { ExportarTablaConsumos } from './exportar-tabla/exportar-tabla-consumos'

export default function BeforeListTableConsumos({ user }: ServerProps) {
  if (user?.rol === 'CLIENTE') return null

  return (
    <section
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 20 }}
    >
      <Link href="/admin/consumos/exportar-registros">Ir a Exportar Registros</Link>
      <ExportarTablaConsumos />
    </section>
  )
}
