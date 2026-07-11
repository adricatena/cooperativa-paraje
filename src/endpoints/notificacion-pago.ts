import { createHmac } from 'crypto'
import MercadoPagoConfig, { Payment } from 'mercadopago'
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes'
import type { Endpoint, PayloadRequest } from 'payload'

async function processPagoConsumo(args: {
  req: PayloadRequest
  metadata: any
  id_pago_mp: string
  payment: PaymentResponse
}) {
  const { req, metadata, id_pago_mp, payment } = args
  const { consumo_id, precio_final, meses_vencido } = metadata

  const consumo = await req.payload.findByID({
    collection: 'consumos',
    id: consumo_id,
  })

  if (
    consumo.estado === 'PAGADO' &&
    consumo.datos_facturacion?.id_pago_mp === String(id_pago_mp)
  ) {
    console.log(
      `[notificacion-pago] Reintento ignorado: consumo ${consumo_id} ya PAGADO con id_pago_mp ${id_pago_mp}`,
    )
    return
  }

  if (consumo.estado === 'PAGADO') {
    console.error(
      `[notificacion-pago] Consumo ${consumo_id} ya PAGADO con otro id_pago_mp (${consumo.datos_facturacion?.id_pago_mp} vs ${id_pago_mp})`,
    )
    return
  }

  const dateApproved = payment.date_approved
  if (!dateApproved) {
    console.error(`[notificacion-pago] Pago ${id_pago_mp} sin date_approved`)
    throw new Error('Pago sin date_approved')
  }

  const { ultimo_nro_comprobante_usado = 1 } = await req.payload.findGlobal({
    slug: 'variables',
  })

  await req.payload.update({
    collection: 'consumos',
    id: consumo_id,
    data: {
      estado: 'PAGADO',
      datos_facturacion: {
        id_pago_mp: String(id_pago_mp),
        precio_final,
        meses_vencido,
        fecha_pago: dateApproved,
      },
      precio_final,
      nro_comprobante: (ultimo_nro_comprobante_usado ?? 0) + 1,
    },
  })
  await req.payload.updateGlobal({
    slug: 'variables',
    data: {
      ultimo_nro_comprobante_usado: (ultimo_nro_comprobante_usado ?? 0) + 1,
    },
  })
}

async function processPagoExtraordinario(args: {
  req: PayloadRequest
  metadata: any
  id_pago_mp: string
}) {
  const { req, metadata, id_pago_mp } = args
  // obtener id de pago de metadata y marcar el pago como pagado
  const { gasto_id } = metadata
  await req.payload.update({
    collection: 'gastos_extraordinarios',
    id: gasto_id,
    data: {
      estado: 'PAGADO',
      id_pago_mp,
    },
  })
}

export const notificacionPagoEndpoint: Endpoint = {
  path: '/notificaciones/pagos',
  method: 'post',
  handler: async (req) => {
    console.log('Notificacion de pago!')
    try {
      const xRequestId = req.headers.get('x-request-id')
      if (!xRequestId || typeof xRequestId !== 'string') {
        console.error('No se encontro el ID de la solicitud')
        return new Response('No se encontro el ID de la solicitud', { status: 400 })
      }

      const xSignature = req.headers.get('x-signature')
      if (!xSignature || typeof xSignature !== 'string') {
        console.error('No se encontro la firma')
        return new Response('No se encontro la firma', { status: 400 })
      }
      const parts = xSignature.split(',')
      const ts = parts.find((part) => part.startsWith('ts='))?.split('=')[1]
      const hash = parts.find((part) => part.startsWith('v1='))?.split('=')[1]
      if (!ts || !hash) {
        console.error('No se encontro la firma')
        return new Response('No se encontro la firma', { status: 400 })
      }

      const dataID = req.query['data.id']
      if (!dataID || typeof dataID !== 'string') {
        console.error('No se encontro el ID')
        return new Response('No se encontro el ID', { status: 400 })
      }

      const secret = process.env.MP_WEBHOOK_SECRET ?? ''
      const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`
      const hmac = createHmac('sha256', secret)
      hmac.update(manifest)
      const sha = hmac.digest('hex')
      if (sha !== hash) {
        console.error('La firma no coincide')
        return new Response('La firma no coincide', { status: 401 })
      }

      if (!req.json) {
        console.error('Falta el body!')
        return new Response('Faltan datos', { status: 401 })
      }
      const data = await req.json()
      const id = data?.data?.id
      if (!id) {
        console.error('No se encontro el ID')
        return new Response('No se encontro el ID', { status: 400 })
      }

      const client = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN ?? '',
      })

      const payment = await new Payment(client).get({ id })

      if (payment.status !== 'approved') {
        console.error('El pago no esta aprobado')
        return new Response('El pago no esta aprobado', { status: 400 })
      }

      if (payment.metadata.tipo === 'CONSUMO') {
        await processPagoConsumo({
          req,
          metadata: payment.metadata,
          id_pago_mp: String(id),
          payment,
        })
      }

      if (payment.metadata.tipo === 'GASTO_EXTRA') {
        await processPagoExtraordinario({
          req,
          metadata: payment.metadata,
          id_pago_mp: id,
        })
      }

      return new Response('Notificacion recibida', { status: 200 })
    } catch (error) {
      console.error(error)
      return new Response('Algo salio mal', { status: 500 })
    }
  },
}
