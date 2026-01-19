import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

// Database IDs
const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'
const RECIPES_DB = process.env.NOTION_RECIPES_DB || '2ece4eb3-a205-810e-820e-ecb16b053bbe'
const RECIPE_INGREDIENTS_DB = process.env.NOTION_RECIPE_INGREDIENTS_DB || '2ece4eb3-a205-81c0-a268-ea9f417aa728'
const INVOICE_ITEMS_DB = process.env.NOTION_INVOICE_ITEMS_DB || '2ece4eb3-a205-81ea-a7ae-e22b95158dab'
const INVOICES_DB = process.env.NOTION_INVOICES_DB || '2ece4eb3-a205-8123-9734-ed7e5a7546dc'
const PRODUCT_SALES_DB = process.env.NOTION_PRODUCT_SALES_DB || '2ece4eb3-a205-8141-9e68-f230cdd557f4'

// Unit conversion factors
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  'g': { 'kg': 0.001, 'g': 1, 'lb': 0.00220462 },
  'kg': { 'kg': 1, 'g': 1000, 'lb': 2.20462 },
  'lb': { 'kg': 0.453592, 'g': 453.592, 'lb': 1 },
  'mL': { 'L': 0.001, 'mL': 1, 'fl. oz': 0.033814 },
  'ml': { 'L': 0.001, 'mL': 1, 'fl. oz': 0.033814 },
  'L': { 'L': 1, 'mL': 1000, 'fl. oz': 33.814 },
  'fl. oz': { 'L': 0.0295735, 'mL': 29.5735, 'fl. oz': 1 },
  'whole unit': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'unit': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'ea': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'each': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'pc': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'pcs': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
  'serving': { 'whole unit': 1, 'unit': 1, 'ea': 1, 'each': 1, 'pc': 1, 'pcs': 1, 'serving': 1 },
}

function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const fromNorm = fromUnit.toLowerCase().trim()
  const toNorm = toUnit.toLowerCase().trim()
  if (fromNorm === toNorm) return quantity
  const conversions = UNIT_CONVERSIONS[fromNorm]
  if (conversions && conversions[toNorm] !== undefined) {
    return quantity * conversions[toNorm]
  }
  console.log(`No conversion found: ${fromUnit} -> ${toUnit}`)
  return quantity
}

// Interfaces
interface Ingredient {
  id: string
  name: string
  unitCost: number        // Reference price (theoretical)
  latestPrice: number     // Latest invoice price
  perUnit: string
  priceUpdated: string | null
}

interface Recipe {
  id: string
  name: string
  category: string
  yieldQty: number
  yieldUnit: string
  sellingPrice: number
}

interface RecipeIngredient {
  recipeId: string
  ingredientId: string
  ingredientName: string
  quantity: number
  unit: string
}

interface InvoiceItem {
  id: string
  productName: string
  unitPrice: number
  unit: string
  quantity: number
  invoiceId: string
  invoiceDate: string | null
}

interface ProductSale {
  productName: string
  quantitySold: number
  revenue: number
  category: string
}

interface IngredientPriceChange {
  ingredientId: string
  ingredientName: string
  referencePrice: number   // Unit Cost from ingredients table
  actualPrice: number      // Latest price from invoices
  priceVariance: number    // actual - reference
  variancePct: number      // (variance / reference) * 100
  perUnit: string
  invoiceDate: string | null
}

interface RecipeImpactAnalysis {
  recipe: Recipe
  ingredients: {
    name: string
    quantity: number
    unit: string
    referenceUnitCost: number
    actualUnitCost: number
    referenceCost: number
    actualCost: number
    variance: number
    variancePct: number
  }[]
  referenceTotalCost: number  // What it SHOULD cost
  actualTotalCost: number     // What it ACTUALLY costs
  costVariancePerPortion: number
  costVariancePct: number
  unitsSoldInPeriod: number
  totalFinancialImpact: number  // variance × units sold
  sellingPrice: number
  referenceMarginPct: number
  actualMarginPct: number
  marginImpactPct: number
  recommendation: string
}

// Fetch all ingredients with reference prices
async function fetchIngredients(): Promise<Map<string, Ingredient>> {
  const ingredients = new Map<string, Ingredient>()
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
      const latestPrice = props['Latest Price']?.number ?? unitCost
      const perUnit = props['Per Unit']?.select?.name ||
                      props['Unit Type']?.select?.name || ''
      const priceUpdated = props['Price Updated']?.date?.start || null

      if (name) {
        const ing = { id: page.id, name, unitCost, latestPrice, perUnit, priceUpdated }
        ingredients.set(page.id, ing)
        ingredients.set(name.toLowerCase(), ing)
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return ingredients
}

// Fetch all recipes
async function fetchRecipes(): Promise<Recipe[]> {
  const recipes: Recipe[] = []
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: RECIPES_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      const name = props['Recipe Name']?.title?.[0]?.plain_text ||
                   props['Name']?.title?.[0]?.plain_text || ''
      const category = props['Category']?.select?.name || ''
      const yieldQty = props['Yield Qty']?.number || props['Yield']?.number || 1
      const yieldUnit = props['Yield Unit']?.select?.name || 'portion'
      const sellingPrice = props['Selling Price']?.number ||
                          props['Menu Price']?.number || 0

      if (name) {
        recipes.push({ id: page.id, name, category, yieldQty, yieldUnit, sellingPrice })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return recipes
}

// Fetch recipe ingredients
async function fetchRecipeIngredients(): Promise<RecipeIngredient[]> {
  const recipeIngredients: RecipeIngredient[] = []
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: RECIPE_INGREDIENTS_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      const recipeRelation = props['Recipe']?.relation?.[0]?.id || ''
      const ingredientRelation = props['Ingredient']?.relation?.[0]?.id || ''
      const ingredientName = props['Ingredient Name']?.rich_text?.[0]?.plain_text ||
                            props['Ingredient']?.title?.[0]?.plain_text || ''
      const quantity = props['Quantity']?.number || props['Qty']?.number || 0
      const unit = props['Unit']?.select?.name ||
                   props['Unit']?.rich_text?.[0]?.plain_text || ''

      if (recipeRelation && (ingredientRelation || ingredientName) && quantity > 0) {
        recipeIngredients.push({
          recipeId: recipeRelation,
          ingredientId: ingredientRelation,
          ingredientName,
          quantity,
          unit,
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return recipeIngredients
}

// Fetch invoice items with prices (optionally filtered by date)
async function fetchInvoiceItems(startDate?: string, endDate?: string): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = []

  // First fetch invoices to get dates
  const invoiceDates = new Map<string, string>()
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const invoiceResponse: any = await notion.databases.query({
      database_id: INVOICES_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of invoiceResponse.results) {
      const props = (page as any).properties
      const invoiceDate = props['Invoice Date']?.date?.start || null
      if (invoiceDate) {
        invoiceDates.set(page.id, invoiceDate)
      }
    }

    hasMore = invoiceResponse.has_more
    startCursor = invoiceResponse.next_cursor
  }

  // Now fetch invoice items
  hasMore = true
  startCursor = undefined

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
      const quantity = props['Quantity']?.number || 0
      const invoiceId = props['Invoice']?.relation?.[0]?.id || ''
      const invoiceDate = invoiceId ? invoiceDates.get(invoiceId) || null : null

      // Filter by date range if provided
      if (startDate && invoiceDate && invoiceDate < startDate) continue
      if (endDate && invoiceDate && invoiceDate > endDate) continue

      if (productName && unitPrice > 0) {
        items.push({
          id: page.id,
          productName,
          unitPrice,
          unit,
          quantity,
          invoiceId,
          invoiceDate,
        })
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return items
}

// Fetch POS product sales (optionally filtered by date)
async function fetchProductSales(): Promise<Map<string, ProductSale>> {
  const sales = new Map<string, ProductSale>()
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: PRODUCT_SALES_DB,
      page_size: 100,
      start_cursor: startCursor,
    })

    for (const page of response.results) {
      const props = (page as any).properties
      const productName = props['Product Name']?.title?.[0]?.plain_text || ''
      const quantitySold = props['Quantity Sold']?.number || 0
      const revenue = props['Revenue']?.number || 0
      const category = props['Category']?.select?.name || ''

      if (productName && quantitySold > 0) {
        // Aggregate by product name (lowercase for matching)
        const key = productName.toLowerCase()
        const existing = sales.get(key)
        if (existing) {
          existing.quantitySold += quantitySold
          existing.revenue += revenue
        } else {
          sales.set(key, { productName, quantitySold, revenue, category })
        }
      }
    }

    hasMore = response.has_more
    startCursor = response.next_cursor
  }

  return sales
}

// Match invoice items to ingredients and calculate price changes
function calculateIngredientPriceChanges(
  ingredients: Map<string, Ingredient>,
  invoiceItems: InvoiceItem[]
): Map<string, IngredientPriceChange> {
  const priceChanges = new Map<string, IngredientPriceChange>()

  // Group invoice items by product name and take the most recent
  const latestPrices = new Map<string, InvoiceItem>()
  for (const item of invoiceItems) {
    const key = item.productName.toLowerCase()
    const existing = latestPrices.get(key)
    if (!existing || (item.invoiceDate && (!existing.invoiceDate || item.invoiceDate > existing.invoiceDate))) {
      latestPrices.set(key, item)
    }
  }

  // Match to ingredients
  for (const [key, invoiceItem] of latestPrices) {
    // Try to find matching ingredient
    const ingredient = ingredients.get(key)
    if (ingredient && ingredient.unitCost > 0) {
      const priceVariance = invoiceItem.unitPrice - ingredient.unitCost
      const variancePct = (priceVariance / ingredient.unitCost) * 100

      priceChanges.set(ingredient.id, {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        referencePrice: ingredient.unitCost,
        actualPrice: invoiceItem.unitPrice,
        priceVariance,
        variancePct,
        perUnit: ingredient.perUnit || invoiceItem.unit,
        invoiceDate: invoiceItem.invoiceDate,
      })
    }
  }

  return priceChanges
}

// Generate recommendation based on impact
function generateRecommendation(
  variancePct: number,
  totalImpact: number,
  marginImpactPct: number,
  sellingPrice: number
): string {
  if (Math.abs(variancePct) < 2) {
    return '✓ Cost stable - no action needed'
  }

  if (variancePct > 0) {
    // Price increased
    if (variancePct >= 15 || totalImpact > 100) {
      return `🚨 CRITICAL: +${variancePct.toFixed(0)}% cost increase. Impact: $${totalImpact.toFixed(0)}/period. Actions: 1) Negotiate with supplier immediately, 2) Source alternatives, 3) Consider ${sellingPrice > 0 ? `raising price by $${(totalImpact / 50).toFixed(2)}` : 'menu price increase'}`
    } else if (variancePct >= 8 || totalImpact > 50) {
      return `⚠️ HIGH: +${variancePct.toFixed(0)}% increase. Review supplier contract. Consider reducing portion by ${(variancePct / 2).toFixed(0)}% or price increase.`
    } else {
      return `📊 MONITOR: +${variancePct.toFixed(0)}% increase. Track for next 2 weeks before action.`
    }
  } else {
    // Price decreased
    if (variancePct <= -10) {
      return `💰 OPPORTUNITY: ${variancePct.toFixed(0)}% cost reduction! Lock in supplier contract or stock up. Margin improved by ${Math.abs(marginImpactPct).toFixed(1)}%.`
    } else {
      return `✓ Favorable: ${variancePct.toFixed(0)}% cost decrease. Consider bulk purchasing.`
    }
  }
}

// Calculate full impact analysis
function calculateImpactAnalysis(
  recipes: Recipe[],
  recipeIngredients: RecipeIngredient[],
  ingredients: Map<string, Ingredient>,
  priceChanges: Map<string, IngredientPriceChange>,
  productSales: Map<string, ProductSale>
): RecipeImpactAnalysis[] {
  const analyses: RecipeImpactAnalysis[] = []

  for (const recipe of recipes) {
    const recipeIngs = recipeIngredients.filter(ri => ri.recipeId === recipe.id)
    if (recipeIngs.length === 0) continue

    const ingredientAnalysis: RecipeImpactAnalysis['ingredients'] = []
    let referenceTotalCost = 0
    let actualTotalCost = 0

    for (const ri of recipeIngs) {
      let ingredient = ingredients.get(ri.ingredientId)
      if (!ingredient && ri.ingredientName) {
        ingredient = ingredients.get(ri.ingredientName.toLowerCase())
      }

      if (ingredient) {
        const recipeUnit = ri.unit || 'g'
        const ingredientUnit = ingredient.perUnit || 'kg'
        const convertedQty = convertQuantity(ri.quantity, recipeUnit, ingredientUnit)

        // Check if we have a price change for this ingredient
        const priceChange = priceChanges.get(ingredient.id)
        const referenceUnitCost = ingredient.unitCost
        const actualUnitCost = priceChange?.actualPrice ?? ingredient.latestPrice ?? ingredient.unitCost

        const referenceCost = convertedQty * referenceUnitCost
        const actualCost = convertedQty * actualUnitCost
        const variance = actualCost - referenceCost
        const variancePct = referenceCost > 0 ? (variance / referenceCost) * 100 : 0

        ingredientAnalysis.push({
          name: ingredient.name,
          quantity: ri.quantity,
          unit: ri.unit || ingredient.perUnit,
          referenceUnitCost,
          actualUnitCost,
          referenceCost,
          actualCost,
          variance,
          variancePct,
        })

        referenceTotalCost += referenceCost
        actualTotalCost += actualCost
      }
    }

    const costVariancePerPortion = actualTotalCost - referenceTotalCost
    const costVariancePct = referenceTotalCost > 0
      ? (costVariancePerPortion / referenceTotalCost) * 100
      : 0

    // Find sales for this recipe
    const salesKey = recipe.name.toLowerCase()
    const sales = productSales.get(salesKey)
    const unitsSoldInPeriod = sales?.quantitySold || 0

    // Calculate total financial impact
    const totalFinancialImpact = costVariancePerPortion * unitsSoldInPeriod

    // Calculate margins
    const referenceMarginPct = recipe.sellingPrice > 0
      ? ((recipe.sellingPrice - referenceTotalCost) / recipe.sellingPrice) * 100
      : 0
    const actualMarginPct = recipe.sellingPrice > 0
      ? ((recipe.sellingPrice - actualTotalCost) / recipe.sellingPrice) * 100
      : 0
    const marginImpactPct = actualMarginPct - referenceMarginPct

    // Generate recommendation
    const recommendation = generateRecommendation(
      costVariancePct,
      totalFinancialImpact,
      marginImpactPct,
      recipe.sellingPrice
    )

    analyses.push({
      recipe,
      ingredients: ingredientAnalysis,
      referenceTotalCost,
      actualTotalCost,
      costVariancePerPortion,
      costVariancePct,
      unitsSoldInPeriod,
      totalFinancialImpact,
      sellingPrice: recipe.sellingPrice,
      referenceMarginPct,
      actualMarginPct,
      marginImpactPct,
      recommendation,
    })
  }

  // Sort by total financial impact (highest first)
  analyses.sort((a, b) => Math.abs(b.totalFinancialImpact) - Math.abs(a.totalFinancialImpact))

  return analyses
}

export async function GET(request: Request) {
  try {
    // Parse query parameters for date range
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const period = searchParams.get('period') || 'week' // week, month, ytd, custom

    // Calculate date range based on period
    let effectiveStartDate = startDate
    let effectiveEndDate = endDate
    const today = new Date()

    if (!effectiveStartDate) {
      switch (period) {
        case 'week':
          const weekAgo = new Date(today)
          weekAgo.setDate(today.getDate() - 7)
          effectiveStartDate = weekAgo.toISOString().split('T')[0]
          break
        case 'month':
          const monthAgo = new Date(today)
          monthAgo.setMonth(today.getMonth() - 1)
          effectiveStartDate = monthAgo.toISOString().split('T')[0]
          break
        case 'ytd':
          effectiveStartDate = `${today.getFullYear()}-01-01`
          break
      }
    }

    if (!effectiveEndDate) {
      effectiveEndDate = today.toISOString().split('T')[0]
    }

    // Fetch all data in parallel
    const [ingredients, recipes, recipeIngredients, invoiceItems, productSales] = await Promise.all([
      fetchIngredients(),
      fetchRecipes(),
      fetchRecipeIngredients(),
      fetchInvoiceItems(effectiveStartDate, effectiveEndDate),
      fetchProductSales(),
    ])

    // Calculate price changes from invoices
    const priceChanges = calculateIngredientPriceChanges(ingredients, invoiceItems)

    // Calculate full impact analysis
    const analyses = calculateImpactAnalysis(
      recipes,
      recipeIngredients,
      ingredients,
      priceChanges,
      productSales
    )

    // Calculate summary statistics
    const totalReferenceCostandise = analyses.reduce((sum, a) => sum + a.referenceTotalCost * a.unitsSoldInPeriod, 0)
    const totalActualCost = analyses.reduce((sum, a) => sum + a.actualTotalCost * a.unitsSoldInPeriod, 0)
    const totalFinancialImpact = analyses.reduce((sum, a) => sum + a.totalFinancialImpact, 0)
    const totalUnitsSold = analyses.reduce((sum, a) => sum + a.unitsSoldInPeriod, 0)

    const recipesWithIncrease = analyses.filter(a => a.costVariancePct > 2).length
    const recipesWithDecrease = analyses.filter(a => a.costVariancePct < -2).length
    const criticalRecipes = analyses.filter(a => a.costVariancePct > 10 || a.totalFinancialImpact > 50).length

    // Get top ingredient price changes
    const ingredientChanges = Array.from(priceChanges.values())
      .filter(pc => Math.abs(pc.variancePct) >= 2)
      .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
      .slice(0, 15)

    return NextResponse.json({
      success: true,
      period: {
        type: period,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      },
      summary: {
        totalRecipes: analyses.length,
        recipesWithIncrease,
        recipesWithDecrease,
        criticalRecipes,
        totalUnitsSold,
        totalReferenceCostandise,
        totalActualCost,
        totalFinancialImpact,
        avgVariancePct: totalReferenceCostandise > 0
          ? ((totalActualCost - totalReferenceCostandise) / totalReferenceCostandise) * 100
          : 0,
        invoiceItemsAnalyzed: invoiceItems.length,
        ingredientsWithPriceChange: priceChanges.size,
      },
      // Top impacted recipes (by financial impact)
      topImpactedRecipes: analyses.slice(0, 20),
      // All recipes with variance > 2%
      recipesWithVariance: analyses.filter(a => Math.abs(a.costVariancePct) > 2),
      // Ingredient price changes
      ingredientPriceChanges: ingredientChanges,
      // AI summary recommendation
      aiSummary: generateOverallSummary(totalFinancialImpact, criticalRecipes, ingredientChanges),
    })

  } catch (error: any) {
    console.error('Cost calculator error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate costs' },
      { status: 500 }
    )
  }
}

function generateOverallSummary(
  totalImpact: number,
  criticalCount: number,
  ingredientChanges: IngredientPriceChange[]
): string {
  if (Math.abs(totalImpact) < 10 && criticalCount === 0) {
    return '✅ Food costs are stable. No immediate action required.'
  }

  const topIncreases = ingredientChanges.filter(ic => ic.variancePct > 5).slice(0, 3)
  const topDecreases = ingredientChanges.filter(ic => ic.variancePct < -5).slice(0, 2)

  let summary = ''

  if (totalImpact > 0) {
    summary = `⚠️ Cost Alert: $${totalImpact.toFixed(0)} additional cost this period. `
  } else if (totalImpact < 0) {
    summary = `💰 Cost Savings: $${Math.abs(totalImpact).toFixed(0)} saved this period. `
  }

  if (criticalCount > 0) {
    summary += `${criticalCount} recipes need immediate attention. `
  }

  if (topIncreases.length > 0) {
    summary += `Top increases: ${topIncreases.map(i => `${i.ingredientName} (+${i.variancePct.toFixed(0)}%)`).join(', ')}. `
  }

  if (topDecreases.length > 0) {
    summary += `Opportunities: ${topDecreases.map(i => `${i.ingredientName} (${i.variancePct.toFixed(0)}%)`).join(', ')}.`
  }

  return summary || 'Review individual recipes for details.'
}
