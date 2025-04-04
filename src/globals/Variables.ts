import { isSuperAdminOrMoreCollectionAccess } from '@/access/collection-access'
import { isDevFieldAccess } from '@/access/field-access'
import {
  CAMBIO_TITULAR_KEY,
  NUEVA_CONEXION_KEY,
  RECONEXION_KEY,
} from '@/data/gastos_extraordinarios'
import { APIError, type GlobalConfig } from 'payload'

export const Variables: GlobalConfig = {
  slug: 'variables',
  label: 'Variables',
  admin: {
    hideAPIURL: process.env.NODE_ENV === 'production',
    hidden: ({ user }) =>
      !(user?.desarrollador || user?.rol === 'SUPERADMINISTRADOR' || user?.rol === 'ADMINISTRADOR'),
  },
  access: {
    read: () => true,
    update: isSuperAdminOrMoreCollectionAccess,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data.primer_vencimiento >= data.segundo_vencimiento) {
          throw new APIError(
            'La fecha del primer vencimiento debe ser menor a la fecha del segundo vencimiento',
            401,
            null,
            true,
          )
        }

        return data
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'primer_vencimiento',
          label: 'Fecha de primer vencimiento',
          type: 'number',
          required: true,
          min: 1,
          max: 28,
          admin: {
            step: 1,
            placeholder: '10',
            description: 'Fecha de primer vencimiento del comprobante',
          },
        },
        {
          name: 'interes_primer_vencimiento',
          label: 'Interes del primer vencimiento',
          type: 'number',
          required: true,
          min: 1,
          admin: {
            placeholder: '5',
            description: 'Porcentaje de interes a aplicar en el primer vencimiento',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'segundo_vencimiento',
          label: 'Fecha de segundo vencimiento',
          type: 'number',
          required: true,
          min: 1,
          max: 28,
          admin: {
            step: 1,
            placeholder: '20',
            description: 'Fecha de segundo vencimiento del comprobante',
          },
        },
        {
          name: 'interes_segundo_vencimiento',
          label: 'Interes del segundo vencimiento',
          type: 'number',
          required: true,
          min: 1,
          admin: {
            placeholder: '10',
            description: 'Porcentaje de interes a aplicar en el segundo vencimiento',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'consumo_base',
          label: 'Consumo base',
          type: 'number',
          required: true,
          min: 1,
          admin: {
            placeholder: '10',
            description: 'Consumo en m3',
          },
        },
        {
          name: 'precio_base',
          label: 'Precio base',
          type: 'number',
          required: true,
          min: 1,
          admin: {
            placeholder: '1000',
            description: 'Precio en pesos argentinos para el consumo base.',
          },
        },
      ],
    },
    {
      type: 'number',
      name: 'interes_mensual',
      label: 'Interes mensual',
      admin: {
        placeholder: '5',
        description: 'Porcentaje de interes mensual a aplicar luego del ultimo vencimiento',
      },
      min: 1,
      required: true,
    },
    {
      type: 'number',
      name: NUEVA_CONEXION_KEY,
      label: 'Costo de Conexión',
      required: true,
      min: 0,
      defaultValue: 1,
      admin: {
        description: 'Ingrese el monto a cobrar para conexión como Gasto Extraordinario',
      },
    },
    {
      type: 'number',
      name: RECONEXION_KEY,
      label: 'Costo de Reconexión',
      required: true,
      min: 0,
      defaultValue: 1,
      admin: {
        description: 'Ingrese el monto a cobrar para reconexión como Gasto Extraordinario',
      },
    },
    {
      type: 'number',
      name: CAMBIO_TITULAR_KEY,
      label: 'Costo de Cambio de Titular',
      required: true,
      min: 0,
      defaultValue: 1,
      admin: {
        description: 'Ingrese el monto a cobrar para cambio de titular como Gasto Extraordinario',
      },
    },
    {
      type: 'number',
      name: 'nro_comprobante_inicial',
      label: 'Numero de Comprobante inicial',
      min: 1,
      defaultValue: 1,
      access: {
        create: isDevFieldAccess,
        read: isDevFieldAccess,
        update: isDevFieldAccess,
      },
    },
    {
      type: 'number',
      name: 'ultimo_nro_comprobante_usado',
      label: 'Ultimo Numero de Comprobante usado',
      min: 1,
      defaultValue: 1,
      access: {
        create: isDevFieldAccess,
        read: isDevFieldAccess,
        update: isDevFieldAccess,
      },
    },
  ],
}
