import type { Consumo } from '@/payload-types'
import type { ServerProps } from 'payload'
import { DownloadMedidoresPeriodos } from './download-medidores-periodos'
import { ExportarTablaMedidores } from './exportar-tabla/exportar-tabla-medidores'

export async function BeforeListTableMedidores({ user, payload }: ServerProps) {
  if (!user || user.rol === 'CLIENTE') return null

  const { docs: medidores } = await payload.find({
    collection: 'medidores',
    where: {
      activo: {
        equals: true,
      },
    },
    pagination: false,
    depth: 3,
  })

  const periodos = new Set<string>()
  for (const medidor of medidores) {
    for (const consumo of medidor.consumos?.docs ?? []) {
      periodos.add((consumo as Consumo).periodo)
    }
  }

  return (
    <section
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 25 }}
    >
      <ExportarTablaMedidores />
      <DownloadMedidoresPeriodos medidores={medidores} periodos={periodos} />
    </section>
  )
}
