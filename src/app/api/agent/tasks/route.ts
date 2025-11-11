import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    
    if (!email) {
      return NextResponse.json({ success: false, error: "Email parameter required" }, { status: 400 });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, isLive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Sort controls (default oldest to newest by createdAt)
    const orderParam = (searchParams.get('order') || 'asc').toLowerCase();
    const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';

    // Get tasks assigned to this user with statuses that agents can work on
    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: user.id,
        status: {
          in: ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"]
        }
      },
      select: {
        id: true,
        brand: true,
        phone: true,
        text: true,
        status: true,
        assignedToId: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        assistanceNotes: true,
        managerResponse: true,
        createdAt: true,
        updatedAt: true,
        taskType: true,
        // Holds specific fields
        holdsOrderDate: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsPriority: true,
        holdsDaysInSystem: true,
        holdsStatus: true,
        // WOD/IVCS specific fields
        wodIvcsSource: true,
        documentNumber: true,
        warehouseEdgeStatus: true,
        amount: true,
        webOrderDifference: true,
        webOrder: true,
        webOrderSubtotal: true,
        webOrderTotal: true,
        nsVsWebDiscrepancy: true,
        customerName: true,
        netSuiteTotal: true,
        webTotal: true,
        webVsNsDifference: true,
        shippingCountry: true,
        shippingState: true,
        purchaseDate: true,
        // Email Request specific fields
        emailRequestFor: true,
        details: true,
        timestamp: true,
        completionTime: true,
        salesforceCaseNumber: true,
        customerNameNumber: true,
        salesOrderId: true,
        // Standalone Refund specific fields
        amountToBeRefunded: true,
        verifiedRefund: true,
        paymentMethod: true,
        refundReason: true,
        productSku: true,
        quantity: true,
        refundAmount: true,
        // Yotpo specific fields
        yotpoDateSubmitted: true,
        yotpoPrOrYotpo: true,
        yotpoCustomerName: true,
        yotpoEmail: true,
        yotpoOrderDate: true,
        yotpoProduct: true,
        yotpoIssueTopic: true,
        yotpoReviewDate: true,
        yotpoReview: true,
        yotpoSfOrderLink: true,
        rawMessage: {
          select: {
            brand: true,
            phone: true,
            text: true
          }
        }
      },
      orderBy: [
        { createdAt: order } // Oldest to newest by default
      ]
    });

    // Transform tasks to include brand/phone/text from rawMessage if not set on task
    const transformedTasks = tasks.map(task => {
      // Calculate order age for WOD/IVCS tasks
      let orderAge = null;
      let orderAgeDays = null;
      
      if (task.purchaseDate) {
        orderAgeDays = Math.floor((Date.now() - task.purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
        orderAge = orderAgeDays === 0 ? "Today" : `${orderAgeDays} day${orderAgeDays === 1 ? '' : 's'} old`;
      }

      return {
        ...task,
        brand: task.brand || task.rawMessage?.brand || "Unknown",
        phone: task.phone || task.rawMessage?.phone || "",
        text: task.text || task.rawMessage?.text || "",
        orderAge: orderAge,
        orderAgeDays: orderAgeDays,
        rawMessage: undefined // Remove from response
      };
    });

    // Custom sorting: IN_PROGRESS first (current assignments), then PENDING (new assignments), then ASSISTANCE_REQUIRED
    // Within the same status, preserve createdAt ordering from the DB (oldest/newest per `order`)
    const sortedTasks = transformedTasks.sort((a, b) => {
      const statusOrder = { 'IN_PROGRESS': 1, 'PENDING': 2, 'ASSISTANCE_REQUIRED': 3 };
      const aOrder = statusOrder[a.status as keyof typeof statusOrder] || 4;
      const bOrder = statusOrder[b.status as keyof typeof statusOrder] || 4;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // If same status, keep createdAt ordering (asc/desc based on `order`)
      return order === 'asc'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Debug: Check if any tasks have manager responses
    const tasksWithResponses = sortedTasks.filter(t => t.managerResponse);
    if (tasksWithResponses.length > 0) {
      console.log("🔍 API Debug: Found tasks with manager responses:", tasksWithResponses.length);
      tasksWithResponses.forEach((task, index) => {
        console.log(`🔍 API Debug: Task ${index + 1} - ID: ${task.id}, Status: ${task.status}, Response: ${task.managerResponse}`);
      });
    } else {
      console.log("🔍 API Debug: No tasks with manager responses found");
      console.log("🔍 API Debug: Total tasks returned:", sortedTasks.length);
      console.log("🔍 API Debug: Sample task:", sortedTasks[0] ? {
        id: sortedTasks[0].id,
        status: sortedTasks[0].status,
        hasManagerResponse: !!sortedTasks[0].managerResponse
      } : "No tasks");
    }

    // Additional debugging: Check raw data before transformation
    console.log("🔍 API Debug: Raw tasks from database:", tasks.length);
    const rawTasksWithResponses = tasks.filter(t => t.managerResponse);
    console.log("🔍 API Debug: Raw tasks with responses:", rawTasksWithResponses.length);
    if (rawTasksWithResponses.length > 0) {
      rawTasksWithResponses.forEach((task, index) => {
        console.log(`🔍 API Debug: Raw Task ${index + 1} - ID: ${task.id}, Status: ${task.status}, Has Response: ${!!task.managerResponse}`);
      });
    }

    return NextResponse.json({ 
      success: true, 
      tasks: sortedTasks 
    });
  } catch (err: any) {
    console.error("Error fetching agent tasks:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to fetch tasks" 
    }, { status: 500 });
  }
}
