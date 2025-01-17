'use client'
import type { Consumo, Medidore, Usuario } from '@/payload-types'
import { round } from '@/utils/math'
import { GET } from '@/utils/queries'
import { Button } from '@payloadcms/ui'
import type { PaginatedDocs, Where } from 'payload'
import { stringify } from 'qs-esm'
import { useCallback, useRef } from 'react'

const TIPO_DE_COMPROBANTE = '018' // LIQUIDACION DE SERVICIOS PUBLICOS CLASE B
const PUNTO_DE_VENTA = '00002'
const NRO_COMPROBANTE_LENGTH = 20
const COD_DOC_COMPRADOR = '96' // Código de documento del comprador
const IMPORTE_CONCEPTOS_NO_GRAVADOS = '000000000000000' // Importe total de conceptos que no integran el precio neto gravado
const PERCEPCION_A_NO_CATEGORIZADOS = '000000000000000' // Percepción a no categorizados
const IMPORTE_OPERACIONES_EXENTAS = '000000000000000' // Importe de operaciones exentas
const IMPORTE_PERCEPCIONES_IMPUESTOS = '000000000000000' // Importe de percepciones o pagos a cuenta de impuestos Nacionales
const IMPORTE_PERCEPCIONES_INGRESOS_BRUTOS = '000000000000000' // Importe de percepciones de Ingresos Brutos
const IMPORTE_PERCEPCIONES_MUNICIPALES = '000000000000000' // Importe de percepciones impuestos Municipales
const IMPORTE_IMPUESTOS_INTERNOS = '000000000000000' // Importe impuestos internos
const CODIGO_MONEDA = 'PES' // Código de moneda
const TIPO_CAMBIO = '0001000000' // Tipo de cambio
const CANTIDAD_ALICUOTAS_IVA = '1' // Cantidad de alícuotas de IVA
const CODIGO_OPERACION = '0' // Código de operación
const OTROS_TRIBUTOS = '000000000000000' // Otros tributos

const ALICUOTA_IVA = '0005' // Alícuota de IVA

type CreateTXTArgs = {
  consumos: Consumo[]
}
function createComprobantes({ consumos }: CreateTXTArgs) {
  const text = consumos
    .map((consumo) => {
      let renglon = ''
      const fechaPago = new Date(consumo.datos_facturacion?.fecha_pago ?? '')
      const fechaComprobante = `${fechaPago.getFullYear()}${fechaPago.getMonth() + 1}${fechaPago.getDate()}`
      renglon += fechaComprobante + TIPO_DE_COMPROBANTE + PUNTO_DE_VENTA

      const nroComprobante = (consumo.nro_comprobante ?? 0)
        .toString()
        .padStart(NRO_COMPROBANTE_LENGTH, '0')
      renglon += nroComprobante + nroComprobante + COD_DOC_COMPRADOR

      const usuario = (consumo.medidor as Medidore).usuario as Usuario

      const dni = (usuario.datos_personales?.cuit.toString() ?? '').slice(2, -1)
      const nroIdentificadorComprador = dni.padStart(20, '0')
      renglon += nroIdentificadorComprador

      let denominacion = `${usuario.datos_personales?.apellido?.toUpperCase()} ${usuario.datos_personales?.nombre?.toUpperCase()}`
      if (denominacion.length > 30) {
        denominacion = denominacion.slice(0, 30)
      }
      if (denominacion.length < 30) {
        denominacion = denominacion.padEnd(30, ' ')
      }
      renglon += denominacion

      const importeTotal = Math.trunc((consumo.precio_final ?? 0) * 100)
        .toString()
        .padStart(15, '0')
      renglon +=
        importeTotal +
        IMPORTE_CONCEPTOS_NO_GRAVADOS +
        PERCEPCION_A_NO_CATEGORIZADOS +
        IMPORTE_OPERACIONES_EXENTAS +
        IMPORTE_PERCEPCIONES_IMPUESTOS +
        IMPORTE_PERCEPCIONES_INGRESOS_BRUTOS +
        IMPORTE_PERCEPCIONES_MUNICIPALES +
        IMPORTE_IMPUESTOS_INTERNOS +
        CODIGO_MONEDA +
        TIPO_CAMBIO +
        CANTIDAD_ALICUOTAS_IVA +
        CODIGO_OPERACION +
        OTROS_TRIBUTOS +
        fechaComprobante

      return renglon
    })
    .join('\n')
  return text
}

function createAlicuotas({ consumos }: CreateTXTArgs) {
  const text = consumos
    .map((consumo) => {
      let renglon = TIPO_DE_COMPROBANTE + PUNTO_DE_VENTA

      const nroComprobante = (consumo.nro_comprobante ?? 0)
        .toString()
        .padStart(NRO_COMPROBANTE_LENGTH, '0')
      renglon += nroComprobante

      const importeNeto = Math.trunc(round((consumo.precio_final ?? 0) / 1.21) * 100)
      const importeNetoGravado = importeNeto.toString().padStart(15, '0')
      renglon += importeNetoGravado + ALICUOTA_IVA

      const impuesto = Math.trunc((consumo.precio_final ?? 0) * 100) - importeNeto
      const impuestoLiquidado = impuesto.toString().padStart(15, '0')
      renglon += impuestoLiquidado

      return renglon
    })
    .join('\n')
  return text
}

type Props = {
  periodos: { label: string; key: string }[]
}
export function ClientExportRegistros({ periodos }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const consumosRef = useRef<{ periodo: string; consumos: Consumo[] }>({
    periodo: '',
    consumos: [],
  })

  const getConsumosPorPeriodo = useCallback(async () => {
    const formData = new FormData(formRef.current!)
    const periodoElegido = formData.get('periodo') as string
    if (consumosRef.current.periodo === periodoElegido) return

    const periodoPosterior = new Date(periodoElegido)
    periodoPosterior.setMonth(periodoPosterior.getMonth() + 1)

    // obtener los consumos que tengan el periodo igual al seleccionado
    const where: Where = {
      and: [
        {
          estado: {
            equals: 'PAGADO',
          },
        },
        {
          'datos_facturacion.fecha_pago': {
            greater_than_equal: periodoElegido,
          },
        },
        {
          'datos_facturacion.fecha_pago': {
            less_than: periodoPosterior.toISOString(),
          },
        },
      ],
    }
    const query = stringify({ where, pagination: false, sort: '-datos_facturacion.fecha_pago' })
    const r = await GET(`/api/consumos?${query}`)
    const { docs: consumos }: PaginatedDocs<Consumo> = await r.json()

    consumosRef.current = { periodo: periodoElegido, consumos }
  }, [])

  const downloadFile = useCallback((args: { text: string; periodo: string; prefix: string }) => {
    const { text, periodo, prefix } = args
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const sufixName = periodos.find(({ key }) => key === periodo)?.label ?? ''
    link.download = `${prefix}_${sufixName}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [])

  const handleClickVentas = useCallback(async () => {
    await getConsumosPorPeriodo()

    const text = createComprobantes({ consumos: consumosRef.current.consumos })

    downloadFile({ text, periodo: consumosRef.current.periodo, prefix: 'VentasComprobantes' })
  }, [])

  const handleClickAlicuota = useCallback(async () => {
    await getConsumosPorPeriodo()

    const text = createAlicuotas({ consumos: consumosRef.current.consumos })

    downloadFile({ text, periodo: consumosRef.current.periodo, prefix: 'VentasAlicuotas' })
  }, [])

  return (
    <>
      <h3>Consumos - Registros</h3>
      <form ref={formRef}>
        <fieldset style={{ border: 0 }}>
          <legend>Seleccione el periodo que desea exportar</legend>
          {periodos.map(({ label, key }, i) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                marginBottom: 5,
              }}
            >
              <input type="radio" id={key} name="periodo" value={key} defaultChecked={i === 0} />
              {label}
            </label>
          ))}
        </fieldset>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 20 }}
        >
          <Button onClick={handleClickVentas}>Descargar Registro de Ventas</Button>
          <Button onClick={handleClickAlicuota}>Descargar Registro de Ventas Alicuotas</Button>
        </div>
      </form>
    </>
  )
}
