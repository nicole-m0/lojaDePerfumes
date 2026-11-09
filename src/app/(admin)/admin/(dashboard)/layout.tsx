import type { Metadata } from 'next'
import Link from 'next/link'
import { Boxes, LayoutDashboard, LogOut, Package, ShoppingCart, Tags, Wallet } from 'lucide-react'
import { requireStaffPage } from '@/server/guard'
import { signOutAction } from '@/server/session-actions'
import { can, type Permission } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import Logo, { BrandMark } from '@/components/brand/Logo'

export const metadata: Metadata = {
  title: 'Painel',
  robots: { index: false, follow: false },
}

const NAV_LINKS: { href: string; label: string; icon: typeof Package; permission: Permission }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'panel' },
  { href: '/admin/produtos', label: 'Produtos', icon: Package, permission: 'panel' },
  { href: '/admin/categorias', label: 'Categorias & Marcas', icon: Tags, permission: 'panel' },
  { href: '/admin/estoque', label: 'Estoque', icon: Boxes, permission: 'panel' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart, permission: 'panel' },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Wallet, permission: 'finance' },
]

const NAV_SOON = ['Clientes', 'Entregas', 'Configurações']

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // O layout NÃO roda de novo na navegação entre páginas do painel: cada página
  // chama requireStaffPage() por conta própria. Aqui serve ao menu e ao cabeçalho
  // (mesma consulta da página, compartilhada via cache por requisição).
  const staff = await requireStaffPage()
  const links = NAV_LINKS.filter((l) => can(staff.role, l.permission))

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Link href="/admin" className="block px-3 pb-5">
          <Logo size="sm" />
          <p className="mt-1.5 text-xs text-muted-foreground">Painel administrativo</p>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {links.map(({ href, label, icon: Icon }) => (
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
            {staff.email} · {staff.role}
          </span>
          {/* Logout só por POST (Server Action com conferência de origem). */}
          <form action={signOutAction}>
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
