const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestTasks() {
  try {
    // Get the test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });

    if (!user) {
      console.log('❌ Test user not found. Please run the setup first.');
      return;
    }

    // Create some test WOD/IVCS tasks
    const testTasks = [
      {
        taskType: 'WOD_IVCS',
        status: 'PENDING',
        wodIvcsSource: 'SO_VS_WEB_DIFFERENCE',
        documentNumber: 'ORD-TEST-001',
        customerName: 'Test Customer 1',
        amount: 100.00,
        webOrderDifference: 5.00,
        brand: 'Test Brand',
        purchaseDate: new Date(),
        assignedToId: user.id
      },
      {
        taskType: 'WOD_IVCS',
        status: 'PENDING',
        wodIvcsSource: 'SO_VS_WEB_DIFFERENCE',
        documentNumber: 'ORD-TEST-002',
        customerName: 'Test Customer 2',
        amount: 200.00,
        webOrderDifference: 10.00,
        brand: 'Test Brand',
        purchaseDate: new Date(),
        assignedToId: user.id
      },
      {
        taskType: 'WOD_IVCS',
        status: 'PENDING',
        wodIvcsSource: 'SO_VS_WEB_DIFFERENCE',
        documentNumber: 'ORD-TEST-003',
        customerName: 'Test Customer 3',
        amount: 300.00,
        webOrderDifference: 15.00,
        brand: 'Test Brand',
        purchaseDate: new Date(),
        assignedToId: user.id
      }
    ];

    for (const taskData of testTasks) {
      const task = await prisma.task.create({
        data: taskData
      });
      console.log(`✅ Created test task: ${task.documentNumber}`);
    }

    console.log('\n🎯 Test tasks created! You can now:');
    console.log('1. Login to http://localhost:3000 with test@local.com / password123');
    console.log('2. Go to Agent Portal');
    console.log('3. Test the new WOD/IVCS dispositions');
    console.log('4. Check that "Not Completed - No edit button" counts as work completed');
    console.log('5. Check that sent-back tasks show in the Pending Tasks with send-back info');

  } catch (error) {
    console.error('Error creating test tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestTasks();
