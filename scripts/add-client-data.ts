import { MongoClient } from 'mongodb'

const client = await MongoClient.connect(process.env.DATABASE_URI || '')

const db = client.db('test')
const usuariosCol = db.collection('usuarios')
const clientesCol = db.collection('clientes')

// Primero verificar qué roles existen
console.log('Verificando roles en la colección usuarios...')
const rolesDistinct = await usuariosCol.distinct('rol')
console.log('Roles encontrados:', rolesDistinct)

// Ver cuántos usuarios hay en total
const totalUsuarios = await usuariosCol.countDocuments()
console.log('Total usuarios:', totalUsuarios)

// Ver un ejemplo de usuario
const ejemploUsuario = await usuariosCol.findOne()
console.log('Ejemplo de usuario:', JSON.stringify(ejemploUsuario, null, 2))

// Buscar usuarios con rol CLIENTE
const usuarios = await usuariosCol
  .find({
    rol: 'CLIENTE',
    'datos_personales.cuit': { $exists: true },
  })
  // .limit(10) // Descomentar para testing
  .toArray()

console.log(`\nEncontrados ${usuarios.length} usuarios con rol CLIENTE`)

let creados = 0
let errores = 0

// Para cada usuario, crear el cliente correspondiente
for (const usuario of usuarios) {
  const datosPersonales = usuario.datos_personales

  if (!datosPersonales?.cuit) {
    console.log(`✗ Usuario ${usuario.email} no tiene CUIT`)
    errores++
    continue
  }

  // Verificar si ya existe un cliente con ese CUIT
  const clienteExistente = await clientesCol.findOne({ cuit: datosPersonales.cuit })
  if (clienteExistente) {
    console.log(`⊘ Cliente con CUIT ${datosPersonales.cuit} ya existe`)
    continue
  }

  /* const nuevoCliente = {
    // Datos personales a nivel raíz
    nombre: datosPersonales.nombre || '',
    apellido: datosPersonales.apellido || '',
    cuit: datosPersonales.cuit,
    domicilio: datosPersonales.domicilio || '',
    telefono: datosPersonales.telefono || 0,
    nacimiento: datosPersonales.nacimiento || null,
    // Resto de campos del usuario (excepto rol y datos_personales)
    titulo: usuario.titulo,
    email: usuario.email,
    hash: usuario.hash,
    salt: usuario.salt,
    confirmado: usuario.confirmado || false,
    activo: usuario.activo || true,
    desarrollador: usuario.desarrollador || false,
    pago_manual: usuario.pago_manual || false,
    observaciones: usuario.observaciones || '',
    loginAttempts: usuario.loginAttempts || 0,
    __v: usuario.__v || 0,
    sessions: usuario.sessions || [],
    lockUntil: usuario.lockUntil || null,
    createdAt: usuario.createdAt || new Date(),
    updatedAt: usuario.updatedAt || new Date(),
    // Campos opcionales que pueden existir
    ...(usuario.resetPasswordExpiration && { resetPasswordExpiration: usuario.resetPasswordExpiration }),
    ...(usuario.resetPasswordToken && { resetPasswordToken: usuario.resetPasswordToken }),
  } */

  /* const nuevo: Cliente = {
    activo: usuario.activo || true,
    apellido: datosPersonales.apellido || '',
    confirmado: usuario.confirmado || false,
    createdAt: usuario.createdAt || new Date(),
    cuit: datosPersonales.cuit,
    domicilio: datosPersonales.domicilio || '',
    email: usuario.email,
    hash: usuario.hash,
    nacimiento: datosPersonales.nacimiento || null,
    nombre: datosPersonales.nombre || '',
    salt: usuario.salt,
    sessions: usuario.sessions || [],
    telefono: datosPersonales.telefono || 0,
    titulo: `${datosPersonales.cuit} - ${datosPersonales.nombre} ${datosPersonales.apellido}`,
    updatedAt: usuario.updatedAt || new Date(),
  } */
  const nuevo = {}

  const nuevoCliente = {
    ...nuevo,
    loginAttempts: usuario.loginAttempts || 0,
    __v: usuario.__v || 0,
    lockUntil: usuario.lockUntil || null,
    // Campos opcionales que pueden existir
    ...(usuario.resetPasswordExpiration && {
      resetPasswordExpiration: usuario.resetPasswordExpiration,
    }),
    ...(usuario.resetPasswordToken && { resetPasswordToken: usuario.resetPasswordToken }),
  }

  try {
    await clientesCol.insertOne(nuevoCliente)
    creados++
    console.log(
      `✓ Cliente creado con CUIT: ${datosPersonales.cuit} - ${datosPersonales.nombre} ${datosPersonales.apellido}`,
    )
  } catch (error) {
    console.log(
      `✗ Error al crear cliente con CUIT ${datosPersonales.cuit}:`,
      (error as Error)?.message,
    )
    errores++
  }
}

console.log(`\nTotal clientes creados: ${creados} de ${usuarios.length}`)
console.log(`Errores: ${errores}`)
await client.close()
