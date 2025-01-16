'use client'
import { Button } from '@payloadcms/ui'
import { redirect, RedirectType } from 'next/navigation'
import { useCallback } from 'react'

export function LogoutButton() {
  const handleClick = useCallback(async () => {
    try {
      await fetch('/api/usuarios/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
    } finally {
      redirect('/admin/login', RedirectType.replace)
    }
  }, [])

  return <Button onClick={handleClick}>Cerrar sesion</Button>
}
