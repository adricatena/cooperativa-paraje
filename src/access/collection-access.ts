import type { Access } from 'payload'

export const isDevCollectionAccess: Access = ({ req }) => Boolean(req.user?.desarrollador)

export const isSuperAdminOrMoreCollectionAccess: Access = ({ req }) =>
  req.user?.desarrollador || req.user?.rol === 'SUPERADMINISTRADOR'

export const isAdminOrMoreCollectionAccess: Access = ({ req }) =>
  req.user?.desarrollador ||
  req.user?.rol === 'SUPERADMINISTRADOR' ||
  req.user?.rol === 'ADMINISTRADOR'

export const isAdminOrMyMeterCollectionAccess: Access = async ({ req }) => {
  const roleIsEnough =
    req.user?.desarrollador ||
    req.user?.rol === 'SUPERADMINISTRADOR' ||
    req.user?.rol === 'ADMINISTRADOR'
  if (roleIsEnough) return true

  return {
    'medidor.usuario.email': {
      equals: req.user?.email,
    },
  }
}
