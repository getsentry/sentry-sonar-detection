// Minimal CIDR allowlist matching for IPv4 and IPv6.
// Addresses are normalized to a BigInt within their family and compared by prefix.

type Family = 4 | 6
interface ParsedIp {
  family: Family
  value: bigint
}

function parseIpv4(ip: string): ParsedIp | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    value = (value << 8n) | BigInt(n)
  }
  return { family: 4, value }
}

function parseIpv6(input: string): ParsedIp | null {
  // Strip a zone id if present (e.g. fe80::1%eth0).
  const pct = input.indexOf('%')
  const ip = pct >= 0 ? input.slice(0, pct) : input

  const halves = ip.split('::')
  if (halves.length > 2) return null

  const expand = (s: string): number[] | null => {
    if (s === '') return []
    const out: number[] = []
    for (const seg of s.split(':')) {
      if (seg.includes('.')) {
        // Embedded IPv4 (e.g. ::ffff:1.2.3.4) occupies two 16-bit groups.
        const v4 = parseIpv4(seg)
        if (!v4) return null
        const n = Number(v4.value)
        out.push((n >>> 16) & 0xffff, n & 0xffff)
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null
        out.push(parseInt(seg, 16))
      }
    }
    return out
  }

  const head = expand(halves[0] ?? '')
  const tail = halves.length === 2 ? expand(halves[1] ?? '') : []
  if (head === null || tail === null) return null

  let groups: number[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill(0), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  let value = 0n
  for (const g of groups) value = (value << 16n) | BigInt(g)
  return { family: 6, value }
}

function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim()
  return trimmed.includes(':') ? parseIpv6(trimmed) : parseIpv4(trimmed)
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.lastIndexOf('/')
  const a = parseIp(ip)
  if (!a) return false

  if (slash < 0) {
    const b = parseIp(cidr)
    return !!b && b.family === a.family && b.value === a.value
  }

  const b = parseIp(cidr.slice(0, slash))
  if (!b || b.family !== a.family) return false

  const bits = a.family === 4 ? 32 : 128
  const prefix = Number(cidr.slice(slash + 1))
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return false

  const shift = BigInt(bits - prefix)
  return a.value >> shift === b.value >> shift
}

export function parseRanges(csv: string | undefined | null): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function ipInAllowlist(ip: string | undefined | null, ranges: string[]): boolean {
  if (!ip) return false
  return ranges.some((r) => ipInCidr(ip, r))
}
