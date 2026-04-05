export const TIME_BASED_CAP = 999999999

export function formatQuantity(quantity) {
  if (quantity === null || quantity === undefined) return 'Unlimited'
  if (quantity === TIME_BASED_CAP) return '???'
  return typeof quantity === 'number' ? quantity.toLocaleString() : quantity
}
