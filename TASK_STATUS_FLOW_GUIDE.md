# Task Status Flow Guide

**Quick Reference for Managers Who Assign Tasks**

---

## 📋 How Task Status Works

### The Flow:
1. **Unassigned** → `PENDING` status
   - Shows in "Pending Tasks" count ✅
   - No agent assigned yet

2. **Assigned to Agent** → Still `PENDING` status
   - Still shows in "Pending Tasks" count ✅
   - Agent hasn't started working yet
   - **⚠️ Count does NOT decrease at this step**

3. **Agent Starts Task** → Changes to `IN_PROGRESS` status
   - Leaves "Pending Tasks" count ✅
   - Joins "In Progress" count ✅
   - **✅ Count decreases when agent clicks "Start Task"**

4. **Agent Completes Task** → Changes to `COMPLETED` status
   - Removed from active counts
   - Shows in completed metrics

---

## 🎯 Key Points

### When You Assign Tasks:
- ✅ Tasks are successfully assigned to agents
- ❌ **Pending count stays the same** (this is normal!)
- ✅ Tasks appear in agent's "To Do" column
- ✅ Agents can see assigned tasks (blurred until started)

### When Pending Count Decreases:
- ✅ Only when agents click **"Start Task"**
- ✅ Task moves from `PENDING` → `IN_PROGRESS`
- ✅ Pending count: 178 → 177 (for example)

---

## 📊 Example Scenario

**Starting Point:**
- 178 Pending Tasks
- You assign 50 tasks to an agent
- **Result: Still 178 Pending Tasks** (tasks are assigned but not started)

**After Agent Actions:**
- Agent starts 1 task
- **Result: 177 Pending Tasks** (count decreases when started)
- Agent completes 5 tasks
- **Result: Still 177 Pending Tasks** (completed tasks don't affect pending count)

---

## ✅ Summary

**Remember:** 
- Assigning = Status stays `PENDING` → Count stays the same
- Starting = Status changes to `IN_PROGRESS` → Count decreases
- This applies to **all task types** (Text Club, Holds, Email Requests, Yotpo, etc.)

---

## 🤔 Why This Design?

This ensures:
- ✅ Accurate workload tracking (only count tasks being actively worked)
- ✅ Clear distinction between "assigned but not started" vs "in progress"
- ✅ Prevents double-counting (tasks can't be in multiple states)

---

**Last Updated:** January 2025
