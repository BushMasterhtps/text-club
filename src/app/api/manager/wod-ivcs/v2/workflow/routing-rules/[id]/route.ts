export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../_lib/handle-workflow-api";
import {
  deactivateRoutingRule,
  updateRoutingRule,
  type RoutingRuleInput,
} from "@/lib/wod-ivcs/routing-matrix-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as RoutingRuleInput;
    const rule = await updateRoutingRule(prisma, id, body, userId);
    return { rule };
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const rule = await deactivateRoutingRule(prisma, id, userId);
    return { rule };
  });
}
