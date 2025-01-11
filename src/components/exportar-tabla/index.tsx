'use client'
import { GET } from '@/utils/queries'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { useSearchParams } from 'next/navigation'
import type { PaginatedDocs } from 'payload'

// Función para convertir array de objetos a CSV
function convertToCSV(arr: any[]) {
  const array = [Object.keys(arr[0]), ...arr.map((item) => Object.values(item))]
  return array
    .map((row) =>
      row
        .map((value) => {
          // Convertir a string
          let strValue = String(value)

          if (typeof value === 'boolean') {
            strValue = value ? 'SI' : 'NO'
          }

          // Verificar si es un número con punto decimal
          if (typeof value === 'number' && strValue.includes('.')) {
            strValue = strValue.replace('.', ',')
          }

          // Si contiene comas, envolver en comillas
          if (strValue.includes(',')) {
            return `"${strValue}"`
          }

          return strValue
        })
        .join(';'),
    )
    .join('\n')
}

// Método 1: Usando Blob y createObjectURL
function downloadCSV(data: any[], filename: string) {
  // Crear el contenido del CSV
  const csvContent = convertToCSV(data)

  // Agregar BOM para soporte de caracteres especiales
  const BOM = '\uFEFF'

  // Crear Blob
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

  // Crear URL del blob
  const url = window.URL.createObjectURL(blob)

  // Crear link temporal
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename || 'download.csv')

  // Añadir al DOM (necesario para Firefox)
  document.body.appendChild(link)

  // Simular click y remover
  link.click()
  document.body.removeChild(link)

  // Liberar URL
  window.URL.revokeObjectURL(url)
}

type Props = {
  collection: string
  mapData: (docs: any[]) => any[]
}
export function ExportarTabla({ collection, mapData }: Props) {
  const { user } = useAuth()
  const rawSearchParams = useSearchParams()

  if (user?.rol === 'CLIENTE') return null

  async function handleClick() {
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
    }
  }

  return (
    <Button size="small" buttonStyle="secondary" onClick={handleClick}>
      Exportar Tabla
    </Button>
  )
}
