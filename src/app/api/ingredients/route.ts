import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'

export async function GET() {
  try {
    const response = await notion.databases.query({
      database_id: INGREDIENTS_DB,
      page_size: 100,
      sorts: [{ property: 'Ingredient Name', direction: 'ascending' }],
    })

    const ingredients = response.results.map((page: any) => {
      const props = page.properties
      return {
        id: page.id,
        name: props['Ingredient Name']?.title?.[0]?.plain_text || '',
        qtyPurchased: props['Qty Purchased']?.number || 0,
        unitType: props['Unit Type']?.select?.name || '',
        purchasePrice: props['Purchase Price']?.number || 0,
        unitCost: props['Unit Cost']?.number || 0,
        perUnit: props['Per Unit']?.select?.name || '',
        category: props['Category']?.select?.name || '',
      }
    })

    return NextResponse.json({ success: true, ingredients })
  } catch (error: any) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, qtyPurchased, unitType, purchasePrice, unitCost, perUnit, category } = body

    const response = await notion.pages.create({
      parent: { database_id: INGREDIENTS_DB },
      properties: {
        'Ingredient Name': {
          title: [{ text: { content: name } }],
        },
        'Qty Purchased': { number: qtyPurchased || 0 },
        'Unit Type': { select: { name: unitType || 'g' } },
        'Purchase Price': { number: purchasePrice || 0 },
        'Unit Cost': { number: unitCost || 0 },
        'Per Unit': { select: { name: perUnit || 'g' } },
        'Category': { select: { name: category || 'Other' } },
      },
    })

    return NextResponse.json({ success: true, id: response.id })
  } catch (error: any) {
    console.error('Error creating ingredient:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
