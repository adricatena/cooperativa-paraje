import { isAdminOrMoreFieldAccess } from '@/hooks/field-access'
import type { Condition, Field, FieldAccess } from 'payload'

type FieldActivoArgs = {
  access?: {
    create?: FieldAccess
    read?: FieldAccess
    update?: FieldAccess
  }
  admin?: {
    condition?: Condition
    position?: 'sidebar'
  }
}
export const fieldActivo = ({ access, admin }: FieldActivoArgs): Field => {
  const baseField: Field = {
    type: 'checkbox',
    name: 'activo',
    label: 'Activo',
    defaultValue: true,
    access: {
      create: access?.create ?? isAdminOrMoreFieldAccess,
      read: access?.read ?? (() => true),
      update: access?.update ?? isAdminOrMoreFieldAccess,
    },
    admin: {},
  }

  if (admin?.condition) baseField.admin!.condition = admin.condition
  if (admin?.position) baseField.admin!.position = admin.position

  return baseField
}
