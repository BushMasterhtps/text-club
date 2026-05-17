export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { updateCatalogOption } from "@/lib/wod-ivcs/workflow-config-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      value?: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
      metadataJson?: unknown;
    };

    const option = await updateCatalogOption(prisma, {
      optionId: id,
      actorId: userId,
      value: body.value,
      label: body.label,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      metadataJson: body.metadataJson,
    });

    return { option };
  });
}
