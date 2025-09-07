import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication } from '@azure/msal-node';

// Microsoft Graph API Configuration
const config = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    authority: 'https://login.microsoftonline.com/common',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: any, message: string, containsPii: any) => {
        if (containsPii) {
          return;
        }
        console.log(`[MSAL] ${level}: ${message}`);
      },
      piiLoggingEnabled: false,
      logLevel: 'Info',
    },
  },
};

// Initialize MSAL
const cca = new ConfidentialClientApplication(config);

// Get access token for Microsoft Graph
export async function getAccessToken(): Promise<string> {
  try {
    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
    return response?.accessToken || '';
  } catch (error) {
    console.error('Error acquiring access token:', error);
    throw new Error('Failed to acquire Microsoft Graph access token');
  }
}

// Initialize Graph client
export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// Read Excel data from SharePoint
export async function readExcelData(
  siteId: string,
  driveId: string,
  itemId: string,
  worksheetName: string = 'Email Requests'
): Promise<any[]> {
  try {
    const accessToken = await getAccessToken();
    const graphClient = getGraphClient(accessToken);

    // Get the Excel file
    const workbook = await graphClient
      .sites(siteId)
      .drives(driveId)
      .items(itemId)
      .workbook
      .worksheets(worksheetName)
      .get();

    // Get the used range of the worksheet
    const usedRange = await graphClient
      .sites(siteId)
      .drives(driveId)
      .items(itemId)
      .workbook
      .worksheets(worksheetName)
      .usedRange()
      .get();

    // Get the values from the used range
    const values = await graphClient
      .sites(siteId)
      .drives(driveId)
      .items(itemId)
      .workbook
      .worksheets(worksheetName)
      .range(usedRange.address)
      .get();

    return values.values || [];
  } catch (error) {
    console.error('Error reading Excel data:', error);
    throw new Error('Failed to read Excel data from SharePoint');
  }
}

// Get SharePoint site information
export async function getSharePointSite(siteUrl: string): Promise<{ siteId: string; driveId: string }> {
  try {
    const accessToken = await getAccessToken();
    const graphClient = getGraphClient(accessToken);

    // Extract site ID from URL
    const site = await graphClient.sites.getByPath(siteUrl, 'root').get();
    
    // Get the default drive (document library)
    const drive = await graphClient.sites(site.id).drive.get();

    return {
      siteId: site.id,
      driveId: drive.id,
    };
  } catch (error) {
    console.error('Error getting SharePoint site:', error);
    throw new Error('Failed to get SharePoint site information');
  }
}

// Find Excel file by name
export async function findExcelFile(
  siteId: string,
  driveId: string,
  fileName: string
): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    const graphClient = getGraphClient(accessToken);

    // Search for the Excel file
    const searchResults = await graphClient
      .sites(siteId)
      .drives(driveId)
      .root
      .search(fileName)
      .get();

    // Find the Excel file
    const excelFile = searchResults.value?.find(
      (item: any) => item.name === fileName && item.file?.mimeType?.includes('spreadsheet')
    );

    return excelFile?.id || null;
  } catch (error) {
    console.error('Error finding Excel file:', error);
    return null;
  }
}

// Parse Excel data into email request format
export function parseEmailRequestData(excelData: any[][]): any[] {
  if (!excelData || excelData.length < 2) {
    return [];
  }

  const headers = excelData[0];
  const rows = excelData.slice(1);

  // Map column headers to our expected format
  const columnMap: { [key: string]: string } = {
    'Start time': 'startTime',
    'Completion time': 'completionTime',
    'Email': 'email',
    'Name': 'name',
    'SaleForce Case Number (please DO NOT include any other system number) I.E 1234567': 'salesforceCaseNumber',
    'What is the email request for?': 'emailRequestFor',
    'Details': 'details',
    'Error?': 'error',
    'Email Sent Yes/No': 'emailSent',
    'Name2': 'name2',
    'Processed': 'processed',
    'Column1': 'column1',
  };

  return rows.map((row, index) => {
    const rowData: any = { rowNumber: index + 2 }; // +2 because Excel is 1-indexed and we skip header

    headers.forEach((header, colIndex) => {
      const mappedKey = columnMap[header] || header.toLowerCase().replace(/\s+/g, '_');
      rowData[mappedKey] = row[colIndex] || null;
    });

    return rowData;
  });
}

// Filter data based on date criteria (9/6/2025 onwards)
export function filterEmailRequestData(data: any[]): any[] {
  const cutoffDate = new Date('2025-09-06T00:00:00Z');
  
  return data.filter((row) => {
    // Check if completion time is after cutoff date
    if (row.completionTime) {
      const completionDate = new Date(row.completionTime);
      return completionDate >= cutoffDate;
    }
    
    // If no completion time, check start time
    if (row.startTime) {
      const startDate = new Date(row.startTime);
      return startDate >= cutoffDate;
    }
    
    // If no dates, include it (shouldn't happen with proper data)
    return true;
  });
}
