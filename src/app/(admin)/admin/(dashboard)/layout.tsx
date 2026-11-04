import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, LayoutDashboard, LogOut, Package, ShoppingCart, Tags, Wallet } from 'lucide-react'
import { auth, signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import Logo, { BrandMark } from '@/components/brand/Logo'

export const metadata: Metadata = {
  title: 'Painel',
  robots: { index: false, follow: false },
}

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias & Marcas', icon: Tags },
  { href: '/admin/estoque', label: 'Estoque', icon: Boxes },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
]

const NAV_SOON = ['Clientes', 'Entregas', 'Configurações']

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Link href="/admin" className="block px-3 pb-5">
          <Logo size="sm" />
          <p className="mt-1.5 text-xs text-muted-foreground">Painel administrativo</p>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}

          {NAV_SOON.map((label) => (
            <span
              key={label}
              className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              title="Disponível em breve"
            >
              {label}
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                em breve
              </span>
            </span>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-6 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* Sem sidebar no celular: o símbolo mantém a marca visível. */}
            <BrandMark className="size-6 md:hidden" title="Bella&Cheirosa" />
            {session.user.email}
            {session.user.role ? ` · ${session.user.role}` : ''}
          </span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/admin/login' })
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              Sair
            </Button>
          </form>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
