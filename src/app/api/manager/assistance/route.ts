// RAILWAY FRESH DEPLOY: Database wiped, deploying with clean schema - $(date +%s)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    console.log("🔍 Assistance API: Fetching assistance requests...");
    
    // Fetch all tasks that have assistance notes and are either pending assistance or have been responded to
    // Exclude unassigned tasks (assignedToId must not be null)
    const tasks = await prisma.task.findMany({
      where: {
        assistanceNotes: { not: null },
        assignedToId: { not: null }, // Only show tasks that are assigned to an agent
        OR: [
          { status: "ASSISTANCE_REQUIRED" }, // Pending assistance requests
          { 
            status: "IN_PROGRESS", 
            managerResponse: { not: null } // Tasks that have been responded to but not completed
          }
        ]
      },
      select: {
        id: true,
        brand: true,
        phone: true,
        text: true,
        email: true,
        taskType: true,
        assistanceNotes: true,
        managerResponse: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // WOD/IVCS specific fields
        wodIvcsSource: true,
        documentNumber: true,
        customerName: true,
        amount: true,
        webOrderDifference: true,
        purchaseDate: true,
        // Email Request specific fields
        emailRequestFor: true,
        details: true,
        salesforceCaseNumber: true,
        customerNameNumber: true,
        // Standalone Refund specific fields
        refundAmount: true,
        paymentMethod: true,
        refundReason: true,
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
        // Holds specific fields
        holdsOrderDate: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsPriority: true,
        holdsStatus: true,
        holdsDaysInSystem: true,
        // NOTE: orderDate is excluded - it's only for Standalone Refunds
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        rawMessage: {
          select: {
            brand: true,
            phone: true,
            text: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    console.log("🔍 Assistance API: Found", tasks.length, "tasks with assistance notes");
    
    // Helper function to safely convert dates to ISO strings
    const safeToISOString = (date: Date | null | undefined): string | null => {
      if (!date) return null;
      try {
        if (date instanceof Date) {
          return date.toISOString();
        }
        // If it's already a string, return it
        if (typeof date === 'string') {
          return date;
        }
        return null;
      } catch (error) {
        console.error('Error converting date to ISO string:', error);
        return null;
      }
    };

    // Transform the data to match the frontend interface
    const requests = tasks.map(task => {
      try {
        // Calculate order age for WOD/IVCS tasks
        let orderAge = null;
        if (task.taskType === "WOD_IVCS" && task.purchaseDate) {
          try {
            const purchaseDate = task.purchaseDate instanceof Date ? task.purchaseDate : new Date(task.purchaseDate);
            if (!isNaN(purchaseDate.getTime())) {
              const now = new Date();
              const diffTime = Math.abs(now.getTime() - purchaseDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              orderAge = `${diffDays} day${diffDays !== 1 ? 's' : ''} old`;
            }
          } catch (error) {
            console.error('Error calculating order age:', error);
          }
        }

        // Safely get email - check task.email first, then rawMessage (but rawMessage doesn't have email in select)
        const email = task.email || null;

        return {
          id: task.id,
          brand: task.brand || task.rawMessage?.brand || "Unknown",
          phone: task.phone || task.rawMessage?.phone || "Unknown",
          text: task.text || task.rawMessage?.text || "Unknown",
          email: email,
          agentName: task.assignedTo?.name || "Unknown",
          agentEmail: task.assignedTo?.email || "Unknown",
          assistanceNotes: task.assistanceNotes || "",
          managerResponse: task.managerResponse || null,
          createdAt: safeToISOString(task.createdAt),
          updatedAt: safeToISOString(task.updatedAt),
          status: task.status,
          taskType: task.taskType,
          // WOD/IVCS specific fields
          wodIvcsSource: task.wodIvcsSource || null,
          documentNumber: task.documentNumber || null,
          customerName: task.customerName || null,
          amount: task.amount ? Number(task.amount) : null,
          webOrderDifference: task.webOrderDifference ? Number(task.webOrderDifference) : null,
          purchaseDate: safeToISOString(task.purchaseDate),
          orderAge: orderAge,
          // Email Request specific fields
          emailRequestFor: task.emailRequestFor || null,
          details: task.details || null,
          salesforceCaseNumber: task.salesforceCaseNumber || null,
          customerNameNumber: task.customerNameNumber || null,
          // Standalone Refund specific fields
          refundAmount: task.refundAmount ? Number(task.refundAmount) : null,
          paymentMethod: task.paymentMethod || null,
          refundReason: task.refundReason || null,
          // Yotpo specific fields
          yotpoDateSubmitted: safeToISOString(task.yotpoDateSubmitted),
          yotpoPrOrYotpo: task.yotpoPrOrYotpo || null,
          yotpoCustomerName: task.yotpoCustomerName || null,
          yotpoEmail: task.yotpoEmail || null,
          yotpoOrderDate: safeToISOString(task.yotpoOrderDate),
          yotpoProduct: task.yotpoProduct || null,
          yotpoIssueTopic: task.yotpoIssueTopic || null,
          yotpoReviewDate: safeToISOString(task.yotpoReviewDate),
          yotpoReview: task.yotpoReview || null,
          yotpoSfOrderLink: task.yotpoSfOrderLink || null,
          // Holds specific fields
          holdsOrderDate: safeToISOString(task.holdsOrderDate),
          holdsOrderNumber: task.holdsOrderNumber || null,
          holdsCustomerEmail: task.holdsCustomerEmail || null,
          holdsPriority: task.holdsPriority || null,
          holdsStatus: task.holdsStatus || null,
          holdsDaysInSystem: task.holdsDaysInSystem || null,
        };
      } catch (error) {
        console.error(`Error transforming task ${task.id}:`, error);
        // Return a minimal valid object to prevent API failure
        return {
          id: task.id,
          brand: task.brand || task.rawMessage?.brand || "Unknown",
          phone: task.phone || task.rawMessage?.phone || "Unknown",
          text: task.text || task.rawMessage?.text || "Unknown",
          email: task.email || null,
          agentName: task.assignedTo?.name || "Unknown",
          agentEmail: task.assignedTo?.email || "Unknown",
          assistanceNotes: task.assistanceNotes || "",
          managerResponse: task.managerResponse || null,
          createdAt: safeToISOString(task.createdAt),
          updatedAt: safeToISOString(task.updatedAt),
          status: task.status,
          taskType: task.taskType,
        };
      }
    });

    console.log("🔍 Assistance API: Returning", requests.length, "requests");

    return NextResponse.json({
      success: true,
      requests
    });
  } catch (error: any) {
    console.error("Failed to fetch assistance requests:", error);
    console.error("Error details:", {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      name: error?.name
    });
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to fetch assistance requests",
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
