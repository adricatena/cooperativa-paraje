'use client'
import type { Consumo } from '@/payload-types'
import { GET } from '@/utils/queries'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Comprobante } from './comprobante'

export function TabPagar() {
  const { user } = useAuth()
  const path = usePathname()
  const id = useMemo(() => path.split('/').at(-1), [path])

  const [isLoading, setIsLoading] = useState(true)
  const consumo = useRef<Consumo>(null)

  const handleClickPagarConMP = useCallback(async () => {
    setIsLoading(true)
    const errorMessage = 'No se puede acceder a MercadoPago, por favor intente de nuevo mas tarde.'
    try {
      const res = await fetch(`/api/consumos/${id}/preferencia`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const result = await res.json()
        toast.error(result?.error || errorMessage)
        setIsLoading(false)
        return
      }
      const newUrl = await res.text()
      location.href = newUrl
    } catch (error) {
      console.error(error)
      toast.error(errorMessage)
      setIsLoading(false)
      return
    }
  }, [id])

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const consumosRes = await GET(`/api/consumos/${id}`)
        const consumosData: Consumo = await consumosRes.json()
        consumo.current = consumosData
        setIsLoading(false)
      } catch (error) {
        console.error(error)
        setIsLoading(false)
      }
    })()
  }, [id])

  if (isLoading) return <Button disabled>Cargando...</Button>

  if (consumo?.current?.estado === 'PAGADO') {
    return (
      <PDFDownloadLink
        document={<Comprobante consumo={consumo.current} />}
        fileName={`comprobante_pago_${consumo.current?.titulo}.pdf`}
      >
        <Button>Descargar comprobante</Button>
      </PDFDownloadLink>
    )
  }

  if (consumo?.current?.estado === 'ADEUDADO' && user?.rol === 'CLIENTE') {
    return <Button onClick={handleClickPagarConMP}>Pagar con MercadoPago</Button>
  }

  return <Button disabled>Pagar con MercadoPago</Button>
}
