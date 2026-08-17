import { describe, it, expect } from 'vitest'
import { ipInCidr, ipInAllowlist, parseRanges } from '../src/ip'

describe('ipInCidr — IPv4', () => {
  it('matches inside the range', () => {
    expect(ipInCidr('203.0.113.5', '203.0.113.0/24')).toBe(true)
    expect(ipInCidr('203.0.113.5', '203.0.113.0/29')).toBe(true)
  })
  it('rejects outside the range', () => {
    expect(ipInCidr('203.0.114.5', '203.0.113.0/24')).toBe(false)
    expect(ipInCidr('203.0.113.9', '203.0.113.0/29')).toBe(false)
  })
  it('handles /32 and bare addresses', () => {
    expect(ipInCidr('10.0.0.1', '10.0.0.1/32')).toBe(true)
    expect(ipInCidr('10.0.0.1', '10.0.0.2/32')).toBe(false)
    expect(ipInCidr('10.0.0.1', '10.0.0.1')).toBe(true)
  })
  it('/0 matches everything', () => {
    expect(ipInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true)
  })
})

describe('ipInCidr — IPv6', () => {
  it('matches inside the range, incl :: compression', () => {
    expect(ipInCidr('2001:db8:1234::1', '2001:db8:1234::/48')).toBe(true)
    expect(ipInCidr('2001:db8:9999::1', '2001:db8:1234::/48')).toBe(false)
  })
  it('never matches across families', () => {
    expect(ipInCidr('203.0.113.5', '2001:db8::/32')).toBe(false)
    expect(ipInCidr('2001:db8::1', '203.0.113.0/24')).toBe(false)
  })
})

describe('parseRanges / ipInAllowlist', () => {
  it('parses a CSV of CIDRs', () => {
    expect(parseRanges(' 203.0.113.0/24 , 2001:db8::/32 ')).toEqual([
      '203.0.113.0/24',
      '2001:db8::/32',
    ])
    expect(parseRanges('')).toEqual([])
    expect(parseRanges(undefined)).toEqual([])
  })
  it('matches against any range in the list', () => {
    const ranges = ['203.0.113.0/24', '2001:db8::/32']
    expect(ipInAllowlist('203.0.113.7', ranges)).toBe(true)
    expect(ipInAllowlist('2001:db8::5', ranges)).toBe(true)
    expect(ipInAllowlist('8.8.8.8', ranges)).toBe(false)
    expect(ipInAllowlist(undefined, ranges)).toBe(false)
    expect(ipInAllowlist('203.0.113.7', [])).toBe(false)
  })
})
