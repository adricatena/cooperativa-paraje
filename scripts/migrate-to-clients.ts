import config from '@payload-config'
import { getPayload } from 'payload'

const seed = async () => {
  // Get a local copy of Payload by passing your config
  const payload = await getPayload({ config })

  const usuarios = await payload.find({
    collection: 'usuarios',
    pagination: false,
    where: {
      rol: {
        equals: 'CLIENTE',
      },
    },
  })

  const clientes = await Promise.all(
    usuarios.docs.map((u) => {
      const { rol, datos_personales, desarrollador, medidores, password, ...rest } = u
      return payload.create({
        collection: 'cliente',
        data: {
          ...rest,
          nombre: datos_personales?.nombre || '',
          apellido: datos_personales?.apellido || '',
          cuit: datos_personales!.cuit,
          domicilio: datos_personales?.domicilio,
          telefono: datos_personales!.telefono,
          nacimiento: datos_personales?.nacimiento,
        },
      })
    }),
  )

  console.log(`Migrated ${clientes.length} clientes from usuarios collection.`)
}

// Call the function here to run your seed script
await seed()
