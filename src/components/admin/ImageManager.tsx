'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CldUploadWidget } from 'next-cloudinary'
import { ImagePlus, Link2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface ProductImageInput {
  url: string
  publicId?: string
  alt?: string
}

interface ImageManagerProps {
  value: ProductImageInput[]
  onChange: (images: ProductImageInput[]) => void
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

export default function ImageManager({ value, onChange }: ImageManagerProps) {
  const [urlDraft, setUrlDraft] = useState('')

  const add = (img: ProductImageInput) => {
    if (!img.url || value.some((v) => v.url === img.url)) return
    onChange([...value, img])
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {value.map((img, index) => (
            <li
              key={img.url}
              className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
            >
              <Image src={img.url} alt={img.alt ?? ''} fill sizes="96px" className="object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label="Remover imagem"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X className="size-3.5" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[10px] text-white">
                  capa
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {CLOUD_NAME ? (
          <CldUploadWidget
            signatureEndpoint="/api/cloudinary/sign"
            options={{ folder: 'loja-venus/produtos', multiple: true, sources: ['local', 'url'] }}
            onSuccess={(result) => {
              const info = result?.info
              if (info && typeof info === 'object' && 'secure_url' in info) {
                add({
                  url: String(info.secure_url),
                  publicId: 'public_id' in info ? String(info.public_id) : undefined,
                })
              }
            }}
          >
            {({ open }) => (
              <Button type="button" variant="outline" onClick={() => open()}>
                <ImagePlus className="size-4" />
                Enviar imagem
              </Button>
            )}
          </CldUploadWidget>
        ) : (
          <p className="text-xs text-muted-foreground">
            Cloudinary não configurado — adicione imagens por URL abaixo.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="url"
          placeholder="https://... (colar URL da imagem)"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            add({ url: urlDraft.trim() })
            setUrlDraft('')
          }}
        >
          <Link2 className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  )
}
