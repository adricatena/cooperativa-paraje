import type { Usuario } from '@/payload-types'
import type { FieldAccess } from 'payload'

type T = FieldAccess<any, Usuario>

export const isDevFieldAccess: T = ({ req }) => Boolean((req.user as Usuario)?.desarrollador)

export const isSuperAdminOrMoreFieldAccess: T = ({ req }) =>
  (req.user as Usuario)?.desarrollador || (req.user as Usuario)?.rol === 'SUPERADMINISTRADOR'

export const isAdminOrMoreFieldAccess: T = ({ req }) =>
  (req.user as Usuario)?.desarrollador ||
  (req.user as Usuario)?.rol === 'SUPERADMINISTRADOR' ||
  (req.user as Usuario)?.rol === 'ADMINISTRADOR'
