export function normalizeCoverageLabel(label: string | null | undefined): string {
  if (!label) return ''
  return (
    label
      .trim()
      .replace(/\s+/g, ' ')
      // Use tr-TR locale to ensure 'I' lowers to 'ı' and 'İ' lowers to 'i'
      .toLocaleLowerCase('tr-TR')
  )
}
