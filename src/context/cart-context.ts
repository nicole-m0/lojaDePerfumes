import { createContext } from 'react'
import type { CartItem, Product } from '../types'

export interface CartNotification {
  product: Product
  id: number
}

export interface CartContextValue {
  items: CartItem[]
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  notification: CartNotification | null
  dismissNotification: () => void
}

export const CartContext = createContext<CartContextValue | undefined>(undefined)
