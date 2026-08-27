import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { auth, signOut } from '@/auth'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Painel',
  robots: { index: false, follow: false },
}

const NAV_SOON = [
  'Produtos',
  'Categorias & Marcas',
  'Estoque',
  'Pedidos',
  'Clientes',
  'Entregas',
  'Financeiro',
  'Configurações',
]

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <div className="px-3 pb-4">
          <span className="font-script text-2xl text-venus-600">Vênus</span>
          <p className="text-xs text-muted-foreground">Painel administrativo</p>
        </div>

        <nav className="flex flex-col gap-0.5">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground"
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>

          {NAV_SOON.map((label) => (
            <span
              key={label}
              className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              title="Disponível nas próximas fases"
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
          <span className="text-sm text-muted-foreground">
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
