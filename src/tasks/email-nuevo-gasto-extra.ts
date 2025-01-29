import { getTipoGastoLabel } from '@/collections/GastosExtraordinarios'
import type { TaskConfig } from 'payload'

export const emailNuevoGastoExtra = {
  slug: 'email-nuevo-gasto-extra',
  retries: 3,
  inputSchema: [{ name: 'gastoId', type: 'text', required: true }],
  outputSchema: [{ name: 'mensaje', type: 'text', required: false }],
  handler: async (args) => {
    const { req, input } = args

    const gastoExtra = await req.payload.findByID({
      collection: 'gastos_extraordinarios',
      id: input.gastoId,
      depth: 3,
    })

    const medidor = gastoExtra.medidor as any
    const usuario = medidor.usuario as any

    const concepto = getTipoGastoLabel(gastoExtra.tipo)

    await req.payload.sendEmail({
      to: usuario.email,
      subject: 'Nuevo gasto extra cargado',
      html: `
        <div style="font-family: sans-serif; font-size: small">
          <h1 style="font-size: xxx-large">Cooperativa de Agua Paraje La Virgen<h1>
          <p style="font-weight: 100">¡Hola <strong>${usuario.datos_personales?.nombre} ${usuario.datos_personales?.apellido}</strong>! Tienes un nuevo gasto extra registrado a tu nombre para el domicilio <strong>${medidor.direccion}</strong></p>
          <p style="font-weight: 100">Resumen de tu gasto extra:</p>
          <ul style="font-weight: 100">
            <li>Concepto: ${concepto}</li>
            <li>Precio: $${gastoExtra.monto}</li>
            <li>Fecha: ${new Date(gastoExtra.createdAt).toLocaleDateString('es-AR')}</li>
            ${gastoExtra.observaciones ? `<li>Observaciones: ${gastoExtra.observaciones}</li>` : ''}
          </ul>
          <p style="font-weight: 400">Recuerda que solo puedes abonarlo ingresando con tu email y contraseña en <a href="${process.env.NEXT_PUBLIC_DOMINIO}/admin/collections/gastos" target="_blank">Cooperativa Paraje La Virgen</a></p>
        </div>
      `,
    })

    return {
      output: {
        mensaje: 'Email enviado',
      },
    }
  },
} as TaskConfig<'email-nuevo-gasto-extra'>
