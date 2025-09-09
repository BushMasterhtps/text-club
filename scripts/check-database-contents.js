#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabaseContents() {
  try {
    console.log('🔍 Checking database contents...');
    
    // Check all tasks
    const allTasks = await prisma.task.findMany({
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true,
        text: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log(`📊 Total tasks in database: ${allTasks.length}`);
    console.log('📋 Sample tasks:');
    allTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ID: ${task.id}, Type: ${task.taskType}, Status: ${task.status}, Assigned: ${task.assignedToId ? 'Yes' : 'No'}, Brand: ${task.brand}`);
    });
    
    // Check task counts by type
    const taskCounts = await prisma.task.groupBy({
      by: ['taskType'],
      _count: { _all: true }
    });
    
    console.log('\n📊 Task counts by type:');
    taskCounts.forEach(count => {
      console.log(`  ${count.taskType || 'NULL'}: ${count._count._all}`);
    });
    
    // Check task counts by status
    const statusCounts = await prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    
    console.log('\n📊 Task counts by status:');
    statusCounts.forEach(count => {
      console.log(`  ${count.status}: ${count._count._all}`);
    });
    
    // Check raw messages
    const rawMessageCounts = await prisma.rawMessage.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    
    console.log('\n📊 Raw message counts by status:');
    rawMessageCounts.forEach(count => {
      console.log(`  ${count.status}: ${count._count._all}`);
    });
    
    // Check assigned tasks
    const assignedTasks = await prisma.task.findMany({
      where: { assignedToId: { not: null } },
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true
      }
    });
    
    console.log(`\n📊 Assigned tasks: ${assignedTasks.length}`);
    assignedTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ID: ${task.id}, Type: ${task.taskType}, Status: ${task.status}, Brand: ${task.brand}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkDatabaseContents()
  .then(() => {
    console.log('🎉 Database check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database check failed:', error);
    process.exit(1);
  });
