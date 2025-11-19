# Salesforce Access Requirements for Self-Setup
## What You Need to Set Up the Integration Yourself

---

## Minimum Required Access Level

### **System Administrator** (Recommended)
- **Why:** Full access to all configuration settings
- **What you can do:**
  - Create Connected Apps
  - Configure API access
  - Modify object permissions
  - Set up email settings
  - Access all data and settings

### **Custom Profile with Specific Permissions** (Alternative)
If you can't get System Admin access, you'll need a custom profile with these permissions:

---

## Required Permissions Breakdown

### 1. Connected App Setup
**Required Permission:**
- **"Manage Connected Apps"** or **"Customize Application"**
- **Location:** Setup → App Manager → Connected Apps

**What you need to do:**
- Create a new Connected App
- Configure OAuth settings
- Generate Client ID and Client Secret
- Set callback URLs

**Can be done with:** System Admin OR Custom Profile with "Manage Connected Apps" permission

---

### 2. API Access Configuration
**Required Permission:**
- **"API Enabled"** (on your user profile)
- **"Modify All Data"** (to read/write all objects) OR specific object permissions

**What you need to do:**
- Enable API access for your user
- Verify API is enabled at org level (usually already enabled)

**Can be done with:** System Admin OR Profile with "API Enabled" + object permissions

---

### 3. Object Permissions (Read/Write)

**Required Objects & Permissions:**

| Object | Read | Create | Edit | Delete |
|--------|------|--------|------|--------|
| **Case** | ✅ Required | ✅ Required | ✅ Required | ❌ Optional |
| **EmailMessage** | ✅ Required | ✅ Required | ✅ Required | ❌ Optional |
| **CaseComment** | ✅ Required | ✅ Required | ✅ Required | ❌ Optional |
| **Contact** | ✅ Required | ❌ Optional | ❌ Optional | ❌ Optional |
| **Account** | ✅ Required | ❌ Optional | ❌ Optional | ❌ Optional |

**What you need to do:**
- Verify you can query these objects via API
- Test creating/updating records
- Check field-level security (some fields might be restricted)

**Can be done with:** System Admin OR Profile with object-level permissions

---

### 4. Email Configuration
**Required Permission:**
- **"Send Email"** or **"Send Email via API"**
- **"Email Administration"** (for email template access)

**What you need to do:**
- Configure email settings
- Set up email templates (optional but recommended)
- Test sending emails via API

**Can be done with:** System Admin OR Profile with email permissions

---

### 5. Field-Level Security
**Required Permission:**
- **"Modify All"** OR access to specific fields

**What you need to check:**
- Case object fields (Status, Priority, Subject, etc.)
- EmailMessage fields (TextBody, HtmlBody, etc.)
- Any custom fields you want to sync

**Can be done with:** System Admin OR Profile with field-level access

---

## Step-by-Step: What You Can Do With Each Access Level

### ✅ **System Administrator** (Full Control)
**You can do everything yourself:**
1. ✅ Create Connected App
2. ✅ Configure OAuth settings
3. ✅ Set up API access
4. ✅ Modify object permissions
5. ✅ Configure email settings
6. ✅ Test API calls
7. ✅ Debug any permission issues

**Time to set up:** 2-4 hours (first time)

---

### ⚠️ **Custom Profile with Permissions** (Partial Control)
**You can do most things, but may need help:**
1. ✅ Create Connected App (if "Manage Connected Apps" permission granted)
2. ⚠️ Configure OAuth (may need admin to approve)
3. ✅ Test API calls (if API Enabled)
4. ⚠️ Modify permissions (may need admin for some settings)
5. ⚠️ Email configuration (may need admin approval)

**Time to set up:** 3-6 hours (may need to coordinate with admin)

---

### ❌ **Standard User** (Limited Control)
**You'll need IT/Salesforce Admin help:**
1. ❌ Cannot create Connected Apps
2. ❌ Cannot modify permissions
3. ⚠️ Can test API calls (if API Enabled on profile)
4. ❌ Cannot configure email settings

**Time to set up:** Not feasible without admin help

---

## Recommended Approach: Request Specific Permissions

If you can't get System Admin access, request a custom profile with these permissions:

### **Profile Name:** "Integration Administrator" or "Portal Integration User"

### **Required Permissions:**
```
✅ API Enabled
✅ Manage Connected Apps
✅ Modify All Data (or specific object permissions)
✅ Send Email via API
✅ Email Administration
✅ Customize Application (for some settings)
```

### **Object Permissions:**
```
Case: Read, Create, Edit
EmailMessage: Read, Create, Edit
CaseComment: Read, Create, Edit
Contact: Read
Account: Read
```

### **Field Permissions:**
```
All standard fields on Case, EmailMessage, CaseComment
Any custom fields you need to sync
```

---

## What You Can Test Without Full Access

### **API Testing (If API Enabled)**
Even with limited access, you can:
1. ✅ Test querying cases (if you have read access)
2. ✅ Test updating cases (if you have edit access)
3. ✅ Test sending emails (if email permissions granted)
4. ⚠️ May hit field-level security restrictions

### **Tools for Testing:**
- **Postman** - Test Salesforce REST API calls
- **Workbench** - Browser-based Salesforce API tool
- **Salesforce Developer Console** - Built-in API testing

---

## Common Permission Issues & Solutions

### **Issue 1: "Insufficient Access Rights"**
**Cause:** Missing object or field permissions  
**Solution:** Request "Modify All Data" or specific object permissions

### **Issue 2: "Email Not Sent"**
**Cause:** Missing email permissions  
**Solution:** Request "Send Email via API" permission

### **Issue 3: "Connected App Creation Failed"**
**Cause:** Missing "Manage Connected Apps" permission  
**Solution:** Request System Admin access OR custom permission

### **Issue 4: "Field Not Accessible"**
**Cause:** Field-level security restrictions  
**Solution:** Request field access OR use "Modify All Data"

---

## Checklist: What to Request from IT/Salesforce Admin

If you can't get System Admin access, request:

- [ ] **Profile/User Access:**
  - [ ] API Enabled checkbox
  - [ ] "Manage Connected Apps" permission
  - [ ] "Modify All Data" OR specific object permissions
  - [ ] "Send Email via API" permission
  - [ ] "Email Administration" permission

- [ ] **Object Permissions:**
  - [ ] Case: Read, Create, Edit
  - [ ] EmailMessage: Read, Create, Edit
  - [ ] CaseComment: Read, Create, Edit
  - [ ] Contact: Read
  - [ ] Account: Read

- [ ] **Field-Level Security:**
  - [ ] All standard Case fields
  - [ ] All standard EmailMessage fields
  - [ ] All standard CaseComment fields
  - [ ] Any custom fields needed

- [ ] **Org-Level Settings:**
  - [ ] API access enabled (usually already enabled)
  - [ ] Email deliverability settings configured
  - [ ] Connected App creation allowed

---

## Alternative: Developer Edition (For Testing)

If you want to practice/test without affecting production:

### **Salesforce Developer Edition**
- **Cost:** Free
- **Access:** Full System Admin access
- **Limitations:** 
  - Limited data storage
  - Not connected to production
  - Good for testing/learning

**Use Case:** Practice setting up Connected Apps, testing API calls, understanding the flow

**How to Get:** Sign up at developer.salesforce.com

---

## Recommended Access Level for You

### **Best Case: System Administrator**
- Full control
- Can troubleshoot issues yourself
- No waiting on IT for permission changes
- **Request this if possible**

### **Good Case: Custom Profile with All Required Permissions**
- Can do 90% of setup yourself
- May need occasional admin help
- **Request specific permissions listed above**

### **Minimum Case: Standard User + IT Support**
- IT/Salesforce Admin handles Connected App setup
- You handle portal-side development
- Coordinate for testing
- **Workable but slower**

---

## Time Investment by Access Level

| Access Level | Setup Time | Troubleshooting | Independence |
|--------------|------------|-----------------|--------------|
| **System Admin** | 2-4 hours | Can fix yourself | 100% |
| **Custom Profile** | 3-6 hours | May need help | 80% |
| **Standard User** | N/A | Need IT help | 20% |

---

## Questions to Ask Your IT/Salesforce Admin

1. **"Can I get System Administrator access, or at least a custom profile with integration permissions?"**

2. **"What's the process for creating Connected Apps? Can I do it, or do you need to?"**

3. **"Are there any API restrictions or rate limits I should be aware of?"**

4. **"Can you enable 'API Enabled' on my profile if it's not already?"**

5. **"What object and field permissions do I currently have?"**

6. **"Can I get 'Send Email via API' permission for testing?"**

7. **"Is there a sandbox/developer org I can use for testing?"**

---

## Bottom Line

**To set this up completely yourself, you need:**
- ✅ **System Administrator access** (ideal)
- OR
- ✅ **Custom profile with:** API Enabled + Manage Connected Apps + Modify All Data + Email permissions

**Without these permissions, you'll need IT/Salesforce Admin help for:**
- Connected App creation
- Permission configuration
- Some troubleshooting

**Recommendation:** Request System Admin access or a custom "Integration Administrator" profile. This gives you full control and independence.

---

**Document Version:** 1.0  
**Last Updated:** November 2025

