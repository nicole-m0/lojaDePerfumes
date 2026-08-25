import { Link } from 'react-router-dom'
import { Camera, MessageCircle } from 'lucide-react'
import { STORE_WHATSAPP_NUMBER, STORE_TAGLINE } from '../config/store'
import { categories } from '../data/products'
import venusFlower from '../assets/venus-flower.png'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-venus-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Link to="/" className="flex items-center gap-1.5">
            <img src={venusFlower} alt="" className="h-8 w-auto" />
            <span className="font-script text-2xl text-venus-600">Vênus</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-neutral-500">{STORE_TAGLINE}</p>
          <div className="mt-4 flex gap-3">
            <a
              href={`https://wa.me/${STORE_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-venus-50 text-venus-600 transition hover:bg-venus-100"
            >
              <MessageCircle className="h-4.5 w-4.5" />
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-venus-50 text-venus-600 transition hover:bg-venus-100"
            >
              <Camera className="h-4.5 w-4.5" />
            </a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
            Categorias
          </h4>
          <ul className="space-y-2 text-sm text-neutral-500">
            {categories.slice(0, 6).map((category) => (
              <li key={category}>
                <Link to={`/?categoria=${encodeURIComponent(category)}`} className="hover:text-venus-600">
                  {category}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
            Atendimento
          </h4>
          <ul className="space-y-2 text-sm text-neutral-500">
            <li>Segunda a sábado, 9h às 19h</li>
            <li>Entregas para todo o Brasil</li>
            <li>Compra 100% segura</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-venus-50 py-4 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} Loja Vênus. Todos os direitos reservados.
      </div>
    </footer>
  )
}
