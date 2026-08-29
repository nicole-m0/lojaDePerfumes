'use client'

// Campos de endereço de entrega. Os `name` batem com o schema de
// `createWebsiteOrder`. Reutilizável pelo admin numa fase futura.

const inputClass =
  'mt-1 w-full rounded-lg border border-venus-100 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-venus-300 focus:ring-2 focus:ring-venus-200'
const labelClass = 'text-xs font-medium text-neutral-600'

export interface AddressDefaults {
  recipientName?: string
  zipCode?: string
  state?: string
  city?: string
  neighborhood?: string
  street?: string
  number?: string
  complement?: string
  reference?: string
  addressPhone?: string
}

export default function AddressFields({ defaults }: { defaults?: AddressDefaults }) {
  const d = defaults ?? {}
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2 block">
        <span className={labelClass}>Destinatário</span>
        <input name="recipientName" defaultValue={d.recipientName} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>CEP</span>
        <input name="zipCode" defaultValue={d.zipCode} required inputMode="numeric" className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Estado (UF)</span>
        <input
          name="state"
          defaultValue={d.state}
          required
          maxLength={2}
          className={`${inputClass} uppercase`}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Cidade</span>
        <input name="city" defaultValue={d.city} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Bairro</span>
        <input name="neighborhood" defaultValue={d.neighborhood} required className={inputClass} />
      </label>

      <label className="block sm:col-span-2">
        <span className={labelClass}>Logradouro</span>
        <input name="street" defaultValue={d.street} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Número</span>
        <input name="number" defaultValue={d.number} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Complemento</span>
        <input name="complement" defaultValue={d.complement} className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Ponto de referência</span>
        <input name="reference" defaultValue={d.reference} className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Telefone do endereço</span>
        <input name="addressPhone" defaultValue={d.addressPhone} inputMode="tel" className={inputClass} />
      </label>
    </div>
  )
}
