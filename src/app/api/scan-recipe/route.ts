import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'

const MARKUP_PERCENTAGE = 0.5

interface ExtractedIngredient {
  name: string
  quantity: number
  unit: string
}

interface IngredientLookup {
  id: string
  name: string
  unitCost: number
  perUnit: string
}

// Unit conversion helpers
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  kg: { kg: 1, g: 0.001 },
  g: { g: 1, kg: 1000 },
  L: { L: 1, mL: 0.001, 'fl. oz': 0.0295735 },
  mL: { mL: 1, L: 1000, 'fl. oz': 29.5735 },
  'fl. oz': { 'fl. oz': 1, L: 33.814, mL: 0.033814 },
  'whole unit': { 'whole unit': 1, 'whole units': 1 },
  'whole units': { 'whole unit': 1, 'whole units': 1 },
}

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim()
  if (lower === 'whole units' || lower === 'whole unit' || lower === 'pcs' || lower === 'pieces' || lower === 'each') return 'whole unit'
  if (lower === 'fl. oz' || lower === 'fl oz' || lower === 'floz') return 'fl. oz'
  if (lower === 'grams' || lower === 'gram') return 'g'
  if (lower === 'kilograms' || lower === 'kilogram') return 'kg'
  if (lower === 'liters' || lower === 'liter' || lower === 'litres' || lower === 'litre') return 'L'
  if (lower === 'milliliters' || lower === 'milliliter' || lower === 'ml') return 'mL'
  if (lower === 'tablespoon' || lower === 'tbsp') return 'mL'
  if (lower === 'teaspoon' || lower === 'tsp') return 'mL'
  if (lower === 'cup' || lower === 'cups') return 'mL'
  if (lower === 'ounce' || lower === 'oz') return 'g'
  return unit.trim()
}

function convertToBaseUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  const lower = unit.toLowerCase().trim()

  if (lower === 'tablespoon' || lower === 'tbsp') {
    return { quantity: quantity * 15, unit: 'mL' }
  }
  if (lower === 'teaspoon' || lower === 'tsp') {
    return { quantity: quantity * 5, unit: 'mL' }
  }
  if (lower === 'cup' || lower === 'cups') {
    return { quantity: quantity * 240, unit: 'mL' }
  }
  if (lower === 'ounce' || lower === 'oz') {
    return { quantity: quantity * 28.35, unit: 'g' }
  }
  if (lower === 'pound' || lower === 'lb' || lower === 'lbs') {
    return { quantity: quantity * 453.6, unit: 'g' }
  }

  return { quantity, unit: normalizeUnit(unit) }
}

async function getIngredientLookup(): Promise<Map<string, IngredientLookup>> {
  const lookup = new Map()
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
      if (name) {
        lookup.set(name.toLowerCase(), {
          id: page.id,
          name: name,
          unitCost: props['Unit Cost']?.number || 0,
          perUnit: props['Per Unit']?.select?.name || 'g',
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return lookup
}

function findBestMatch(searchName: string, lookup: Map<string, IngredientLookup>): IngredientLookup | null {
  const searchLower = searchName.toLowerCase().trim()

  // Exact match
  if (lookup.has(searchLower)) {
    return lookup.get(searchLower)!
  }

  // Partial match
  const entries = Array.from(lookup.entries())
  for (const entry of entries) {
    const [key, value] = entry
    if (key.includes(searchLower) || searchLower.includes(key)) {
      return value
    }
  }

  // Word-based matching
  const searchWords = searchLower.split(/\s+/)
  for (const entry of entries) {
    const [key, value] = entry
    for (const word of searchWords) {
      if (word.length > 3 && key.includes(word)) {
        return value
      }
    }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY

    let extractedIngredients: ExtractedIngredient[] = []
    let recipeName = 'Scanned Recipe'

    if (anthropicKey) {
      // Use Claude Vision API
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mediaType = file.type || 'image/jpeg'

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Extract the recipe information from this image. This could be a handwritten note, printed recipe, or ingredient list. Return JSON only with this exact format:
{
  "name": "Recipe Name",
  "ingredients": [
    {"name": "ingredient name", "quantity": 100, "unit": "g"},
    {"name": "another ingredient", "quantity": 2, "unit": "whole unit"}
  ]
}

Use these units: g, kg, mL, L, fl. oz, whole unit
For items counted individually (eggs, pieces), use "whole unit".
Return ONLY the JSON, no other text.`
              }
            ]
          }]
        })
      })

      if (response.ok) {
        const data = await response.json()
        const content = data.content?.[0]?.text || ''

        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0])
            recipeName = parsed.name || 'Scanned Recipe'
            extractedIngredients = parsed.ingredients || []
          } catch (e) {
            console.error('Failed to parse JSON from Claude:', e)
          }
        }
      }
    }

    // If no API key or extraction failed, provide demo data
    if (extractedIngredients.length === 0) {
      return NextResponse.json({
        success: true,
        note: 'Demo mode - Add ANTHROPIC_API_KEY for real image scanning',
        recipe: {
          name: 'Sample Pad Thai (Demo)',
          description: 'Demo recipe - Add API key for real scanning',
          type: 'Menu Item',
          category: 'Noodles',
          yieldQty: 1,
          yieldUnit: 'serving',
          laborHours: 0,
          ingredientCost: 4.08,
          laborCost: 0,
          grossCost: 4.08,
          costPerYield: 4.08,
          costWithMarkup: 6.12,
          lines: [
            { ingredientName: 'Rice noodle (S)', quantity: 150, unit: 'g', lineCost: 0.57 },
            { ingredientName: 'Chicken breast', quantity: 75, unit: 'g', lineCost: 1.05 },
            { ingredientName: 'Eggs', quantity: 1, unit: 'whole unit', lineCost: 0.32 },
            { ingredientName: 'Beansprout', quantity: 80, unit: 'g', lineCost: 0.13 },
            { ingredientName: 'Pad thai sauce', quantity: 3, unit: 'fl. oz', lineCost: 0.78 },
            { ingredientName: 'Peanuts', quantity: 15, unit: 'g', lineCost: 0.10 },
          ]
        }
      })
    }

    // Get ingredient lookup for cost calculation
    const ingredientLookup = await getIngredientLookup()

    // Calculate costs for extracted ingredients
    const recipeLines = []
    let totalCost = 0

    for (const ing of extractedIngredients) {
      const converted = convertToBaseUnit(ing.quantity, ing.unit)
      const match = findBestMatch(ing.name, ingredientLookup)

      let lineCost = 0
      let ingredientId = ''

      if (match) {
        ingredientId = match.id

        let costQty = converted.quantity
        if (converted.unit !== match.perUnit) {
          const conversions = UNIT_CONVERSIONS[match.perUnit]
          if (conversions && conversions[converted.unit]) {
            costQty = converted.quantity * conversions[converted.unit]
          }
        }
        lineCost = costQty * match.unitCost
      }

      totalCost += lineCost

      recipeLines.push({
        ingredientId,
        ingredientName: match?.name || ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        lineCost
      })
    }

    const costPerYield = totalCost
    const costWithMarkup = costPerYield * (1 + MARKUP_PERCENTAGE)

    return NextResponse.json({
      success: true,
      recipe: {
        name: recipeName,
        description: 'Extracted from image',
        type: 'Menu Item',
        category: 'Scanned',
        yieldQty: 1,
        yieldUnit: 'serving',
        laborHours: 0,
        ingredientCost: totalCost,
        laborCost: 0,
        grossCost: totalCost,
        costPerYield: costPerYield,
        costWithMarkup: costWithMarkup,
        lines: recipeLines
      }
    })

  } catch (error: any) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Scan failed' },
      { status: 500 }
    )
  }
}
