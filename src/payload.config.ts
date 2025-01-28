// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { es } from 'payload/i18n/es'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Consumos } from './collections/Consumos'
import { GastosExtraordinarios } from './collections/GastosExtraordinarios'
import { Medidores } from './collections/Medidores'
import { Usuarios } from './collections/Usuarios'
import { notificacionPagoEndpoint } from './endpoints/notificacion-pago'
import { Variables } from './globals/Variables'
import { emailNuevoConsumo } from './tasks/email-nuevo-consumo'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const email = nodemailerAdapter({
  defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? '',
  defaultFromName: process.env.EMAIL_FROM_NAME ?? '',
  // Nodemailer transportOptions
  transportOptions: {
    host: process.env.EMAIL_SMTP_HOST,
    port: process.env.EMAIL_SMTP_PORT,
    secure: true,
    auth: {
      user: process.env.EMAIL_AUTH_USER,
      pass: process.env.EMAIL_AUTH_PASS,
    },
  },
})

export default buildConfig({
  admin: {
    user: Usuarios.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    avatar: 'default',
    components: {
      graphics: {
        // Icon: '/brand/home-icon#HomeIcon',
        Logo: '/brand/logo#Logo',
      },
      logout: {
        Button: '/components/logout-button#LogoutButton',
      },
      views: {
        exportRegistros: {
          path: '/consumos/exportar-registros',
          Component: '/views/export-registros#ExportRegistros',
        },
      },
    },
    theme: 'light',
    meta: {
      titleSuffix: ' - Cooperativa Paraje La Virgen',
    },
  },
  collections: [Usuarios, Medidores, Consumos, GastosExtraordinarios],
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
  endpoints: [notificacionPagoEndpoint],
  email,
  jobs: {
    tasks: [emailNuevoConsumo],
  },
})
