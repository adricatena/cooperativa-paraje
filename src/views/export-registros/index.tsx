import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewProps } from 'payload'
import { ClientExportRegistros } from './client-export-registros'

export default async function ExportRegistros({
  initPageResult,
  params,
  searchParams,
}: AdminViewProps) {
  const { payload } = initPageResult.req
  const { docs: consumos } = await payload.find({
    collection: 'consumos',
    where: {
      estado: {
        equals: 'PAGADO',
      },
    },
    sort: '-datos_facturacion.fecha_pago',
    pagination: false,
  })

  const periodos = Object.groupBy(consumos, ({ datos_facturacion }) => {
    if (!datos_facturacion?.fecha_pago) return 'adeudado'
    const fechaPago = new Date(datos_facturacion.fecha_pago)
    fechaPago.setDate(1)
    fechaPago.setHours(0, 0, 0, 0)
    return fechaPago.toISOString()
  })

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <ClientExportRegistros
          periodos={Object.keys(periodos).map((periodo, i) => {
            const fecha = new Date(periodo)
            return {
              label: fecha.toLocaleDateString('es-AR', {
                month: 'long',
                year: 'numeric',
              }),
              key: periodo,
            }
          })}
        />
      </Gutter>
    </DefaultTemplate>
  )
}
