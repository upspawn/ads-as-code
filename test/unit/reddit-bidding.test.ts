import { describe, test, expect } from 'bun:test'
import { lowestCost, costCap, manualBid } from '../../src/helpers/reddit-bidding'

describe('reddit bidding helpers', () => {
  test('lowestCost returns LOWEST_COST strategy', () => {
    expect(lowestCost()).toEqual({ type: 'LOWEST_COST' })
  })

  test('costCap returns COST_CAP with amount', () => {
    expect(costCap(500_000)).toEqual({ type: 'COST_CAP', amount: 500_000 })
  })

  test('costCap rejects non-positive amounts', () => {
    expect(() => costCap(0)).toThrow()
    expect(() => costCap(-1)).toThrow()
  })

  test('manualBid returns MANUAL_BID with amount', () => {
    expect(manualBid(150_000)).toEqual({ type: 'MANUAL_BID', amount: 150_000 })
  })

  test('manualBid rejects non-positive amounts', () => {
    expect(() => manualBid(0)).toThrow()
    expect(() => manualBid(-1)).toThrow()
  })
})
