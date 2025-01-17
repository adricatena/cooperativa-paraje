import { MongoClient } from 'mongodb'

/*
 * Requires the MongoDB Node.js Driver
 * https://mongodb.github.io/node-mongodb-native
 */

const agg = [
  /* {
    $limit: 10, // Agregamos el límite al inicio del pipeline
  }, */
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
/* const client = await MongoClient.connect(
  'mongodb+srv://adricatena:bfrqYw9xzdADFJkZ@cluster0.lrlqy.mongodb.net/',
) */

// PROD
const client = await MongoClient.connect(
  'mongodb+srv://adricatena:NGt9T6bBRzsBmDJR@cluster0.vpbnc.mongodb.net/',
)

const coll = client.db('test').collection('consumos')
const cursor = coll.aggregate(agg)
const result = await cursor.toArray()
await client.close()
