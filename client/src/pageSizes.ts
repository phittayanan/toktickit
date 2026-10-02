// The page sizes every Ticket list offers (docs/lab-03/api-spec.md §5.1).
export const PAGE_SIZES = [10, 25, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]
