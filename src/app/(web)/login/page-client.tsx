'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { signin } from '../actions/auth'

export function LoginPageClient() {
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)

    const email = event.currentTarget.email?.value
    const password = event.currentTarget.password?.value

    if (!email || !password) {
      toast.error('Por favor, completa todos los campos.')
      setIsLoading(false)
      return
    }

    const response = await signin({ email, password })

    if (response.ok) {
      toast.success('¡Ingreso exitoso!')
      return router.replace('/')
    }

    toast.error(
      response.message || 'Error al iniciar sesión. Por favor, verifica tus credenciales.',
    )
    setIsLoading(false)
  }

  return (
    <div className="bg-base-200 flex min-h-screen items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="card bg-base-100 w-full max-w-sm rounded-lg p-6 shadow sm:max-w-md md:max-w-lg lg:max-w-xl">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="mb-6">
            <h2 className="mb-2 text-center text-2xl font-bold">Cooperativa Paraje La Virgen</h2>
            <p className="text-center text-sm text-gray-500">Accede con tu email y contraseña</p>
          </div>
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor="email">
              Email
            </label>
            <input
              name="email"
              id="email"
              type="email"
              placeholder="Email"
              required
              className="input w-full"
            />
          </fieldset>
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor="password">
              Contraseña
            </label>
            <input
              name="password"
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              className="input w-full"
              required
            />
            <label className="label">
              <input
                type="checkbox"
                name="showPassword"
                id="showPassword"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
                className="checkbox"
              />
              Mostrar contraseña
            </label>
          </fieldset>
          <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
            Ingresar
          </button>
        </form>
      </div>
    </div>
  )
}
