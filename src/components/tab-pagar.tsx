'use client'
import type { Consumo } from '@/payload-types'
import { GET } from '@/utils/queries'
import { Button, toast, useAuth } from '@payloadcms/ui'
import { Document, Page, PDFDownloadLink, Text, View } from '@react-pdf/renderer'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
        const r = await GET(`/api/consumos/${id}`)
        const data: Consumo = await r.json()
        consumo.current = data
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [id])

  if (isLoading) return <Button disabled>Cargando...</Button>

  if (consumo?.current?.estado === 'PAGADO') {
    const Comprobante = (
      <Document>
        <Page
          size="A5"
          style={{
            backgroundColor: '#FFFFFF',
            padding: 20,
            fontSize: 10,
          }}
        >
          <View
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 20,
              border: 'solid',
              borderWidth: 1,
              borderColor: 'mediumseagreen',
              color: 'mediumseagreen',
              borderRadius: 5,
              backgroundColor: 'honeydew',
            }}
          >
            <View style={{ textAlign: 'center', fontWeight: 'light' }}>
              <Text style={{ fontSize: 20 }}>
                COOPERATIVA DE AGUA Y SERVICIOS PUBLICOS PARAJE LA VIRGEN
              </Text>
              <Text style={{ fontWeight: 'bold' }}>
                Paraje La Virgen - Dpto. Diamante - C.P. 3101 - Entre Rios
              </Text>
              <Text>
                I.V.A. RESPONSABLE INSCRIPTO - C.U.I.T.: 30-70834541-1 - Ing. Brutos: Exento - INIC.
                DE ACTIVIDADES: 17/03/2003 Matricula N° 24404
              </Text>
            </View>
          </View>
          <View
            style={{
              margin: 10,
              padding: 5,
              border: 'solid',
              borderWidth: 1,
              borderColor: 'mediumseagreen',
              color: 'mediumseagreen',
              borderRadius: 5,
              backgroundColor: 'honeydew',
              fontWeight: 'bold',
            }}
          >
            <Text>LIQUIDACIÓN DE SERVICIOS PUBLICOS</Text>
          </View>
        </Page>
      </Document>
    )

    return (
      <PDFDownloadLink
        document={Comprobante}
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
