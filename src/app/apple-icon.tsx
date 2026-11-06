import { ImageResponse } from 'next/og'
import { BRAND_SPARKLE_PATH } from '@/components/brand/Logo'

// Ícone para iOS ("Adicionar à Tela de Início"), gerado no build a partir do
// mesmo símbolo do favicon (src/app/icon.svg). Sem arquivo binário de terceiros.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#77344d',
      }}
    >
      <svg width="132" height="132" viewBox="0 0 32 32">
        <rect x="12" y="3.5" width="8" height="4.5" rx="1.2" fill="#d9ba80" />
        <rect x="14" y="8" width="4" height="2.75" fill="#f4ead6" />
        <rect
          x="7.25"
          y="10.75"
          width="17.5"
          height="17.5"
          rx="5"
          fill="none"
          stroke="#f4ead6"
          strokeWidth="2"
        />
        <path d={BRAND_SPARKLE_PATH} fill="#d9ba80" />
      </svg>
    </div>,
    size,
  )
}
