# Microsoft Graph API Setup for Email Requests Integration

This guide will help you set up Microsoft Graph API integration to automatically import email requests from your SharePoint Excel file.

## Prerequisites

1. **Azure Active Directory (Azure AD) tenant** with admin access
2. **SharePoint site** with the Excel file containing email requests
3. **Admin permissions** to create app registrations in Azure AD

## Step 1: Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: `Text Club Email Requests Integration`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: Leave blank for now
5. Click **Register**

## Step 2: Configure API Permissions

1. In your new app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated)
5. Add these permissions:
   - `Sites.Read.All` - Read items in all site collections
   - `Files.Read.All` - Read files in all site collections
   - `Sites.ReadWrite.All` - Read and write items in all site collections (if you need to modify data)
6. Click **Add permissions**
7. Click **Grant admin consent** (requires admin privileges)

## Step 3: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description: `Text Club Integration Secret`
4. Choose expiration: `24 months` (or your preferred duration)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - you won't be able to see it again!

## Step 4: Get SharePoint Site Information

1. Go to your SharePoint site: `https://allgoldens.sharepoint.com/sites/GCCCustomerAccounts`
2. Navigate to the **Email Requests 1.xlsx** file
3. Copy the URL - it should look like:
   ```
   https://allgoldens.sharepoint.com/sites/GCCCustomerAccounts/_layouts/15/Doc.aspx?sourcedoc={FB0653A9-249D-4917-AA48-7176E72574ED}&file=Email%20Requests%201.xlsx&action=default&mobileredirect=true
   ```

## Step 5: Configure Environment Variables

Add these environment variables to your `.env.local` file:

```bash
# Microsoft Graph API Configuration
MICROSOFT_CLIENT_ID=your_app_registration_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_value_here

# SharePoint Configuration
SHAREPOINT_SITE_URL=/sites/GCCCustomerAccounts
EXCEL_FILE_NAME=Email Requests 1.xlsx
WORKSHEET_NAME=Email Requests
```

## Step 6: Test the Integration

1. Restart your development server: `npm run dev`
2. Go to the Email Requests Dashboard
3. Click **Import from Microsoft Forms**
4. Check the console logs for detailed import information

## Troubleshooting

### Common Issues:

1. **"Insufficient privileges" error**
   - Ensure admin consent was granted for all API permissions
   - Check that the app registration has the correct permissions

2. **"File not found" error**
   - Verify the Excel file name and location in SharePoint
   - Ensure the file is accessible to the app registration

3. **"Authentication failed" error**
   - Double-check the CLIENT_ID and CLIENT_SECRET values
   - Ensure the client secret hasn't expired

4. **"Site not found" error**
   - Verify the SharePoint site URL is correct
   - Ensure the app has access to the site

### Debug Mode:

To enable detailed logging, add this to your `.env.local`:
```bash
DEBUG_MICROSOFT_GRAPH=true
```

## Security Notes

- **Never commit** the `.env.local` file to version control
- **Rotate client secrets** regularly (every 6-12 months)
- **Use least privilege** - only grant necessary permissions
- **Monitor usage** in Azure AD audit logs

## Alternative: Power Automate Integration

If you prefer a no-code solution, you can also set up a Power Automate flow:

1. Create a **Power Automate** flow triggered by new rows in the Excel file
2. Use the **HTTP** action to call your Text Club API
3. This approach doesn't require Azure app registrations but may have limitations

## Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Review the server logs for API call details
3. Verify all environment variables are set correctly
4. Test with a simple Excel file first to isolate issues
