import { isAdminOrMoreCollectionAccess, isDevCollectionAccess } from '@/access/collection-access'
import { fieldActivo } from '@/fields/activo'
import { fieldTitulo } from '@/fields/titulo'
import type { Medidore } from '@/payload-types'
import type { Access, CollectionBeforeChangeHook, CollectionConfig } from 'payload'

// #region COLLECTION ACCESS
const isAdminOrMyMeter: Access<Medidore> = async ({ req }) => {
  const roleIsEnough =
    req.user?.desarrollador ||
    req.user?.rol === 'SUPERADMINISTRADOR' ||
    req.user?.rol === 'ADMINISTRADOR'
  if (roleIsEnough) return true

  return {
    'usuario.email': {
      equals: req.user?.email,
    },
  }
}
// #endregion

// #region COLLECTION HOOKS
const beforeChange: CollectionBeforeChangeHook<Medidore> = async ({ data, req }) => {
  let { usuario } = data
  if (typeof usuario === 'string') {
    usuario = await req.payload.findByID({
      collection: 'usuarios',
      id: usuario,
    })
  }

  const tituloCliente = usuario?.datos_personales
    ? `${usuario.datos_personales.nombre} ${usuario.datos_personales.apellido}`
    : 'Sin cliente'

  return {
    ...data,
    titulo: `${data.numero_medidor} - ${tituloCliente} - ${data.direccion}`,
  }
}
// #endregion

export const Medidores: CollectionConfig = {
  slug: 'medidores',
  labels: {
    singular: 'Medidor',
    plural: 'Medidores',
  },
  admin: {
    useAsTitle: 'titulo',
    hideAPIURL: process.env.NODE_ENV === 'production',
    defaultColumns: [
      'titulo',
      'numero_medidor',
      'direccion',
      'lectura_inicial',
      'activo',
      'usuario',
    ],
    components: {
      beforeListTable: ['/components/before-list-table-medidores#BeforeListTableMedidores'],
    },
  },
  access: {
    create: isAdminOrMoreCollectionAccess,
    read: isAdminOrMyMeter,
    update: isAdminOrMoreCollectionAccess,
    delete: isDevCollectionAccess,
  },
  hooks: {
    beforeChange: [beforeChange],
  },
  fields: [
    fieldTitulo({ defaultValue: 'Medidor' }),
    {
      type: 'join',
      name: 'consumos',
      collection: 'consumos',
      on: 'medidor',
      label: 'Consumos',
      admin: {
        disableListColumn: true,
        disableListFilter: true,
      },
    },
    {
      name: 'direccion',
      label: 'Direccion',
      type: 'text',
      required: true,
      admin: {
        placeholder: 'Av. Siempre Viva 123',
        description: 'Direccion de instalacion del medidor',
      },
    },
    {
      name: 'lectura_inicial',
      label: 'Lectura inicial',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: {
        placeholder: '10',
        description: 'Lectura inicial del medidor',
      },
    },
    {
      name: 'numero_medidor',
      label: 'Numero de medidor',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Identificador del medidor',
      },
    },
    {
      type: 'relationship',
      name: 'usuario',
      label: 'Usuario',
      relationTo: 'usuarios',
      hasMany: false,
      filterOptions: {
        and: [
          {
            activo: { equals: true },
          },
          {
            rol: { equals: 'CLIENTE' },
          },
        ],
      },
    },
    { type: 'textarea', name: 'observaciones', label: 'Observaciones' },
    fieldActivo({}),
  ],
}
