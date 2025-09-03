import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    const jwtSecret = process.env.JWT_SECRET;
    
    return NextResponse.json({
      success: true,
      hasDatabaseUrl: !!databaseUrl,
      hasJwtSecret: !!jwtSecret,
      databaseUrlPrefix: databaseUrl ? databaseUrl.substring(0, 20) + '...' : 'NOT_SET',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
