/* import { MongoClient } from 'mongodb'

const agg = [
  // {
  //   $limit: 10, // Agregamos el límite al inicio del pipeline
  // },
  {
    $match: {
      estado: 'PAGADO',
      'datos_facturacion.fecha_pago': {
        $exists: false,
      },
    },
  },
  {
    $set: {
      'datos_facturacion.fecha_pago': '$updatedAt',
    },
  },
  {
    $merge: {
      into: 'consumos',
      whenNotMatched: 'discard',
      //   whenMatched: 'merge',
    },
  },
]

// DEV
// const client = await MongoClient.connect('')

// PROD
const client = await MongoClient.connect('')

const coll = client.db('test').collection('consumos')
const cursor = coll.aggregate(agg)
const result = await cursor.toArray()
await client.close() */
