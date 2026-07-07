import type { Offer, Merchant } from '../repositories/types'

/**
 * Ofertas KaBuM + Pichau + Terabyte com preços plausíveis 2026.
 * Cada oferta aponta para um `product_id` (FK) e um `variant_id` interno.
 */

export const merchants: Merchant[] = [
  {
    id: 1,
    name: 'KaBuM!',
    slug: 'kabum',
    affiliate_base_url: 'https://www.kabum.com.br/produto/{id}',
    affiliate_param: 'utm_source=reidofps',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    name: 'Pichau',
    slug: 'pichau',
    affiliate_base_url: 'https://www.pichau.com.br/produto/{id}',
    affiliate_param: 'utm_source=reidofps',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 3,
    name: 'Terabyte',
    slug: 'terabyte',
    affiliate_base_url: 'https://www.terabyteshop.com.br/produto/{id}',
    affiliate_param: 'utm_source=reidofps',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
  },
]

export const offers: Offer[] = [
  // CPU
  { id: 1, variant_id: 101, merchant_id: 1, price_brl: 599, in_stock: true, url: 'https://www.kabum.com.br/produto/101', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 2, variant_id: 102, merchant_id: 1, price_brl: 1199, in_stock: true, url: 'https://www.kabum.com.br/produto/102', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 3, variant_id: 103, merchant_id: 1, price_brl: 1749, in_stock: true, url: 'https://www.kabum.com.br/produto/103', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 4, variant_id: 104, merchant_id: 1, price_brl: 2899, in_stock: true, url: 'https://www.kabum.com.br/produto/104', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 5, variant_id: 105, merchant_id: 1, price_brl: 3899, in_stock: true, url: 'https://www.kabum.com.br/produto/105', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 6, variant_id: 106, merchant_id: 1, price_brl: 949, in_stock: true, url: 'https://www.kabum.com.br/produto/106', last_checked_at: '2026-01-15T00:00:00Z' },

  // GPU
  { id: 10, variant_id: 110, merchant_id: 1, price_brl: 1099, in_stock: true, url: 'https://www.kabum.com.br/produto/110', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 11, variant_id: 111, merchant_id: 1, price_brl: 1899, in_stock: true, url: 'https://www.kabum.com.br/produto/111', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 12, variant_id: 112, merchant_id: 1, price_brl: 2599, in_stock: true, url: 'https://www.kabum.com.br/produto/112', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 13, variant_id: 113, merchant_id: 1, price_brl: 2999, in_stock: true, url: 'https://www.kabum.com.br/produto/113', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 14, variant_id: 114, merchant_id: 1, price_brl: 4499, in_stock: true, url: 'https://www.kabum.com.br/produto/114', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 15, variant_id: 115, merchant_id: 1, price_brl: 3899, in_stock: true, url: 'https://www.kabum.com.br/produto/115', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 16, variant_id: 116, merchant_id: 1, price_brl: 5899, in_stock: true, url: 'https://www.kabum.com.br/produto/116', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 17, variant_id: 117, merchant_id: 1, price_brl: 7299, in_stock: true, url: 'https://www.kabum.com.br/produto/117', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 18, variant_id: 118, merchant_id: 1, price_brl: 6899, in_stock: true, url: 'https://www.kabum.com.br/produto/118', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 19, variant_id: 119, merchant_id: 1, price_brl: 14599, in_stock: true, url: 'https://www.kabum.com.br/produto/119', last_checked_at: '2026-01-15T00:00:00Z' },

  // Cases
  { id: 30, variant_id: 130, merchant_id: 1, price_brl: 329, in_stock: true, url: 'https://www.kabum.com.br/produto/130', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 31, variant_id: 131, merchant_id: 1, price_brl: 549, in_stock: true, url: 'https://www.kabum.com.br/produto/131', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 32, variant_id: 132, merchant_id: 1, price_brl: 899, in_stock: true, url: 'https://www.kabum.com.br/produto/132', last_checked_at: '2026-01-15T00:00:00Z' },
  { id: 33, variant_id: 133, merchant_id: 1, price_brl: 1199, in_stock: true, url: 'https://www.kabum.com.br/produto/133', last_checked_at: '2026-01-15T00:00:00Z' },
]

/**
 * Tabela rápida produto_id → melhor oferta.
 * Simplifica o wizard e os build pages.
 */
export const productBestOffer: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
  10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17, 18: 18, 19: 19,
  30: 30, 31: 31, 32: 32, 33: 33,
}

export function getOfferById(id: number): Offer | undefined {
  return offers.find((o) => o.id === id)
}

export function getMerchantById(id: number): Merchant | undefined {
  return merchants.find((m) => m.id === id)
}

export function getBestOfferForProduct(productId: number): Offer | undefined {
  const offerId = productBestOffer[productId]
  if (!offerId) return undefined
  return getOfferById(offerId)
}