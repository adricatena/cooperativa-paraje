// ESTO PROBABLEMENTE SE PUEDA ELIMINAR

import type { Consumo } from '@/payload-types'
import { round } from '@/utils/math'
import config from '@payload-config'
import { Document, Page, renderToStream, Text, View } from '@react-pdf/renderer'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import * as qs from 'qs-esm'
import type { ReactNode } from 'react'

type Columns = {
  key: keyof Omit<Consumo, 'datos_facturacion'>
  label: string
}
type ColumnsFacturacion = {
  key: keyof Required<Consumo>['datos_facturacion']
  label: string
}

const COLUMNS: Columns[] = [
  {
    key: 'medidor',
    label: 'Medidor',
  },
  {
    key: 'periodo_normalizado',
    label: 'Periodo',
  },
  {
    key: 'lectura',
    label: 'Lectura',
  },
  {
    key: 'fecha_lectura',
    label: 'Fecha de Lectura',
  },
  {
    key: 'estado',
    label: 'Estado',
  },
  {
    key: 'consumo_real',
    label: 'Consumo Real',
  },
  {
    key: 'precio_final',
    label: 'Precio Final',
  },
]
const COLUMNS_FACTURACION: ColumnsFacturacion[] = [
  {
    key: 'consumo_base',
    label: 'Consumo Base',
  },
  {
    key: 'precio_base',
    label: 'Precio Base',
  },
  {
    key: 'precio_litro',
    label: 'Precio por litro',
  },
  {
    key: 'precio_regular',
    label: 'Precio Regular',
  },
  {
    key: 'dia_primer_vencimiento',
    label: '1er Venc',
  },
  {
    key: 'precio_primer_vencimiento',
    label: 'Precio 1er Venc',
  },
  {
    key: 'dia_segundo_vencimiento',
    label: '2do Venc',
  },
  {
    key: 'precio_segundo_vencimiento',
    label: 'Precio 2do Venc',
  },
  {
    key: 'fecha_pago',
    label: 'Fecha de pago',
  },
  {
    key: 'meses_vencido',
    label: 'Meses Vencido',
  },
]

async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '') || undefined
  // const page = parseInt(req.nextUrl.searchParams.get('page') ?? '') || undefined
  // const search = req.nextUrl.searchParams.get('search')

  const { limit, page, where } = qs.parse(req.nextUrl.searchParams.toString())
  console.log(req.nextUrl.searchParams.toString(), where)

  // console.log(req.nextUrl.searchParams, JSON.stringify(a))

  const { docs: consumos } = await payload.find({
    collection: 'consumos',
    limit: parseInt((limit as string) || '') || undefined,
    page: parseInt((page as string) || '') || undefined,
    where: where ? JSON.parse(where as string) : undefined,
  })

  const periodos = new Map<string, { cobrado: number; deuda: number }>()

  const getRow = (consumo: Consumo, i: number) => {
    const cells: { text: any; key: string }[] = []
    COLUMNS.forEach((column) => {
      cells.push({ text: consumo[column.key], key: column.key })
    })
    COLUMNS_FACTURACION.forEach((column) => {
      cells.push({
        text: consumo.datos_facturacion![column.key],
        key: column.key,
      })
    })

    const consumo_periodo = periodos.get(consumo.periodo_normalizado!)
    if (consumo_periodo) {
      if (consumo.estado === 'ADEUDADO') {
        periodos.set(consumo.periodo_normalizado!, {
          cobrado: consumo_periodo.cobrado,
          deuda: round(consumo_periodo.deuda - consumo.precio_final!),
        })
      } else {
        periodos.set(consumo.periodo_normalizado!, {
          cobrado: round(consumo_periodo.cobrado + consumo.precio_final!),
          deuda: consumo_periodo.deuda,
        })
      }
    } else {
      if (consumo.estado === 'ADEUDADO') {
        periodos.set(consumo.periodo_normalizado!, {
          cobrado: 0,
          deuda: consumo.precio_final!,
        })
      } else {
        periodos.set(consumo.periodo_normalizado!, {
          cobrado: consumo.precio_final!,
          deuda: 0,
        })
      }
    }

    return (
      <View
        key={consumo.id}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          border: '2px solid black',
          borderLeft: '2px solid black',
          borderRight: 0,
          borderTop: 0,
        }}
      >
        <Text
          style={{
            width: 100,
            height: '100%',
            textAlign: 'center',
            borderRight: '2px solid black',
          }}
        >
          {i}
        </Text>
        {cells.map((cell) => {
          let text = ''
          if (cell.key === 'medidor') {
            text = cell.text.titulo
          } else if (cell.key === 'fecha_lectura') {
            text = new Date(cell.text).toLocaleDateString()
          } else if (cell.key === 'fecha_pago') {
            text = cell.text ? new Date(cell.text).toLocaleDateString() : ''
          } else {
            text = cell.text
          }
          return (
            <Text
              key={consumo.id + cell.key}
              style={{
                width: 250,
                height: '100%',
                textAlign: 'center',
                borderRight: '2px solid black',
              }}
            >
              {text}
            </Text>
          )
        })}
      </View>
    )
  }

  const getPeriodo = () => {
    if (periodos.size === 0) return []

    const rows: ReactNode[] = []
    periodos.forEach((periodo, key) => {
      rows.push(
        <View key={key} style={{ paddingVertical: 15 }}>
          <Text style={{ fontWeight: 'bold' }}>Periodo {key}:</Text>
          <Text style={{ marginLeft: 10 }}>Cobrado: $ {periodo.cobrado}</Text>
          <Text style={{ marginLeft: 10 }}>Deuda: $ {periodo.deuda}</Text>
        </View>,
      )
    })
    return rows
  }

  const Tabla = (
    <Document>
      <Page
        size="A3"
        orientation="landscape"
        style={{
          backgroundColor: '#FFFFFF',
          padding: 20,
          fontSize: 10,
        }}
      >
        <View>
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              border: '2px solid black',
              borderLeft: '2px solid black',
              borderRight: 0,
            }}
          >
            <Text
              style={{
                width: 100,
                height: '100%',
                textAlign: 'center',
                borderRight: '2px solid black',
              }}
            >
              Nro
            </Text>
            {COLUMNS.map((column) => (
              <Text
                key={column.key}
                style={{
                  width: 250,
                  height: '100%',
                  textAlign: 'center',
                  borderRight: '2px solid black',
                }}
              >
                {column.label.toUpperCase()}
              </Text>
            ))}
            {COLUMNS_FACTURACION.map((column) => (
              <Text
                key={column.key}
                style={{
                  width: 250,
                  height: '100%',
                  textAlign: 'center',
                  borderRight: '2px solid black',
                }}
              >
                {column.label.toUpperCase()}
              </Text>
            ))}
          </View>
          {consumos.map((consumo, i) => getRow(consumo, i + 1))}
        </View>
        {getPeriodo().map((periodo) => periodo)}
      </Page>
    </Document>
  )

  const stream = await renderToStream(Tabla)

  return new NextResponse(stream as unknown as ReadableStream)
}
