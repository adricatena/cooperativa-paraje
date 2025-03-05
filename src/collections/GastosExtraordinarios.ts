import {
  isAdminOrMoreCollectionAccess,
  isAdminOrMyMeterCollectionAccess,
  isDevCollectionAccess,
  isSuperAdminOrMoreCollectionAccess,
} from '@/access/collection-access'
import { isSuperAdminOrMoreFieldAccess } from '@/access/field-access'
import {
  CAMBIO_TITULAR_KEY,
  NUEVA_CONEXION_KEY,
  RECONEXION_KEY,
} from '@/data/gastos_extraordinarios'
import { fieldTitulo } from '@/fields/titulo'
import type { GastosExtraordinario } from '@/payload-types'
import { round } from '@/utils/math'
import MercadoPagoConfig, { Preference } from 'mercadopago'
import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Endpoint,
} from 'payload'

const TIPO_OPTIONS = [
  { value: NUEVA_CONEXION_KEY, label: 'Nueva conexión' },
  { value: RECONEXION_KEY, label: 'Reconexión' },
  { value: CAMBIO_TITULAR_KEY, label: 'Cambio de titular' },
  { value: 'Extensión de red', label: 'Extensión de red' },
  { value: 'Otros', label: 'Otros' },
]
export const getTipoGastoLabel = (value: string) =>
  TIPO_OPTIONS.find((tipo) => tipo.value === value)?.label ?? 'Gasto Extraordinario'

// #region COLLECTION HOOKS
const beforeChange: CollectionBeforeChangeHook<GastosExtraordinario> = async ({ data, req }) => {
  if (!data.tipo)
    throw new APIError('Debe seleccionar un tipo de gasto extraordinario', 401, null, true)

  let { medidor } = data
  if (typeof medidor === 'string') {
    medidor = await req.payload.findByID({
      collection: 'medidores',
      id: medidor,
    })
  }
  const prefix = getTipoGastoLabel(data.tipo)
  const titulo = `${prefix} - ${medidor?.direccion}`

  if (data.tipo === 'Otros' || data.tipo === 'Extensión de red') {
    if (!data.monto) {
      throw new APIError(
        'Debe ingresar un monto para este tipo de gasto extraordinario',
        401,
        null,
        true,
      )
    }
    return { ...data, titulo }
  } else {
    const variables = await req.payload.findGlobal({
      slug: 'variables',
    })
    const monto = variables[data.tipo]

    return { ...data, monto, titulo }
  }
}
const afterChange: CollectionAfterChangeHook<GastosExtraordinario> = async ({
  operation,
  req,
  doc,
}) => {
  if (operation === 'create') {
    req.payload.jobs
      .queue({
        task: 'email-nuevo-gasto-extra',
        input: { gastoId: doc.id },
        queue: 'enviar-mail-gasto-extra',
      })
      .then((queue) => req.payload.jobs.runByID({ id: queue.id }))
  }
}
// #endregion

// #region ENDPOINTS
const crearReferenciaMP: Endpoint = {
  path: '/:id/preferencia',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const id = req.routeParams?.id as string
    if (!id) {
      return Response.json({ error: 'No se encontro el ID' }, { status: 400 })
    }

    const gasto = await req.payload.findByID({
      collection: 'gastos_extraordinarios',
      id,
      depth: 3,
    })
    if (!gasto) {
      return Response.json({ error: 'No se encontro el gasto extraordinario' }, { status: 400 })
    }

    let { medidor } = gasto
    if (typeof medidor === 'string') {
      medidor = await req.payload.findByID({
        collection: 'medidores',
        id: medidor,
      })
    }

    let { usuario } = medidor
    if (typeof usuario === 'string') {
      usuario = await req.payload.findByID({
        collection: 'usuarios',
        id: usuario,
      })
    }

    try {
      const unit_price = round(gasto.monto ?? 0)
      const description = `Pago correspondiente al gasto extraordinario en concepto de ${getTipoGastoLabel(gasto.tipo)} de la Cooperativa de Agua y Servicios Paraje La Virgen`

      const client = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN ?? '',
      })
      const mpPreference = await new Preference(client).create({
        body: {
          items: [
            {
              id: gasto.titulo,
              title: gasto.titulo,
              description,
              quantity: 1,
              unit_price,
              category_id: 'gasto_extra',
            },
          ],
          metadata: {
            gasto_id: gasto.id,
            precio: unit_price,
            tipo: 'GASTO_EXTRA',
          },
          back_urls: {
            success: process.env.MP_SUCCESS_BACK_URL,
          },
          external_reference: gasto.id,
          payer: {
            name: usuario?.datos_personales?.nombre ?? 'Nombre Usuario',
            surname: usuario?.datos_personales?.apellido ?? 'Apellido Usuario',
            email: usuario?.email ?? 'usuario@cooperativa.com',
          },
        },
      })
      return new Response(mpPreference.init_point)
    } catch (e) {
      console.error(e)
      const error = e instanceof Error ? e.message : 'Ocurrio un error desconocido'
      return Response.json({ error }, { status: 500 })
    }
  },
}
// #endregion

export const GastosExtraordinarios: CollectionConfig = {
  slug: 'gastos_extraordinarios',
  labels: {
    singular: 'Gasto Extraordinario',
    plural: 'Gastos Extraordinarios',
  },
  admin: {
    useAsTitle: 'titulo',
    hideAPIURL: process.env.NODE_ENV === 'production',
    components: {
      views: {
        edit: {
          default: {
            tab: {
              label: 'Informacion',
            },
          },
          pagar: {
            tab: {
              Component: '/components/tab-pagar-extra#TabPagarExtra',
            },
          },
        },
      },
    },
  },
  access: {
    create: isAdminOrMoreCollectionAccess,
    read: isAdminOrMyMeterCollectionAccess,
    update: isDevCollectionAccess,
    delete: isSuperAdminOrMoreCollectionAccess,
  },
  hooks: {
    beforeChange: [beforeChange],
    afterChange: [afterChange],
  },
  endpoints: [crearReferenciaMP],
  fields: [
    {
      name: 'medidor',
      label: 'Medidor',
      type: 'relationship',
      relationTo: 'medidores',
      required: true,
      filterOptions: {
        and: [
          {
            usuario: { exists: true },
          },
          {
            activo: { equals: true },
          },
        ],
      },
    },
    {
      type: 'select',
      name: 'tipo',
      label: 'Tipo',
      required: true,
      options: TIPO_OPTIONS,
    },
    {
      type: 'number',
      name: 'monto',
      min: 0,
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: () => true,
        update: isSuperAdminOrMoreFieldAccess,
      },
      admin: {
        condition: (data, siblingData) => {
          if (Boolean(data.id)) return true
          return siblingData.tipo === 'Otros' || siblingData.tipo === 'Extensión de red'
        },
      },
    },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      options: ['ADEUDADO', 'PAGADO'],
      defaultValue: 'ADEUDADO',
      required: true,
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: () => true,
        update: isSuperAdminOrMoreFieldAccess,
      },
    },
    { type: 'textarea', name: 'observaciones', label: 'Observaciones' },
    fieldTitulo({ defaultValue: 'Gasto Extraordinario' }),
    {
      type: 'text',
      name: 'id_pago_mp',
      admin: {
        disabled: true,
      },
    },
  ],
}
