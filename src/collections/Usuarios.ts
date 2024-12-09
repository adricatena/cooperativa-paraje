import { fieldActivo } from '@/fields/activo'
import { fieldTitulo } from '@/fields/titulo'
import { isAdminOrMoreCollectionAccess, isDevCollectionAccess } from '@/hooks/collection-access'
import {
  isAdminOrMoreFieldAccess,
  isDevFieldAccess,
  isSuperAdminOrMoreFieldAccess,
} from '@/hooks/field-access'
import type { Usuario } from '@/payload-types'
import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionConfig,
  DateField,
  FieldAccess,
  NumberField,
  TextField,
  Validate,
} from 'payload'
import { date, number, text } from 'payload/shared'

// COLLECTION ACCESS
const isAdminOrMeCollectionAccess: Access<Usuario> = ({ req, id }) =>
  req.user?.desarrollador ||
  req.user?.rol === 'SUPERADMINISTRADOR' ||
  req.user?.rol === 'ADMINISTRADOR' ||
  req.user?.id === id

// COLLECTION HOOKS
const beforeChange: CollectionBeforeChangeHook<Usuario> = ({ data }) => ({
  ...data,
  titulo:
    data?.rol === 'CLIENTE'
      ? `${data?.datos_personales?.cuit} - ${data.datos_personales?.nombre} ${data.datos_personales?.apellido}`
      : data.email,
})

// FIELD ACCESS
const createRoleFieldAccess: FieldAccess<Usuario, Usuario> = ({ req, siblingData }) => {
  if (req.user?.desarrollador || req.user?.rol === 'SUPERADMINISTRADOR') {
    return true
  }

  // si es admin, solo puede crear usuarios con rol CLIENTE
  if (req.user?.rol === 'ADMINISTRADOR') {
    return siblingData?.rol === 'CLIENTE'
  }

  return false
}

// FIELD VALIDATION
const textValidation: Validate<any, any, any, TextField> = async (value, options) => {
  if (options?.data?.rol !== 'CLIENTE') return true
  return await text(value, options)
}
const numberValidation: Validate<any, any, any, NumberField> = async (value, options) => {
  if (options?.data?.rol !== 'CLIENTE') return true
  return await number(value, options)
}
const dateValidation: Validate<any, any, any, DateField> = async (value, options) => {
  if (options?.data?.rol !== 'CLIENTE') return true
  return await date(value, options)
}

export const Usuarios: CollectionConfig = {
  slug: 'usuarios',
  auth: true,
  admin: {
    useAsTitle: 'titulo',
    hideAPIURL: process.env.PAYLOAD_PUBLIC_ENV !== 'dev',
    defaultColumns: ['titulo', 'rol', 'email', 'confirmado', 'activo'],
  },
  labels: {
    singular: 'Usuario',
    plural: 'Usuarios',
  },
  access: {
    create: isAdminOrMoreCollectionAccess,
    read: isAdminOrMeCollectionAccess,
    update: isAdminOrMeCollectionAccess,
    delete: isDevCollectionAccess,
  },
  hooks: {
    beforeChange: [beforeChange],
  },
  fields: [
    // Email added by default
    // Add more fields as needed
    fieldTitulo({ defaultValue: 'Usuario' }),
    {
      type: 'select',
      name: 'rol',
      label: 'Rol',
      options: ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'CLIENTE'],
      saveToJWT: true,
      defaultValue: 'CLIENTE',
      required: true,
      access: {
        create: createRoleFieldAccess,
        read: () => true,
        update: isSuperAdminOrMoreFieldAccess,
      },
    },
    {
      type: 'group',
      name: 'datos_personales',
      label: 'Datos Personales',
      admin: {
        condition: (_, siblingData) => siblingData.rol === 'CLIENTE',
        disableListColumn: true,
        disableListFilter: true,
      },
      fields: [
        {
          name: 'nombre',
          label: 'Nombre',
          type: 'text',
          admin: {
            placeholder: 'Juan Martin',
            description: 'Nombre completo',
          },
          validate: textValidation,
        },
        {
          name: 'apellido',
          label: 'Apellido',
          type: 'text',
          admin: {
            placeholder: 'Perez',
            description: 'Apellido completo',
          },
          validate: textValidation,
        },
        {
          name: 'cuit',
          label: 'CUIT/CUIL',
          type: 'number',
          unique: true,
          min: 10000000000,
          max: 99999999999,
          admin: {
            placeholder: '12345678901',
            description: 'Sin guiones ni puntos',
          },
          hooks: {
            beforeValidate: [({ data, value }) => (data?.rol !== 'CLIENTE' ? Date.now() : value)],
          },
          validate: numberValidation,
          required: true,
        },
        {
          name: 'domicilio',
          label: 'Domicilio',
          type: 'text',
          admin: {
            placeholder: 'Av. Siempre Viva 123, Parana, Entre Rios.',
            description: 'Domicilio real del cliente',
          },
          validate: textValidation,
        },
        {
          name: 'telefono',
          label: 'Telefono',
          type: 'number',
          unique: true,
          min: 1000000000,
          max: 999999999999999,
          admin: {
            placeholder: '1122334455',
            description: 'Telefono/Celular del cliente',
          },
          hooks: {
            beforeValidate: [
              ({ data, value }) => (data?.rol !== 'CLIENTE' ? 1000000000 - Date.now() : value),
            ],
          },
          validate: numberValidation,
          required: true,
        },
        {
          name: 'nacimiento',
          label: 'Fecha de nacimiento',
          type: 'date',
          admin: {
            placeholder: '01/01/2000',
            description: 'Fecha de nacimiento del cliente',
          },
          validate: dateValidation,
        },
      ],
    },
    {
      name: 'confirmado',
      label: 'Confirmado',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: isAdminOrMoreFieldAccess,
        update: isSuperAdminOrMoreFieldAccess,
      },
      admin: {
        position: 'sidebar',
      },
    },
    fieldActivo({
      admin: {
        position: 'sidebar',
      },
    }),
    {
      type: 'checkbox',
      name: 'desarrollador',
      label: 'Desarrollador',
      defaultValue: false,
      access: {
        create: isDevFieldAccess,
        read: isDevFieldAccess,
        update: isDevFieldAccess,
      },
      saveToJWT: true,
      admin: {
        position: 'sidebar',
        disableListColumn: true,
        disableListFilter: true,
      },
    },
  ],
}
