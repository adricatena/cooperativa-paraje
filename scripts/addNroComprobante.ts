/* import { MongoClient } from 'mongodb'

const agg = [
  // {
  //   $limit: 10, // Agregamos el límite al inicio del pipeline
  // },
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
// const client = await MongoClient.connect('')

// PROD
const client = await MongoClient.connect('')

const coll = client.db('test').collection('consumos')
const cursor = coll.aggregate(agg)
const result = await cursor.toArray()
await client.close() */
