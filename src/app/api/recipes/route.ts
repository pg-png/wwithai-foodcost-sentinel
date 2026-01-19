import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const RECIPES_DB = process.env.NOTION_RECIPES_DB || '2ece4eb3-a205-810e-820e-ecb16b053bbe'
const RECIPE_INGREDIENTS_DB = process.env.NOTION_RECIPE_INGREDIENTS_DB || '2ece4eb3-a205-81c0-a268-ea9f417aa728'

export async function GET() {
  try {
    const response = await notion.databases.query({
      database_id: RECIPES_DB,
      page_size: 100,
      sorts: [{ property: 'Recipe Name', direction: 'ascending' }],
      filter: {
        property: 'Active',
        checkbox: { equals: true },
      },
    })

    const recipes = response.results.map((page: any) => {
      const props = page.properties
      return {
        id: page.id,
        name: props['Recipe Name']?.title?.[0]?.plain_text || '',
        description: props['Description']?.rich_text?.[0]?.plain_text || '',
        type: props['Recipe Type']?.select?.name || '',
        category: props['Category']?.select?.name || '',
        yieldQty: props['Yield Qty']?.number || 0,
        yieldUnit: props['Yield Unit']?.select?.name || '',
        ingredientCost: props['Ingredient Cost']?.number || 0,
        laborCost: props['Labor Cost']?.number || 0,
        grossCost: props['Gross Cost']?.number || 0,
        costPerYield: props['Cost Per Yield']?.number || 0,
        costWithMarkup: props['Cost With Markup']?.number || 0,
      }
    })

    return NextResponse.json({ success: true, recipes })
  } catch (error: any) {
    console.error('Error fetching recipes:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      type,
      category,
      yieldQty,
      yieldUnit,
      laborHours,
      ingredientCost,
      laborCost,
      grossCost,
      costPerYield,
      costWithMarkup,
      lines,
    } = body

    // Create the recipe
    const recipeResponse = await notion.pages.create({
      parent: { database_id: RECIPES_DB },
      properties: {
        'Recipe Name': {
          title: [{ text: { content: name } }],
        },
        'Description': {
          rich_text: [{ text: { content: description || '' } }],
        },
        'Recipe Type': { select: { name: type || 'Menu Item' } },
        'Category': { select: { name: category || 'Appetizers' } },
        'Yield Qty': { number: yieldQty || 1 },
        'Yield Unit': { select: { name: yieldUnit || 'serving' } },
        'Labor Hours': { number: laborHours || 0 },
        'Ingredient Cost': { number: ingredientCost || 0 },
        'Labor Cost': { number: laborCost || 0 },
        'Gross Cost': { number: grossCost || 0 },
        'Cost Per Yield': { number: costPerYield || 0 },
        'Cost With Markup': { number: costWithMarkup || 0 },
        'Active': { checkbox: true },
      },
    })

    const recipeId = recipeResponse.id

    // Create recipe ingredient lines
    if (lines && lines.length > 0) {
      for (const line of lines) {
        await notion.pages.create({
          parent: { database_id: RECIPE_INGREDIENTS_DB },
          properties: {
            'Line Item': {
              title: [{ text: { content: line.ingredientName } }],
            },
            'Recipe': {
              relation: [{ id: recipeId }],
            },
            'Ingredient': {
              relation: line.ingredientId ? [{ id: line.ingredientId }] : [],
            },
            'Quantity': { number: line.quantity || 0 },
            'Unit': { select: { name: line.unit || 'g' } },
            'Line Cost': { number: line.lineCost || 0 },
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      id: recipeId,
      linesCreated: lines?.length || 0,
    })
  } catch (error: any) {
    console.error('Error creating recipe:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
