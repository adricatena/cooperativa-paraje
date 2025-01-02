'use client'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { useSearchParams } from 'next/navigation'

export function BeforeListTable() {
  const { user } = useAuth()
  const searchParams = useSearchParams()

  if (user?.rol === 'CLIENTE') return null

  async function handleClick() {
    try {
      const response = await fetch(`/api/consumos/exportar-tabla?${searchParams.toString()}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'consumos.csv'

      document.body.appendChild(a)
      a.click()

      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error al descargar el CSV:', error)
      toast.error('Error al descargar el CSV')
    }
  }

  return (
    <>
      <Button size="small" buttonStyle="secondary" onClick={handleClick}>
        Exportar Tabla
      </Button>
    </>
  )
}
