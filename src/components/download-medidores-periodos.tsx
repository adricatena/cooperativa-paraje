'use client'
import type { Consumo, Medidore } from '@/payload-types'
import { downloadCSV } from '@/utils/csv'
import { Button } from '@payloadcms/ui'
import { useCallback, useState } from 'react'

type Props = {
  medidores: Medidore[]
  periodos: Set<string>
  resultado?: { [key: string]: Medidore[] }
}
export function DownloadMedidoresPeriodos({ medidores, periodos }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const handleClick = useCallback(() => {
    setIsLoading(true)
    const mappedDocs = medidores.map((medidor) => {
      const mappedDoc: { [key: string]: string } = { MEDIDOR: medidor.titulo }
      for (const periodo of periodos) {
        const consumoAlPeriodo = medidor.consumos?.docs?.find(
          (consumo) => (consumo as Consumo).periodo === periodo,
        )
        const periodoDate = new Date(periodo)
        mappedDoc[`${periodoDate.getMonth() + 1}/${periodoDate.getFullYear()}`] = consumoAlPeriodo
          ? String((consumoAlPeriodo as Consumo).lectura)
          : 'Sin consumo'
      }
      return mappedDoc
    })
    downloadCSV(mappedDocs, `consumos-por-periodos.csv`)
    setIsLoading(false)
  }, [])

  return (
    <Button size="small" disabled={isLoading} onClick={handleClick}>
      Descargar analisis por periodos
    </Button>
  )
}
