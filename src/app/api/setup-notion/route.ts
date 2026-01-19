import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'

// Add required fields to Ingredients database
export async function POST() {
  try {
    // Update database schema to add Latest Price and Price Updated fields
    const response = await notion.databases.update({
      database_id: INGREDIENTS_DB,
      properties: {
        'Latest Price': {
          number: {
            format: 'dollar',
          },
        },
        'Price Updated': {
          date: {},
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Added Latest Price and Price Updated fields to Ingredients database',
      databaseId: INGREDIENTS_DB,
      properties: Object.keys((response as any).properties),
    })

  } catch (error: any) {
    console.error('Setup Notion error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update database schema',
        code: error.code,
      },
      { status: 500 }
    )
  }
}

// GET: Check current database schema
export async function GET() {
  try {
    const response = await notion.databases.retrieve({
      database_id: INGREDIENTS_DB,
    })

    const properties = (response as any).properties
    const propertyNames = Object.keys(properties)

    return NextResponse.json({
      success: true,
      databaseId: INGREDIENTS_DB,
      title: (response as any).title?.[0]?.plain_text || 'Unknown',
      properties: propertyNames,
      hasLatestPrice: propertyNames.includes('Latest Price'),
      hasPriceUpdated: propertyNames.includes('Price Updated'),
      schema: Object.fromEntries(
        Object.entries(properties).map(([name, prop]: [string, any]) => [
          name,
          { type: prop.type, id: prop.id }
        ])
      ),
    })

  } catch (error: any) {
    console.error('Get schema error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get database schema' },
      { status: 500 }
    )
  }
}
