import type { Usuario } from '@/payload-types'
import type { ExportTableColumn } from './exportar-tabla'

export const USUARIOS_COLUMNS: ExportTableColumn<Usuario>[] = [
  { key: 'email', label: 'Email' },
  { key: 'activo', label: 'Activo' },
  { key: 'rol', label: 'Rol' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'titulo', label: 'Titulo' },
] as const

type DatosPersonales = Required<Usuario>['datos_personales']
export const USUARIOS_DATOSPERSONALES_COLUMNS: ExportTableColumn<DatosPersonales>[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellido', label: 'Apellido' },
  { key: 'cuit', label: 'CUIT' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'telefono', label: 'Telefono' },
  { key: 'nacimiento', label: 'Nacimiento' },
]
