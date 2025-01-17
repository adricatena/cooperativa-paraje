'use client'
import type { Consumo, Medidore } from '@/payload-types'
import { COLUMNS, COLUMNS_FACTURACION } from '@/utils/consumos'
import { useAuth } from '@payloadcms/ui'
import { ExportarTabla } from '.'

export function ExportarTablaConsumos() {
  const { user } = useAuth()
  if (user?.rol === 'CLIENTE') return null

  function mapData(consumos: Consumo[]) {
    const mappedDocs = consumos.map((consumo) => {
      const mappedDoc: { [key: string]: any } = {}
      COLUMNS.forEach(({ key, label }) => {
        const data = consumo[key]
        if (key === 'medidor') {
          mappedDoc[label] = (data as Medidore)?.titulo
        } else if (key === 'fecha_lectura') {
          mappedDoc[label] = new Date(consumo.fecha_lectura).toLocaleDateString('es-AR')
        } else {
          mappedDoc[label] = data
        }
      })
      COLUMNS_FACTURACION.forEach(({ key, label }) => {
        const data = consumo?.datos_facturacion![key]
        if (key === 'fecha_pago') {
          mappedDoc[label] = consumo?.datos_facturacion?.fecha_pago
            ? new Date(consumo.datos_facturacion.fecha_pago).toLocaleDateString('es-AR')
            : ''
        } else {
          mappedDoc[label] = data
        }
      })
      return mappedDoc
    })

    return mappedDocs
  }

  return <ExportarTabla collection="consumos" mapData={mapData} />
}
