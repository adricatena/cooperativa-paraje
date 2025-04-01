import {
  isAdminOrMoreCollectionAccess,
  isAdminOrMyMeterCollectionAccess,
  isSuperAdminOrMoreCollectionAccess,
} from '@/access/collection-access'
import {
  isAdminOrMoreFieldAccess,
  isDevFieldAccess,
  isSuperAdminOrMoreFieldAccess,
} from '@/access/field-access'
import { fieldTitulo } from '@/fields/titulo'
import type { Consumo, Usuario } from '@/payload-types'
import { round } from '@/utils/math'
import dayjs from 'dayjs'
import MercadoPagoConfig, { Preference } from 'mercadopago'
import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeReadHook,
  type CollectionConfig,
  type Endpoint,
  type FieldAccess,
} from 'payload'

const fieldAccessUpdateManual: FieldAccess<Consumo, Consumo> = async ({ req, data }) => {
  const canEdit = req.user?.desarrollador || req.user?.rol === 'SUPERADMINISTRADOR'
  if (!canEdit) return false

  if (data?.estado === 'PAGADO') {
    return false
  }

  let medidor = data?.medidor
  if (typeof medidor === 'string') {
    medidor = await req.payload.findByID({
      collection: 'medidores',
      id: medidor,
      depth: 3,
    })
  }

  return (medidor?.usuario as Usuario)?.pago_manual ?? false
}

const PERIODO_FORMAT = 'YYYY/MM'

// #region COLLECTION HOOKS
const beforeChange: CollectionBeforeChangeHook<Consumo> = async ({ data, req, operation }) => {
  if (operation === 'create') {
    let { medidor } = data
    if (typeof medidor === 'string') {
      medidor = await req.payload.findByID({
        collection: 'medidores',
        id: medidor,
      })
    }

    if (medidor!.lectura_inicial > data.lectura!) {
      throw new APIError('La lectura debe ser mayor o igual a la lectura inicial.', 401, null, true)
    }

    const fechaLectura = dayjs(data.fecha_lectura)
    const dayjsPeriodo = dayjs(data.periodo)
    if (fechaLectura.isBefore(dayjsPeriodo.add(1, 'month'))) {
      throw new APIError(
        'El periodo seleccionado debe ser previo a la fecha de lectura.',
        401,
        null,
        true,
      )
    }

    let consumo_real = data.lectura! - medidor!.lectura_inicial

    const periodo_normalizado = dayjsPeriodo.format(PERIODO_FORMAT)

    // chequear si el medidor tiene algun gasto extraordinario adeudado
    const { totalDocs } = await req.payload.find({
      collection: 'gastos_extraordinarios',
      where: {
        and: [
          {
            medidor: {
              equals: medidor!.id,
            },
          },
          {
            estado: {
              equals: 'ADEUDADO',
            },
          },
        ],
      },
      pagination: false,
    })
    if (totalDocs > 1) {
      throw new APIError(
        'Tiene gastos extraordinarios adeudados, por favor cancele primero cualquier deuda previa.',
        401,
        null,
        true,
      )
    }

    const consumosRegistrados = await req.payload.find({
      collection: 'consumos',
      where: {
        medidor: {
          equals: medidor!.id,
        },
      },
      pagination: false,
      sort: '-periodo_normalizado',
    })

    if (consumosRegistrados.totalDocs) {
      const periodoRegistrado = consumosRegistrados.docs.find(
        (consumo) => consumo.periodo_normalizado === periodo_normalizado,
      )
      if (periodoRegistrado) {
        throw new APIError('Ya existe un consumo para ese periodo', 401, null, true)
      }

      const periodoPrevioRegistrado = consumosRegistrados.docs.find((consumo) => {
        const periodoPrevioNormalizado = dayjsPeriodo.subtract(1, 'month').format(PERIODO_FORMAT)
        return consumo.periodo_normalizado === periodoPrevioNormalizado
      })
      if (!periodoPrevioRegistrado) {
        const ultimoPeriodo = consumosRegistrados.docs[0].periodo_normalizado
        throw new APIError(
          `No existe consumo del periodo previo, por favor registre primero el/los anterior/es. El ultimo periodo registrado es el ${ultimoPeriodo}`,
          401,
          null,
          true,
        )
      }
      if (periodoPrevioRegistrado.lectura > data.lectura!) {
        throw new APIError(
          'La lectura debe ser mayor o igual a la lectura del periodo previo.',
          401,
          null,
          true,
        )
      }

      consumo_real = data.lectura! - periodoPrevioRegistrado.lectura
    }

    const variables = await req.payload.findGlobal({
      slug: 'variables',
    })

    const precio_litro = round(variables.precio_base / variables.consumo_base)

    const consumo_excedente = consumo_real - variables.consumo_base
    const precio_regular =
      consumo_excedente > 0
        ? variables.precio_base + round(consumo_excedente * precio_litro)
        : variables.precio_base

    const precio_primer_vencimiento = round(
      precio_regular * (1 + variables.interes_primer_vencimiento / 100),
    )

    const precio_segundo_vencimiento = round(
      precio_primer_vencimiento * (1 + variables.interes_segundo_vencimiento / 100),
    )

    return {
      ...data,
      periodo_normalizado,
      titulo: `${periodo_normalizado} - ${medidor!.direccion}`,
      datos_facturacion: {
        precio_base: variables.precio_base,
        consumo_base: variables.consumo_base,
        precio_litro,
        consumo_real,
        precio_regular,
        dia_primer_vencimiento: variables.primer_vencimiento,
        precio_primer_vencimiento,
        dia_segundo_vencimiento: variables.segundo_vencimiento,
        precio_segundo_vencimiento,
      },
      consumo_real,
    }
  }
  if (operation === 'update' && data?.pago_manual) {
    const { ultimo_nro_comprobante_usado = 1 } = await req.payload.findGlobal({
      slug: 'variables',
    })

    data.datos_facturacion!.precio_final = data.pago_manual_data?.precio_final
    data.datos_facturacion!.fecha_pago = data.pago_manual_data?.fecha_pago
    data.datos_facturacion!.meses_vencido = data.pago_manual_data?.meses_vencido
    data.datos_facturacion!.id_pago_mp = data.id

    data.precio_final = data.pago_manual_data?.precio_final
    data.nro_comprobante = (ultimo_nro_comprobante_usado ?? 0) + 1
    data.estado = 'PAGADO'

    await req.payload.updateGlobal({
      slug: 'variables',
      data: {
        ultimo_nro_comprobante_usado: (ultimo_nro_comprobante_usado ?? 0) + 1,
      },
    })

    return data
  }
}
const afterChange: CollectionAfterChangeHook<Consumo> = async ({ doc, operation, req }) => {
  if (operation === 'create') {
    req.payload.jobs
      .queue({
        task: 'email-nuevo-consumo',
        input: { consumoId: doc.id },
        queue: 'enviar-mail',
      })
      .then((queue) => req.payload.jobs.runByID({ id: queue.id }))
  }
}
const beforeDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const consumo = await req.payload.findByID({ collection: 'consumos', id })
  if (consumo.estado === 'PAGADO') {
    throw new APIError('No se puede eliminar un consumo pagado', 401, null, true)
  }
}
const beforeRead: CollectionBeforeReadHook<Consumo> = async ({ doc, req }) => {
  if (doc.estado === 'PAGADO') {
    return { ...doc, precio_final: doc.datos_facturacion?.precio_final }
  }

  const variables = await req.payload.findGlobal({
    slug: 'variables',
  })

  // precio final al dia de la fecha
  const today = dayjs()
  const createdAt = dayjs(doc.createdAt)
  const primer_vencimiento = createdAt.date(variables.primer_vencimiento)
  const segundo_vencimiento = createdAt.date(variables.segundo_vencimiento)
  const mes_vencido = createdAt.add(1, 'month').date(1)

  let precio: number = 0
  let meses_vencido = 0
  if (today.isAfter(mes_vencido)) {
    // para saber el interes mensual, tengo que ver cuantos meses vencidos tiene
    meses_vencido = today.diff(mes_vencido, 'month') + 1 // sumamos 1 porque cuenta el mes actual
    precio = doc.datos_facturacion?.precio_segundo_vencimiento ?? 0
    for (let i = 0; i < meses_vencido; i++) {
      precio += round(precio * (variables.interes_mensual / 100))
    }
  } else if (today.isAfter(segundo_vencimiento)) {
    precio = doc.datos_facturacion?.precio_segundo_vencimiento ?? 0
  } else if (today.isAfter(primer_vencimiento)) {
    precio = doc.datos_facturacion?.precio_primer_vencimiento ?? 0
  } else {
    precio = doc.datos_facturacion?.precio_regular ?? 0
  }

  return { ...doc, precio_final: -1 * round(precio) }
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

    const consumo = await req.payload.findByID({
      collection: 'consumos',
      id,
    })
    if (!consumo) {
      return Response.json({ error: 'No se encontro el consumo' }, { status: 400 })
    }

    let { medidor } = consumo
    if (typeof medidor === 'string') {
      medidor = await req.payload.findByID({
        collection: 'medidores',
        id: medidor,
      })
    }

    const consumosAdeudados = await req.payload.find({
      collection: 'consumos',
      where: {
        and: [
          {
            medidor: {
              equals: medidor.id,
            },
          },
          {
            estado: {
              equals: 'ADEUDADO',
            },
          },
        ],
      },
      pagination: false,
      sort: 'periodo_normalizado',
    })
    if (consumosAdeudados.totalDocs > 1 && consumosAdeudados.docs[0].id !== id) {
      return Response.json(
        {
          error: 'Tiene una deuda pendiente, por favor cancele primero cualquier consumo previo.',
        },
        { status: 400 },
      )
    }

    try {
      const variables = await req.payload.findGlobal({ slug: 'variables' })

      const createdAt = dayjs(consumo.createdAt)
      const today = dayjs()
      const primer_vencimiento = createdAt.date(variables.primer_vencimiento)
      const segundo_vencimiento = createdAt.date(variables.segundo_vencimiento)
      const mes_vencido = createdAt.add(1, 'month').date(1)

      let precio: number = 0
      let meses_vencido = 0
      if (today.isAfter(mes_vencido)) {
        // para saber el interes mensual, tengo que ver cuantos meses vencidos tiene
        meses_vencido = today.diff(mes_vencido, 'month') + 1 // sumamos 1 porque cuenta el mes actual
        precio = consumo.datos_facturacion?.precio_segundo_vencimiento ?? 0
        for (let i = 0; i < meses_vencido; i++) {
          precio += round(precio * (variables.interes_mensual / 100))
        }
      } else if (today.isAfter(segundo_vencimiento)) {
        precio = consumo.datos_facturacion?.precio_segundo_vencimiento ?? 0
      } else if (today.isAfter(primer_vencimiento)) {
        precio = consumo.datos_facturacion?.precio_primer_vencimiento ?? 0
      } else {
        precio = consumo.datos_facturacion?.precio_regular ?? 0
      }

      const unit_price = round(precio)

      const client = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN ?? '',
      })
      const mpPreference = await new Preference(client).create({
        body: {
          items: [
            {
              id: `Consumo ${consumo.titulo}`,
              title: consumo.titulo,
              description: `Pago correspondiente al periodo ${consumo.periodo_normalizado} de la Cooperativa de Agua y Servicios Paraje La Virgen`,
              quantity: 1,
              unit_price,
              category_id: 'consumo',
            },
          ],
          metadata: {
            consumo_id: consumo.id,
            precio_final: unit_price,
            meses_vencido,
            tipo: 'CONSUMO',
          },
          back_urls: {
            success: process.env.MP_SUCCESS_BACK_URL,
          },
          external_reference: consumo.id,
          payer: {
            name: req.user?.datos_personales?.nombre ?? 'Nombre Usuario',
            surname: req.user?.datos_personales?.apellido ?? 'Apellido Usuario',
            email: req.user?.email ?? 'usuario@cooperativa.com',
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

export const Consumos: CollectionConfig = {
  slug: 'consumos',
  labels: {
    singular: 'Consumo',
    plural: 'Consumos',
  },
  admin: {
    useAsTitle: 'titulo',
    hideAPIURL: process.env.NODE_ENV === 'production',
    defaultColumns: ['titulo', 'estado', 'periodo', 'medidor', 'lectura'],
    components: {
      beforeListTable: ['/components/before-list-table-consumos#BeforeListTableConsumos'],
      views: {
        edit: {
          default: {
            tab: {
              label: 'Informacion',
            },
          },
          pagar: {
            tab: {
              Component: '/components/tab-pagar#TabPagar',
            },
          },
        },
      },
    },
  },
  access: {
    create: isAdminOrMoreCollectionAccess,
    read: isAdminOrMyMeterCollectionAccess,
    update: isSuperAdminOrMoreCollectionAccess,
    delete: isSuperAdminOrMoreCollectionAccess,
  },
  hooks: {
    beforeChange: [beforeChange],
    afterChange: [afterChange],
    beforeDelete: [beforeDelete],
    beforeRead: [beforeRead],
  },
  endpoints: [crearReferenciaMP],
  fields: [
    /* {
      type: 'ui',
      name: 'comprobante',
      label: 'Comprobante',
      admin: {
        condition: (data) => data?.estado === 'PAGADO' && process.env.NODE_ENV === 'development',
        components: {
          Field: '/components/comprobante/viewer#ComprobanteViewer',
        },
      },
    }, */
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
      access: {
        update: isDevFieldAccess,
      },
    },
    {
      name: 'lectura',
      label: 'Lectura',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        placeholder: '123.45',
        description: 'Numero obtenido de la lectura',
      },
      access: {
        update: isDevFieldAccess,
      },
    },
    {
      name: 'fecha_lectura',
      label: 'Fecha de lectura',
      type: 'date',
      required: true,
      defaultValue: new Date().toISOString(),
      admin: {
        description: 'Fecha en que se realizo la lectura',
        date: {
          displayFormat: 'dd/MM/yyyy',
        },
      },
      access: {
        update: isDevFieldAccess,
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
        update: isDevFieldAccess,
      },
    },
    {
      name: 'periodo',
      label: 'Periodo',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'monthOnly',
          displayFormat: 'MM/yyyy',
        },
        description: 'Periodo (numero de mes) correspondiente a la lectura',
        placeholder: '01/2000',
      },
      access: {
        update: isDevFieldAccess,
      },
    },
    {
      type: 'textarea',
      name: 'observaciones',
      label: 'Observaciones',
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: isSuperAdminOrMoreFieldAccess,
        update: isSuperAdminOrMoreFieldAccess,
      },
      admin: {
        disableListColumn: true,
        disableListFilter: true,
      },
    },
    {
      type: 'checkbox',
      name: 'pago_manual',
      label: 'Pago manual',
      defaultValue: false,
      required: true,
      access: {
        create: () => false,
        read: () => true,
        update: fieldAccessUpdateManual,
      },
    },
    {
      type: 'group',
      name: 'pago_manual_data',
      label: 'Datos de pago manual',
      access: {
        create: () => false,
        read: isSuperAdminOrMoreFieldAccess,
        update: fieldAccessUpdateManual,
      },
      admin: {
        condition: (data, siblingData) => data?.pago_manual || siblingData?.pago_manual,
        disableListColumn: true,
        disableListFilter: true,
      },
      fields: [
        {
          type: 'number',
          name: 'precio_final',
          label: 'Precio final',
        },
        {
          type: 'date',
          name: 'fecha_pago',
          label: 'Fecha de pago',
        },
        {
          type: 'number',
          name: 'meses_vencido',
          label: 'Meses vencido',
          defaultValue: 0,
        },
      ],
    },
    {
      type: 'text',
      name: 'periodo_normalizado',
      admin: {
        disabled: true,
      },
    },
    {
      type: 'number',
      name: 'nro_comprobante',
      label: 'Numero de comprobante',
      unique: true,
      admin: {
        readOnly: true,
        condition: (data) => data?.estado === 'PAGADO',
        disableListColumn: true,
        disableListFilter: true,
      },
    },
    {
      type: 'group',
      name: 'datos_facturacion',
      label: 'Datos de facturacion',
      admin: {
        condition: (data) => Boolean(data?.id),
        disableListColumn: true,
        disableListFilter: true,
      },
      access: {
        create: isAdminOrMoreFieldAccess,
        read: () => true,
        update: isDevFieldAccess,
      },
      fields: [
        {
          type: 'number',
          name: 'precio_final',
          label: 'Precio final',
        },
        {
          type: 'number',
          name: 'precio_base',
          label: 'Precio base',
        },
        {
          type: 'number',
          name: 'consumo_base',
          label: 'Consumo base',
        },
        {
          type: 'number',
          name: 'precio_litro',
          label: 'Precio por litro',
        },
        {
          type: 'number',
          name: 'consumo_real',
          label: 'Consumo real',
        },
        {
          type: 'number',
          name: 'precio_regular',
          label: 'Precio regular',
        },
        {
          type: 'number',
          name: 'dia_primer_vencimiento',
          label: 'Dia primer vencimiento',
        },
        {
          type: 'number',
          name: 'precio_primer_vencimiento',
          label: 'Precio primer vencimiento',
        },
        {
          type: 'number',
          name: 'dia_segundo_vencimiento',
          label: 'Dia segundo vencimiento',
        },
        {
          type: 'number',
          name: 'precio_segundo_vencimiento',
          label: 'Precio segundo vencimiento',
        },
        {
          type: 'date',
          name: 'fecha_pago',
          label: 'Fecha de pago',
        },
        {
          type: 'text',
          name: 'id_pago_mp',
          admin: {
            disabled: true,
          },
        },
        {
          type: 'number',
          name: 'meses_vencido',
          defaultValue: 0,
          admin: {
            disabled: true,
          },
        },
      ],
    },
    {
      type: 'number',
      name: 'precio_final',
      label: 'Precio final',
      defaultValue: 0,
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: () => true,
        update: isSuperAdminOrMoreFieldAccess,
      },
      admin: {
        hidden: true,
      },
    },
    {
      type: 'number',
      name: 'consumo_real',
      label: 'Consumo real',
      defaultValue: 0,
      access: {
        create: isSuperAdminOrMoreFieldAccess,
        read: () => true,
        update: isSuperAdminOrMoreFieldAccess,
      },
      admin: {
        hidden: true,
      },
    },
    fieldTitulo({ defaultValue: 'Consumo' }),
  ],
}
