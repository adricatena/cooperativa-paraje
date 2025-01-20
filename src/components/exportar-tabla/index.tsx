'use client'
import { downloadCSV } from '@/utils/csv'
import { GET } from '@/utils/queries'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { useSearchParams } from 'next/navigation'
import type { PaginatedDocs } from 'payload'
import { useCallback, useState } from 'react'

type Props = {
  collection: string
  mapData: (docs: any[]) => any[]
}
export function ExportarTabla({ collection, mapData }: Props) {
  const { user } = useAuth()
  const rawSearchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = useCallback(async () => {
    setIsLoading(true)
    try {
      const searchParams = new URLSearchParams(rawSearchParams.toString())
      searchParams.delete('limit')
      searchParams.set('pagination', 'false')

      const url = `/api/${collection}?${searchParams.toString()}`
      const r = await GET(url)
      const data: PaginatedDocs = await r.json()

      const mappedDocs = mapData(data.docs)
      downloadCSV(mappedDocs, `${collection}.csv`)
    } catch (error) {
      console.error('Error al descargar el CSV:', error)
      toast.error('Error al descargar el CSV')
    } finally {
      setIsLoading(false)
    }
  }, [collection, rawSearchParams, mapData])

  if (user?.rol === 'CLIENTE') return null

  return (
    <Button size="small" buttonStyle="secondary" disabled={isLoading} onClick={handleClick}>
      Exportar Tabla
    </Button>
  )
}
