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

// Synonym mappings for common ingredient names
const SYNONYMS: Record<string, string[]> = {
  'chicken': ['poulet', 'poultry'],
  'beef': ['boeuf', 'steak', 'ground beef', 'boeuf haché'],
  'pork': ['porc', 'cochon'],
  'shrimp': ['crevette', 'prawn', 'crevettes'],
  'fish': ['poisson', 'seafood'],
  'tofu': ['bean curd', 'soy curd', 'tahu'],
  'rice': ['riz', 'jasmine rice', 'riz jasmin'],
  'noodle': ['nouille', 'pasta', 'pâte', 'noodles', 'nouilles'],
  'oil': ['huile', 'cooking oil'],
  'sauce': ['condiment'],
  'onion': ['oignon', 'onions', 'oignons'],
  'garlic': ['ail', 'garlic clove'],
  'ginger': ['gingembre'],
  'cilantro': ['coriander', 'coriandre', 'fresh coriander'],
  'basil': ['basilic', 'thai basil', 'basilic thai'],
  'lime': ['citron vert', 'limette'],
  'lemon': ['citron'],
  'coconut': ['coco', 'noix de coco', 'coconut milk', 'lait de coco'],
  'pepper': ['poivre', 'bell pepper', 'poivron'],
  'chili': ['piment', 'chile', 'hot pepper'],
  'mushroom': ['champignon', 'mushrooms', 'champignons'],
  'egg': ['oeuf', 'eggs', 'oeufs'],
  'sugar': ['sucre'],
  'salt': ['sel'],
  'vinegar': ['vinaigre'],
  'soy': ['soja', 'soy sauce', 'sauce soja'],
  'carrot': ['carotte', 'carrots', 'carottes'],
  'cabbage': ['chou', 'choux'],
  'bean': ['haricot', 'beans', 'haricots'],
  'sprout': ['germe', 'beansprout', 'bean sprouts', 'germes'],
  'lettuce': ['laitue', 'salad', 'salade'],
  'tomato': ['tomate', 'tomatoes', 'tomates'],
  'potato': ['pomme de terre', 'patate'],
  'broccoli': ['brocoli'],
  'cauliflower': ['chou-fleur'],
  'spinach': ['épinard', 'epinard'],
  'cucumber': ['concombre'],
  'mint': ['menthe', 'fresh mint'],
  'lemongrass': ['citronnelle'],
  'galangal': ['galanga'],
  'kaffir': ['combava', 'kaffir lime'],
  'tamarind': ['tamarin'],
  'fish sauce': ['nuoc mam', 'nam pla', 'sauce poisson'],
  'oyster sauce': ['sauce huitre', "sauce d'huitre"],
  'sesame': ['sésame', 'sesame oil', 'huile de sésame'],
  'peanut': ['arachide', 'cacahuète', 'peanuts'],
  'cashew': ['noix de cajou', 'cajou'],
}

// Words to strip for better matching
const STRIP_WORDS = [
  'fresh', 'dried', 'frozen', 'organic', 'raw', 'cooked',
  'frais', 'fraîche', 'séché', 'congelé', 'bio', 'cru', 'cuit',
  'large', 'small', 'medium', 'grand', 'petit', 'moyen',
  'whole', 'sliced', 'chopped', 'diced', 'minced', 'ground',
  'entier', 'tranché', 'haché', 'émincé', 'moulu',
  'thai', 'chinese', 'japanese', 'korean', 'vietnamese',
  'premium', 'select', 'choice', 'grade', 'a', 'b',
  'kg', 'lb', 'oz', 'g', 'ml', 'l', 'unit', 'pc', 'pcs', 'each',
]

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// Normalize string for matching
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Remove common modifiers from ingredient names
function stem(str: string): string {
  let result = normalize(str)
  for (const word of STRIP_WORDS) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), '')
  }
  return result.replace(/\s+/g, ' ').trim()
}

// Expand a term with its synonyms
function expandWithSynonyms(term: string): string[] {
  const normalized = normalize(term)
  const results = [normalized]

  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (normalized.includes(key)) {
      for (const syn of synonyms) {
        results.push(normalized.replace(key, syn))
      }
    }
    for (const syn of synonyms) {
      if (normalized.includes(syn)) {
        results.push(normalized.replace(syn, key))
      }
    }
  }

  return [...new Set(results)]
}

// Calculate similarity score between two strings (improved algorithm)
function similarityScore(a: string, b: string): number {
  const aNorm = normalize(a)
  const bNorm = normalize(b)

  // Exact match
  if (aNorm === bNorm) return 1.0

  // Stemmed match
  const aStem = stem(a)
  const bStem = stem(b)
  if (aStem === bStem && aStem.length > 2) return 0.95

  // Synonym expansion match
  const aExpanded = expandWithSynonyms(aNorm)
  const bExpanded = expandWithSynonyms(bNorm)

  for (const aVar of aExpanded) {
    for (const bVar of bExpanded) {
      if (aVar === bVar) return 0.9
    }
  }

  // One contains the other (stemmed)
  if (aStem.includes(bStem) || bStem.includes(aStem)) {
    const ratio = Math.min(aStem.length, bStem.length) / Math.max(aStem.length, bStem.length)
    return 0.7 + (ratio * 0.2)
  }

  // Levenshtein similarity for short strings
  if (aStem.length <= 15 && bStem.length <= 15) {
    const distance = levenshteinDistance(aStem, bStem)
    const maxLen = Math.max(aStem.length, bStem.length)
    const levenshteinSim = 1 - (distance / maxLen)
    if (levenshteinSim > 0.7) return levenshteinSim * 0.85
  }

  // Word-based matching (improved)
  const aWords = aStem.split(' ').filter(w => w.length >= 2)
  const bWords = bStem.split(' ').filter(w => w.length >= 2)

  if (aWords.length === 0 || bWords.length === 0) return 0

  let matchedWords = 0
  let partialMatches = 0

  for (const aWord of aWords) {
    for (const bWord of bWords) {
      if (aWord === bWord) {
        matchedWords++
        break
      } else if (aWord.length >= 4 && bWord.length >= 4) {
        // Check for partial word match (beginning matches)
        const minLen = Math.min(aWord.length, bWord.length)
        const checkLen = Math.floor(minLen * 0.7)
        if (checkLen >= 3 && aWord.substring(0, checkLen) === bWord.substring(0, checkLen)) {
          partialMatches += 0.5
          break
        }
      }
    }
  }

  const totalWords = Math.max(aWords.length, bWords.length)
  const wordScore = (matchedWords + partialMatches) / totalWords

  // Weight by the significance of matched words
  return wordScore * 0.75
}

// Find best matches for an invoice item
function findMatches(item: InvoiceItem, ingredients: Ingredient[]): {
  best: Ingredient | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  possibleMatches: Ingredient[]
  matchScore: number
} {
  const scored = ingredients.map(ing => ({
    ingredient: ing,
    score: similarityScore(item.productName, ing.name)
  }))

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const topMatches = scored.filter(s => s.score >= 0.25).slice(0, 5)
  const best = topMatches[0]

  if (!best || best.score < 0.25) {
    return { best: null, confidence: 'none', possibleMatches: [], matchScore: 0 }
  }

  // Adjusted thresholds for better matching
  let confidence: 'high' | 'medium' | 'low'
  if (best.score >= 0.85) {
    confidence = 'high'
  } else if (best.score >= 0.55) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  return {
    best: best.ingredient,
    confidence,
    possibleMatches: topMatches.map(m => m.ingredient),
    matchScore: best.score
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
      const { best, confidence, possibleMatches, matchScore } = findMatches(item, ingredients)

      const result: MatchResult = {
        invoiceItem: item,
        matchedIngredient: confidence === 'high' ? best : null,
        confidence,
        needsClarification: confidence === 'low' || confidence === 'medium',
        possibleMatches,
      }

      // Get AI suggestion for ambiguous matches (skip for better performance)
      // Only get AI suggestion for medium confidence matches
      if (confidence === 'medium' && possibleMatches.length > 1) {
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

    const noMatchCount = results.filter(r => r.confidence === 'none').length
    const matchRate = invoiceItems.length > 0
      ? ((autoMatched.length + needsClarification.length) / invoiceItems.length * 100).toFixed(1)
      : '0'

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoiceItems: invoiceItems.length,
        totalIngredients: ingredients.length,
        autoMatched: autoMatched.length,
        needsClarification: needsClarification.length,
        noMatch: noMatchCount,
        matchRate: `${matchRate}%`,
        priceChangesDetected: priceChanges.length,
      },
      priceChanges: priceChanges.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct)),
      needsClarification: needsClarification.slice(0, 20),
      autoMatched: autoMatched.slice(0, 10).map(r => ({
        invoiceProduct: r.invoiceItem.productName,
        matchedIngredient: r.matchedIngredient?.name,
        confidence: r.confidence,
      })),
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
