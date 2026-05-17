export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import {
  createRoutingRule,
  getRoutingRules,
  type RoutingRuleInput,
} from "@/lib/wod-ivcs/routing-matrix-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { id } = await params;
    const result = await getRoutingRules(prisma, id);
    return result;
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as RoutingRuleInput;
    const rule = await createRoutingRule(prisma, id, body, userId);
    return { rule };
  });
}
