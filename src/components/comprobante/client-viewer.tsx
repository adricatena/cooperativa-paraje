'use client'
import type { Consumo, Variable } from '@/payload-types'
import { PDFViewer } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import Comprobante from '.'

type Props = {
  consumo: Consumo
  variables: Variable
}
export function ComprobanteClientViewer({ consumo, variables }: Props) {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  if (!isLoaded) return null

  return (
    <PDFViewer style={{ width: '100%', height: '100%' }} showToolbar={false}>
      <Comprobante consumo={consumo} from="viewer" variables={variables} />
    </PDFViewer>
  )
}
