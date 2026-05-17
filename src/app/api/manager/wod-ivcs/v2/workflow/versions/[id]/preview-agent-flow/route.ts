export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { previewAgentFlow } from "@/lib/wod-ivcs/routing-matrix-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      routingRuleId?: string;
      answers?: Record<string, unknown>;
    };
    const preview = await previewAgentFlow(prisma, id, body);
    return { preview };
  });
}
