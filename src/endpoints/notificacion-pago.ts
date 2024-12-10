import { createHmac } from 'crypto'
import dayjs from 'dayjs'
import MercadoPagoConfig, { Payment } from 'mercadopago'
import type { PayloadHandler } from 'payload'

export const notificacionPagoHandler: PayloadHandler = async (req) => {
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

    const { consumo_id, precio_final, meses_vencido } = payment.metadata

    await req.payload.update({
      collection: 'consumos',
      id: consumo_id,
      data: {
        estado: 'PAGADO',
        datos_facturacion: {
          id_pago_mp: id,
          precio_final,
          meses_vencido,
          fecha_pago: dayjs().toISOString(),
        },
        precio_final,
      },
    })

    return new Response('Notificacion recibida', { status: 200 })
  } catch (error) {
    console.error(error)
    return new Response('Algo salio mal', { status: 500 })
  }
}
