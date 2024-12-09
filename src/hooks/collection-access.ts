import type { Usuario } from '@/payload-types'
import type { Access } from 'payload'

type T = Access<Usuario>

export const isDevCollectionAccess: T = ({ req }) => Boolean(req.user?.desarrollador)

export const isSuperAdminOrMoreCollectionAccess: T = ({ req }) =>
  req.user?.desarrollador || req.user?.rol === 'SUPERADMINISTRADOR'

export const isAdminOrMoreCollectionAccess: T = ({ req }) =>
  req.user?.desarrollador ||
  req.user?.rol === 'SUPERADMINISTRADOR' ||
  req.user?.rol === 'ADMINISTRADOR'
