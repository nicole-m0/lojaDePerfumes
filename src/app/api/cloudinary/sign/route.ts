import { NextResponse } from 'next/server'
import { cloudinary, cloudinaryConfigured } from '@/lib/cloudinary'
import { ForbiddenError, requireStaff, UnauthenticatedError } from '@/server/guard'

// Assina uploads diretos do navegador para o Cloudinary (usado pelo
// CldUploadWidget no admin). Só para usuário de equipe ATIVO (conferido no banco).
export async function POST(request: Request) {
  try {
    await requireStaff('panel')
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    throw err
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
