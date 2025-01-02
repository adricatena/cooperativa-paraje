import type { Consumo } from '@/payload-types'

type Columns = {
  key: keyof Omit<Consumo, 'datos_facturacion'>
  label: string
}
type ColumnsFacturacion = {
  key: keyof Required<Consumo>['datos_facturacion']
  label: string
}

export const COLUMNS: Columns[] = [
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

export const COLUMNS_FACTURACION: ColumnsFacturacion[] = [
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

export const COLUMNS_HEADERS_LABELS: string[] = []
COLUMNS.forEach((column) => COLUMNS_HEADERS_LABELS.push(column.label))
COLUMNS_FACTURACION.forEach((column) => COLUMNS_HEADERS_LABELS.push(column.label))
