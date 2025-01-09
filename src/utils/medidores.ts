import type { Medidore } from '@/payload-types'

type MedidoresColumns = {
  key: keyof Medidore
  label: string
}

export const MEDIDORES_COLUMNS: MedidoresColumns[] = [
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
