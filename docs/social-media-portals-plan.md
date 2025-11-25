# Social Media Portals & Time Log Tracker - Planning Document

**Created:** December 2024  
**Status:** Planning Phase  
**Next Review:** When Ready to Start

---

## 📋 Overview

### Goal
Create separate Social Media Manager and Social Media Agent portals within the existing deployment, featuring:
- Time log tracker (clock in/out functionality)
- Messaging system
- Photo uploads for forms/documentation
- Interactive, modern UI
- Same database and deployment as existing portals

### Portal Structure
```
Current System:
├── Manager Portal (/manager) - Customer Care Manager
├── Agent Portal (/agent) - Customer Care Agent

New System:
├── Social Media Manager Portal (/social-media-manager)
└── Social Media Agent Portal (/social-media-agent)
```

---

## 🎯 Core Features

### 1. Time Log Tracker
**Priority:** High (Primary Feature)

**Features:**
- ⏰ Clock In/Out buttons
- ⏱️ Real-time timer display
- 📊 Daily/weekly/monthly time tracking
- 📈 Time reports and analytics
- 🔔 Break tracking (lunch, breaks)
- 📱 Mobile-friendly interface
- 🔄 Real-time sync across devices

**User Stories:**
- Social Media Agent clicks "Clock In" → Timer starts
- Agent can see time worked today in real-time
- Agent clicks "Clock Out" → Time logged, timer stops
- Manager can view team time logs and reports

---

### 2. Messaging System
**Priority:** Medium

**Features:**
- 💬 Real-time messaging between agents and managers
- 📎 File attachments
- 🔔 Notifications for new messages
- 📱 Message history
- 👥 Group messaging (optional)
- 🔍 Message search

**User Stories:**
- Agent sends message to manager → Real-time delivery
- Manager responds → Agent gets notification
- Both can attach files/photos to messages

---

### 3. Photo Upload System
**Priority:** Medium

**Features:**
- 📸 Photo upload (drag-and-drop)
- 📄 Form/document upload
- 🖼️ Image preview
- 📁 File management
- 🔗 Share photos with team
- 📊 Photo gallery view

**User Stories:**
- Agent uploads photo of completed form → Stored in system
- Manager can view all uploaded photos
- Photos linked to time logs or messages

---

### 4. Dashboard & Analytics
**Priority:** Medium

**Features:**
- 📊 Time tracking analytics
- 👥 Team overview
- 📈 Productivity metrics
- 📅 Calendar view of time logs
- 📉 Reports and exports

---

## 🏗️ Architecture

### Tech Stack (Recommended)

#### Frontend:
- **TypeScript + React** (Current stack - keep this)
- **Next.js** (Current framework - keep this)
- **Tailwind CSS** (Current styling - keep this)
- **Framer Motion** (NEW - for animations)
- **React Hook Form** (NEW - for forms)
- **React Query** (NEW - for data fetching/caching)
- **Socket.io Client** (NEW - for real-time features)

#### Backend:
- **Next.js API Routes** (Current - keep this)
- **Prisma** (Current ORM - keep this)
- **PostgreSQL** (Current database - same database)
- **Socket.io Server** (NEW - for real-time messaging)

#### File Storage:
- **Cloudinary** (Recommended - image hosting)
- **AWS S3** (Alternative - file storage)
- **Next.js Image Optimization** (Built-in)

#### Real-Time:
- **Socket.io** (Real-time messaging, live updates)
- **Server-Sent Events** (Alternative - simpler for one-way updates)

---

## 🗄️ Database Schema

### New Tables Needed

#### 1. TimeLog
```prisma
model TimeLog {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  
  clockInTime   DateTime
  clockOutTime  DateTime?
  breakStart    DateTime?
  breakEnd      DateTime?
  
  totalMinutes  Int?     // Calculated: total time worked
  breakMinutes  Int?     // Calculated: total break time
  notes         String?
  
  date          DateTime // Date of work (for grouping)
  status        String   // "CLOCKED_IN", "ON_BREAK", "CLOCKED_OUT"
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([userId, date])
  @@index([date])
}
```

#### 2. SocialMediaMessage
```prisma
model SocialMediaMessage {
  id            String   @id @default(cuid())
  senderId      String
  sender        User     @relation("SentMessages", fields: [senderId], references: [id])
  recipientId   String?
  recipient     User?    @relation("ReceivedMessages", fields: [recipientId], references: [id])
  
  content       String   @db.Text
  attachments   Json?    // Array of file URLs
  isRead        Boolean  @default(false)
  readAt        DateTime?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([senderId])
  @@index([recipientId])
  @@index([createdAt])
}
```

#### 3. SocialMediaPhoto
```prisma
model SocialMediaPhoto {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  
  url           String   // Cloudinary/S3 URL
  thumbnailUrl  String?  // Optimized thumbnail
  filename      String
  fileSize      Int      // Bytes
  mimeType      String   // image/jpeg, image/png, etc.
  
  description   String?
  tags          String[] // For categorization
  timeLogId     String? // Link to time log if relevant
  messageId     String? // Link to message if attached
  
  createdAt     DateTime @default(now())
  
  @@index([userId])
  @@index([timeLogId])
  @@index([messageId])
}
```

#### 4. Update User Model
```prisma
model User {
  // ... existing fields ...
  
  // New relations
  timeLogs            TimeLog[]
  sentMessages        SocialMediaMessage[] @relation("SentMessages")
  receivedMessages    SocialMediaMessage[] @relation("ReceivedMessages")
  socialMediaPhotos   SocialMediaPhoto[]
  
  // Add new roles
  // role: Role (existing: MANAGER, AGENT, MANAGER_AGENT)
  // Add: SOCIAL_MEDIA_MANAGER, SOCIAL_MEDIA_AGENT
}
```

---

## 📁 File Structure

### Recommended Structure:
```
src/app/
├── social-media-manager/
│   ├── page.tsx                    # Main manager dashboard
│   ├── time-logs/
│   │   └── page.tsx                # Time log reports
│   ├── messages/
│   │   └── page.tsx                # Messaging interface
│   └── photos/
│       └── page.tsx                # Photo gallery
│
├── social-media-agent/
│   ├── page.tsx                    # Main agent dashboard
│   ├── time-tracker/
│   │   └── page.tsx                # Time log tracker
│   ├── messages/
│   │   └── page.tsx                # Messaging interface
│   └── upload/
│       └── page.tsx                # Photo upload
│
├── api/
│   └── social-media/
│       ├── time-log/
│       │   ├── clock-in/
│       │   │   └── route.ts
│       │   ├── clock-out/
│       │   │   └── route.ts
│       │   ├── current/
│       │   │   └── route.ts
│       │   └── history/
│       │       └── route.ts
│       ├── messages/
│       │   ├── route.ts            # Get/send messages
│       │   ├── [id]/
│       │   │   └── route.ts        # Individual message
│       │   └── mark-read/
│       │       └── route.ts
│       └── photos/
│           ├── upload/
│           │   └── route.ts
│           ├── route.ts            # Get photos
│           └── [id]/
│               └── route.ts        # Individual photo
│
└── _components/
    ├── TimeLogTracker.tsx          # Clock in/out component
    ├── TimeLogHistory.tsx          # Time log list
    ├── MessageWindow.tsx           # Messaging interface
    ├── PhotoUploader.tsx           # Photo upload component
    └── PhotoGallery.tsx            # Photo gallery view
```

---

## 🎨 UI/UX Design Considerations

### Time Log Tracker UI

#### Clock In/Out Button:
- **Large, prominent button** with animation
- **Color coding:** Green (clocked in), Red (clocked out)
- **Real-time timer** showing time worked
- **Break button** (optional)
- **Status indicator** (Clocked In / On Break / Clocked Out)

#### Features:
- Smooth animations (Framer Motion)
- Hover effects
- Loading states
- Success/error notifications
- Mobile-responsive design

### Messaging UI

#### Chat Interface:
- **Message list** with timestamps
- **Input field** with file attachment
- **Real-time updates** (Socket.io)
- **Unread indicators**
- **Typing indicators** (optional)
- **Message status** (sent, delivered, read)

### Photo Upload UI

#### Upload Interface:
- **Drag-and-drop zone**
- **File preview** before upload
- **Progress indicator**
- **Thumbnail gallery**
- **Image viewer** (lightbox)

---

## 🔧 Implementation Phases

### Phase 1: Time Log Tracker (MVP)
**Duration:** 2-3 weeks

**Tasks:**
1. ✅ Create database schema (TimeLog table)
2. ✅ Add new user roles (SOCIAL_MEDIA_MANAGER, SOCIAL_MEDIA_AGENT)
3. ✅ Create `/social-media-agent` and `/social-media-manager` routes
4. ✅ Build TimeLogTracker component (clock in/out)
5. ✅ Create API endpoints (clock-in, clock-out, current status)
6. ✅ Add real-time timer display
7. ✅ Build time log history view
8. ✅ Add basic time reports for managers

**Deliverables:**
- Working clock in/out functionality
- Real-time timer
- Basic time log history
- Manager view of team time logs

---

### Phase 2: Enhanced Time Tracking
**Duration:** 1-2 weeks

**Tasks:**
1. ✅ Add break tracking
2. ✅ Improve time reports (daily/weekly/monthly)
3. ✅ Add time analytics dashboard
4. ✅ Export functionality (CSV, PDF)
5. ✅ Calendar view of time logs
6. ✅ Time approval workflow (optional)

**Deliverables:**
- Complete time tracking system
- Advanced reports and analytics
- Export capabilities

---

### Phase 3: Messaging System
**Duration:** 2-3 weeks

**Tasks:**
1. ✅ Create database schema (SocialMediaMessage table)
2. ✅ Set up Socket.io server
3. ✅ Build messaging UI components
4. ✅ Create API endpoints (send, receive, mark read)
5. ✅ Add real-time messaging (Socket.io)
6. ✅ Add file attachments to messages
7. ✅ Add notifications
8. ✅ Add message search

**Deliverables:**
- Real-time messaging system
- File attachments
- Notifications
- Message history

---

### Phase 4: Photo Upload System
**Duration:** 1-2 weeks

**Tasks:**
1. ✅ Set up Cloudinary (or AWS S3)
2. ✅ Create database schema (SocialMediaPhoto table)
3. ✅ Build photo upload component (drag-and-drop)
4. ✅ Create API endpoints (upload, get, delete)
5. ✅ Add photo gallery view
6. ✅ Link photos to time logs/messages
7. ✅ Add image optimization

**Deliverables:**
- Photo upload functionality
- Photo gallery
- Image optimization
- Photo management

---

### Phase 5: Polish & Integration
**Duration:** 1-2 weeks

**Tasks:**
1. ✅ Add animations (Framer Motion)
2. ✅ Improve mobile responsiveness
3. ✅ Add loading states and error handling
4. ✅ Integrate with existing authentication
5. ✅ Add role-based access control
6. ✅ Testing and bug fixes
7. ✅ Performance optimization

**Deliverables:**
- Polished, production-ready portals
- Smooth animations
- Mobile-friendly
- Fully integrated with existing system

---

## 🔐 Authentication & Authorization

### Role-Based Access

#### New Roles:
- `SOCIAL_MEDIA_MANAGER` - Full access to social media manager portal
- `SOCIAL_MEDIA_AGENT` - Access to social media agent portal

#### Access Control:
- Social Media Manager Portal: Only `SOCIAL_MEDIA_MANAGER` role
- Social Media Agent Portal: Only `SOCIAL_MEDIA_AGENT` role
- Same authentication system as existing portals
- Same middleware for route protection

### Integration:
- Use existing `/api/auth/login` endpoint
- Add role check in middleware
- Redirect based on role (similar to current system)

---

## 📊 Features Breakdown

### Time Log Tracker Features

#### Core Features:
- [ ] Clock In button
- [ ] Clock Out button
- [ ] Real-time timer (hours:minutes:seconds)
- [ ] Current status display
- [ ] Today's time summary

#### Advanced Features:
- [ ] Break tracking (start break, end break)
- [ ] Multiple breaks per day
- [ ] Notes/comments on time logs
- [ ] Edit time logs (manager only)
- [ ] Time approval workflow

#### Reports & Analytics:
- [ ] Daily time summary
- [ ] Weekly time report
- [ ] Monthly time report
- [ ] Team time overview (manager)
- [ ] Time trends/charts
- [ ] Export to CSV/PDF

---

### Messaging Features

#### Core Features:
- [ ] Send message
- [ ] Receive message
- [ ] Real-time delivery
- [ ] Message history
- [ ] Unread indicators

#### Advanced Features:
- [ ] File attachments
- [ ] Typing indicators
- [ ] Message search
- [ ] Group messaging
- [ ] Message reactions (optional)

---

### Photo Upload Features

#### Core Features:
- [ ] Drag-and-drop upload
- [ ] File selection
- [ ] Image preview
- [ ] Upload progress
- [ ] Photo gallery

#### Advanced Features:
- [ ] Image optimization
- [ ] Thumbnail generation
- [ ] Photo tags/categories
- [ ] Link photos to time logs
- [ ] Photo search
- [ ] Delete photos

---

## 🎨 UI Component Ideas

### Time Log Tracker Component:
```typescript
<TimeLogTracker>
  <ClockInOutButton />      // Large, animated button
  <RealTimeTimer />         // Live timer display
  <TodaySummary />          // Hours worked today
  <BreakButton />           // Optional break tracking
  <TimeLogHistory />        // List of today's logs
</TimeLogTracker>
```

### Messaging Component:
```typescript
<MessageWindow>
  <MessageList />           // Scrollable message list
  <MessageInput />          // Input with attachment
  <FileUploader />          // Drag-and-drop files
  <UnreadBadge />           // Notification badge
</MessageWindow>
```

### Photo Upload Component:
```typescript
<PhotoUploader>
  <Dropzone />              // Drag-and-drop area
  <FilePreview />           // Preview before upload
  <UploadProgress />        // Progress bar
  <PhotoGallery />          // Grid of uploaded photos
</PhotoUploader>
```

---

## 🔌 Integration Points

### With Existing System:

1. **Authentication:**
   - Same login system
   - Same user table
   - Add new roles to existing Role enum

2. **Database:**
   - Same PostgreSQL database
   - New tables for social media features
   - Can query across systems if needed

3. **Deployment:**
   - Same Netlify deployment
   - Same GitHub repository
   - Same build process

4. **Styling:**
   - Same Tailwind CSS setup
   - Consistent design language
   - Can reuse existing components

---

## 📦 Required Dependencies

### New Packages to Install:

```json
{
  "dependencies": {
    "socket.io": "^4.7.0",
    "socket.io-client": "^4.7.0",
    "framer-motion": "^10.16.0",
    "react-hook-form": "^7.48.0",
    "@tanstack/react-query": "^5.0.0",
    "react-dropzone": "^14.2.0",
    "cloudinary": "^1.41.0",
    "date-fns": "^2.30.0",
    "zod": "^3.22.0"
  }
}
```

---

## 🚀 Getting Started Checklist

### When Ready to Start:

#### Setup:
- [ ] Install new dependencies
- [ ] Set up Cloudinary account (or AWS S3)
- [ ] Update Prisma schema with new tables
- [ ] Run database migrations
- [ ] Set up Socket.io server

#### Development:
- [ ] Create portal routes (`/social-media-manager`, `/social-media-agent`)
- [ ] Build TimeLogTracker component
- [ ] Create time log API endpoints
- [ ] Add authentication/authorization
- [ ] Test clock in/out functionality

#### Testing:
- [ ] Test time tracking accuracy
- [ ] Test real-time updates
- [ ] Test mobile responsiveness
- [ ] Test file uploads
- [ ] Test messaging system

---

## 💡 Design Inspiration

### Time Log Tracker:
- **Large, clear buttons** - Easy to tap on mobile
- **Color coding** - Green (in), Red (out), Yellow (break)
- **Real-time updates** - Timer updates every second
- **Visual feedback** - Animations on button clicks
- **Status indicators** - Clear visual state

### Messaging:
- **Chat-like interface** - Familiar messaging UI
- **Real-time delivery** - Messages appear instantly
- **File previews** - See attachments before opening
- **Unread badges** - Clear notification system

### Photo Upload:
- **Drag-and-drop** - Modern, intuitive
- **Progress indicators** - Show upload status
- **Thumbnail grid** - Easy to browse photos
- **Lightbox viewer** - Full-size image viewing

---

## 🎯 Success Metrics

### Phase 1 Success:
- [ ] Clock in/out works reliably
- [ ] Timer displays accurately
- [ ] Time logs save correctly
- [ ] Manager can view team logs
- [ ] Mobile-friendly interface

### Overall Success:
- [ ] Social Media team uses time tracker daily
- [ ] Messaging system used for communication
- [ ] Photo uploads working smoothly
- [ ] All features accessible on mobile
- [ ] No major bugs or issues

---

## 📝 Notes

### Considerations:
- **Mobile-first design** - Social media team likely uses mobile devices
- **Offline support** - Consider PWA for offline time tracking
- **Notifications** - Push notifications for messages (optional)
- **Analytics** - Track usage to improve features
- **Scalability** - Design for team growth

### Future Enhancements (Post-MVP):
- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Integration with payroll systems
- [ ] Time approval workflows
- [ ] Team scheduling
- [ ] Project time tracking

---

## 🔗 Related Files

### Current System:
- `src/app/manager/page.tsx` - Manager portal (reference)
- `src/app/agent/page.tsx` - Agent portal (reference)
- `src/app/api/auth/login/route.ts` - Authentication
- `prisma/schema.prisma` - Database schema
- `src/middleware.ts` - Route protection

### New Files to Create:
- `src/app/social-media-manager/page.tsx`
- `src/app/social-media-agent/page.tsx`
- `src/app/_components/TimeLogTracker.tsx`
- `src/app/_components/MessageWindow.tsx`
- `src/app/_components/PhotoUploader.tsx`
- `src/app/api/social-media/time-log/...`
- `src/app/api/social-media/messages/...`
- `src/app/api/social-media/photos/...`

---

## 🎓 Learning Resources

### Libraries to Learn:
- **Framer Motion:** https://www.framer.com/motion/
- **React Hook Form:** https://react-hook-form.com/
- **React Query:** https://tanstack.com/query
- **Socket.io:** https://socket.io/docs/v4/
- **React Dropzone:** https://react-dropzone.js.org/
- **Cloudinary:** https://cloudinary.com/documentation

---

**Last Updated:** December 2024  
**Next Review:** When Ready to Start Implementation

