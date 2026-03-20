// test/unit/reddit-constants.test.ts
import { describe, test, expect } from 'bun:test'
import {
  OBJECTIVE_MAP,
  REVERSE_OBJECTIVE_MAP,
  DEFAULT_OPTIMIZATION,
  STATUS_MAP,
  REVERSE_STATUS_MAP,
  CREATION_ORDER,
  DELETION_ORDER,
} from '../../src/reddit/constants'

describe('reddit constants', () => {
  test('OBJECTIVE_MAP covers all 7 objectives', () => {
    expect(Object.keys(OBJECTIVE_MAP)).toHaveLength(7)
    expect(OBJECTIVE_MAP['traffic']).toBe('TRAFFIC')
    expect(OBJECTIVE_MAP['awareness']).toBe('BRAND_AWARENESS_AND_REACH')
    expect(OBJECTIVE_MAP['leads']).toBe('LEAD_GENERATION')
  })

  test('REVERSE_OBJECTIVE_MAP inverts correctly', () => {
    expect(REVERSE_OBJECTIVE_MAP['TRAFFIC']).toBe('traffic')
    expect(REVERSE_OBJECTIVE_MAP['BRAND_AWARENESS_AND_REACH']).toBe('awareness')
  })

  test('DEFAULT_OPTIMIZATION covers all objectives', () => {
    expect(Object.keys(DEFAULT_OPTIMIZATION)).toHaveLength(7)
    expect(DEFAULT_OPTIMIZATION['traffic']).toBe('LINK_CLICKS')
    expect(DEFAULT_OPTIMIZATION['conversions']).toBe('CONVERSIONS')
  })

  test('STATUS_MAP maps SDK → API', () => {
    expect(STATUS_MAP['enabled']).toBe('ACTIVE')
    expect(STATUS_MAP['paused']).toBe('PAUSED')
  })

  test('REVERSE_STATUS_MAP maps API → SDK', () => {
    expect(REVERSE_STATUS_MAP['ACTIVE']).toBe('enabled')
    expect(REVERSE_STATUS_MAP['PAUSED']).toBe('paused')
  })

  test('CREATION_ORDER is parent-first', () => {
    expect(CREATION_ORDER).toEqual(['campaign', 'adGroup', 'ad'])
  })

  test('DELETION_ORDER is child-first', () => {
    expect(DELETION_ORDER).toEqual(['ad', 'adGroup', 'campaign'])
  })
})
