import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INVOICE_ITEMS_DB = process.env.NOTION_INVOICE_ITEMS_DB || '2ece4eb3-a205-8123-9734-ed7e5a7546dc'
const RECIPES_DB = process.env.NOTION_RECIPES_DB || '2ece4eb3-a205-810e-820e-ecb16b053bbe'
const RECIPE_INGREDIENTS_DB = process.env.NOTION_RECIPE_INGREDIENTS_DB || '2ece4eb3-a205-81c0-a268-ea9f417aa728'

interface InvoiceItem {
  id: string
  productName: string
  supplier: string
  unitPrice: number
  unit: string
  invoiceDate: string
  restaurant: string
}

interface PriceChange {
  ingredient: string
  supplier: string
  oldPrice: number
  newPrice: number
  changePercent: number
  unit: string
  dates: { old: string; new: string }
}

interface Alert {
  id: string
  title: string
  ingredient: string
  supplier: string
  oldPrice: number
  newPrice: number
  changePercent: number
  impactLevel: 'Critical' | 'High' | 'Medium' | 'Low'
  affectedDishes: string[]
  totalCostImpact: number
  aiRecommendation: string
  createdAt: string
}

// Fetch recent invoice items from Notion
async function fetchInvoiceItems(): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = []
  let hasMore = true
  let startCursor: string | undefined = undefined

  // Get items from last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: INVOICE_ITEMS_DB,
      page_size: 100,
      start_cursor: startCursor,
      sorts: [{ property: 'Created', direction: 'descending' }],
    })

    for (const page of response.results) {
      const props = (page as any).properties

      const productName = props['Product Name']?.title?.[0]?.plain_text || ''
      const supplier = props['Supplier']?.rich_text?.[0]?.plain_text ||
                       props['Supplier']?.select?.name || ''
      const unitPrice = props['Unit Price']?.number || 0
      const unit = props['Unit']?.select?.name || props['Unit']?.rich_text?.[0]?.plain_text || ''
      const restaurant = props['Restaurant']?.select?.name ||
                         props['Restaurant']?.rich_text?.[0]?.plain_text || ''

      // Try different date field names
      let invoiceDate = ''
      if (props['Invoice Date']?.date?.start) {
        invoiceDate = props['Invoice Date'].date.start
      } else if (props['Date']?.date?.start) {
        invoiceDate = props['Date'].date.start
      } else if (props['Created']?.created_time) {
        invoiceDate = props['Created'].created_time.split('T')[0]
      }

      if (productName && unitPrice > 0) {
        items.push({
          id: page.id,
          productName,
          supplier,
          unitPrice,
          unit,
          invoiceDate,
          restaurant,
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return items
}

// Detect price changes by comparing same products over time
function detectPriceChanges(items: InvoiceItem[]): PriceChange[] {
  const productHistory: Map<string, InvoiceItem[]> = new Map()

  // Group items by product name (normalized)
  for (const item of items) {
    const key = item.productName.toLowerCase().trim()
    if (!productHistory.has(key)) {
      productHistory.set(key, [])
    }
    productHistory.get(key)!.push(item)
  }

  const changes: PriceChange[] = []

  // Find price changes for each product
  for (const [_, productItems] of productHistory) {
    if (productItems.length < 2) continue

    // Sort by date descending
    productItems.sort((a, b) =>
      new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    )

    const newest = productItems[0]
    const oldest = productItems[productItems.length - 1]

    // Only flag if there's a significant price change (> 3%)
    if (oldest.unitPrice > 0) {
      const changePercent = ((newest.unitPrice - oldest.unitPrice) / oldest.unitPrice) * 100

      if (Math.abs(changePercent) >= 3) {
        changes.push({
          ingredient: newest.productName,
          supplier: newest.supplier || oldest.supplier,
          oldPrice: oldest.unitPrice,
          newPrice: newest.unitPrice,
          changePercent,
          unit: newest.unit || oldest.unit,
          dates: {
            old: oldest.invoiceDate,
            new: newest.invoiceDate,
          },
        })
      }
    }
  }

  // Sort by absolute change percentage (largest first)
  changes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))

  return changes.slice(0, 20) // Return top 20 changes
}

// Fetch affected recipes for an ingredient
async function fetchAffectedRecipes(ingredientName: string): Promise<string[]> {
  try {
    // Search recipe ingredients for this ingredient
    const response: any = await notion.databases.query({
      database_id: RECIPE_INGREDIENTS_DB,
      page_size: 50,
      filter: {
        property: 'Ingredient Name',
        rich_text: {
          contains: ingredientName.split(' ')[0], // Use first word for broader match
        },
      },
    })

    const recipeNames: string[] = []

    for (const page of response.results) {
      const props = (page as any).properties
      // Try to get recipe name from relation or title
      const recipeName = props['Recipe']?.relation?.[0]?.id ||
                         props['Recipe Name']?.rich_text?.[0]?.plain_text ||
                         props['Recipe']?.title?.[0]?.plain_text || ''

      if (recipeName && !recipeNames.includes(recipeName)) {
        recipeNames.push(recipeName)
      }
    }

    return recipeNames.slice(0, 5) // Limit to 5 affected recipes
  } catch {
    return []
  }
}

// Calculate impact level based on change percentage
function calculateImpactLevel(changePercent: number): 'Critical' | 'High' | 'Medium' | 'Low' {
  const absChange = Math.abs(changePercent)
  if (absChange >= 20) return 'Critical'
  if (absChange >= 10) return 'High'
  if (absChange >= 5) return 'Medium'
  return 'Low'
}

// Generate AI recommendation using Claude
async function generateAIRecommendation(change: PriceChange, affectedDishes: string[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!anthropicKey) {
    // Fallback recommendations based on change type
    if (change.changePercent > 15) {
      return `Significant ${change.changePercent.toFixed(0)}% price increase detected. Consider: 1) Negotiate with supplier for better rates, 2) Source from alternative suppliers, 3) Review menu pricing for affected dishes.`
    } else if (change.changePercent > 0) {
      return `Price increased ${change.changePercent.toFixed(0)}%. Monitor this ingredient and consider adjusting portion sizes or finding alternative suppliers if trend continues.`
    } else if (change.changePercent < -10) {
      return `Price decreased ${Math.abs(change.changePercent).toFixed(0)}%. Good opportunity to stock up or improve margins on dishes using this ingredient.`
    } else {
      return `Minor price decrease of ${Math.abs(change.changePercent).toFixed(0)}%. No immediate action needed.`
    }
  }

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
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are a restaurant cost control expert. Analyze this price change and give a brief, actionable recommendation (2-3 sentences max):

Ingredient: ${change.ingredient}
Supplier: ${change.supplier || 'Unknown'}
Price Change: $${change.oldPrice.toFixed(2)} → $${change.newPrice.toFixed(2)} per ${change.unit} (${change.changePercent > 0 ? '+' : ''}${change.changePercent.toFixed(1)}%)
Affected Dishes: ${affectedDishes.length > 0 ? affectedDishes.join(', ') : 'Unknown'}
Period: ${change.dates.old} to ${change.dates.new}

Provide specific, practical advice for a restaurant manager.`
        }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.content?.[0]?.text || 'Unable to generate recommendation.'
    }
  } catch (error) {
    console.error('AI recommendation error:', error)
  }

  // Fallback
  return change.changePercent > 0
    ? `Price increased ${change.changePercent.toFixed(0)}%. Review supplier contracts and consider alternatives.`
    : `Price decreased ${Math.abs(change.changePercent).toFixed(0)}%. Good time to evaluate margins.`
}

export async function GET() {
  try {
    // Fetch invoice items
    const items = await fetchInvoiceItems()

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        alerts: [],
        summary: {
          totalAlerts: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalImpact: 0,
        },
        message: 'No invoice items found. Upload some invoices first.',
      })
    }

    // Detect price changes
    const priceChanges = detectPriceChanges(items)

    if (priceChanges.length === 0) {
      return NextResponse.json({
        success: true,
        alerts: [],
        summary: {
          totalAlerts: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalImpact: 0,
        },
        message: 'No significant price changes detected in recent invoices.',
      })
    }

    // Build alerts with AI recommendations
    const alerts: Alert[] = []

    for (const change of priceChanges.slice(0, 10)) { // Process top 10
      const affectedDishes = await fetchAffectedRecipes(change.ingredient)
      const impactLevel = calculateImpactLevel(change.changePercent)
      const aiRecommendation = await generateAIRecommendation(change, affectedDishes)

      // Estimate cost impact (rough calculation)
      const estimatedUsagePerWeek = 10 // units
      const weeklyImpact = (change.newPrice - change.oldPrice) * estimatedUsagePerWeek
      const monthlyImpact = weeklyImpact * 4

      alerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: `${change.ingredient} price ${change.changePercent > 0 ? 'increased' : 'decreased'} ${Math.abs(change.changePercent).toFixed(0)}%`,
        ingredient: change.ingredient,
        supplier: change.supplier,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
        changePercent: change.changePercent,
        impactLevel,
        affectedDishes,
        totalCostImpact: monthlyImpact,
        aiRecommendation,
        createdAt: new Date().toISOString(),
      })
    }

    // Calculate summary
    const summary = {
      totalAlerts: alerts.length,
      criticalCount: alerts.filter(a => a.impactLevel === 'Critical').length,
      highCount: alerts.filter(a => a.impactLevel === 'High').length,
      mediumCount: alerts.filter(a => a.impactLevel === 'Medium').length,
      lowCount: alerts.filter(a => a.impactLevel === 'Low').length,
      totalImpact: alerts.reduce((sum, a) => sum + a.totalCostImpact, 0),
    }

    return NextResponse.json({
      success: true,
      alerts,
      summary,
    })

  } catch (error: any) {
    console.error('Alerts API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}
