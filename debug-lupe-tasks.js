const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugLupeTasks() {
  try {
    console.log('🔍 Debugging Lupe Alvarenga tasks...\n');

    // Find Lupe's user record
    const lupe = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'guadalupe.alvarenga@goldencustomercare.com' },
          { name: { contains: 'Lupe' } },
          { name: { contains: 'Alvarenga' } }
        ]
      },
      select: { id: true, name: true, email: true }
    });

    if (!lupe) {
      console.log('❌ Lupe Alvarenga not found in database');
      return;
    }

    console.log(`👤 Found user: ${lupe.name} (${lupe.email}) - ID: ${lupe.id}\n`);

    // Check all tasks assigned to Lupe
    const allTasks = await prisma.task.findMany({
      where: { assignedToId: lupe.id },
      select: {
        id: true,
        status: true,
        taskType: true,
        createdAt: true,
        updatedAt: true,
        brand: true,
        text: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log(`📊 Total tasks assigned to Lupe: ${allTasks.length}\n`);

    if (allTasks.length > 0) {
      console.log('📋 Task details:');
      allTasks.forEach((task, index) => {
        console.log(`${index + 1}. ID: ${task.id}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Task Type: ${task.taskType}`);
        console.log(`   Created: ${task.createdAt.toISOString()}`);
        console.log(`   Updated: ${task.updatedAt.toISOString()}`);
        console.log(`   Brand: ${task.brand || 'N/A'}`);
        console.log(`   Text: ${task.text ? task.text.substring(0, 50) + '...' : 'N/A'}`);
        console.log('');
      });
    }

    // Check tasks by status
    const statusCounts = await prisma.task.groupBy({
      by: ['status'],
      where: { assignedToId: lupe.id },
      _count: { status: true }
    });

    console.log('📈 Tasks by status:');
    statusCounts.forEach(group => {
      console.log(`   ${group.status}: ${group._count.status}`);
    });

    // Check tasks by task type
    const taskTypeCounts = await prisma.task.groupBy({
      by: ['taskType'],
      where: { assignedToId: lupe.id },
      _count: { taskType: true }
    });

    console.log('\n📈 Tasks by task type:');
    taskTypeCounts.forEach(group => {
      console.log(`   ${group.taskType}: ${group._count.taskType}`);
    });

    // Check for open tasks (PENDING, IN_PROGRESS, ASSISTANCE_REQUIRED)
    const openTasks = await prisma.task.count({
      where: {
        assignedToId: lupe.id,
        status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] }
      }
    });

    console.log(`\n🔓 Open tasks (PENDING, IN_PROGRESS, ASSISTANCE_REQUIRED): ${openTasks}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugLupeTasks();
