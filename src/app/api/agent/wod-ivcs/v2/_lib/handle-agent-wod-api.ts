import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, verifyAuth } from "@/lib/auth";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { AgentWorkflowError } from "@/lib/wod-ivcs/agent-workflow-service";
import { WorkflowConfigError } from "@/lib/wod-ivcs/workflow-config-service";
import { prisma } from "@/lib/prisma";

export type AgentApiAuthOk = {
  allowed: true;
  userId: string;
  userRole: string;
  userEmail: string;
};

export type AgentApiAuthDenied = {
  allowed: false;
  status: 401 | 403;
  message: string;
};

export async function requireAgentApiAuth(
  request: NextRequest
): Promise<AgentApiAuthOk | AgentApiAuthDenied> {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return {
      allowed: false,
      status: 401,
      message: auth.error || "Unauthorized",
    };
  }
  if (auth.userRole !== "AGENT" && auth.userRole !== "MANAGER_AGENT") {
    return {
      allowed: false,
      status: 403,
      message: "Forbidden: agent access required",
    };
  }
  return {
    allowed: true,
    userId: auth.userId!,
    userRole: auth.userRole!,
    userEmail: auth.userEmail!,
  };
}

export function agentWorkflowErrorResponse(error: AgentWorkflowError) {
  return NextResponse.json(
    { success: false, error: error.message, code: error.code },
    { status: error.statusCode }
  );
}

async function resolveActiveAgentUserId(auth: AgentApiAuthOk): Promise<string> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ id: auth.userId }, { email: auth.userEmail.toLowerCase().trim() }],
    },
    select: { id: true, isActive: true },
  });
  if (!user) {
    throw new AgentWorkflowError("User not found", 404, "USER_NOT_FOUND");
  }
  if (!user.isActive) {
    throw new AgentWorkflowError("User account is paused", 403, "USER_PAUSED");
  }
  return user.id;
}

export async function handleAgentWodApi<T extends Record<string, unknown>>(
  request: NextRequest,
  handler: (ctx: {
    userId: string;
    userRole: string;
    userEmail: string;
    request: NextRequest;
  }) => Promise<T>
) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireAgentApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const userId = await resolveActiveAgentUserId(auth);
    const data = await handler({
      userId,
      userRole: auth.userRole,
      userEmail: auth.userEmail,
      request,
    });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    if (error instanceof AgentWorkflowError) {
      return agentWorkflowErrorResponse(error);
    }
    if (error instanceof WorkflowConfigError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error("[agent/wod-ivcs/v2]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Request failed",
      },
      { status: 500 }
    );
  }
}

export { prisma };
