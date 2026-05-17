export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import {
  addCatalogOption,
  normalizeCatalogType,
  WorkflowConfigError,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { type } = await params;
    const catalogType = normalizeCatalogType(type);
    if (!catalogType) {
      throw new WorkflowConfigError(`Invalid catalog type: ${type}`, 400, "INVALID_CATALOG_TYPE");
    }

    const body = (await req.json().catch(() => ({}))) as {
      value?: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
      metadataJson?: unknown;
    };

    if (!body.value || !body.label) {
      throw new WorkflowConfigError("value and label are required", 400);
    }

    const option = await addCatalogOption(prisma, {
      catalogType,
      value: body.value,
      label: body.label,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      metadataJson: body.metadataJson,
      actorId: userId,
    });

    return { option };
  });
}
