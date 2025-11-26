# Holds "Unable to Resolve" Fix - Complete Game Plan

## 🎯 Objectives

1. ✅ Fix "Unable to Resolve" tasks not being counted in agent completion stats
2. ✅ Ensure 100% testing before deployment
3. ✅ Create backup/rollback plan
4. ✅ Update self-healing code if needed
5. ✅ Deploy at 4pm (after agents finish work)

---

## ❓ Questions I Need Answered

### 1. Deployment & Timing
- **Q:** What timezone is 4pm? (PST/EST/UTC?)
- **Q:** Should we deploy via Git push to main branch, or do you have a staging environment?
- **Q:** Do you want me to create a feature branch for this work, or work directly on main?
- **Q:** After deployment, should we monitor for X minutes before considering it successful?

### 2. Backup & Rollback
- **Q:** Do you have automated database backups, or should I create a manual backup script?
- **Q:** For rollback, do you prefer:
  - **Option A:** Revert Git commit + remove migration fields (safest)
  - **Option B:** Keep code, just disable new queries (quick rollback)
  - **Option C:** Both (full safety net)

### 3. Testing Environment
- **Q:** Do you have a staging/test environment, or should we test locally first?
- **Q:** Can we test with a test agent account in production (with test tasks)?
- **Q:** Should I create test scripts to verify the fix works?

### 4. Self-Healing Code
- **Q:** I see self-healing is used in some endpoints. Should I add it to:
  - `/api/agent/completion-stats` (currently doesn't have it)
  - `/api/agent/tasks/[id]/complete` (completion endpoint)
  - Other endpoints we're modifying?
- **Q:** Are there specific error scenarios we should handle with self-healing?

### 5. Historical Data Backfill
- **Q:** For the 15+ existing "Unable to Resolve" tasks:
  - **Option A:** Try to backfill automatically using heuristics
  - **Option B:** Create a script you can run manually to review each one
  - **Option C:** Skip historical, only fix going forward
- **Q:** If we backfill, should we do it:
  - Before deployment (safer)
  - After deployment (can test first)

### 6. Monitoring & Alerts
- **Q:** After deployment, what should we monitor?
  - Agent completion counts (should go up)
  - Error rates (should stay same)
  - Database query performance (should be similar)
- **Q:** Do you have error monitoring/alerts set up? (Sentry, etc.)

---

## 📋 Implementation Plan

### Phase 1: Preparation & Backup (30 min) ⏰ **DO FIRST**

#### 1.1 Create Database Backup
```bash
# Create backup script
node scripts/backup-railway-data.js
# Or manual backup via Railway dashboard
```

#### 1.2 Create Git Branch
```bash
git checkout -b fix/holds-unable-to-resolve-counting
git push -u origin fix/holds-unable-to-resolve-counting
```

#### 1.3 Document Current State
- List all files we'll modify
- Document current query patterns
- Create rollback checklist

---

### Phase 2: Database Migration (30-45 min)

#### 2.1 Update Prisma Schema
- Add `completedBy String?` field
- Add `completedAt DateTime?` field
- Both nullable (safe, backward compatible)

#### 2.2 Create Migration
```bash
npx prisma migrate dev --name add_completed_by_tracking --create-only
```

#### 2.3 Test Migration Locally
- Test on local database first
- Verify fields added correctly
- Verify no data loss

#### 2.4 Prepare Migration for Production
- Migration file ready to run
- **DO NOT RUN YET** - wait until 4pm deployment

---

### Phase 3: Code Updates (90-120 min)

#### 3.1 Update Completion Logic
**File:** `src/app/api/agent/tasks/[id]/complete/route.ts`
- Add `completedBy` when `shouldUnassign = true` for Holds tasks
- Test all 4 unassigning dispositions

#### 3.2 Update Completion Stats Queries (18+ files)

**Priority 1 - Agent Portal (Critical):**
1. `src/app/api/agent/completion-stats/route.ts` ⭐ **ADD SELF-HEALING**
2. `src/app/api/agent/stats/route.ts`
3. `src/app/api/agent/completed-today/route.ts`
4. `src/app/api/agent/personal-scorecard/route.ts`

**Priority 2 - Manager Dashboard:**
5. `src/app/api/manager/dashboard/agent-progress/route.ts`
6. `src/app/api/manager/dashboard/completed-work/route.ts`
7. `src/app/api/manager/dashboard/metrics/route.ts`
8. `src/app/api/manager/agents/progress/route.ts`

**Priority 3 - Holds Analytics:**
9. `src/app/api/holds/analytics/route.ts` - `getAgentPerformance()`

**Priority 4 - General Analytics:**
10. `src/app/api/analytics/agent-status/route.ts`
11. `src/app/api/analytics/overview/route.ts`
12. Other analytics endpoints (as found)

**For each file:**
- Add `completedBy` to OR conditions
- Add self-healing wrapper if missing
- Test query works correctly

#### 3.3 Add Self-Healing to Critical Endpoints
- `/api/agent/completion-stats` - **MUST ADD**
- `/api/agent/tasks/[id]/complete` - **MUST ADD**
- Other endpoints as needed

---

### Phase 4: Testing (60-90 min)

#### 4.1 Unit Testing
- [ ] Test completion with "Unable to Resolve" sets `completedBy`
- [ ] Test completion with "In Communication" sets `completedBy`
- [ ] Test completion with "International Order" sets `completedBy`
- [ ] Test completion with "Duplicate" sets `completedBy`
- [ ] Test regular completions still work (no regression)

#### 4.2 Integration Testing
- [ ] Test agent portal shows correct count
- [ ] Test manager dashboard shows correct count
- [ ] Test analytics shows correct count
- [ ] Test today's stats vs lifetime stats
- [ ] Test with multiple agents (no cross-contamination)

#### 4.3 Self-Healing Testing
- [ ] Test retry logic works on database errors
- [ ] Test circuit breaker prevents cascading failures
- [ ] Test error responses are handled gracefully

#### 4.4 Performance Testing
- [ ] Verify query performance (should be similar)
- [ ] Check database connection usage (no increase)
- [ ] Test with multiple concurrent requests

---

### Phase 5: Backfill Script (30-45 min)

#### 5.1 Create Backfill Script
- Identify unassigned completed tasks
- Show queue history and timestamps
- Allow manual review or heuristic assignment

#### 5.2 Test Backfill Script
- Test on sample data
- Verify it doesn't break anything
- **DO NOT RUN ON PRODUCTION YET**

---

### Phase 6: Pre-Deployment Checklist (15 min)

#### 6.1 Code Review
- [ ] All files updated correctly
- [ ] Self-healing added where needed
- [ ] No breaking changes
- [ ] All tests passing

#### 6.2 Database Migration Ready
- [ ] Migration file created
- [ ] Tested locally
- [ ] Ready to run on Railway

#### 6.3 Backup Verified
- [ ] Database backup created
- [ ] Git branch pushed
- [ ] Rollback plan documented

#### 6.4 Documentation
- [ ] Changes documented
- [ ] Rollback steps documented
- [ ] Monitoring checklist ready

---

### Phase 7: Deployment (At 4pm)

#### 7.1 Pre-Deployment (5 min)
- [ ] Confirm agents are done working
- [ ] Verify no active Holds tasks being completed
- [ ] Notify team of deployment

#### 7.2 Deploy Database Migration (5-10 min)
```bash
# On Railway or via Prisma
npx prisma migrate deploy
# OR
# Run migration via Railway dashboard
```

#### 7.3 Deploy Code (5 min)
```bash
# Merge to main and push
git checkout main
git merge fix/holds-unable-to-resolve-counting
git push origin main
# Netlify will auto-deploy
```

#### 7.4 Verify Deployment (10 min)
- [ ] Check Netlify deployment succeeded
- [ ] Verify database fields exist
- [ ] Test one completion with "Unable to Resolve"
- [ ] Verify count updates correctly

#### 7.5 Run Backfill (Optional - 15 min)
- [ ] Run backfill script if approved
- [ ] Verify historical counts update

---

### Phase 8: Post-Deployment Monitoring (30 min)

#### 8.1 Immediate Checks (First 15 min)
- [ ] No error spikes in logs
- [ ] Agent portal loads correctly
- [ ] Manager dashboard loads correctly
- [ ] Completion counts look correct

#### 8.2 Functional Checks (Next 15 min)
- [ ] Test completing a task with "Unable to Resolve"
- [ ] Verify count increases
- [ ] Test other dispositions still work
- [ ] Verify no regressions

#### 8.3 Success Criteria
- ✅ "Unable to Resolve" tasks are counted
- ✅ No increase in error rates
- ✅ No performance degradation
- ✅ All existing functionality works

---

## 🔄 Rollback Plan

### Quick Rollback (5 min) - If Critical Issue

**Option 1: Revert Code Only (Fastest)**
```bash
# Revert Git commit
git revert HEAD
git push origin main
# Netlify will auto-deploy reverted code
```

**Option 2: Disable New Queries (Temporary)**
- Comment out `completedBy` in queries
- Keep database fields (they're nullable, won't break anything)
- Quick fix while investigating

### Full Rollback (15-30 min) - If Needed

**Step 1: Revert Code**
```bash
git revert HEAD
git push origin main
```

**Step 2: Remove Database Fields (Optional)**
```sql
-- Only if absolutely necessary
ALTER TABLE "Task" DROP COLUMN "completedBy";
ALTER TABLE "Task" DROP COLUMN "completedAt";
```

**Step 3: Restore from Backup (If Data Corruption)**
- Use Railway backup restore
- Or restore from manual backup

---

## 🛡️ Safety Measures

### 1. Non-Breaking Changes
- ✅ All new fields are nullable
- ✅ Old queries still work (just won't count unassigned tasks)
- ✅ Backward compatible

### 2. Self-Healing Protection
- ✅ Add self-healing to critical endpoints
- ✅ Retry on transient errors
- ✅ Circuit breaker prevents cascading failures

### 3. Testing Coverage
- ✅ Test all dispositions
- ✅ Test all endpoints
- ✅ Test with multiple agents
- ✅ Test performance

### 4. Monitoring
- ✅ Watch error rates
- ✅ Watch query performance
- ✅ Watch completion counts

---

## 📊 Files to Modify (Summary)

### Database
- `prisma/schema.prisma` - Add fields
- Migration file (auto-generated)

### Core Logic
- `src/app/api/agent/tasks/[id]/complete/route.ts` - Set `completedBy`

### Stats Queries (18+ files)
- Agent portal: 4 files
- Manager dashboard: 4 files
- Holds analytics: 1 file
- General analytics: 2+ files
- Others: 7+ files

### Self-Healing
- Add to critical endpoints (2-3 files)

**Total: ~25 files to modify**

---

## ⏱️ Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Preparation & Backup | 30 min | ⏳ Pending |
| Database Migration | 30-45 min | ⏳ Pending |
| Code Updates | 90-120 min | ⏳ Pending |
| Testing | 60-90 min | ⏳ Pending |
| Backfill Script | 30-45 min | ⏳ Pending |
| Pre-Deployment | 15 min | ⏳ Pending |
| **Total Before 4pm** | **~4-5 hours** | ⏳ Pending |
| Deployment | 15-20 min | ⏳ At 4pm |
| Monitoring | 30 min | ⏳ After 4pm |

---

## ✅ Success Criteria

1. ✅ "Unable to Resolve" tasks are counted in agent stats
2. ✅ All other dispositions still work correctly
3. ✅ No increase in error rates
4. ✅ No performance degradation
5. ✅ Historical data backfilled (if approved)
6. ✅ Self-healing protects against errors
7. ✅ Rollback plan ready if needed

---

## 🚨 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Database migration fails | Low | High | Test locally first, have backup |
| Query performance degrades | Low | Medium | Test queries, add indexes if needed |
| Breaking existing functionality | Low | High | Extensive testing, backward compatible changes |
| Self-healing doesn't work | Low | Medium | Test self-healing scenarios |
| Rollback needed | Low | Medium | Have rollback plan ready |

**Overall Risk: LOW** ✅
- All changes are additive (nullable fields)
- Backward compatible
- Extensive testing planned
- Rollback plan ready

---

## 📝 Next Steps

1. **Answer questions above** ⏳
2. **Approve game plan** ⏳
3. **Start implementation** ⏳
4. **Complete by 4pm** ⏳
5. **Deploy at 4pm** ⏳
6. **Monitor and verify** ⏳

---

**Status:** ⏳ Waiting for approval and answers to questions  
**Ready to start:** Once questions answered and plan approved

