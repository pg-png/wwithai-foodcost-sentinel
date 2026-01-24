import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'
const INVOICE_ITEMS_DB = process.env.NOTION_INVOICE_ITEMS_DB || '2ece4eb3-a205-81ea-a7ae-e22b95158dab'

// Price thresholds for anomaly detection
const ANOMALY_THRESHOLDS = {
  maxVariancePct: 500,      // >500% variance is suspicious
  minPrice: 0.001,          // Prices below this are suspicious
  maxPricePerGram: 10,      // >$10/g is suspicious (except saffron)
  maxPricePerKg: 500,       // >$500/kg is suspicious
  maxPricePerL: 200,        // >$200/L is suspicious
}

// Common unit cost ranges by category
const EXPECTED_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  'herbs': { min: 0.01, max: 0.50, unit: 'g' },
  'vegetables': { min: 1, max: 15, unit: 'kg' },
  'meat': { min: 8, max: 50, unit: 'kg' },
  'seafood': { min: 15, max: 80, unit: 'kg' },
  'dairy': { min: 3, max: 20, unit: 'L' },
  'oil': { min: 3, max: 15, unit: 'L' },
  'sauce': { min: 5, max: 30, unit: 'L' },
  'noodles': { min: 2, max: 10, unit: 'kg' },
  'rice': { min: 1, max: 5, unit: 'kg' },
  'tofu': { min: 3, max: 12, unit: 'kg' },
  'eggs': { min: 0.15, max: 0.50, unit: 'whole unit' },
}

interface IngredientData {
  id: string
  name: string
  unitCost: number
  latestPrice: number | null
  perUnit: string
  category: string | null
  priceUpdated: string | null
}

interface InvoiceItemData {
  id: string
  productName: string
  unitPrice: number
  unit: string
  invoiceDate: string | null
}

interface AuditIssue {
  id: string
  ingredientId: string
  ingredientName: string
  type: 'price_anomaly' | 'unit_mismatch' | 'missing_price' | 'duplicate' | 'variance_too_high' | 'suspicious_unit_cost'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  currentValue: string
  suggestedFix: string
  referencePrice?: number
  actualPrice?: number
  variance?: number
}

async function fetchAllIngredients(): Promise<IngredientData[]> {
  const ingredients: IngredientData[] = []
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: INGREDIENTS_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      const name = props['Ingredient Name']?.title?.[0]?.plain_text ||
                   props['Name']?.title?.[0]?.plain_text || ''
      const unitCost = props['Unit Cost']?.number || 0
      const latestPrice = props['Latest Price']?.number ?? null
      const perUnit = props['Per Unit']?.select?.name ||
                      props['Unit Type']?.select?.name || ''
      const category = props['Category']?.select?.name || null
      const priceUpdated = props['Price Updated']?.date?.start || null

      if (name) {
        ingredients.push({
          id: page.id,
          name,
          unitCost,
          latestPrice,
          perUnit,
          category,
          priceUpdated,
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return ingredients
}

async function fetchLatestInvoicePrices(): Promise<Map<string, InvoiceItemData>> {
  const latestPrices = new Map<string, InvoiceItemData>()
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: INVOICE_ITEMS_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      const productName = props['Product Name']?.title?.[0]?.plain_text ||
                         props['Name']?.title?.[0]?.plain_text || ''
      const unitPrice = props['Unit Price']?.number || 0
      const unit = props['Unit']?.select?.name || ''
      const invoiceDate = props['Invoice Date']?.date?.start || null

      if (productName && unitPrice > 0) {
        const key = productName.toLowerCase()
        const existing = latestPrices.get(key)

        // Keep the most recent price
        if (!existing || (invoiceDate && (!existing.invoiceDate || invoiceDate > existing.invoiceDate))) {
          latestPrices.set(key, {
            id: page.id,
            productName,
            unitPrice,
            unit,
            invoiceDate,
          })
        }
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return latestPrices
}

function detectAnomalies(
  ingredients: IngredientData[],
  invoicePrices: Map<string, InvoiceItemData>
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const seenNames = new Map<string, IngredientData>()

  for (const ing of ingredients) {
    const nameLower = ing.name.toLowerCase()

    // Check for duplicates
    if (seenNames.has(nameLower)) {
      const existing = seenNames.get(nameLower)!
      issues.push({
        id: `dup-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'duplicate',
        severity: 'medium',
        description: `Possible duplicate of "${existing.name}"`,
        currentValue: `ID: ${ing.id}`,
        suggestedFix: `Merge with ${existing.name} (ID: ${existing.id})`,
      })
    } else {
      seenNames.set(nameLower, ing)
    }

    // Check for missing price
    if (!ing.unitCost || ing.unitCost === 0) {
      issues.push({
        id: `missing-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'missing_price',
        severity: 'high',
        description: 'No unit cost defined',
        currentValue: '$0',
        suggestedFix: 'Add unit cost from supplier invoice',
      })
      continue
    }

    // Check for suspiciously low prices
    if (ing.unitCost < ANOMALY_THRESHOLDS.minPrice) {
      issues.push({
        id: `low-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'suspicious_unit_cost',
        severity: 'critical',
        description: `Unit cost $${ing.unitCost.toFixed(6)}/${ing.perUnit} is suspiciously low`,
        currentValue: `$${ing.unitCost.toFixed(6)}/${ing.perUnit}`,
        suggestedFix: 'Check if unit is correct (g vs kg, mL vs L)',
      })
    }

    // Check unit-specific thresholds
    if (ing.perUnit === 'g' && ing.unitCost > ANOMALY_THRESHOLDS.maxPricePerGram) {
      issues.push({
        id: `high-g-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'suspicious_unit_cost',
        severity: 'high',
        description: `$${ing.unitCost.toFixed(2)}/g is very high - check if should be per kg`,
        currentValue: `$${ing.unitCost.toFixed(2)}/g`,
        suggestedFix: `Consider changing to $${(ing.unitCost / 1000).toFixed(4)}/g (if price is per kg)`,
      })
    }

    if (ing.perUnit === 'kg' && ing.unitCost > ANOMALY_THRESHOLDS.maxPricePerKg) {
      issues.push({
        id: `high-kg-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'suspicious_unit_cost',
        severity: 'medium',
        description: `$${ing.unitCost.toFixed(2)}/kg is unusually high`,
        currentValue: `$${ing.unitCost.toFixed(2)}/kg`,
        suggestedFix: 'Verify with recent invoices',
      })
    }

    // Check variance against invoice prices
    const invoiceItem = invoicePrices.get(nameLower)
    if (invoiceItem && ing.unitCost > 0) {
      const variance = ((invoiceItem.unitPrice - ing.unitCost) / ing.unitCost) * 100

      if (Math.abs(variance) > ANOMALY_THRESHOLDS.maxVariancePct) {
        const severity = Math.abs(variance) > 1000 ? 'critical' : 'high'
        issues.push({
          id: `variance-${ing.id}`,
          ingredientId: ing.id,
          ingredientName: ing.name,
          type: 'variance_too_high',
          severity,
          description: `${variance > 0 ? '+' : ''}${variance.toFixed(0)}% variance between reference and invoice price`,
          currentValue: `Reference: $${ing.unitCost.toFixed(4)}/${ing.perUnit}`,
          suggestedFix: `Update to invoice price: $${invoiceItem.unitPrice.toFixed(4)}/${invoiceItem.unit}`,
          referencePrice: ing.unitCost,
          actualPrice: invoiceItem.unitPrice,
          variance: variance,
        })
      }
    }

    // Check for unit mismatches with expected ranges
    if (ing.category) {
      const categoryLower = ing.category.toLowerCase()
      for (const [cat, range] of Object.entries(EXPECTED_RANGES)) {
        if (categoryLower.includes(cat) && ing.perUnit === range.unit) {
          if (ing.unitCost < range.min * 0.1 || ing.unitCost > range.max * 10) {
            issues.push({
              id: `range-${ing.id}`,
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'price_anomaly',
              severity: 'medium',
              description: `Price $${ing.unitCost.toFixed(2)}/${ing.perUnit} outside expected range for ${cat} ($${range.min}-$${range.max})`,
              currentValue: `$${ing.unitCost.toFixed(2)}/${ing.perUnit}`,
              suggestedFix: `Expected range: $${range.min}-$${range.max}/${range.unit}`,
            })
          }
        }
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return issues
}

export async function GET() {
  try {
    // Fetch all data in parallel
    const [ingredients, invoicePrices] = await Promise.all([
      fetchAllIngredients(),
      fetchLatestInvoicePrices(),
    ])

    // Run anomaly detection
    const issues = detectAnomalies(ingredients, invoicePrices)

    // Calculate summary stats
    const summary = {
      totalIngredients: ingredients.length,
      ingredientsWithPrice: ingredients.filter(i => i.unitCost > 0).length,
      ingredientsWithoutPrice: ingredients.filter(i => !i.unitCost || i.unitCost === 0).length,
      invoiceItemsAnalyzed: invoicePrices.size,
      totalIssues: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      highIssues: issues.filter(i => i.severity === 'high').length,
      mediumIssues: issues.filter(i => i.severity === 'medium').length,
      lowIssues: issues.filter(i => i.severity === 'low').length,
      issuesByType: {
        price_anomaly: issues.filter(i => i.type === 'price_anomaly').length,
        variance_too_high: issues.filter(i => i.type === 'variance_too_high').length,
        missing_price: issues.filter(i => i.type === 'missing_price').length,
        suspicious_unit_cost: issues.filter(i => i.type === 'suspicious_unit_cost').length,
        duplicate: issues.filter(i => i.type === 'duplicate').length,
        unit_mismatch: issues.filter(i => i.type === 'unit_mismatch').length,
      }
    }

    return NextResponse.json({
      success: true,
      summary,
      issues,
      // Top 5 most critical issues for quick action
      topPriority: issues.slice(0, 10),
    })

  } catch (error: any) {
    console.error('Data audit error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Audit failed' },
      { status: 500 }
    )
  }
}
