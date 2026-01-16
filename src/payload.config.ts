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
import { ClienteCollection } from './payload/collections/cliente'
import { Consumos } from './payload/collections/Consumos'
import { GastosExtraordinarios } from './payload/collections/GastosExtraordinarios'
import { Medidores } from './payload/collections/Medidores'
import { Usuarios } from './payload/collections/Usuarios'
import { notificacionPagoEndpoint } from './payload/endpoints/notificacion-pago'
import { Variables } from './payload/globals/Variables'
import { emailNuevoConsumo } from './payload/tasks/email-nuevo-consumo'
import { emailNuevoGastoExtra } from './payload/tasks/email-nuevo-gasto-extra'

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
        // Icon: '/payload/brand/home-icon#HomeIcon',
        Logo: '/payload/brand/logo#Logo',
      },
      logout: {
        Button: '/components/logout-button#LogoutButton',
      },
      views: {
        exportRegistros: {
          path: '/consumos/exportar-registros',
          Component: '/payload/views/export-registros#ExportRegistros',
        },
      },
    },
    theme: 'light',
    meta: {
      titleSuffix: ' - Cooperativa Paraje La Virgen',
    },
    dateFormat: 'dd/MM/yyyy',
  },
  collections: [Usuarios, ClienteCollection, Medidores, Consumos, GastosExtraordinarios],
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
    tasks: [emailNuevoConsumo, emailNuevoGastoExtra],
  },
})
