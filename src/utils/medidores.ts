import type { Medidore } from '@/payload-types'
import type { ExportTableColumn } from './exportar-tabla'

export const MEDIDORES_COLUMNS: ExportTableColumn<Medidore>[] = [
  {
    key: 'usuario',
    label: 'Usuario',
  },
  {
    key: 'direccion',
    label: 'Direccion',
  },
  {
    key: 'numero_medidor',
    label: 'Numero de Medidor',
  },
  {
    key: 'activo',
    label: 'Activo',
  },
  {
    key: 'lectura_inicial',
    label: 'Lectura Inicial',
  },
  {
    key: 'titulo',
    label: 'Titulo',
  },
]
