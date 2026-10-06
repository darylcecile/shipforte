export function escapeMarkup(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}
export function wrapCardText(value: string, width: number, maxLines: number) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    for (let start = 0; start < word.length; start += width) {
      const part = word.slice(start, start + width)
      if (current && current.length + part.length + 1 > width) {
        lines.push(current)
        current = ''
      }
      current = current ? `${current} ${part}` : part
    }
  }
  if (current) lines.push(current)
  const clipped = lines.slice(0, maxLines)
  if (lines.length > maxLines) clipped[maxLines - 1] = clipped[maxLines - 1].slice(0, width - 1) + '…'
  return clipped
}
export function socialCardSvg({
  title,
  subtitle,
  label,
  detail,
}: {
  title: string
  subtitle: string
  label: string
  detail: string
}) {
  const lines = wrapCardText(title, 34, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f7f8f2"/>
    <rect x="25" y="25" width="1150" height="580" rx="28" fill="#fff" stroke="#dfe3d6" stroke-width="2"/>
    <path d="M930 0h270v630H930z" fill="#edf1e4"/>
    <circle cx="1110" cy="230" r="170" fill="none" stroke="#d8e1c8" stroke-width="44"/>
    <rect x="970" y="346" width="150" height="150" rx="24" fill="#c65132" transform="rotate(-12 1045 421)"/>
    <path d="M1010 450l66-66m-52 0h52v52" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <g font-family="Atkinson Hyperlegible" font-weight="700">
      <text x="72" y="103" font-size="38" fill="#252c23">shipforte<tspan fill="#c65132">.</tspan></text>
      <text x="72" y="162" font-size="18" letter-spacing="3" fill="#697362">${escapeMarkup(label.toUpperCase())}</text>
      ${lines.map((line, index) => `<text x="72" y="${247 + index * 67}" font-size="52" fill="#252c23">${escapeMarkup(line)}</text>`).join('')}
      <text x="72" y="473" font-size="23" fill="#697362">${escapeMarkup(wrapCardText(subtitle, 58, 1)[0] || '')}</text>
      <path d="M72 510h778" stroke="#e4e7dd" stroke-width="2"/>
      <text x="72" y="556" font-size="22" fill="#c65132">${escapeMarkup(wrapCardText(detail, 58, 1)[0] || '')}</text>
    </g>
  </svg>`
}
