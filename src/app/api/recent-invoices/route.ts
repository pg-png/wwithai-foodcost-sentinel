import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const INVOICES_DB = process.env.NOTION_INVOICES_DB || '2ece4eb3-a205-8123-9734-ed7e5a7546dc'

interface RecentInvoice {
  id: string
  invoiceNumber: string
  supplier: string
  location: string
  totalAmount: number
  currency: string
  itemsCount: number
  status: string
  createdAt: string
  notionUrl: string
}

export async function GET() {
  try {
    const response: any = await notion.databases.query({
      database_id: INVOICES_DB,
      page_size: 10,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    })

    const invoices: RecentInvoice[] = []

    for (const page of response.results) {
      const props = (page as any).properties

      // Extract properties with flexible field names
      const invoiceNumber = props['Invoice Number']?.title?.[0]?.plain_text ||
                           props['Name']?.title?.[0]?.plain_text || ''
      const supplier = props['Supplier']?.select?.name ||
                       props['Supplier']?.rich_text?.[0]?.plain_text || ''
      const location = props['Location']?.select?.name ||
                       props['Restaurant']?.select?.name || ''
      const totalAmount = props['Total Amount']?.number || 0
      const currency = props['Currency']?.select?.name || 'CAD'
      const itemsCount = props['Items Count']?.number || 0
      const status = props['Status']?.select?.name || 'Pending'
      const createdAt = (page as any).created_time

      invoices.push({
        id: page.id,
        invoiceNumber,
        supplier,
        location,
        totalAmount,
        currency,
        itemsCount,
        status,
        createdAt,
        notionUrl: `https://www.notion.so/${page.id.replace(/-/g, '')}`,
      })
    }

    return NextResponse.json({
      success: true,
      invoices,
      total: invoices.length,
    })

  } catch (error: any) {
    console.error('Recent invoices API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch recent invoices' },
      { status: 500 }
    )
  }
}
