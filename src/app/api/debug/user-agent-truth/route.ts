import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

function routeDecisions(user: {
  exists: boolean;
  role?: string | null;
  isActive?: boolean | null;
  isLive?: boolean | null;
}) {
  const roleAllowed = user.role === "AGENT" || user.role === "MANAGER_AGENT";
  const activeAllowed = user.isActive === true;
  const legacyLiveAllowed = user.isLive === true;
  return {
    "GET /api/agent/tasks": {
      allowNow: user.exists && roleAllowed && activeAllowed,
      wouldBlockReason: !user.exists
        ? "user_not_found"
        : !roleAllowed
          ? "role_not_agent_or_manager_agent"
          : !activeAllowed
            ? "user_is_inactive"
            : null,
      legacyMismatch: activeAllowed !== legacyLiveAllowed,
      legacyWouldBlockBecauseIsLiveFalse: user.exists && roleAllowed && !legacyLiveAllowed,
    },
    "GET /api/agent/completed-today": {
      allowNow: user.exists && roleAllowed && activeAllowed,
      wouldBlockReason: !user.exists
        ? "user_not_found"
        : !roleAllowed
          ? "role_not_agent_or_manager_agent"
          : !activeAllowed
            ? "user_is_inactive"
            : null,
    },
    "GET /api/agent/completion-stats": {
      allowNow: user.exists && roleAllowed && activeAllowed,
      wouldBlockReason: !user.exists
        ? "user_not_found"
        : !roleAllowed
          ? "role_not_agent_or_manager_agent"
          : !activeAllowed
            ? "user_is_inactive"
            : null,
    },
    "GET /api/agent/stats": {
      allowNow: user.exists && roleAllowed && activeAllowed,
      wouldBlockReason: !user.exists
        ? "user_not_found"
        : !roleAllowed
          ? "role_not_agent_or_manager_agent"
          : !activeAllowed
            ? "user_is_inactive"
            : null,
    },
    "GET /api/agent/personal-scorecard": {
      allowNow: user.exists && roleAllowed && activeAllowed,
      wouldBlockReason: !user.exists
        ? "user_not_found"
        : !roleAllowed
          ? "role_not_agent_or_manager_agent"
          : !activeAllowed
            ? "user_is_inactive"
            : null,
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const email = new URL(request.url).searchParams.get("email")?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { success: false, error: "email query parameter is required" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      role: true,
      isActive: true,
      isLive: true,
      agentTypes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const exists = !!user;
  const decisions = routeDecisions({
    exists,
    role: user?.role ?? null,
    isActive: user?.isActive ?? null,
    isLive: user?.isLive ?? null,
  });

  return NextResponse.json({
    success: true,
    diagnostics: {
      requestedEmail: email,
      user: user
        ? {
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            isLive: user.isLive,
            agentTypes: user.agentTypes || [],
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }
        : null,
      routeAccessTruth: decisions,
      note:
        "No password hashes or secrets returned. Use this to verify active/live/role gating for agent routes.",
    },
  });
}

