import { describe, test, expect } from 'bun:test'
import { feed, conversation, automatic } from '../../src/helpers/reddit-placement'

describe('reddit placement helpers', () => {
  test('feed() returns FEED', () => {
    expect(feed()).toBe('FEED')
  })

  test('conversation() returns CONVERSATION', () => {
    expect(conversation()).toBe('CONVERSATION')
  })

  test('automatic() returns ALL', () => {
    expect(automatic()).toBe('ALL')
  })
})
