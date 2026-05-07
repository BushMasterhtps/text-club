/**
 * Loads tasks for GET /api/manager/assistance with select fallbacks so a partial DB (missing Yotpo/Holds
 * columns before migrations deploy) still returns ASSISTANCE_REQUIRED rows instead of 500.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const ASSISTANCE_TASK_WHERE = {
  assistanceNotes: { not: null },
  assignedToId: { not: null },
  status: 'ASSISTANCE_REQUIRED' as const,
} satisfies Prisma.TaskWhereInput;

const ORDER_BY: Prisma.TaskOrderByWithRelationInput = { updatedAt: 'desc' };

/** Full dashboard select (preferred when columns exist). */
export const ASSIST_TASK_SELECT_FULL = {
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
  wodIvcsSource: true,
  documentNumber: true,
  customerName: true,
  amount: true,
  webOrderDifference: true,
  purchaseDate: true,
  emailRequestFor: true,
  details: true,
  salesforceCaseNumber: true,
  customerNameNumber: true,
  refundAmount: true,
  paymentMethod: true,
  refundReason: true,
  // Yotpo
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
  yotpoImportSource: true,
  yotpoSubmittedBy: true,
  // Holds
  holdsOrderDate: true,
  holdsOrderNumber: true,
  holdsCustomerEmail: true,
  holdsPriority: true,
  holdsStatus: true,
  holdsDaysInSystem: true,
  holdsOrderAmount: true,
  webOrderSubtotal: true,
  webOrderTotal: true,
  nsVsWebDiscrepancy: true,
  netSuiteTotal: true,
  webTotal: true,
  webVsNsDifference: true,
  amountToBeRefunded: true,
  assignedTo: {
    select: {
      name: true,
      email: true,
    },
  },
  rawMessage: {
    select: {
      brand: true,
      phone: true,
      text: true,
    },
  },
} satisfies Prisma.TaskSelect;

/** Same without Yotpo columns (fallback when Task yotpo* not migrated yet). */
export const ASSIST_TASK_SELECT_NO_YOTPO = {
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
  wodIvcsSource: true,
  documentNumber: true,
  customerName: true,
  amount: true,
  webOrderDifference: true,
  purchaseDate: true,
  emailRequestFor: true,
  details: true,
  salesforceCaseNumber: true,
  customerNameNumber: true,
  refundAmount: true,
  paymentMethod: true,
  refundReason: true,
  holdsOrderDate: true,
  holdsOrderNumber: true,
  holdsCustomerEmail: true,
  holdsPriority: true,
  holdsStatus: true,
  holdsDaysInSystem: true,
  holdsOrderAmount: true,
  webOrderSubtotal: true,
  webOrderTotal: true,
  nsVsWebDiscrepancy: true,
  netSuiteTotal: true,
  webTotal: true,
  webVsNsDifference: true,
  amountToBeRefunded: true,
  assignedTo: {
    select: {
      name: true,
      email: true,
    },
  },
  rawMessage: {
    select: {
      brand: true,
      phone: true,
      text: true,
    },
  },
} satisfies Prisma.TaskSelect;

/** Minimal row for manager list when Holds/Yotpo or extra decimals missing. */
export const ASSIST_TASK_SELECT_CORE = {
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
  assignedTo: {
    select: {
      name: true,
      email: true,
    },
  },
  rawMessage: {
    select: {
      brand: true,
      phone: true,
      text: true,
    },
  },
} satisfies Prisma.TaskSelect;

export type AssistanceTaskRow = Record<string, unknown> & {
  id: string;
  taskType?: string | null;
  status?: string;
  assistanceNotes?: string | null;
  assignedTo?: { name?: string | null; email?: string | null } | null;
};

function isMissingColumnError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022';
}

export async function findTasksForAssistanceList(): Promise<AssistanceTaskRow[]> {
  const route = '[assistance-task-query]';

  try {
    const rows = await prisma.task.findMany({
      where: ASSISTANCE_TASK_WHERE,
      select: ASSIST_TASK_SELECT_FULL,
      orderBy: ORDER_BY,
    });
    return rows as AssistanceTaskRow[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    console.warn(
      route,
      JSON.stringify({ phase: 'fallback-no-yotpo', prismaMeta: e.meta, message: e.message }),
    );
    try {
      const rows = await prisma.task.findMany({
        where: ASSISTANCE_TASK_WHERE,
        select: ASSIST_TASK_SELECT_NO_YOTPO,
        orderBy: ORDER_BY,
      });
      return rows as AssistanceTaskRow[];
    } catch (e2) {
      if (!isMissingColumnError(e2)) throw e2;
      console.warn(
        route,
        JSON.stringify({ phase: 'fallback-core', prismaMeta: e2.meta, message: e2.message }),
      );
      const rows = await prisma.task.findMany({
        where: ASSISTANCE_TASK_WHERE,
        select: ASSIST_TASK_SELECT_CORE,
        orderBy: ORDER_BY,
      });
      return rows as AssistanceTaskRow[];
    }
  }
}
