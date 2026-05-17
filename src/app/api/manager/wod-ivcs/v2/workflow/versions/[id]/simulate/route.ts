export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { simulateWorkflowVersion } from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      answers?: Record<string, unknown>;
    };

    const simulation = await simulateWorkflowVersion(prisma, id, body.answers ?? {});
    return { simulation };
  });
}
