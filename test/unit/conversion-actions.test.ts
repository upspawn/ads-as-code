import { describe, expect, test } from 'bun:test'
import type { Resource } from '../../src/core/types.ts'
import type { ConversionActionConfig } from '../../src/google/shared-types.ts'

// ─── Lazy imports ───────────────────────────────────────────

let conversionAction: typeof import('../../src/google/shared-types.ts').conversionAction
let flattenConversionAction: typeof import('../../src/google/flatten-shared.ts').flattenConversionAction
let generateConversionActionFile: typeof import('../../src/google/codegen-shared.ts').generateConversionActionFile
let buildConversionActionOperations: typeof import('../../src/google/apply-shared.ts').buildConversionActionOperations

const load = async () => {
  const types = await import('../../src/google/shared-types.ts')
  conversionAction = types.conversionAction

  const flatten = await import('../../src/google/flatten-shared.ts')
  flattenConversionAction = flatten.flattenConversionAction

  const codegen = await import('../../src/google/codegen-shared.ts')
  generateConversionActionFile = codegen.generateConversionActionFile

  const apply = await import('../../src/google/apply-shared.ts')
  buildConversionActionOperations = apply.buildConversionActionOperations
}

// ─── conversionAction() factory ─────────────────────────────

describe('conversionAction()', () => {
  test('creates a ConversionActionConfig with correct shape', async () => {
    await load()
    const action = conversionAction('Website Signup', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
    })

    expect(action.provider).toBe('google')
    expect(action.kind).toBe('conversion-action')
    expect(action.name).toBe('Website Signup')
    expect(action.type).toBe('webpage')
    expect(action.category).toBe('signup')
    expect(action.counting).toBe('one-per-click')
  })

  test('optional fields are preserved', async () => {
    await load()
    const action = conversionAction('Purchase', {
      type: 'webpage',
      category: 'purchase',
      counting: 'many-per-click',
      value: { default: 25, currency: 'USD', useDynamic: true },
      attribution: 'data-driven',
      lookbackDays: 60,
      primary: false,
    })

    expect(action.value).toEqual({ default: 25, currency: 'USD', useDynamic: true })
    expect(action.attribution).toBe('data-driven')
    expect(action.lookbackDays).toBe(60)
    expect(action.primary).toBe(false)
  })
})

// ─── flattenConversionAction() ──────────────────────────────

describe('flattenConversionAction()', () => {
  test('produces a single conversionAction resource', async () => {
    await load()
    const action = conversionAction('Signup', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
    })
    const resources = flattenConversionAction(action)

    expect(resources).toHaveLength(1)
    expect(resources[0]!.kind).toBe('conversionAction')
    expect(resources[0]!.path).toBe('conversion:signup')
    expect(resources[0]!.properties.name).toBe('Signup')
    expect(resources[0]!.properties.type).toBe('webpage')
  })

  test('includes optional fields when set', async () => {
    await load()
    const action = conversionAction('Purchase', {
      type: 'webpage',
      category: 'purchase',
      counting: 'many-per-click',
      value: { default: 50, currency: 'EUR' },
      attribution: 'data-driven',
      lookbackDays: 90,
      primary: true,
    })
    const resources = flattenConversionAction(action)
    const props = resources[0]!.properties

    expect(props.value).toEqual({ default: 50, currency: 'EUR' })
    expect(props.attribution).toBe('data-driven')
    expect(props.lookbackDays).toBe(90)
    expect(props.primary).toBe(true)
  })

  test('omits optional fields when not set', async () => {
    await load()
    const action = conversionAction('Lead', {
      type: 'webpage',
      category: 'lead',
      counting: 'one-per-click',
    })
    const resources = flattenConversionAction(action)
    const props = resources[0]!.properties

    expect(props).not.toHaveProperty('value')
    expect(props).not.toHaveProperty('attribution')
    expect(props).not.toHaveProperty('lookbackDays')
    expect(props).not.toHaveProperty('primary')
  })
})

// ─── buildConversionActionOperations() ──────────────────────

describe('buildConversionActionOperations()', () => {
  test('produces a single conversion_action create operation', async () => {
    await load()
    const action = conversionAction('Signup', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
    })
    const ops = buildConversionActionOperations('7300967494', action)

    expect(ops).toHaveLength(1)
    expect(ops[0]!.operation).toBe('conversion_action')
    expect(ops[0]!.op).toBe('create')
    expect(ops[0]!.resource.name).toBe('Signup')
  })

  test('maps type and category to API enum values', async () => {
    await load()
    const action = conversionAction('Purchase', {
      type: 'webpage',
      category: 'purchase',
      counting: 'many-per-click',
    })
    const ops = buildConversionActionOperations('7300967494', action)
    const resource = ops[0]!.resource

    expect(resource.type).toBe(6) // WEBPAGE
    expect(resource.category).toBe(2) // PURCHASE
    expect(resource.counting_type).toBe(3) // MANY_PER_CLICK
  })

  test('sets value_settings correctly', async () => {
    await load()
    const action = conversionAction('Signup', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
      value: { default: 10, currency: 'EUR', useDynamic: true },
    })
    const ops = buildConversionActionOperations('7300967494', action)
    const vs = ops[0]!.resource.value_settings as Record<string, unknown>

    expect(vs.default_value).toBe(10)
    expect(vs.currency_code).toBe('EUR')
    expect(vs.always_use_default_value).toBe(false) // useDynamic=true means NOT always use default
  })

  test('sets attribution model correctly', async () => {
    await load()
    const dataDriven = conversionAction('DD', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
      attribution: 'data-driven',
    })
    const lastClick = conversionAction('LC', {
      type: 'webpage',
      category: 'signup',
      counting: 'one-per-click',
      attribution: 'last-click',
    })

    const ddOps = buildConversionActionOperations('7300967494', dataDriven)
    const lcOps = buildConversionActionOperations('7300967494', lastClick)

    const ddAttr = ddOps[0]!.resource.attribution_model_settings as Record<string, unknown>
    const lcAttr = lcOps[0]!.resource.attribution_model_settings as Record<string, unknown>

    expect(ddAttr.attribution_model).toBe(6) // DATA_DRIVEN
    expect(lcAttr.attribution_model).toBe(101) // LAST_CLICK
  })

  test('defaults lookback to 30 days when not specified', async () => {
    await load()
    const action = conversionAction('Test', {
      type: 'webpage',
      category: 'lead',
      counting: 'one-per-click',
    })
    const ops = buildConversionActionOperations('7300967494', action)

    expect(ops[0]!.resource.click_through_lookback_window_days).toBe(30)
  })

  test('defaults primary to true when not specified', async () => {
    await load()
    const action = conversionAction('Test', {
      type: 'webpage',
      category: 'lead',
      counting: 'one-per-click',
    })
    const ops = buildConversionActionOperations('7300967494', action)

    expect(ops[0]!.resource.primary_for_goal).toBe(true)
  })
})

// ─── codegen ─────────────────────────────────────────────

describe('generateConversionActionFile()', () => {
  test('generates valid TypeScript with conversionAction() call', async () => {
    await load()
    const resources: Resource[] = [
      {
        kind: 'conversionAction' as any,
        path: 'conversion:website-signup',
        properties: {
          name: 'Website Signup',
          type: 'webpage',
          category: 'signup',
          counting: 'one-per-click',
          value: { default: 10, currency: 'EUR' },
          attribution: 'data-driven',
        },
      },
    ]

    const code = generateConversionActionFile(resources, 'Website Signup')

    expect(code).toContain("import { conversionAction } from '@upspawn/ads'")
    expect(code).toContain("conversionAction('Website Signup'")
    expect(code).toContain("type: 'webpage'")
    expect(code).toContain("category: 'signup'")
    expect(code).toContain("counting: 'one-per-click'")
    expect(code).toContain("attribution: 'data-driven'")
    expect(code).toContain('export default')
  })
})
