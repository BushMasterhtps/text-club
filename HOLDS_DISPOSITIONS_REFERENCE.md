# Holds Dispositions Reference Guide

This document lists all Holds dispositions found in the codebase, organized by queue and completion status.

## 📋 How to Use This Document

1. **Review each disposition** below
2. **Mark each disposition** as one of:
   - ✅ **SAVED** - This disposition saved the company money (positive impact)
   - ❌ **LOST** - This disposition lost the company money (negative impact - full order amount)
   - ⚪ **NEUTRAL** - This disposition has no financial impact (administrative, moved to another queue)

3. **Send me the list** with your classifications, and I'll update the configuration file

---

## ✅ COMPLETION DISPOSITIONS
**These dispositions move the task to "Completed" queue - Task is fully resolved**

These dispositions mark the task as fully completed. The task moves to the "Completed" queue.

### 1. Refunded & Closed
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Task completed - refund issued and order closed

### 2. Refunded & Closed - Customer Requested Cancelation
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Task completed - customer requested cancellation, refund issued

### 3. Refunded & Closed - No Contact
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Task completed - no contact made, refund issued

### 4. Refunded & Closed - Comma Issue
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Task completed - comma issue resolved, refund issued

### 5. Resolved - fixed format / fixed address
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ✅ SAVED (TODO: Update)
- **Description**: Task completed - address/format fixed, order can proceed

### 6. Resolved - Customer Clarified
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ✅ SAVED (TODO: Update)
- **Description**: Task completed - customer provided clarification, order can proceed

### 7. Resolved - FRT Released
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ✅ SAVED (TODO: Update)
- **Description**: Task completed - FRT (Fraud Review Team) released order

### 8. Resolved - other
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ✅ SAVED (TODO: Update)
- **Description**: Task completed - resolved through other means

### 9. Resolved - Other
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ✅ SAVED (TODO: Update)
- **Description**: Task completed - resolved through other means (capitalized variant)

### 10. Closed & Refunded - Fraud/Reseller
- **Queue**: Moves to "Completed"
- **Status**: Task fully resolved
- **Impact**: ❌ LOST (TODO: Update)
- **Description**: Task completed - fraud/reseller detected, order closed and refunded

---

## 🔄 QUEUE MOVEMENT DISPOSITIONS
**These dispositions move the task to another queue - Task not fully resolved yet**

These dispositions move the task to another queue but still count as "completed" for the agent who worked on it. The task is not fully resolved yet.

### 11. Duplicate
- **Queue**: Moves to "Duplicates" queue
- **Status**: Task completed for agent, but moved to manager review
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Task is a duplicate of existing work - moved to Duplicates queue for manager review

### 12. Unable to Resolve
- **Queue**: 
  - If from "Escalated Call 4+ Day": Stays in "Escalated Call 4+ Day"
  - If from other queues: Moves to "Customer Contact"
- **Status**: Task completed for agent, but needs further work
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Agent unable to resolve - task moved to another queue for further work

### 13. In Communication
- **Queue**: Moves back to "Customer Contact" queue
- **Status**: Task completed for agent, but still in communication
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: Agent is in communication with customer - task moved back to Customer Contact queue

### 14. International Order - Unable to Call/ Sent Email
- **Queue**: Moves to "Customer Contact" queue
- **Status**: Task completed for agent, email sent instead of call
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: International order - unable to call, email sent instead

### 15. International Order - Unable to Call / Sent Email
- **Queue**: Moves to "Customer Contact" queue
- **Status**: Task completed for agent, email sent instead of call
- **Impact**: ⚪ NEUTRAL (TODO: Update)
- **Description**: International order - unable to call, email sent instead (variant with space)

---

## 📊 Summary

**Total Dispositions**: 15

**By Completion Status**:
- ✅ **Completion Dispositions** (move to "Completed" queue): 10
- 🔄 **Queue Movement Dispositions** (move to another queue): 5

**By Current Impact Classification** (TODO: Update based on your input):
- ✅ **SAVED**: 5 dispositions
- ❌ **LOST**: 1 disposition
- ⚪ **NEUTRAL**: 9 dispositions

---

## 🎯 Next Steps

1. **Review each disposition** above
2. **Classify each one** as:
   - ✅ **SAVED** - Saved money
   - ❌ **LOST** - Lost money (full order amount)
   - ⚪ **NEUTRAL** - No financial impact

3. **Send me your classifications** and I'll update:
   - `src/lib/holds-disposition-impact.ts` (configuration file)
   - All API endpoints to calculate saved vs lost amounts
   - Frontend to display saved/lost/net amounts

---

## 📝 Notes

- **"Refunded & Closed"** dispositions: These typically result in a refund being issued. Consider whether this is a loss (money refunded) or neutral (customer service cost).
- **"Resolved"** dispositions: These typically mean the order can proceed. Consider whether this is a save (order proceeds, revenue maintained) or neutral.
- **"Closed & Refunded - Fraud/Reseller"**: This clearly involves a refund, likely a loss.
- **Queue Movement dispositions**: These typically don't have immediate financial impact since the task isn't fully resolved yet.

