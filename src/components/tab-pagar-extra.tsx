'use client'
import type { GastosExtraordinario } from '@/payload-types'
import { GET } from '@/utils/queries'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export function TabPagarExtra() {
  const { user } = useAuth()
  const path = usePathname()
  const id = useMemo(() => path.split('/').at(-1), [path])

  const [isLoading, setIsLoading] = useState(true)
  const gastoExtraordinario = useRef<GastosExtraordinario>(null)

  const handleClickPagarConMP = useCallback(async () => {
    setIsLoading(true)
    const errorMessage = 'No se puede acceder a MercadoPago, por favor intente de nuevo mas tarde.'
    try {
      const res = await fetch(`/api/gastos_extraordinarios/${id}/preferencia`, {
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
        const r = await GET(`/api/gastos_extraordinarios/${id}`)
        const gasto: GastosExtraordinario = await r.json()
        gastoExtraordinario.current = gasto
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [id])

  if (isLoading) return <Button disabled>Cargando...</Button>

  if (gastoExtraordinario?.current?.estado === 'PAGADO') {
    return <Button disabled>Descargar comprobante</Button>
  }

  if (gastoExtraordinario?.current?.estado === 'ADEUDADO' && user?.rol === 'CLIENTE') {
    return <Button onClick={handleClickPagarConMP}>Pagar con MercadoPago</Button>
  }

  return <Button disabled>Pagar con MercadoPago</Button>
}
