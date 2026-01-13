/**
 * Test Data Generator for Kanban Board
 * Generates mock tasks for local testing without database
 */

import { Task } from '@/stores/useTaskStore';

const brands = ['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E'];
const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'YOTPO', 'HOLDS', 'STANDALONE_REFUNDS'];
const dispositions = ['Resolved', 'Unable to Resolve', 'Duplicate', 'In Communication'];
const customerNames = ['John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Williams', 'Charlie Brown'];
const phones = ['555-0100', '555-0101', '555-0102', '555-0103', '555-0104'];
const emails = ['customer1@example.com', 'customer2@example.com', 'customer3@example.com', 'customer4@example.com'];

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(daysAgo: number = 0, hoursAgo: number = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(date.getHours() - hoursAgo);
  return date;
}

function generateTaskId(): string {
  return `test-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTestTasks(count: number = 80): Task[] {
  const tasks: Task[] = [];
  const now = new Date();
  
  // Generate tasks with various statuses
  const statusDistribution = {
    PENDING: Math.floor(count * 0.3), // 30% pending
    IN_PROGRESS: Math.floor(count * 0.4), // 40% in progress
    ASSISTANCE_REQUIRED: Math.floor(count * 0.15), // 15% assistance required
    RESOLVED: Math.floor(count * 0.05), // 5% resolved (in assistance column)
    COMPLETED: Math.floor(count * 0.1), // 10% completed
  };
  
  let taskIndex = 0;
  
  // Generate PENDING tasks
  for (let i = 0; i < statusDistribution.PENDING; i++) {
    const createdAt = randomDate(Math.floor(Math.random() * 7), Math.floor(Math.random() * 24));
    tasks.push({
      id: generateTaskId(),
      brand: randomItem(brands),
      phone: randomItem(phones),
      text: `Test task ${taskIndex++}: Customer inquiry about order status`,
      status: 'PENDING',
      assignedToId: 'test-agent-id',
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      taskType: randomItem(taskTypes),
      customerName: randomItem(customerNames),
    });
  }
  
  // Generate IN_PROGRESS tasks
  for (let i = 0; i < statusDistribution.IN_PROGRESS; i++) {
    const createdAt = randomDate(Math.floor(Math.random() * 7), Math.floor(Math.random() * 24));
    const startTime = new Date(createdAt);
    startTime.setMinutes(startTime.getMinutes() + Math.floor(Math.random() * 60));
    tasks.push({
      id: generateTaskId(),
      brand: randomItem(brands),
      phone: randomItem(phones),
      text: `Test task ${taskIndex++}: Processing refund request`,
      status: 'IN_PROGRESS',
      assignedToId: 'test-agent-id',
      startTime: startTime.toISOString(),
      createdAt: createdAt.toISOString(),
      updatedAt: startTime.toISOString(),
      taskType: randomItem(taskTypes),
      customerName: randomItem(customerNames),
    });
  }
  
  // Generate ASSISTANCE_REQUIRED tasks
  for (let i = 0; i < statusDistribution.ASSISTANCE_REQUIRED; i++) {
    const createdAt = randomDate(Math.floor(Math.random() * 7), Math.floor(Math.random() * 24));
    const startTime = new Date(createdAt);
    startTime.setMinutes(startTime.getMinutes() + Math.floor(Math.random() * 60));
    const assistanceTime = new Date(startTime);
    assistanceTime.setMinutes(assistanceTime.getMinutes() + Math.floor(Math.random() * 30));
    tasks.push({
      id: generateTaskId(),
      brand: randomItem(brands),
      phone: randomItem(phones),
      text: `Test task ${taskIndex++}: Complex issue requiring manager review`,
      status: 'ASSISTANCE_REQUIRED',
      assignedToId: 'test-agent-id',
      startTime: startTime.toISOString(),
      assistanceRequestedAt: assistanceTime.toISOString(),
      assistanceNotes: 'Need help with unusual refund request',
      createdAt: createdAt.toISOString(),
      updatedAt: assistanceTime.toISOString(),
      taskType: randomItem(taskTypes),
      customerName: randomItem(customerNames),
    });
  }
  
  // Generate RESOLVED tasks (in assistance column, manager responded)
  for (let i = 0; i < statusDistribution.RESOLVED; i++) {
    const createdAt = randomDate(Math.floor(Math.random() * 7), Math.floor(Math.random() * 24));
    const startTime = new Date(createdAt);
    startTime.setMinutes(startTime.getMinutes() + Math.floor(Math.random() * 60));
    const assistanceTime = new Date(startTime);
    assistanceTime.setMinutes(assistanceTime.getMinutes() + Math.floor(Math.random() * 30));
    const resolvedTime = new Date(assistanceTime);
    resolvedTime.setMinutes(resolvedTime.getMinutes() + Math.floor(Math.random() * 60));
    tasks.push({
      id: generateTaskId(),
      brand: randomItem(brands),
      phone: randomItem(phones),
      text: `Test task ${taskIndex++}: Manager has provided guidance`,
      status: 'RESOLVED',
      assignedToId: 'test-agent-id',
      startTime: startTime.toISOString(),
      assistanceRequestedAt: assistanceTime.toISOString(),
      assistanceNotes: 'Need help with unusual refund request',
      managerResponse: 'Please proceed with full refund as customer is VIP',
      createdAt: createdAt.toISOString(),
      updatedAt: resolvedTime.toISOString(),
      taskType: randomItem(taskTypes),
      customerName: randomItem(customerNames),
    });
  }
  
  // Generate COMPLETED tasks (for today and yesterday)
  for (let i = 0; i < statusDistribution.COMPLETED; i++) {
    const createdAt = randomDate(Math.floor(Math.random() * 7), Math.floor(Math.random() * 24));
    const startTime = new Date(createdAt);
    startTime.setMinutes(startTime.getMinutes() + Math.floor(Math.random() * 60));
    const completedTime = new Date(startTime);
    completedTime.setMinutes(completedTime.getMinutes() + Math.floor(Math.random() * 30) + 5);
    // Mix of today and yesterday
    const isToday = Math.random() > 0.5;
    if (!isToday) {
      completedTime.setDate(completedTime.getDate() - 1);
    }
    tasks.push({
      id: generateTaskId(),
      brand: randomItem(brands),
      phone: randomItem(phones),
      text: `Test task ${taskIndex++}: Successfully completed`,
      status: 'COMPLETED',
      assignedToId: 'test-agent-id',
      startTime: startTime.toISOString(),
      endTime: completedTime.toISOString(),
      durationSec: Math.floor((completedTime.getTime() - startTime.getTime()) / 1000),
      disposition: randomItem(dispositions),
      createdAt: createdAt.toISOString(),
      updatedAt: completedTime.toISOString(),
      taskType: randomItem(taskTypes),
      customerName: randomItem(customerNames),
    });
  }
  
  return tasks;
}
