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
    $addFields: {
      nro_comprobante: {
        $trunc: {
          // Truncamos para obtener solo la parte entera
          $divide: [
            // Dividimos por 1000 para convertir de milisegundos a segundos
            {
              $toLong: {
                $toDate: '$createdAt',
              },
            },
            1000,
          ],
        },
      },
    },
  },
  {
    $merge: {
      into: 'consumos',
      //   whenMatched: 'replace',
      whenNotMatched: 'discard',
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
