import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

interface FixRequest {
  ingredientId: string
  field: 'unitCost' | 'perUnit' | 'latestPrice' | 'category'
  newValue: number | string
  reason?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: FixRequest = await request.json()
    const { ingredientId, field, newValue, reason } = body

    if (!ingredientId || !field || newValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: ingredientId, field, newValue' },
        { status: 400 }
      )
    }

    // Build the properties update based on field
    let properties: any = {}

    switch (field) {
      case 'unitCost':
        if (typeof newValue !== 'number') {
          return NextResponse.json(
            { success: false, error: 'unitCost must be a number' },
            { status: 400 }
          )
        }
        properties['Unit Cost'] = { number: newValue }
        // Also update the "Price Updated" date
        properties['Price Updated'] = {
          date: { start: new Date().toISOString().split('T')[0] }
        }
        break

      case 'latestPrice':
        if (typeof newValue !== 'number') {
          return NextResponse.json(
            { success: false, error: 'latestPrice must be a number' },
            { status: 400 }
          )
        }
        properties['Latest Price'] = { number: newValue }
        break

      case 'perUnit':
        if (typeof newValue !== 'string') {
          return NextResponse.json(
            { success: false, error: 'perUnit must be a string' },
            { status: 400 }
          )
        }
        properties['Per Unit'] = { select: { name: newValue } }
        break

      case 'category':
        if (typeof newValue !== 'string') {
          return NextResponse.json(
            { success: false, error: 'category must be a string' },
            { status: 400 }
          )
        }
        properties['Category'] = { select: { name: newValue } }
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unknown field: ${field}` },
          { status: 400 }
        )
    }

    // Update the page in Notion
    const response = await notion.pages.update({
      page_id: ingredientId,
      properties,
    })

    // Fetch the updated page to return current values
    const updatedPage: any = await notion.pages.retrieve({ page_id: ingredientId })
    const props = updatedPage.properties

    const updatedIngredient = {
      id: ingredientId,
      name: props['Ingredient Name']?.title?.[0]?.plain_text ||
            props['Name']?.title?.[0]?.plain_text || '',
      unitCost: props['Unit Cost']?.number || 0,
      latestPrice: props['Latest Price']?.number ?? null,
      perUnit: props['Per Unit']?.select?.name || '',
      category: props['Category']?.select?.name || null,
      priceUpdated: props['Price Updated']?.date?.start || null,
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${field} to ${newValue}${reason ? ` (${reason})` : ''}`,
      ingredient: updatedIngredient,
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error('Fix ingredient error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Update failed' },
      { status: 500 }
    )
  }
}

// Bulk fix endpoint
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { fixes } = body as { fixes: FixRequest[] }

    if (!fixes || !Array.isArray(fixes) || fixes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'fixes array is required' },
        { status: 400 }
      )
    }

    if (fixes.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Maximum 20 fixes per request' },
        { status: 400 }
      )
    }

    const results = []
    const errors = []

    for (const fix of fixes) {
      try {
        let properties: any = {}

        if (fix.field === 'unitCost' && typeof fix.newValue === 'number') {
          properties['Unit Cost'] = { number: fix.newValue }
          properties['Price Updated'] = {
            date: { start: new Date().toISOString().split('T')[0] }
          }
        } else if (fix.field === 'latestPrice' && typeof fix.newValue === 'number') {
          properties['Latest Price'] = { number: fix.newValue }
        } else if (fix.field === 'perUnit' && typeof fix.newValue === 'string') {
          properties['Per Unit'] = { select: { name: fix.newValue } }
        } else if (fix.field === 'category' && typeof fix.newValue === 'string') {
          properties['Category'] = { select: { name: fix.newValue } }
        } else {
          errors.push({ ingredientId: fix.ingredientId, error: `Invalid field or value type` })
          continue
        }

        await notion.pages.update({
          page_id: fix.ingredientId,
          properties,
        })

        results.push({
          ingredientId: fix.ingredientId,
          field: fix.field,
          newValue: fix.newValue,
          success: true,
        })
      } catch (err: any) {
        errors.push({
          ingredientId: fix.ingredientId,
          error: err.message || 'Update failed',
        })
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      totalRequested: fixes.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors,
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error('Bulk fix error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Bulk update failed' },
      { status: 500 }
    )
  }
}
