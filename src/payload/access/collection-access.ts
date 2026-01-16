import type { Usuario } from '@/payload-types'
import type { Access } from 'payload'

export const isDevCollectionAccess: Access = ({ req }) =>
  Boolean((req.user as Usuario)?.desarrollador)

export const isSuperAdminOrMoreCollectionAccess: Access = ({ req }) =>
  (req.user as Usuario)?.desarrollador || (req.user as Usuario)?.rol === 'SUPERADMINISTRADOR'

export const isAdminOrMoreCollectionAccess: Access = ({ req }) =>
  (req.user as Usuario)?.desarrollador ||
  (req.user as Usuario)?.rol === 'SUPERADMINISTRADOR' ||
  (req.user as Usuario)?.rol === 'ADMINISTRADOR'

/* export const isAdminOrMyMeterCollectionAccess: Access = async ({ req }) => {
  const roleIsEnough =
    (req.user as Usuario)?.desarrollador ||
    (req.user as Usuario)?.rol === 'SUPERADMINISTRADOR' ||
    (req.user as Usuario)?.rol === 'ADMINISTRADOR'
  if (roleIsEnough) return true

  return {
    'medidor.usuario.email': {
      equals: (req.user as Usuario)?.email,
    },
  }
} */
