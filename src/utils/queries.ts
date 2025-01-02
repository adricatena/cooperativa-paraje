import type { Usuario } from '@/payload-types'
import type { Where } from 'payload'

export const isWhere = (where: any): where is Where => where && typeof where === 'object'

export const GET = (url: string) =>
  fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

export async function getMe() {
  try {
    const resUser = await fetch(`/api/usuarios/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    const { user } = await resUser.json()
    return user as Usuario
  } catch (error) {
    console.error(error)
    return null
  }
}
