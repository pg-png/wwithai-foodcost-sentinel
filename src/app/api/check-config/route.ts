import { NextResponse } from 'next/server'

export async function GET() {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
  const keyPrefix = process.env.ANTHROPIC_API_KEY?.substring(0, 10) || 'not set'
  const hasNotionKey = !!process.env.NOTION_API_KEY

  return NextResponse.json({
    anthropicKey: hasAnthropicKey ? `configured (${keyPrefix}...)` : 'NOT CONFIGURED',
    notionKey: hasNotionKey ? 'configured' : 'NOT CONFIGURED',
    environment: process.env.NODE_ENV || 'unknown',
    vercel: process.env.VERCEL === '1' ? 'yes' : 'no',
  })
}
