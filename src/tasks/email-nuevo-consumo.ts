import type { Medidore, Usuario } from '@/payload-types'
import type { TaskConfig } from 'payload'

export const emailNuevoConsumo: TaskConfig = {
  slug: 'email-nuevo-consumo',
  retries: 3,
  inputSchema: [
    { name: 'to', type: 'text', required: true },
    { name: 'consumoId', type: 'text', required: true },
  ],
  outputSchema: [{ name: 'mensaje', type: 'text', required: false }],
  handler: async (args) => {
    const { req, input } = args

    const consumo = await req.payload.findByID({
      collection: 'consumos',
      id: input.consumoId,
      depth: 3,
    })

    const medidor = consumo.medidor as Medidore
    const usuario = medidor.usuario as Usuario

    const [year, mes] = consumo.periodo_normalizado?.split('/') ?? []

    await req.payload.sendEmail({
      to: input.to,
      subject: 'Nuevo consumo cargado',
      html: `
        <div style="font-family: sans-serif; font-size: small">
          <h1 style="font-size: xxx-large">Cooperativa de Agua Paraje La Virgen<h1>
          <p style="font-weight: 100">¡Hola <strong>${usuario.datos_personales?.nombre} ${usuario.datos_personales?.apellido}</strong>! Tienes un nuevo consumo registrado a tu nombre para el periodo del <strong>${mes}/${year}</strong> del domicilio <strong>${medidor.direccion}</strong></p>
          <p style="font-weight: 100">Resumen de tu consumo:</p>
          <ul style="font-weight: 100">
            <li>Periodo: ${mes}/${year}</li>
            <li>Consumo base: ${consumo.datos_facturacion?.consumo_base}</li>
            <li>Precio base: $${consumo.datos_facturacion?.precio_base}</li>
            <li>Consumo: ${consumo.consumo_real}m3</li>
            <li>Precio regular: $${consumo.datos_facturacion?.precio_regular}</li>
            <li>Fecha 1er vencimiento: ${consumo.datos_facturacion?.dia_primer_vencimiento}</li>
            <li>Precio 1er vencimiento: $${consumo.datos_facturacion?.precio_primer_vencimiento}</li>
            <li>Fecha 2do vencimiento: ${consumo.datos_facturacion?.dia_segundo_vencimiento}</li>
            <li>Precio 2do vencimiento: $${consumo.datos_facturacion?.precio_segundo_vencimiento}</li>
          </ul>
          <p style="font-weight: 400">Recuerda que solo puedes abonarlo ingresando con tu email y contraseña en <a href="${process.env.NEXT_PUBLIC_DOMINIO}/admin/collections/consumos" target="_blank">Cooperativa Paraje La Virgen</a></p>
        </div>
      `,
    })

    return {
      output: {
        mensaje: 'Email enviado',
      },
    }
  },
} as TaskConfig<'email-nuevo-consumo'>
