import { NextResponse } from 'next/server';
import { getAccessToken, getSharePointSite, findExcelFile } from '@/lib/microsoft-graph';

export async function GET() {
  try {
    // Check if Microsoft Graph is configured
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: 'Microsoft Graph API not configured',
        details: {
          clientId: !!process.env.MICROSOFT_CLIENT_ID,
          clientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
        }
      });
    }

    console.log('🔍 Testing Microsoft Graph connection...');

    // Test 1: Get access token
    const accessToken = await getAccessToken();
    console.log('✅ Access token acquired successfully');

    // Test 2: Get SharePoint site information
    const SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || '/sites/GCCCustomerAccounts';
    const { siteId, driveId } = await getSharePointSite(SHAREPOINT_SITE_URL);
    console.log(`✅ SharePoint site found: ${siteId}`);

    // Test 3: Find Excel file
    const EXCEL_FILE_NAME = process.env.EXCEL_FILE_NAME || 'Email Requests 1.xlsx';
    const excelFileId = await findExcelFile(siteId, driveId, EXCEL_FILE_NAME);
    
    if (!excelFileId) {
      return NextResponse.json({
        success: false,
        error: `Excel file "${EXCEL_FILE_NAME}" not found`,
        details: {
          siteId,
          driveId,
          fileName: EXCEL_FILE_NAME,
        }
      });
    }

    console.log(`✅ Excel file found: ${excelFileId}`);

    return NextResponse.json({
      success: true,
      message: 'Microsoft Graph connection successful!',
      details: {
        siteId,
        driveId,
        excelFileId,
        fileName: EXCEL_FILE_NAME,
        siteUrl: SHAREPOINT_SITE_URL,
      }
    });

  } catch (error) {
    console.error('❌ Microsoft Graph connection test failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Connection test failed',
        details: {
          clientId: !!process.env.MICROSOFT_CLIENT_ID,
          clientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
          siteUrl: process.env.SHAREPOINT_SITE_URL,
          fileName: process.env.EXCEL_FILE_NAME,
        }
      },
      { status: 500 }
    );
  }
}
