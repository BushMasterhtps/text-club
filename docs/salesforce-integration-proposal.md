# Salesforce Integration Proposal
## Portal-to-Salesforce Two-Way Sync for Email Case Management

**Date:** November 2025  
**Prepared by:** [Your Name]  
**Purpose:** Technical feasibility and implementation plan for integrating Salesforce with the existing portal system

---

## Executive Summary

This proposal outlines a plan to integrate Salesforce with our existing portal system to enable email case management, two-way data synchronization, and enhanced analytics. The integration will allow agents to work cases directly in the portal while Salesforce remains the source of truth for all customer communications and case activity.

**Key Benefits:**
- Centralized workspace for all agent tasks (Text Club, WOD/IVCS, Email Requests, Yotpo, Holds, and now Salesforce Cases)
- Real-time AHT (Average Handle Time) tracking per case type
- Improved analytics and forecasting capabilities
- Better agent experience with unified interface
- Full control over UI/UX without Power Apps limitations

---

## Current State

**Existing Portal Capabilities:**
- Task management for Text Club, WOD/IVCS, Email Requests, Yotpo, Holds, Refunds
- Agent assignment and workload balancing
- Real-time analytics and performance tracking
- Sprint-based performance metrics
- One-on-one notes and agent management
- Knowledge base system

**Current Salesforce Usage:**
- Customer service team handles email cases in Salesforce
- Limited visibility into agent performance metrics
- No AHT tracking per case type
- Separate system from portal workflow

---

## Proposed Solution

### Architecture Overview

```
Salesforce (Source of Truth)
    ↕ API Integration
Portal (Working Interface)
    ↕ Database Sync
PostgreSQL Database (Local Cache + Analytics)
```

**Key Principles:**
1. **Salesforce as Source of Truth:** All customer communications and case data originate in Salesforce
2. **Portal as Working Interface:** Agents interact with cases through the portal
3. **Two-Way Sync:** Changes in portal sync back to Salesforce automatically
4. **Real-Time Analytics:** Portal tracks metrics Salesforce doesn't provide (AHT, case type performance, etc.)

---

## Technical Requirements

### 1. Salesforce API Access

**Required from IT/Salesforce Admin:**

- [ ] **Salesforce Connected App Setup**
  - OAuth 2.0 authentication
  - Client ID and Client Secret
  - Refresh token for long-term access
  - API access permissions

- [ ] **API Permissions Needed:**
  - Read/Write access to Case object
  - Read/Write access to EmailMessage object
  - Read/Write access to CaseComment object
  - Send Email via Salesforce API
  - Read access to Contact/Account objects (for customer info)

- [ ] **Salesforce Object Structure Documentation:**
  - Case object field mapping
  - EmailMessage object structure
  - CaseComment object structure
  - Custom fields and their purposes
  - Required vs optional fields

- [ ] **Webhook/Platform Event Setup (Optional but Recommended):**
  - Outbound Message or Platform Event for real-time case updates
  - Webhook endpoint URL (will be provided after portal setup)
  - Security token for webhook validation

### 2. Network & Security Requirements

- [ ] **Outbound API Access:**
  - Portal server (Netlify) needs HTTPS outbound access to `*.salesforce.com`
  - No firewall restrictions on Salesforce API endpoints
  - Port 443 (HTTPS) access

- [ ] **Inbound Webhook Access (if using webhooks):**
  - Publicly accessible endpoint for Salesforce to send updates
  - HTTPS endpoint (Netlify Functions can provide this)
  - Webhook security token validation

- [ ] **Environment Variables:**
  - Secure storage for Salesforce credentials
  - Netlify environment variables (already configured)
  - No hardcoded credentials in code

### 3. Database Schema Updates

**Required Database Changes:**
- New table: `SalesforceCase` (to store synced cases)
- New table: `SalesforceSyncLog` (to track sync operations)
- New table: `SalesforceEmailThread` (to store email conversations)
- Updates to existing `User` table (link to Salesforce user IDs if needed)

**Database Access:**
- Current PostgreSQL database (Railway) can accommodate new tables
- No additional database setup required
- Migration scripts will be provided

### 4. API Rate Limits & Performance

**Salesforce API Limits:**
- Standard org: 5,000 API calls per day
- Enterprise org: 10,000+ API calls per day
- Per-transaction limits: 2,000 records per call

**Optimization Strategy:**
- Batch API calls where possible
- Polling interval: 2-5 minutes (configurable)
- Incremental sync (only fetch changed records)
- Caching to reduce redundant API calls

---

## Implementation Phases

### Phase 1: Foundation & Read-Only Integration (Weeks 1-2)

**Deliverables:**
- Salesforce Connected App configuration
- Authentication flow (OAuth 2.0)
- API endpoint to fetch cases from Salesforce
- Database schema for storing cases
- Basic case list view in portal

**Resources Needed:**
- Salesforce admin time: 2-4 hours (Connected App setup)
- Portal development: 20-30 hours
- Testing: 4-6 hours

**Success Criteria:**
- Cases appear in portal within 5 minutes of creation in Salesforce
- Case details display correctly
- Email thread visible in portal

---

### Phase 2: Case Assignment & Routing (Week 3)

**Deliverables:**
- Auto-assignment logic (similar to existing task assignment)
- Manual assignment capability
- Update Salesforce case owner when assigned in portal
- Assignment tracking in analytics

**Resources Needed:**
- Portal development: 15-20 hours
- Testing: 3-4 hours

**Success Criteria:**
- Cases auto-assigned based on workload
- Salesforce case owner updates automatically
- Assignment visible in both systems

---

### Phase 3: Email Reply Functionality (Weeks 4-6)

**Deliverables:**
- Email composer in portal
- Send email replies through Salesforce API
- Email thread synchronization
- Email metrics tracking (response time, handle time)

**Resources Needed:**
- Portal development: 30-40 hours
- Salesforce email template configuration: 2-3 hours
- Testing: 6-8 hours

**Success Criteria:**
- Agents can reply to emails from portal
- Emails sent through Salesforce appear in case thread
- Email metrics tracked accurately

---

### Phase 4: Full Two-Way Sync (Weeks 7-9)

**Deliverables:**
- Sync notes/comments to Salesforce
- Sync status updates
- Sync case type/category
- Conflict resolution (Salesforce wins)
- Error handling and retry logic

**Resources Needed:**
- Portal development: 40-50 hours
- Testing: 8-10 hours
- Salesforce field mapping documentation: 2-3 hours

**Success Criteria:**
- All portal updates sync to Salesforce within 30 seconds
- No data loss during sync
- Conflicts resolved correctly

---

### Phase 5: Analytics & Reporting (Weeks 10-11)

**Deliverables:**
- AHT tracking per case type
- Agent performance metrics for email cases
- Case volume trends
- Integration with existing analytics dashboard

**Resources Needed:**
- Portal development: 20-25 hours
- Testing: 4-5 hours

**Success Criteria:**
- AHT metrics visible in analytics
- Case type breakdown available
- Agent performance comparable to other task types

---

## Resource Requirements

### Development Resources

**Portal Development:**
- Full-stack developer: 120-150 hours total
- Timeline: 10-11 weeks (can be accelerated with dedicated resources)
- Skills needed: Next.js, TypeScript, Prisma, REST API integration

**Salesforce Configuration:**
- Salesforce admin: 8-12 hours total
- Skills needed: Connected App setup, API permissions, field mapping

### Infrastructure Resources

**Current Infrastructure (No Additional Cost):**
- Netlify hosting (already in use)
- Railway PostgreSQL database (already in use)
- GitHub for version control (already in use)

**Potential Additional Costs:**
- None expected (using existing infrastructure)
- Salesforce API usage within standard limits (no additional cost)

### Testing Resources

**QA Testing:**
- 20-30 hours of testing across all phases
- User acceptance testing with customer service team
- Performance testing for API rate limits

---

## Security & Compliance Considerations

### Data Security

- **Authentication:** OAuth 2.0 with refresh tokens
- **Credential Storage:** Environment variables (never in code)
- **Data Transmission:** HTTPS only
- **Webhook Security:** Token validation for incoming webhooks

### Data Privacy

- **Customer Data:** Stored securely in PostgreSQL (same as current system)
- **Sync Logs:** Track all sync operations for audit trail
- **Error Handling:** No sensitive data in error logs

### Compliance

- **Salesforce Compliance:** All data remains in Salesforce (source of truth)
- **Portal Compliance:** Follows same security standards as current portal
- **Audit Trail:** Complete sync log for compliance reporting

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| API rate limits exceeded | High | Implement batching, caching, and incremental sync |
| Salesforce API changes | Medium | Version API calls, monitor Salesforce release notes |
| Sync conflicts | Medium | Salesforce as source of truth, conflict resolution logic |
| Network connectivity issues | Low | Retry logic with exponential backoff |
| Authentication token expiration | Low | Automatic refresh token rotation |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User adoption | Medium | Training sessions, gradual rollout |
| Data accuracy concerns | Medium | Comprehensive testing, audit logs |
| Performance issues | Low | Load testing, optimization |

---

## Success Metrics

### Technical Metrics

- **Sync Latency:** < 30 seconds for portal → Salesforce updates
- **API Reliability:** > 99.5% successful API calls
- **Error Rate:** < 0.5% failed syncs
- **System Uptime:** > 99.9% (same as current portal)

### Business Metrics

- **Agent Adoption:** 80%+ of email cases handled in portal within 30 days
- **AHT Tracking:** 100% of cases tracked by case type
- **Productivity:** Measurable improvement in cases handled per agent
- **User Satisfaction:** Positive feedback from customer service team

---

## Comparison: Portal Integration vs Power Apps

### Advantages of Portal Integration

| Aspect | Portal Integration | Power Apps |
|--------|-------------------|------------|
| **Performance** | Fast, optimized | Can be slow/clunky |
| **Customization** | Full control | Limited by Power Apps framework |
| **Cost** | No per-user licensing | Per-user licensing costs |
| **Integration** | Seamless with existing system | Separate system |
| **Scalability** | Highly scalable | Performance degrades with scale |
| **Maintenance** | Full control | Dependent on Power Apps updates |
| **User Experience** | Consistent with current portal | Different UI/UX |

### Power Apps Considerations

- Requires separate licensing for each user
- Limited customization options
- Performance can be inconsistent
- Additional system to maintain
- Less integration with existing portal analytics

---

## Next Steps & Decision Points

### Immediate Actions Required

1. **Salesforce Admin Review:**
   - Review API access requirements
   - Confirm Connected App setup feasibility
   - Provide Salesforce object structure documentation

2. **IT Security Review:**
   - Review OAuth 2.0 authentication approach
   - Approve outbound API access to Salesforce
   - Approve webhook endpoint (if using webhooks)

3. **Stakeholder Approval:**
   - Customer service team buy-in
   - Management approval for development timeline
   - Resource allocation confirmation

### Decision Points

- [ ] **Sync Method:** Real-time webhooks vs polling (recommendation: start with polling, add webhooks later)
- [ ] **Rollout Strategy:** Big bang vs phased (recommendation: phased by team/department)
- [ ] **Case Types:** Which case types to include initially (recommendation: start with email cases only)

---

## Timeline Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Phase 1: Foundation | 2 weeks | Cases visible in portal |
| Phase 2: Assignment | 1 week | Auto-assignment working |
| Phase 3: Email Replies | 3 weeks | Email replies functional |
| Phase 4: Two-Way Sync | 3 weeks | Full synchronization |
| Phase 5: Analytics | 2 weeks | Complete metrics |
| **Total** | **11 weeks** | **Production-ready system** |

*Timeline can be accelerated with dedicated development resources*

---

## Questions for IT Team

1. **Salesforce Access:**
   - Can we get API access and Connected App setup?
   - What is the Salesforce org type (Standard, Enterprise, etc.)?
   - Are there any API usage restrictions we should be aware of?

2. **Network/Security:**
   - Are there firewall rules that might block Salesforce API access?
   - Can we set up webhook endpoints (if using webhooks)?
   - What security review process do we need to follow?

3. **Resources:**
   - Who will handle Salesforce Connected App setup?
   - What is the approval process for new integrations?
   - Are there any compliance/security requirements we need to meet?

4. **Timeline:**
   - What is the target go-live date?
   - Are there any deadlines or constraints we should be aware of?
   - Can we get dedicated development time for this project?

---

## Conclusion

This Salesforce integration is technically feasible and aligns with the existing portal architecture. The implementation will provide significant value to the customer service team while maintaining Salesforce as the source of truth for all customer communications.

**Recommended Approach:**
- Start with Phase 1 (read-only integration) as a proof of concept
- Validate with customer service team
- Proceed with remaining phases based on feedback

**Key Success Factors:**
- Clear communication between portal development and Salesforce admin
- Thorough testing at each phase
- User training and gradual rollout
- Continuous monitoring and optimization

---

## Appendix: Technical Details

### API Endpoints to Build

1. `GET /api/salesforce/sync` - Fetch cases from Salesforce
2. `POST /api/salesforce/webhook` - Receive updates from Salesforce (if using webhooks)
3. `PUT /api/salesforce/cases/[id]` - Update case in Salesforce
4. `POST /api/salesforce/cases/[id]/reply` - Send email reply
5. `POST /api/salesforce/cases/[id]/notes` - Add note/comment to case
6. `GET /api/salesforce/cases/[id]` - Get case details with email thread

### Database Schema (Prisma)

```prisma
model SalesforceCase {
  id              String   @id @default(cuid())
  salesforceId    String   @unique
  caseNumber      String   @unique
  subject         String?
  status          String?
  priority        String?
  caseType        String?
  customerEmail   String?
  assignedToId    String?
  assignedTo      User?    @relation(fields: [assignedToId], references: [id])
  lastSyncedAt    DateTime?
  syncStatus      String?
  portalStatus    String?
  portalNotes     Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model SalesforceSyncLog {
  id              String   @id @default(cuid())
  caseId          String
  direction       String
  status          String
  errorMessage    String?  @db.Text
  syncedAt        DateTime @default(now())
}
```

### Salesforce API Calls Required

- `GET /services/data/vXX.0/query/?q=SELECT...FROM Case` - Fetch cases
- `PATCH /services/data/vXX.0/sobjects/Case/{id}` - Update case
- `POST /services/data/vXX.0/sobjects/EmailMessage/` - Send email
- `POST /services/data/vXX.0/sobjects/CaseComment/` - Add comment

---

**Document Version:** 1.0  
**Last Updated:** November 2025  
**Contact:** [Your Contact Information]

