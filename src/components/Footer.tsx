import Link from 'next/link'
import { STORE_NAME, STORE_TAGLINE } from '../config/store'
import { isMercadoPagoConfigured } from '@/lib/mercadopago'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { BrandMark } from './brand/Logo'
import { Container } from './shop/ui'

interface FooterProps {
  categories: { name: string; slug: string }[]
}

export default function Footer({ categories }: FooterProps) {
  // Texto de pagamento fiel à configuração real deste ambiente.
  const paymentLine = isMercadoPagoConfigured()
    ? 'Pagamento online pelo Mercado Pago'
    : 'Pagamento combinado com a loja após o pedido'
  // `null` sem número de WhatsApp válido configurado — o botão e a menção ao
  // atendimento pelo WhatsApp somem.
  const whatsappUrl = buildWhatsAppUrl()

  const columnTitle = 'eyebrow mb-5 text-ivory/55'
  const link = 'link-underline pb-0.5 text-ivory/85 hover:text-ivory'

  return (
    <footer className="mt-24 bg-ink text-ivory">
      <Container className="grid gap-12 py-16 md:grid-cols-12 md:gap-8 lg:py-20">
        <div className="md:col-span-5">
          <BrandMark
            className="h-10 w-10"
            bottleColor="var(--color-ivory)"
            accentColor="var(--color-champagne-300)"
          />
          <p className="mt-6 max-w-sm font-display text-3xl leading-tight text-ivory">
            {STORE_TAGLINE}
          </p>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex h-11 items-center border border-ivory/35 px-6 text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-ivory hover:text-ink"
            >
              Fale conosco no WhatsApp
            </a>
          )}
        </div>

        <nav aria-labelledby="rodape-colecoes" className="md:col-span-3">
          <h2 id="rodape-colecoes" className={columnTitle}>
            Coleções
          </h2>
          <ul className="space-y-3 text-sm">
            <li>
              <Link href="/#catalogo" className={link}>
                Todos os produtos
              </Link>
            </li>
            {categories.slice(0, 6).map((category) => (
              <li key={category.slug}>
                <Link href={`/?categoria=${encodeURIComponent(category.name)}`} className={link}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-4">
          <h2 className={columnTitle}>Como funciona</h2>
          <ul className="space-y-3 text-sm text-ivory/85">
            <li>Frete calculado no checkout, a partir do CEP</li>
            <li>{paymentLine}</li>
            {whatsappUrl && <li>Atendimento pelo WhatsApp</li>}
          </ul>
        </div>
      </Container>

      <div className="border-t border-ivory/15">
        <Container className="flex flex-col gap-3 py-6 text-xs text-ivory/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {STORE_NAME}
          </p>
          {/* Recuo à direita: não fica sob o botão flutuante do WhatsApp. */}
          <p className="max-w-xl pr-14 md:pr-16 md:text-right">
            Loja demonstrativa — projeto de portfólio. Nenhum pedido é entregue.
          </p>
        </Container>
      </div>
    </footer>
  )
}
