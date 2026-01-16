import config from '@payload-config'
import { getPayload } from 'payload'

export const basePayload = await getPayload({ config })
