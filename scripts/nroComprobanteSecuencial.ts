import config from '@payload-config'
import { getPayload } from 'payload'

const seed = async () => {
  // Get a local copy of Payload by passing your config
  const payload = await getPayload({ config })

  const { docs: consumos } = await payload.find({
    collection: 'consumos',
    where: {
      estado: {
        equals: 'PAGADO',
      },
    },
    sort: 'datos_facturacion.fecha_pago',
    pagination: false,
  })
  const { nro_comprobante_inicial, ultimo_nro_comprobante_usado } = await payload.findGlobal({
    slug: 'variables',
  })
  if (!nro_comprobante_inicial || !ultimo_nro_comprobante_usado) {
    return
  }

  let nro_comprobante = nro_comprobante_inicial
  for (const consumo of consumos) {
    await payload.update({
      collection: 'consumos',
      id: consumo.id,
      data: {
        nro_comprobante,
      },
    })
    nro_comprobante++
  }
  await payload.updateGlobal({
    slug: 'variables',
    data: {
      ultimo_nro_comprobante_usado: nro_comprobante,
    },
  })
}

// Call the function here to run your seed script
await seed()
