import type { Usuario } from '@/payload-types'
import type { FieldAccess } from 'payload'

type T = FieldAccess<any, Usuario>

export const isDevFieldAccess: T = ({ req }) => Boolean(req.user?.desarrollador)

export const isSuperAdminOrMoreFieldAccess: T = ({ req }) =>
  req.user?.desarrollador || req.user?.rol === 'SUPERADMINISTRADOR'

export const isAdminOrMoreFieldAccess: T = ({ req }) =>
  req.user?.desarrollador ||
  req.user?.rol === 'SUPERADMINISTRADOR' ||
  req.user?.rol === 'ADMINISTRADOR'
