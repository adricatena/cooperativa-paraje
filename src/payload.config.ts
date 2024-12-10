// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { es } from 'payload/i18n/es'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Consumos } from './collections/Consumos'
import { Medidores } from './collections/Medidores'
import { Usuarios } from './collections/Usuarios'
import { notificacionPagoHandler } from './endpoints/notificacion-pago'
import { Variables } from './globals/Variables'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Usuarios.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        // Icon: '/brand/home-icon#HomeIcon',
        Logo: '/brand/logo#Logo',
      },
    },
    meta: {
      titleSuffix: ' - Cooperativa Paraje La Virgen',
    },
  },
  collections: [Usuarios, Medidores, Consumos],
  globals: [Variables],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // storage-adapter-placeholder
  ],
  i18n: {
    fallbackLanguage: 'es',
    supportedLanguages: { es },
  },
  endpoints: [
    {
      path: '/notificaciones/pagos',
      method: 'post',
      handler: notificacionPagoHandler,
    },
  ],
})
