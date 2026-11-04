'use client'

import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { STORE_NAME, STORE_WHATSAPP_NUMBER } from '../config/store'

export default function WhatsAppButton() {
  const pathname = usePathname()
  // Página de produto no celular: já tem barra de compra fixa e link próprio para
  // o WhatsApp — o botão flutuante só cobriria conteúdo. Fica visível no desktop.
  const onProduct = pathname.startsWith('/produto/')
  const message = encodeURIComponent(
    `Olá! Vim do site da ${STORE_NAME} e gostaria de tirar uma dúvida.`,
  )

  return (
    <a
      href={`https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a loja no WhatsApp (abre em nova aba)"
      className={`fixed bottom-4 right-4 z-30 h-12 w-12 items-center justify-center bg-ink text-ivory transition-colors hover:bg-brand-800 sm:bottom-6 sm:right-6 ${
        onProduct ? 'hidden lg:flex' : 'flex'
      }`}
    >
      <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
    </a>
  )
}
