'use server'

import type { Cliente } from '@/payload-types'
import type { Ret } from '@/types'
import config from '@payload-config'
import { login, logout } from '@payloadcms/next/auth'

export async function signin(args: { email: string; password: string }): Promise<Ret<Cliente>> {
  try {
    const response = await login({
      collection: 'cliente',
      config,
      email: args.email,
      password: args.password,
    })

    if (response?.user) {
      return { ok: true, message: 'Login exitoso', data: response.user }
    }

    return { ok: false, message: 'Credenciales inválidas', data: null }
  } catch (error) {
    console.error(error)
    return { ok: false, message: 'Error en el login', data: null }
  }
}

export async function signout(): Promise<Ret<null>> {
  try {
    const response = await logout({
      config,
    })
    if (response?.success) {
      return { ok: true, message: 'Logout exitoso', data: null }
    }

    return { ok: false, message: 'Error al cerrar sesión', data: null }
  } catch (error) {
    console.error(error)
    return { ok: false, message: 'Error en el logout', data: null }
  }
}
