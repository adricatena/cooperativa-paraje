import type { Consumo } from '@/payload-types'
import type { FieldServerComponent } from 'payload'
import { ComprobanteClientViewer } from './client-viewer'

export const ComprobanteViewer: FieldServerComponent = async ({ data, payload }) => {
  let { medidor } = data
  if (typeof medidor === 'string') {
    medidor = await payload.findByID({
      collection: 'medidores',
      id: medidor,
    })
  }

  const variables = await payload.findGlobal({ slug: 'variables' })

  return <ComprobanteClientViewer consumo={{ ...data, medidor } as Consumo} variables={variables} />
}
