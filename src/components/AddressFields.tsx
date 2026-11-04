'use client'

// Campos de endereço de entrega (controlado). Os `name` batem com o schema de
// `createWebsiteOrder`, então o submit da Server Action continua funcionando.
// O componente pai controla o estado para poder: (a) preencher via ViaCEP e
// (b) usar o CEP para cotar o frete.

const inputClass =
  'mt-2 h-12 w-full border border-ink/20 bg-ivory px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-ink'
const labelClass = 'text-xs font-medium tracking-wide text-ink-soft'

export interface AddressValue {
  recipientName: string
  zipCode: string
  state: string
  city: string
  neighborhood: string
  street: string
  number: string
  complement: string
  reference: string
  addressPhone: string
}

export const EMPTY_ADDRESS: AddressValue = {
  recipientName: '',
  zipCode: '',
  state: '',
  city: '',
  neighborhood: '',
  street: '',
  number: '',
  complement: '',
  reference: '',
  addressPhone: '',
}

interface AddressFieldsProps {
  value: AddressValue
  onChange: (patch: Partial<AddressValue>) => void
  /** Slot logo abaixo do CEP — usado para o status do ViaCEP. */
  zipHint?: React.ReactNode
}

export default function AddressFields({ value, onChange, zipHint }: AddressFieldsProps) {
  const set =
    (field: keyof AddressValue) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [field]: e.target.value })

  return (
    <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
      <label className="sm:col-span-2 block">
        <span className={labelClass}>Destinatário</span>
        <input
          name="recipientName"
          value={value.recipientName}
          onChange={set('recipientName')}
          required
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>CEP</span>
        <input
          name="zipCode"
          value={value.zipCode}
          onChange={set('zipCode')}
          required
          inputMode="numeric"
          autoComplete="postal-code"
          className={inputClass}
        />
        {zipHint}
      </label>

      <label className="block">
        <span className={labelClass}>Estado (UF)</span>
        <input
          name="state"
          value={value.state}
          onChange={set('state')}
          required
          maxLength={2}
          className={`${inputClass} uppercase`}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Cidade</span>
        <input name="city" value={value.city} onChange={set('city')} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Bairro</span>
        <input
          name="neighborhood"
          value={value.neighborhood}
          onChange={set('neighborhood')}
          required
          className={inputClass}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className={labelClass}>Logradouro</span>
        <input
          name="street"
          value={value.street}
          onChange={set('street')}
          required
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Número</span>
        <input
          name="number"
          value={value.number}
          onChange={set('number')}
          required
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Complemento</span>
        <input
          name="complement"
          value={value.complement}
          onChange={set('complement')}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Ponto de referência</span>
        <input
          name="reference"
          value={value.reference}
          onChange={set('reference')}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Telefone do endereço</span>
        <input
          name="addressPhone"
          value={value.addressPhone}
          onChange={set('addressPhone')}
          inputMode="tel"
          className={inputClass}
        />
      </label>
    </div>
  )
}
