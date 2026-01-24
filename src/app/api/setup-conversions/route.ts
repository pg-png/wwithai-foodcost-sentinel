import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'
const INVOICE_ITEMS_DB = process.env.NOTION_INVOICE_ITEMS_DB || '2ece4eb3-a205-81ea-a7ae-e22b95158dab'

// ============ KNOWN CONVERSIONS DATABASE ============
// Maps common product patterns to conversion factors

interface ConversionRule {
  pattern: RegExp
  invoiceUnit: string
  getConversion: (match: RegExpMatchArray) => { factor: number; notes: string; baseUnit: string }
}

const CONVERSION_RULES: ConversionRule[] = [
  // Pattern: NxWEIGHT (e.g., "12X454G", "6X1KG", "24X500ML")
  {
    pattern: /(\d+)\s*[Xx]\s*(\d+(?:\.\d+)?)\s*(G|KG|ML|L|OZ|LB|LBS)\b/i,
    invoiceUnit: 'box',
    getConversion: (m) => {
      const count = parseInt(m[1])
      const size = parseFloat(m[2])
      const unit = m[3].toUpperCase()

      if (unit === 'G') return { factor: count * size, notes: `${count}x${size}g`, baseUnit: 'g' }
      if (unit === 'KG') return { factor: count * size * 1000, notes: `${count}x${size}kg`, baseUnit: 'g' }
      if (unit === 'LB' || unit === 'LBS') return { factor: count * size * 453.592, notes: `${count}x${size}lbs`, baseUnit: 'g' }
      if (unit === 'OZ') return { factor: count * size * 28.3495, notes: `${count}x${size}oz`, baseUnit: 'g' }
      if (unit === 'ML') return { factor: count * size, notes: `${count}x${size}mL`, baseUnit: 'mL' }
      if (unit === 'L') return { factor: count * size * 1000, notes: `${count}x${size}L`, baseUnit: 'mL' }
      return { factor: count * size, notes: `${count}x${size}${unit}`, baseUnit: 'g' }
    }
  },
  // Pattern: NxNUN (e.g., "15X12UN" = 180 units)
  {
    pattern: /(\d+)\s*[Xx]\s*(\d+)\s*UN\b/i,
    invoiceUnit: 'box',
    getConversion: (m) => {
      const total = parseInt(m[1]) * parseInt(m[2])
      return { factor: total, notes: `${m[1]}x${m[2]} units`, baseUnit: 'whole unit' }
    }
  },
  // Pattern: (NLBS) or (NKG) - weight in parentheses
  {
    pattern: /\((\d+(?:\.\d+)?)\s*(LB|LBS|KG|G|OZ)\)/i,
    invoiceUnit: 'bag',
    getConversion: (m) => {
      const size = parseFloat(m[1])
      const unit = m[2].toUpperCase()

      if (unit === 'G') return { factor: size, notes: `${size}g bag`, baseUnit: 'g' }
      if (unit === 'KG') return { factor: size * 1000, notes: `${size}kg bag`, baseUnit: 'g' }
      if (unit === 'LB' || unit === 'LBS') return { factor: size * 453.592, notes: `${size}lbs bag`, baseUnit: 'g' }
      if (unit === 'OZ') return { factor: size * 28.3495, notes: `${size}oz bag`, baseUnit: 'g' }
      return { factor: size, notes: `${size}${unit}`, baseUnit: 'g' }
    }
  },
  // Pattern: SIZE N (for produce like limes = count per box)
  {
    pattern: /SIZE\s*(\d+)/i,
    invoiceUnit: 'box',
    getConversion: (m) => ({ factor: parseInt(m[1]), notes: `~${m[1]} count per box`, baseUnit: 'whole unit' })
  },
  // Pattern: standalone weight like "5KG" or "500G"
  {
    pattern: /\b(\d+(?:\.\d+)?)\s*(KG|G|LB|LBS|OZ|ML|L)\b/i,
    invoiceUnit: 'bag',
    getConversion: (m) => {
      const size = parseFloat(m[1])
      const unit = m[2].toUpperCase()

      if (unit === 'G') return { factor: size, notes: `${size}g`, baseUnit: 'g' }
      if (unit === 'KG') return { factor: size * 1000, notes: `${size}kg`, baseUnit: 'g' }
      if (unit === 'LB' || unit === 'LBS') return { factor: size * 453.592, notes: `${size}lbs`, baseUnit: 'g' }
      if (unit === 'OZ') return { factor: size * 28.3495, notes: `${size}oz`, baseUnit: 'g' }
      if (unit === 'ML') return { factor: size, notes: `${size}mL`, baseUnit: 'mL' }
      if (unit === 'L') return { factor: size * 1000, notes: `${size}L`, baseUnit: 'mL' }
      return { factor: size, notes: `${size}${unit}`, baseUnit: 'g' }
    }
  },
]

// Known product-specific conversions (for items without weight in name)
const KNOWN_PRODUCT_CONVERSIONS: Record<string, { invoiceUnit: string; factor: number; notes: string; baseUnit: string }> = {
  // Herbs - typically sold as bunches
  'mint': { invoiceUnit: 'bunch', factor: 30, notes: '~30g per bunch', baseUnit: 'g' },
  'basil': { invoiceUnit: 'bunch', factor: 30, notes: '~30g per bunch', baseUnit: 'g' },
  'cilantro': { invoiceUnit: 'bunch', factor: 40, notes: '~40g per bunch', baseUnit: 'g' },
  'coriander': { invoiceUnit: 'bunch', factor: 40, notes: '~40g per bunch', baseUnit: 'g' },
  'parsley': { invoiceUnit: 'bunch', factor: 50, notes: '~50g per bunch', baseUnit: 'g' },
  'green onion': { invoiceUnit: 'bunch', factor: 100, notes: '~100g per bunch', baseUnit: 'g' },
  'scallion': { invoiceUnit: 'bunch', factor: 100, notes: '~100g per bunch', baseUnit: 'g' },
  'thai basil': { invoiceUnit: 'bunch', factor: 30, notes: '~30g per bunch', baseUnit: 'g' },
  'lemongrass': { invoiceUnit: 'bunch', factor: 150, notes: '~150g per bunch', baseUnit: 'g' },

  // Vegetables - typical box sizes
  'cauliflower': { invoiceUnit: 'box', factor: 7000, notes: '~7kg per box', baseUnit: 'g' },
  'broccoli': { invoiceUnit: 'box', factor: 6000, notes: '~6kg per box', baseUnit: 'g' },
  'cabbage': { invoiceUnit: 'box', factor: 15000, notes: '~15kg per box', baseUnit: 'g' },
  'nappa': { invoiceUnit: 'box', factor: 12000, notes: '~12kg per box', baseUnit: 'g' },
  'bok choy': { invoiceUnit: 'box', factor: 5000, notes: '~5kg per box', baseUnit: 'g' },
  'gai lan': { invoiceUnit: 'bunch', factor: 300, notes: '~300g per bunch', baseUnit: 'g' },

  // Fruits
  'lime': { invoiceUnit: 'box', factor: 200, notes: '~200 count per box', baseUnit: 'whole unit' },
  'lemon': { invoiceUnit: 'box', factor: 150, notes: '~150 count per box', baseUnit: 'whole unit' },

  // Proteins
  'egg': { invoiceUnit: 'case', factor: 180, notes: '15 dozen (180 eggs)', baseUnit: 'whole unit' },
  'large egg': { invoiceUnit: 'case', factor: 180, notes: '15 dozen (180 eggs)', baseUnit: 'whole unit' },
}

// Fuzzy matching helpers
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1]
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fresh|frozen|dried|organic|natural|premium|quality|grade|a|b|c)\b/g, '')
    .replace(/\b(\d+x\d+[a-z]*|\d+[a-z]+)\b/gi, '') // Remove weight specs
    .replace(/\s+/g, ' ')
    .trim()
}

function findBestIngredientMatch(
  productName: string,
  ingredients: { id: string; name: string; perUnit: string }[]
): { ingredient: { id: string; name: string; perUnit: string } | null; confidence: number } {
  const normalizedProduct = normalizeProductName(productName)
  const productWords = normalizedProduct.split(' ').filter(w => w.length > 2)

  let bestMatch: { id: string; name: string; perUnit: string } | null = null
  let bestScore = 0

  for (const ing of ingredients) {
    const normalizedIng = normalizeProductName(ing.name)

    // Exact match
    if (normalizedProduct === normalizedIng || normalizedProduct.includes(normalizedIng) || normalizedIng.includes(normalizedProduct)) {
      const score = 1.0
      if (score > bestScore) { bestScore = score; bestMatch = ing }
      continue
    }

    // Word overlap
    const ingWords = normalizedIng.split(' ').filter(w => w.length > 2)
    const matchingWords = productWords.filter(pw =>
      ingWords.some(iw => iw === pw || levenshteinDistance(iw, pw) <= 2)
    )
    const overlapScore = matchingWords.length / Math.max(productWords.length, ingWords.length)

    if (overlapScore > bestScore) { bestScore = overlapScore; bestMatch = ing }

    // Levenshtein on full string
    const distance = levenshteinDistance(normalizedProduct, normalizedIng)
    const maxLen = Math.max(normalizedProduct.length, normalizedIng.length)
    const levScore = 1 - (distance / maxLen)

    if (levScore > bestScore) { bestScore = levScore; bestMatch = ing }
  }

  return { ingredient: bestMatch, confidence: bestScore }
}

// Parse conversion from product description
function parseConversionFromProduct(productName: string, invoiceUnit: string): { invoiceUnit: string; factor: number; notes: string; baseUnit: string } | null {
  // Try rule-based patterns first
  for (const rule of CONVERSION_RULES) {
    const match = productName.match(rule.pattern)
    if (match) {
      const conversion = rule.getConversion(match)
      return { invoiceUnit: invoiceUnit || rule.invoiceUnit, ...conversion }
    }
  }

  // Try known product conversions
  const normalizedName = normalizeProductName(productName)
  for (const [key, conversion] of Object.entries(KNOWN_PRODUCT_CONVERSIONS)) {
    if (normalizedName.includes(key)) {
      return conversion
    }
  }

  return null
}

// Fetch all ingredients
async function fetchIngredients() {
  const ingredients: any[] = []
  let hasMore = true
  let cursor: string | undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: INGREDIENTS_DB,
      page_size: 100,
      start_cursor: cursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      ingredients.push({
        id: page.id,
        name: props['Ingredient Name']?.title?.[0]?.plain_text || props['Name']?.title?.[0]?.plain_text || '',
        unitCost: props['Unit Cost']?.number || 0,
        perUnit: props['Per Unit']?.select?.name || props['Unit Type']?.select?.name || '',
        category: props['Category']?.select?.name || null,
        invoiceUnit: props['Invoice Unit']?.select?.name || null,
        conversionFactor: props['Conversion Factor']?.number || null,
        conversionNotes: props['Conversion Notes']?.rich_text?.[0]?.plain_text || null,
      })
    }

    hasMore = response.has_more
    cursor = response.next_cursor
  }

  return ingredients
}

// Fetch all invoice items
async function fetchInvoiceItems() {
  const items: any[] = []
  let hasMore = true
  let cursor: string | undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: INVOICE_ITEMS_DB,
      page_size: 100,
      start_cursor: cursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      items.push({
        id: page.id,
        productName: props['Product Name']?.title?.[0]?.plain_text || props['Name']?.title?.[0]?.plain_text || '',
        unitPrice: props['Unit Price']?.number || 0,
        unit: props['Unit']?.select?.name || '',
        invoiceDate: props['Invoice Date']?.date?.start || null,
      })
    }

    hasMore = response.has_more
    cursor = response.next_cursor
  }

  return items
}

// Update ingredient with conversion
async function updateIngredientConversion(
  ingredientId: string,
  invoiceUnit: string,
  factor: number,
  notes: string,
  recalculateUnitCost: boolean,
  invoicePrice?: number,
  baseUnit?: string
) {
  const properties: any = {}

  // Try to set Invoice Unit - if field doesn't exist, this will be ignored
  try {
    properties['Invoice Unit'] = { select: { name: invoiceUnit } }
  } catch (e) {
    // Field might not exist yet
  }

  // Try to set Conversion Factor
  try {
    properties['Conversion Factor'] = { number: factor }
  } catch (e) {}

  // Try to set Conversion Notes
  try {
    properties['Conversion Notes'] = {
      rich_text: [{ type: 'text', text: { content: notes } }]
    }
  } catch (e) {}

  // Recalculate unit cost if requested
  if (recalculateUnitCost && invoicePrice && factor > 0) {
    const newUnitCost = invoicePrice / factor
    properties['Unit Cost'] = { number: newUnitCost }
    properties['Latest Price'] = { number: invoicePrice }
    properties['Price Updated'] = { date: { start: new Date().toISOString().split('T')[0] } }
  }

  await notion.pages.update({
    page_id: ingredientId,
    properties,
  })

  return properties
}

// GET: Analyze and suggest conversions
export async function GET() {
  try {
    const [ingredients, invoiceItems] = await Promise.all([
      fetchIngredients(),
      fetchInvoiceItems(),
    ])

    const suggestions: any[] = []
    const alreadyConfigured: any[] = []
    const noMatchFound: any[] = []

    // Group invoice items by product (keep latest price)
    const latestPrices = new Map<string, any>()
    for (const item of invoiceItems) {
      const key = item.productName.toLowerCase()
      const existing = latestPrices.get(key)
      if (!existing || (item.invoiceDate && (!existing.invoiceDate || item.invoiceDate > existing.invoiceDate))) {
        latestPrices.set(key, item)
      }
    }

    // For each invoice item, find matching ingredient and suggest conversion
    for (const [, item] of latestPrices) {
      const { ingredient, confidence } = findBestIngredientMatch(item.productName, ingredients)

      if (!ingredient || confidence < 0.4) {
        noMatchFound.push({
          invoiceItem: item.productName,
          unit: item.unit,
          price: item.unitPrice,
          bestMatch: ingredient?.name || null,
          confidence,
        })
        continue
      }

      // Check if already configured
      if (ingredient.conversionFactor && ingredient.conversionFactor > 0) {
        alreadyConfigured.push({
          ingredient: ingredient.name,
          invoiceItem: item.productName,
          invoiceUnit: ingredient.invoiceUnit,
          factor: ingredient.conversionFactor,
          notes: ingredient.conversionNotes,
        })
        continue
      }

      // Try to parse conversion
      const conversion = parseConversionFromProduct(item.productName, item.unit)

      if (conversion) {
        const calculatedUnitCost = item.unitPrice / conversion.factor
        suggestions.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          invoiceItem: item.productName,
          invoicePrice: item.unitPrice,
          invoiceUnit: item.unit || conversion.invoiceUnit,
          currentUnitCost: ingredient.unitCost,
          suggestedConversion: conversion,
          calculatedUnitCost,
          confidence,
          autoApply: confidence >= 0.7, // High confidence = safe to auto-apply
        })
      } else {
        // No conversion pattern found, but we have a match
        suggestions.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          invoiceItem: item.productName,
          invoicePrice: item.unitPrice,
          invoiceUnit: item.unit,
          currentUnitCost: ingredient.unitCost,
          suggestedConversion: null,
          calculatedUnitCost: null,
          confidence,
          autoApply: false,
          needsManualConversion: true,
        })
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoiceItems: latestPrices.size,
        suggestionsFound: suggestions.length,
        alreadyConfigured: alreadyConfigured.length,
        noMatchFound: noMatchFound.length,
        autoApplyable: suggestions.filter(s => s.autoApply).length,
        needsManual: suggestions.filter(s => s.needsManualConversion).length,
      },
      suggestions,
      alreadyConfigured,
      noMatchFound,
    })

  } catch (error: any) {
    console.error('Setup conversions error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Apply suggested conversions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { applyAll, ingredientIds, recalculateUnitCosts } = body as {
      applyAll?: boolean
      ingredientIds?: string[]
      recalculateUnitCosts?: boolean
    }

    // First get the suggestions
    const [ingredients, invoiceItems] = await Promise.all([
      fetchIngredients(),
      fetchInvoiceItems(),
    ])

    // Group invoice items by product
    const latestPrices = new Map<string, any>()
    for (const item of invoiceItems) {
      const key = item.productName.toLowerCase()
      const existing = latestPrices.get(key)
      if (!existing || (item.invoiceDate && (!existing.invoiceDate || item.invoiceDate > existing.invoiceDate))) {
        latestPrices.set(key, item)
      }
    }

    const results: any[] = []
    const errors: any[] = []

    for (const [, item] of latestPrices) {
      const { ingredient, confidence } = findBestIngredientMatch(item.productName, ingredients)

      if (!ingredient || confidence < 0.4) continue
      if (ingredient.conversionFactor && ingredient.conversionFactor > 0) continue

      // Filter by ingredientIds if provided
      if (ingredientIds && !ingredientIds.includes(ingredient.id)) continue

      // Only auto-apply if confidence is high enough
      if (!applyAll && confidence < 0.7) continue

      const conversion = parseConversionFromProduct(item.productName, item.unit)
      if (!conversion) continue

      try {
        await updateIngredientConversion(
          ingredient.id,
          item.unit || conversion.invoiceUnit,
          conversion.factor,
          conversion.notes,
          recalculateUnitCosts ?? true,
          item.unitPrice,
          conversion.baseUnit
        )

        results.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          invoiceItem: item.productName,
          conversionApplied: conversion,
          newUnitCost: item.unitPrice / conversion.factor,
        })
      } catch (err: any) {
        errors.push({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      applied: results.length,
      errors: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error: any) {
    console.error('Apply conversions error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT: Add a known product conversion rule
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { productKeyword, invoiceUnit, factor, notes, baseUnit } = body

    if (!productKeyword || !invoiceUnit || !factor) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // This would normally save to a database, but for now we'll just apply it
    // to matching ingredients
    const ingredients = await fetchIngredients()
    const keyword = productKeyword.toLowerCase()

    const updated: any[] = []
    for (const ing of ingredients) {
      if (ing.name.toLowerCase().includes(keyword)) {
        try {
          await updateIngredientConversion(
            ing.id,
            invoiceUnit,
            factor,
            notes || `${factor} ${baseUnit || 'units'} per ${invoiceUnit}`,
            false
          )
          updated.push({ id: ing.id, name: ing.name })
        } catch (e) {}
      }
    }

    return NextResponse.json({
      success: true,
      message: `Applied conversion to ${updated.length} ingredients matching "${productKeyword}"`,
      updated,
    })

  } catch (error: any) {
    console.error('Add conversion rule error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
