'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/auth'

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/admin',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return 'E-mail ou senha inválidos.'
    }
    // Re-lança o redirect de sucesso (NEXT_REDIRECT) e demais erros.
    throw error
  }
  return undefined
}
