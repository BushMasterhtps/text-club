import { NextRequest } from 'next/server';
import { withSelfHealing } from '@/lib/self-healing/wrapper';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { logRouteTiming } from '@/lib/route-timing-log';
import { NextResponseJsonSafe } from '@/lib/safe-json-response';
import { findTasksForAssistanceList } from '@/lib/assistance-task-query';
import type { AssistanceTaskRow } from '@/lib/assistance-task-query';

export async function GET(req: NextRequest) {
  const route = 'GET /api/manager/assistance';
  const startedAt = Date.now();
  let rowCount: number | undefined;

  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  console.info('[manager/assistance]', JSON.stringify({ phase: 'route-start', route }));

  try {
    const tasks = await withSelfHealing(
      () => findTasksForAssistanceList(),
      { service: 'assistance-api' },
    );

    console.info(
      '[manager/assistance]',
      JSON.stringify({ phase: 'prisma-success', route, rowCount: tasks.length }),
    );

    const safeToISO = (date: unknown): string | null => {
      if (!date) return null;
      try {
        if (date instanceof Date) return date.toISOString();
        if (typeof date === 'string') return date;
      } catch {
        /* noop */
      }
      return null;
    };

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (
        typeof v === 'object' &&
        'toNumber' in (v as object) &&
        typeof (v as { toNumber?: () => number }).toNumber === 'function'
      ) {
        try {
          return (v as { toNumber: () => number }).toNumber();
        } catch {
          return null;
        }
      }
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
      return null;
    };

    const requests = tasks.map((taskRow) =>
      transformAssistanceTask(taskRow as AssistanceTaskRow, safeToISO, num),
    );

    rowCount = requests.length;

    console.info('[manager/assistance]', JSON.stringify({ phase: 'response-serialize', route }));

    return NextResponseJsonSafe({
      success: true,
      requests,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(
      '[manager/assistance]',
      JSON.stringify({ phase: 'GET catch', route, message: errMsg, stack: error }),
    );
    rowCount = 0;
    return NextResponseJsonSafe(
      {
        success: false,
        requests: [],
        error: 'Failed to fetch assistance requests',
      },
      { status: 500 },
    );
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      rowCount,
      email: auth.userEmail,
    });
  }
}

function transformAssistanceTask(
  task: AssistanceTaskRow,
  safeToISO: (d: unknown) => string | null,
  num: (v: unknown) => number | null,
) {
  let orderAge: string | null = null;
  if (task.taskType === 'WOD_IVCS' && task.purchaseDate) {
    try {
      const purchaseDate =
        task.purchaseDate instanceof Date ? task.purchaseDate : new Date(task.purchaseDate as string);
      if (!isNaN(purchaseDate.getTime())) {
        const diffDays = Math.ceil(
          Math.abs(Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        orderAge = `${diffDays} day${diffDays !== 1 ? 's' : ''} old`;
      }
    } catch {
      /* noop */
    }
  }

  const email =
    typeof task.email === 'string'
      ? task.email
      : task.email === null || task.email === undefined
        ? null
        : String(task.email);
  const raw = task.rawMessage as { brand?: string | null; phone?: string | null; text?: string | null } | null;

  const assigned = task.assignedTo as { name?: string | null; email?: string | null } | null;

  return {
    id: task.id as string,
    brand: typeof task.brand === 'string' ? task.brand : raw?.brand || 'Unknown',
    phone:
      typeof task.phone === 'string' ? task.phone : raw?.phone != null ? String(raw.phone) : 'Unknown',
    text: typeof task.text === 'string' ? task.text : raw?.text != null ? String(raw.text) : 'Unknown',
    email,
    agentName: assigned?.name || 'Unknown',
    agentEmail: assigned?.email || 'Unknown',
    assistanceNotes:
      typeof task.assistanceNotes === 'string' ? task.assistanceNotes : String(task.assistanceNotes ?? ''),
    managerResponse:
      task.managerResponse !== undefined && task.managerResponse !== null
        ? String(task.managerResponse)
        : null,
    createdAt: safeToISO(task.createdAt),
    updatedAt: safeToISO(task.updatedAt),
    status: task.status ?? 'UNKNOWN',
    taskType: task.taskType ?? 'TEXT_CLUB',
    orderAge,
    // WOD/IVCS
    wodIvcsSource:
      typeof task.wodIvcsSource === 'string' ? task.wodIvcsSource : task.wodIvcsSource ?? null,
    documentNumber: task.documentNumber != null ? String(task.documentNumber) : null,
    customerName: task.customerName != null ? String(task.customerName) : null,
    amount: num(task.amount ?? null),
    webOrderDifference: num(task.webOrderDifference ?? null),
    purchaseDate: safeToISO(task.purchaseDate),
    // Email Requests
    emailRequestFor:
      typeof task.emailRequestFor === 'string' ? task.emailRequestFor : task.emailRequestFor ?? null,
    details: typeof task.details === 'string' ? task.details : task.details ?? null,
    salesforceCaseNumber:
      typeof task.salesforceCaseNumber === 'string'
        ? task.salesforceCaseNumber
        : task.salesforceCaseNumber ?? null,
    customerNameNumber:
      typeof task.customerNameNumber === 'string'
        ? task.customerNameNumber
        : task.customerNameNumber ?? null,
    // Refunds
    refundAmount: num(task.refundAmount ?? null),
    paymentMethod:
      typeof task.paymentMethod === 'string' ? task.paymentMethod : task.paymentMethod ?? null,
    refundReason:
      typeof task.refundReason === 'string' ? task.refundReason : task.refundReason ?? null,
    // Yotpo (optional when CORE select)
    yotpoDateSubmitted: safeToISO(task.yotpoDateSubmitted),
    yotpoPrOrYotpo: task.yotpoPrOrYotpo != null ? String(task.yotpoPrOrYotpo) : null,
    yotpoCustomerName:
      task.yotpoCustomerName != null ? String(task.yotpoCustomerName) : null,
    yotpoEmail: task.yotpoEmail != null ? String(task.yotpoEmail) : null,
    yotpoOrderDate: safeToISO(task.yotpoOrderDate),
    yotpoProduct: task.yotpoProduct != null ? String(task.yotpoProduct) : null,
    yotpoIssueTopic: task.yotpoIssueTopic != null ? String(task.yotpoIssueTopic) : null,
    yotpoReviewDate: safeToISO(task.yotpoReviewDate),
    yotpoReview: task.yotpoReview != null ? String(task.yotpoReview) : null,
    yotpoSfOrderLink: task.yotpoSfOrderLink != null ? String(task.yotpoSfOrderLink) : null,
    yotpoImportSource:
      task.yotpoImportSource != null ? String(task.yotpoImportSource) : null,
    yotpoSubmittedBy:
      task.yotpoSubmittedBy != null ? String(task.yotpoSubmittedBy) : null,
    // Holds
    holdsOrderDate: safeToISO(task.holdsOrderDate),
    holdsOrderNumber: task.holdsOrderNumber != null ? String(task.holdsOrderNumber) : null,
    holdsCustomerEmail:
      task.holdsCustomerEmail != null ? String(task.holdsCustomerEmail) : null,
    holdsPriority:
      typeof task.holdsPriority === 'number'
        ? task.holdsPriority
        : task.holdsPriority != null
          ? Number(task.holdsPriority)
          : null,
    holdsStatus: task.holdsStatus != null ? String(task.holdsStatus) : null,
    holdsDaysInSystem:
      typeof task.holdsDaysInSystem === 'number'
        ? task.holdsDaysInSystem
        : task.holdsDaysInSystem != null
          ? Number(task.holdsDaysInSystem)
          : null,
    holdsOrderAmount: num(task.holdsOrderAmount ?? null),
    webOrderSubtotal: num(task.webOrderSubtotal ?? null),
    webOrderTotal: num(task.webOrderTotal ?? null),
    nsVsWebDiscrepancy: num(task.nsVsWebDiscrepancy ?? null),
    netSuiteTotal: num(task.netSuiteTotal ?? null),
    webTotal: num(task.webTotal ?? null),
    webVsNsDifference: num(task.webVsNsDifference ?? null),
    amountToBeRefunded: num(task.amountToBeRefunded ?? null),
  };
}
