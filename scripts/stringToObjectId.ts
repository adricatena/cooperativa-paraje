import { MongoClient } from 'mongodb'

/*
 * Requires the MongoDB Node.js Driver
 * https://mongodb.github.io/node-mongodb-native
 */

const agg = [
  {
    $project: {
      usuario: {
        $toObjectId: '$usuario',
      },
    },
  },
  {
    $merge: {
      into: 'medidores',
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

const coll = client.db('test').collection('medidores')
const cursor = coll.aggregate(agg)
const result = await cursor.toArray()
await client.close()
