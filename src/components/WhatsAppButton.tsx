import Image from 'next/image'
import { STORE_NAME, STORE_WHATSAPP_NUMBER } from '../config/store'
import whatsappIcon from '../assets/whatsapp.png'

export default function WhatsAppButton() {
  const message = encodeURIComponent(
    `Olá! Vim do site da ${STORE_NAME} e gostaria de tirar uma dúvida.`,
  )

  return (
    <a
      href={`https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_30px_-8px_rgba(37,211,102,0.7)] transition-transform hover:scale-110 animate-float"
    >
      <Image src={whatsappIcon} alt="WhatsApp" className="h-full w-full rounded-full" />
    </a>
  )
}
