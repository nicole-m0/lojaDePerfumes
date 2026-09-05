import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { cloudinary, cloudinaryConfigured } from '@/lib/cloudinary'

// Assina uploads diretos do navegador para o Cloudinary (usado pelo
// CldUploadWidget no admin). Só para staff autenticado.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!cloudinaryConfigured) {
    return NextResponse.json({ error: 'cloudinary_not_configured' }, { status: 503 })
  }

  const { paramsToSign } = (await request.json()) as {
    paramsToSign: Record<string, string | number>
  }

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET as string,
  )

  return NextResponse.json({ signature })
}
