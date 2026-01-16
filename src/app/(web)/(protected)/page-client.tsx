'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { signout } from '../actions/auth'

export function PageClient() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)

    const response = await signout()

    if (response.ok) {
      toast.info('¡Cierre de sesión exitoso!')
      return router.replace('/login')
    }

    toast.error(response.message || 'Error al cerrar sesión.')
    setIsLoading(false)
  }

  return (
    <div>
      Page Client
      <button className="btn" onClick={handleClick} disabled={isLoading}>
        Cerrar sesion
      </button>
    </div>
  )
}
