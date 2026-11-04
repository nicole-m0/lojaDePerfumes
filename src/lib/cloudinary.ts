import 'server-only'
import { v2 as cloudinary } from 'cloudinary'

export const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ''
// Só afeta NOVOS uploads. Imagens já enviadas guardam a URL completa e o publicId
// no banco (ProductImage) e continuam funcionando na pasta antiga.
export { CLOUDINARY_PRODUCTS_FOLDER as CLOUDINARY_FOLDER } from '@/config/store'

export const cloudinaryConfigured = Boolean(
  CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
)

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export { cloudinary }
