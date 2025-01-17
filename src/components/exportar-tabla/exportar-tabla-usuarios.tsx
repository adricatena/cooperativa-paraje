'use client'
import type { Usuario } from '@/payload-types'
import { USUARIOS_COLUMNS, USUARIOS_DATOSPERSONALES_COLUMNS } from '@/utils/usuarios'
import { useAuth } from '@payloadcms/ui'
import { ExportarTabla } from '.'

export function ExportarTablaUsuarios() {
  const { user } = useAuth()
  if (user?.rol === 'CLIENTE') return null

  function mapData(usuarios: Usuario[]) {
    const mappedDocs = usuarios.map((usario) => {
      const mappedDoc: any = {}

      USUARIOS_COLUMNS.forEach(({ key, label }) => {
        mappedDoc[label] = usario[key]
      })

      USUARIOS_DATOSPERSONALES_COLUMNS.forEach(({ key, label }) => {
        if (key === 'nacimiento') {
          mappedDoc[label] = usario.datos_personales?.nacimiento
            ? new Date(usario.datos_personales.nacimiento).toLocaleDateString('es-AR')
            : ''
          return
        }
        mappedDoc[label] = usario.datos_personales![key]
      })

      return mappedDoc
    })

    return mappedDocs
  }

  return <ExportarTabla collection="usuarios" mapData={mapData} />
}
