'use client'

import { useEffect, useRef } from 'react'
import { endRevokedSessionAction } from '@/server/session-actions'
import { Button } from '@/components/ui/button'

/**
 * Envia, uma única vez e por POST, o pedido de encerramento da sessão revogada.
 * O botão continua visível (sem JavaScript, ou se o envio automático falhar).
 * O servidor confere a origem e só encerra se o usuário perdeu mesmo o acesso.
 */
export default function RevokedSessionForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    formRef.current?.requestSubmit()
  }, [])

  return (
    <form ref={formRef} action={endRevokedSessionAction}>
      <Button type="submit" className="w-full">
        Encerrar sessão
      </Button>
    </form>
  )
}
