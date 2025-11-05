/**
 * Sprint Ranking System Utilities
 * 
 * Handles 14-day sprint cycles starting Nov 1, 2025
 */

// Sprint system starts Nov 1, 2025 at 00:00:00
const SPRINT_START_DATE = new Date('2025-11-01T00:00:00.000Z');
const SPRINT_DURATION_DAYS = 14;
const SPRINT_DURATION_MS = SPRINT_DURATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Calculate which sprint number a date falls into
 */
export function getSprintNumber(date: Date = new Date()): number {
  const timeSinceStart = date.getTime() - SPRINT_START_DATE.getTime();
  
  if (timeSinceStart < 0) {
    // Date is before sprint system started
    return 0;
  }
  
  return Math.floor(timeSinceStart / SPRINT_DURATION_MS) + 1;
}

/**
 * Get the start and end dates for a specific sprint number
 */
export function getSprintDates(sprintNumber: number): { start: Date; end: Date } {
  if (sprintNumber < 1) {
    throw new Error('Sprint number must be >= 1');
  }
  
  const startMs = SPRINT_START_DATE.getTime() + (sprintNumber - 1) * SPRINT_DURATION_MS;
  const endMs = startMs + SPRINT_DURATION_MS - 1; // -1ms to end at 23:59:59.999
  
  return {
    start: new Date(startMs),
    end: new Date(endMs)
  };
}

/**
 * Get the current sprint number and dates
 */
export function getCurrentSprint(): { number: number; start: Date; end: Date; daysRemaining: number; daysElapsed: number } {
  const now = new Date();
  const sprintNumber = getSprintNumber(now);
  const { start, end } = getSprintDates(sprintNumber);
  
  const totalDays = SPRINT_DURATION_DAYS;
  const msElapsed = now.getTime() - start.getTime();
  const daysElapsed = Math.floor(msElapsed / (24 * 60 * 60 * 1000)) + 1; // +1 to count today
  const daysRemaining = totalDays - daysElapsed;
  
  return {
    number: sprintNumber,
    start,
    end,
    daysElapsed,
    daysRemaining: Math.max(0, daysRemaining)
  };
}

/**
 * Check if a date is within a specific sprint
 */
export function isDateInSprint(date: Date, sprintNumber: number): boolean {
  const { start, end } = getSprintDates(sprintNumber);
  return date >= start && date <= end;
}

/**
 * Get all sprint numbers between two dates
 */
export function getSprintsBetween(startDate: Date, endDate: Date): number[] {
  const startSprint = getSprintNumber(startDate);
  const endSprint = getSprintNumber(endDate);
  
  const sprints: number[] = [];
  for (let i = startSprint; i <= endSprint; i++) {
    sprints.push(i);
  }
  
  return sprints;
}

/**
 * Format sprint for display
 */
export function formatSprintPeriod(sprintNumber: number): string {
  const { start, end } = getSprintDates(sprintNumber);
  
  const formatDate = (d: Date) => {
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  };
  
  return `${formatDate(start)} - ${formatDate(end)}, ${start.getFullYear()}`;
}

/**
 * Get sprint progress percentage (0-100)
 */
export function getSprintProgress(sprintNumber: number): number {
  const now = new Date();
  const { start, end } = getSprintDates(sprintNumber);
  
  if (now < start) return 0;
  if (now > end) return 100;
  
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  
  return Math.round((elapsed / totalDuration) * 100);
}

/**
 * Senior agents (excluded from competitive rankings)
 */
export const SENIOR_AGENTS = [
  'daniel.murcia@goldenboltllc.com',
  'genesis.hernandez@goldencustomercare.com', 
  'carson.lund@goldencustomercare.com',
  'lisa.marin@goldencustomercare.com'
];

export function isSeniorAgent(email: string): boolean {
  return SENIOR_AGENTS.includes(email.toLowerCase());
}

