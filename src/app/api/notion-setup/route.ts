import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INGREDIENTS_DB = process.env.NOTION_INGREDIENTS_DB || '2ece4eb3-a205-81e1-a136-cf452793b96a'

// POST: Add conversion properties to Ingredients database
export async function POST() {
  try {
    // First, retrieve the current database to see existing properties
    const database = await notion.databases.retrieve({
      database_id: INGREDIENTS_DB,
    }) as any

    const existingProperties = Object.keys(database.properties)
    const addedProperties: string[] = []
    const skippedProperties: string[] = []

    // Properties to add
    const newProperties: Record<string, any> = {}

    // Invoice Unit - Select field
    if (!existingProperties.includes('Invoice Unit')) {
      newProperties['Invoice Unit'] = {
        select: {
          options: [
            { name: 'box', color: 'blue' },
            { name: 'case', color: 'blue' },
            { name: 'bag', color: 'orange' },
            { name: 'bunch', color: 'green' },
            { name: 'each', color: 'gray' },
            { name: 'bottle', color: 'purple' },
            { name: 'can', color: 'red' },
            { name: 'jar', color: 'yellow' },
            { name: 'pack', color: 'pink' },
            { name: 'pail', color: 'brown' },
          ]
        }
      }
      addedProperties.push('Invoice Unit')
    } else {
      skippedProperties.push('Invoice Unit (already exists)')
    }

    // Conversion Factor - Number field
    if (!existingProperties.includes('Conversion Factor')) {
      newProperties['Conversion Factor'] = {
        number: {
          format: 'number'
        }
      }
      addedProperties.push('Conversion Factor')
    } else {
      skippedProperties.push('Conversion Factor (already exists)')
    }

    // Conversion Notes - Rich text field
    if (!existingProperties.includes('Conversion Notes')) {
      newProperties['Conversion Notes'] = {
        rich_text: {}
      }
      addedProperties.push('Conversion Notes')
    } else {
      skippedProperties.push('Conversion Notes (already exists)')
    }

    // Update database if there are new properties to add
    if (Object.keys(newProperties).length > 0) {
      await notion.databases.update({
        database_id: INGREDIENTS_DB,
        properties: newProperties,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Database updated successfully`,
      addedProperties,
      skippedProperties,
      totalProperties: existingProperties.length + addedProperties.length,
    })

  } catch (error: any) {
    console.error('Notion setup error:', error)

    // Provide more detailed error info
    if (error.code === 'validation_error') {
      return NextResponse.json({
        success: false,
        error: 'Validation error - the Notion API may not allow adding properties to this database type',
        details: error.message,
        suggestion: 'You may need to add the properties manually in Notion',
      }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Setup failed' },
      { status: 500 }
    )
  }
}

// GET: Check current database schema
export async function GET() {
  try {
    const database = await notion.databases.retrieve({
      database_id: INGREDIENTS_DB,
    }) as any

    const properties = Object.entries(database.properties).map(([name, prop]: [string, any]) => ({
      name,
      type: prop.type,
      id: prop.id,
    }))

    const hasConversionFields = {
      invoiceUnit: properties.some(p => p.name === 'Invoice Unit'),
      conversionFactor: properties.some(p => p.name === 'Conversion Factor'),
      conversionNotes: properties.some(p => p.name === 'Conversion Notes'),
    }

    return NextResponse.json({
      success: true,
      databaseId: INGREDIENTS_DB,
      databaseTitle: database.title?.[0]?.plain_text || 'Unknown',
      propertyCount: properties.length,
      properties,
      hasConversionFields,
      ready: hasConversionFields.invoiceUnit && hasConversionFields.conversionFactor,
    })

  } catch (error: any) {
    console.error('Get schema error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
