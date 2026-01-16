import { HIDE_API_URL } from '@/config'
import type { Cliente } from '@/payload-types'
import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { isAdminOrMoreFieldAccess, isSuperAdminOrMoreFieldAccess } from '../access/field-access'

const beforeChange: CollectionBeforeChangeHook<Cliente> = async ({ data }) => {
  if (data.cuit && data.nombre && data.apellido) {
    data.titulo = `${data.cuit} - ${data.nombre} ${data.apellido}`
  }
  return data
}

export const ClienteCollection: CollectionConfig = {
  slug: 'cliente',
  labels: {
    singular: 'Cliente',
    plural: 'Clientes',
  },
  admin: {
    useAsTitle: 'titulo',
    hideAPIURL: HIDE_API_URL,
  },
  hooks: {
    beforeChange: [beforeChange],
  },
  auth: true,
  trash: true,
  fields: [
    {
      name: 'nombre',
      label: 'Nombre',
      type: 'text',
      admin: {
        placeholder: 'Juan Martin',
        description: 'Nombre completo',
      },
    },
    {
      name: 'apellido',
      label: 'Apellido',
      type: 'text',
      admin: {
        placeholder: 'Perez',
        description: 'Apellido completo',
      },
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
    },
    // aside fields
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
    {
      type: 'checkbox',
      name: 'activo',
      label: 'Activo',
      defaultValue: true,
      access: {
        create: isAdminOrMoreFieldAccess,
        update: isAdminOrMoreFieldAccess,
      },
      admin: {
        position: 'sidebar',
      },
    },
    // hidden fields
    {
      type: 'text',
      name: 'titulo',
      label: 'Titulo',
      required: true,
      defaultValue: 'Cliente',
      admin: {
        hidden: true,
      },
    },
  ],
}
