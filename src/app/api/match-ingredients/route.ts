import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'
const INVOICE_ITEMS_DB = process.env.NOTION_INVOICE_ITEMS_DB || '2ece4eb3-a205-81ea-a7ae-e22b95158dab'

interface Ingredient {
  id: string
  name: string
  unitCost: number
  perUnit: string
  latestPrice: number | null
  priceUpdated: string | null
}

interface InvoiceItem {
  id: string
  productName: string
  unitPrice: number
  unit: string
  invoiceDate: string
}

interface MatchResult {
  invoiceItem: InvoiceItem
  matchedIngredient: Ingredient | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  needsClarification: boolean
  possibleMatches: Ingredient[]
  aiSuggestion?: string
}

// Fetch all ingredients from Notion
async function fetchIngredients(): Promise<Ingredient[]> {
  const ingredients: Ingredient[] = []
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

      const name = props['Ingredient Name']?.title?.[0]?.plain_text || ''
      const unitCost = props['Unit Cost']?.number || 0
      const perUnit = props['Per Unit']?.select?.name || ''
      const latestPrice = props['Latest Price']?.number || null
      const priceUpdated = props['Price Updated']?.date?.start || null

      if (name) {
        ingredients.push({
          id: page.id,
          name,
          unitCost,
          perUnit,
          latestPrice,
          priceUpdated,
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return ingredients
}

// Fetch recent unmatched invoice items
async function fetchRecentInvoiceItems(limit: number = 50): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = []

  const response: any = await notion.databases.query({
    database_id: INVOICE_ITEMS_DB,
    page_size: limit,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  })

  for (const page of response.results) {
    const props = (page as any).properties

    const productName = props['Product Name']?.title?.[0]?.plain_text ||
                        props['Name']?.title?.[0]?.plain_text || ''
    const unitPrice = props['Unit Price']?.number || 0
    const unit = props['Unit']?.select?.name || ''

    let invoiceDate = ''
    if (props['Invoice Date']?.date?.start) {
      invoiceDate = props['Invoice Date'].date.start
    } else if ((page as any).created_time) {
      invoiceDate = (page as any).created_time.split('T')[0]
    }

    if (productName && unitPrice > 0) {
      items.push({
        id: page.id,
        productName,
        unitPrice,
        unit,
        invoiceDate,
      })
    }
  }

  return items
}

// Normalize string for matching
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Calculate similarity score between two strings
function similarityScore(a: string, b: string): number {
  const aNorm = normalize(a)
  const bNorm = normalize(b)

  // Exact match
  if (aNorm === bNorm) return 1.0

  // One contains the other
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.8

  // Word-based matching
  const aWords = aNorm.split(' ')
  const bWords = bNorm.split(' ')

  let matchedWords = 0
  for (const aWord of aWords) {
    if (aWord.length < 3) continue
    for (const bWord of bWords) {
      if (bWord.length < 3) continue
      if (aWord === bWord || aWord.includes(bWord) || bWord.includes(aWord)) {
        matchedWords++
        break
      }
    }
  }

  const totalSignificantWords = Math.max(
    aWords.filter(w => w.length >= 3).length,
    bWords.filter(w => w.length >= 3).length
  )

  if (totalSignificantWords === 0) return 0

  return matchedWords / totalSignificantWords * 0.7
}

// Find best matches for an invoice item
function findMatches(item: InvoiceItem, ingredients: Ingredient[]): {
  best: Ingredient | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  possibleMatches: Ingredient[]
} {
  const scored = ingredients.map(ing => ({
    ingredient: ing,
    score: similarityScore(item.productName, ing.name)
  }))

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const topMatches = scored.filter(s => s.score >= 0.3).slice(0, 5)
  const best = topMatches[0]

  if (!best || best.score < 0.3) {
    return { best: null, confidence: 'none', possibleMatches: [] }
  }

  let confidence: 'high' | 'medium' | 'low'
  if (best.score >= 0.9) {
    confidence = 'high'
  } else if (best.score >= 0.6) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  return {
    best: best.ingredient,
    confidence,
    possibleMatches: topMatches.map(m => m.ingredient)
  }
}

// Use AI to suggest best match (when API key available)
async function getAISuggestion(
  invoiceItem: InvoiceItem,
  possibleMatches: Ingredient[]
): Promise<string | undefined> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey || possibleMatches.length === 0) return undefined

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Match this invoice item to the best ingredient from the list.

Invoice item: "${invoiceItem.productName}" (${invoiceItem.unit}, $${invoiceItem.unitPrice})

Possible ingredients:
${possibleMatches.map((m, i) => `${i + 1}. "${m.name}" (${m.perUnit}, $${m.unitCost})`).join('\n')}

Reply with ONLY the number (1-${possibleMatches.length}) of the best match, or "0" if none match well. Add a brief reason after a dash.
Example: "1 - Same product, different packaging size"`
        }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.content?.[0]?.text || undefined
    }
  } catch (error) {
    console.error('AI suggestion error:', error)
  }

  return undefined
}

// Update ingredient with latest price
async function updateIngredientPrice(
  ingredientId: string,
  newPrice: number,
  invoiceDate: string
): Promise<boolean> {
  try {
    await notion.pages.update({
      page_id: ingredientId,
      properties: {
        'Latest Price': { number: newPrice },
        'Price Updated': { date: { start: invoiceDate } },
      },
    })
    return true
  } catch (error) {
    console.error('Failed to update ingredient price:', error)
    return false
  }
}

// GET: Analyze recent invoice items and find matches
export async function GET() {
  try {
    const [ingredients, invoiceItems] = await Promise.all([
      fetchIngredients(),
      fetchRecentInvoiceItems(30)
    ])

    const results: MatchResult[] = []
    const needsClarification: MatchResult[] = []
    const autoMatched: MatchResult[] = []

    for (const item of invoiceItems) {
      const { best, confidence, possibleMatches } = findMatches(item, ingredients)

      const result: MatchResult = {
        invoiceItem: item,
        matchedIngredient: confidence === 'high' ? best : null,
        confidence,
        needsClarification: confidence === 'low' || confidence === 'medium',
        possibleMatches,
      }

      // Get AI suggestion for ambiguous matches
      if (result.needsClarification && possibleMatches.length > 0) {
        result.aiSuggestion = await getAISuggestion(item, possibleMatches)
      }

      results.push(result)

      if (result.needsClarification) {
        needsClarification.push(result)
      } else if (confidence === 'high') {
        autoMatched.push(result)
      }
    }

    // Calculate price changes for auto-matched items
    const priceChanges = autoMatched
      .filter(r => r.matchedIngredient && r.matchedIngredient.unitCost > 0)
      .map(r => {
        const ing = r.matchedIngredient!
        const item = r.invoiceItem
        const variance = item.unitPrice - ing.unitCost
        const variancePct = (variance / ing.unitCost) * 100

        return {
          ingredientId: ing.id,
          ingredientName: ing.name,
          referencePrice: ing.unitCost,
          latestPrice: item.unitPrice,
          variance,
          variancePct,
          invoiceDate: item.invoiceDate,
          unit: ing.perUnit,
        }
      })
      .filter(pc => Math.abs(pc.variancePct) >= 1) // Only show 1%+ changes

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoiceItems: invoiceItems.length,
        autoMatched: autoMatched.length,
        needsClarification: needsClarification.length,
        noMatch: results.filter(r => r.confidence === 'none').length,
        priceChangesDetected: priceChanges.length,
      },
      priceChanges: priceChanges.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct)),
      needsClarification: needsClarification.slice(0, 20),
      ingredients: ingredients.length,
    })

  } catch (error: any) {
    console.error('Match ingredients error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to match ingredients' },
      { status: 500 }
    )
  }
}

// POST: Confirm a match and update price
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ingredientId, newPrice, invoiceDate, invoiceItemId } = body

    if (!ingredientId || !newPrice) {
      return NextResponse.json(
        { success: false, error: 'Missing ingredientId or newPrice' },
        { status: 400 }
      )
    }

    const updated = await updateIngredientPrice(
      ingredientId,
      newPrice,
      invoiceDate || new Date().toISOString().split('T')[0]
    )

    if (updated) {
      return NextResponse.json({
        success: true,
        message: 'Ingredient price updated',
        ingredientId,
        newPrice,
      })
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to update ingredient' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Confirm match error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to confirm match' },
      { status: 500 }
    )
  }
}
