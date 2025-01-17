'use client'
import type { Medidore, Usuario } from '@/payload-types'
import { MEDIDORES_COLUMNS } from '@/utils/medidores'
import { useAuth } from '@payloadcms/ui'
import { ExportarTabla } from '.'

export function ExportarTablaMedidores() {
  const { user } = useAuth()
  if (user?.rol === 'CLIENTE') return null

  function mapData(medidores: Medidore[]) {
    const mappedDocs = medidores.map((medidor) => {
      const mappedDoc: any = {}
      MEDIDORES_COLUMNS.forEach(({ key, label }) => {
        const data = medidor[key]
        if (key === 'usuario') {
          mappedDoc[label] = (data as Usuario)?.titulo
        } else {
          mappedDoc[label] = data
        }
      })
      return mappedDoc
    })

    return mappedDocs
  }

  return <ExportarTabla collection="medidores" mapData={mapData} />
}
