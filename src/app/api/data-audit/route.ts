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
  invoiceUnit: string | null       // Unit on invoice (box, case, bunch)
  conversionFactor: number | null  // How many base units per invoice unit
  conversionNotes: string | null   // e.g., "12x454g packs"
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
  type: 'price_anomaly' | 'unit_mismatch' | 'missing_price' | 'duplicate' | 'variance_too_high' | 'suspicious_unit_cost' | 'needs_conversion' | 'conversion_mismatch'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  currentValue: string
  suggestedFix: string
  referencePrice?: number
  actualPrice?: number
  variance?: number
  suggestedConversion?: {
    invoiceUnit: string
    factor: number
    calculatedUnitCost: number
    notes: string
  }
}

// Parse product descriptions to extract conversion info (e.g., "12X454G" → 5448g)
function parseConversionFromDescription(description: string): { factor: number; unit: string; notes: string } | null {
  const desc = description.toUpperCase()

  // Pattern: NxWEIGHT (e.g., "12X454G", "6X1KG", "24X500ML")
  const multiPackMatch = desc.match(/(\d+)\s*[Xx]\s*(\d+(?:\.\d+)?)\s*(G|KG|ML|L|OZ|LB)/i)
  if (multiPackMatch) {
    const count = parseInt(multiPackMatch[1])
    const size = parseFloat(multiPackMatch[2])
    const unit = multiPackMatch[3].toUpperCase()

    let totalGrams = 0
    let baseUnit = 'g'

    if (unit === 'G') {
      totalGrams = count * size
      baseUnit = 'g'
    } else if (unit === 'KG') {
      totalGrams = count * size * 1000
      baseUnit = 'g'
    } else if (unit === 'LB' || unit === 'LBS') {
      totalGrams = count * size * 453.592
      baseUnit = 'g'
    } else if (unit === 'OZ') {
      totalGrams = count * size * 28.3495
      baseUnit = 'g'
    } else if (unit === 'ML') {
      return { factor: count * size, unit: 'mL', notes: `${count}x${size}mL` }
    } else if (unit === 'L') {
      return { factor: count * size * 1000, unit: 'mL', notes: `${count}x${size}L` }
    }

    return { factor: totalGrams, unit: baseUnit, notes: `${count}x${size}${unit}` }
  }

  // Pattern: WEIGHT per unit (e.g., "5LBS", "2KG", "500G")
  const singleWeightMatch = desc.match(/(\d+(?:\.\d+)?)\s*(G|KG|ML|L|OZ|LB|LBS)/i)
  if (singleWeightMatch) {
    const size = parseFloat(singleWeightMatch[1])
    const unit = singleWeightMatch[2].toUpperCase()

    if (unit === 'G') return { factor: size, unit: 'g', notes: `${size}g` }
    if (unit === 'KG') return { factor: size * 1000, unit: 'g', notes: `${size}kg` }
    if (unit === 'LB' || unit === 'LBS') return { factor: size * 453.592, unit: 'g', notes: `${size}lbs` }
    if (unit === 'OZ') return { factor: size * 28.3495, unit: 'g', notes: `${size}oz` }
    if (unit === 'ML') return { factor: size, unit: 'mL', notes: `${size}mL` }
    if (unit === 'L') return { factor: size * 1000, unit: 'mL', notes: `${size}L` }
  }

  // Pattern: SIZE N (e.g., "SIZE 200" for limes = ~200 count)
  const sizeCountMatch = desc.match(/SIZE\s*(\d+)/i)
  if (sizeCountMatch) {
    return { factor: parseInt(sizeCountMatch[1]), unit: 'whole unit', notes: `~${sizeCountMatch[1]} count` }
  }

  // Pattern: NxNUN (e.g., "15X12UN" = 180 units)
  const unitCountMatch = desc.match(/(\d+)\s*[Xx]\s*(\d+)\s*UN/i)
  if (unitCountMatch) {
    const total = parseInt(unitCountMatch[1]) * parseInt(unitCountMatch[2])
    return { factor: total, unit: 'whole unit', notes: `${unitCountMatch[1]}x${unitCountMatch[2]} units = ${total}` }
  }

  return null
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

      // New conversion fields
      const invoiceUnit = props['Invoice Unit']?.select?.name || null
      const conversionFactor = props['Conversion Factor']?.number ?? null
      const conversionNotes = props['Conversion Notes']?.rich_text?.[0]?.plain_text || null

      if (name) {
        ingredients.push({
          id: page.id,
          name,
          unitCost,
          latestPrice,
          perUnit,
          category,
          priceUpdated,
          invoiceUnit,
          conversionFactor,
          conversionNotes,
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

    // Check variance against invoice prices WITH conversion factor support
    const invoiceItem = invoicePrices.get(nameLower)
    if (invoiceItem && ing.unitCost > 0) {
      // Check if we have a conversion factor defined
      if (ing.conversionFactor && ing.conversionFactor > 0) {
        // Apply conversion: invoice price / conversion factor = price per base unit
        const convertedUnitPrice = invoiceItem.unitPrice / ing.conversionFactor
        const variance = ((convertedUnitPrice - ing.unitCost) / ing.unitCost) * 100

        if (Math.abs(variance) > 20) { // 20% tolerance after conversion
          issues.push({
            id: `conversion-variance-${ing.id}`,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'conversion_mismatch',
            severity: Math.abs(variance) > 50 ? 'high' : 'medium',
            description: `${variance > 0 ? '+' : ''}${variance.toFixed(1)}% variance after applying conversion (${ing.conversionFactor} ${ing.perUnit}/${ing.invoiceUnit})`,
            currentValue: `Reference: $${ing.unitCost.toFixed(4)}/${ing.perUnit}, Converted: $${convertedUnitPrice.toFixed(4)}/${ing.perUnit}`,
            suggestedFix: `Verify conversion factor or update unit cost to $${convertedUnitPrice.toFixed(4)}/${ing.perUnit}`,
            referencePrice: ing.unitCost,
            actualPrice: convertedUnitPrice,
            variance: variance,
          })
        }
      } else {
        // No conversion factor - check if units differ and suggest one
        const invoiceUnitLower = invoiceItem.unit?.toLowerCase() || ''
        const refUnitLower = ing.perUnit?.toLowerCase() || ''
        const isUnitMismatch = invoiceUnitLower !== refUnitLower &&
                              ['box', 'case', 'bunch', 'bag', 'each', 'pack'].includes(invoiceUnitLower)

        if (isUnitMismatch) {
          // Try to parse conversion from product name
          const parsedConversion = parseConversionFromDescription(invoiceItem.productName)

          if (parsedConversion) {
            // Calculate what the unit cost would be with this conversion
            const calculatedUnitCost = invoiceItem.unitPrice / parsedConversion.factor
            const variance = ((calculatedUnitCost - ing.unitCost) / ing.unitCost) * 100

            issues.push({
              id: `needs-conversion-${ing.id}`,
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'needs_conversion',
              severity: 'info',
              description: `Unit mismatch detected: invoice is per ${invoiceItem.unit}, reference is per ${ing.perUnit}. Auto-detected conversion available.`,
              currentValue: `Invoice: $${invoiceItem.unitPrice.toFixed(2)}/${invoiceItem.unit} | Reference: $${ing.unitCost.toFixed(4)}/${ing.perUnit}`,
              suggestedFix: `Set Conversion Factor = ${parsedConversion.factor.toFixed(0)} (${parsedConversion.notes}) → $${calculatedUnitCost.toFixed(4)}/${parsedConversion.unit}`,
              referencePrice: ing.unitCost,
              actualPrice: invoiceItem.unitPrice,
              variance: variance,
              suggestedConversion: {
                invoiceUnit: invoiceItem.unit,
                factor: parsedConversion.factor,
                calculatedUnitCost: calculatedUnitCost,
                notes: parsedConversion.notes,
              }
            })
          } else {
            // Can't auto-detect, flag for manual review
            const rawVariance = ((invoiceItem.unitPrice - ing.unitCost) / ing.unitCost) * 100
            issues.push({
              id: `variance-${ing.id}`,
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'unit_mismatch',
              severity: 'high',
              description: `Unit mismatch: invoice is per ${invoiceItem.unit}, reference is per ${ing.perUnit}. Manual conversion needed.`,
              currentValue: `Invoice: $${invoiceItem.unitPrice.toFixed(2)}/${invoiceItem.unit} | Reference: $${ing.unitCost.toFixed(4)}/${ing.perUnit}`,
              suggestedFix: `Add Invoice Unit = "${invoiceItem.unit}" and Conversion Factor (${ing.perUnit} per ${invoiceItem.unit})`,
              referencePrice: ing.unitCost,
              actualPrice: invoiceItem.unitPrice,
              variance: rawVariance,
            })
          }
        } else {
          // Same units or simple comparison
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
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  issues.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5))

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
        needs_conversion: issues.filter(i => i.type === 'needs_conversion').length,
        conversion_mismatch: issues.filter(i => i.type === 'conversion_mismatch').length,
      },
      ingredientsWithConversion: ingredients.filter(i => i.conversionFactor && i.conversionFactor > 0).length,
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
