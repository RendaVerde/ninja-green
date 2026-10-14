import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getConnectionTokens,
  maskApiId,
  normalizeZproBaseUrl,
  saveConnectionToken,
} from "@/lib/whatsapp/connection-config";

const providerSchema = z.enum([
  "uazapi",
  "baileys",
  "evolution",
  "evolution_go",
  "zpro",
]);
const attendantSchema = z.object({
  profileName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  role: z.enum(["attendant", "manager"]).default("attendant"),
});
const connectionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    provider: providerSchema,
    endpointUrl: z.string().trim().url().or(z.literal("")).default(""),
    instanceName: z.string().trim().max(120).default(""),
    apiToken: z.string().trim().max(2000).default(""),
    active: z.boolean().default(true),
    attendants: z.array(attendantSchema).max(30).default([]),
  })
  .superRefine((value, context) => {
    if (value.provider !== "zpro") return;
    if (!value.endpointUrl) {
      context.addIssue({
        code: "custom",
        path: ["endpointUrl"],
        message: "Informe a BaseUrl da ZPRO.",
      });
    }
    if (!value.instanceName) {
      context.addIssue({
        code: "custom",
        path: ["instanceName"],
        message: "Informe o ApiID da ZPRO.",
      });
    }
    if (!value.apiToken) {
      context.addIssue({
        code: "custom",
        path: ["apiToken"],
        message: "Informe o token da ZPRO.",
      });
    }
  });

async function resolveUsersByEmail(emails: string[]) {
  if (!emails.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Map<string, string>();
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return new Map(
    (data?.users || [])
      .filter(
        (user) => user.email && emails.includes(user.email.toLowerCase()),
      )
      .map((user) => [user.email!.toLowerCase(), user.id]),
  );
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { data: connections, error } = await supabase
    .from("whatsapp_connections")
    .select(
      "id,owner_id,name,provider,endpoint_url,instance_name,active,created_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível carregar as conexões." },
      { status: 500 },
    );
  }

  const ids = (connections || []).map((item) => item.id);
  const attendantsResult = ids.length
    ? await supabase
        .from("whatsapp_connection_attendants")
        .select("id,connection_id,profile_name,email,role,user_id")
        .in("connection_id", ids)
        .order("created_at")
    : { data: [], error: null };
  if (attendantsResult.error) {
    return NextResponse.json(
      { error: "Não foi possível carregar os atendentes." },
      { status: 500 },
    );
  }

  let tokenConnectionIds: Set<string>;
  try {
    tokenConnectionIds = await getConnectionTokens(ids);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar as credenciais das conexões." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    connections: (connections || []).map((item) => ({
      id: item.id,
      name: item.name,
      provider: item.provider,
      endpointUrl: item.endpoint_url || "",
      instanceName: item.provider === "zpro" ? "" : item.instance_name || "",
      apiIdMasked:
        item.provider === "zpro" ? maskApiId(item.instance_name) : "",
      active: item.active,
      owner: item.owner_id === user.id,
      hasToken: tokenConnectionIds.has(item.id),
      attendants: (attendantsResult.data || [])
        .filter((attendant) => attendant.connection_id === item.id)
        .map((attendant) => ({
          id: attendant.id,
          profileName: attendant.profile_name,
          email: attendant.email,
          role: attendant.role,
          linked: Boolean(attendant.user_id),
        })),
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const parsed = connectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Revise a conexão." },
      { status: 400 },
    );
  }

  let endpointUrl = parsed.data.endpointUrl || null;
  if (parsed.data.provider === "zpro") {
    try {
      endpointUrl = normalizeZproBaseUrl(parsed.data.endpointUrl);
    } catch (baseUrlError) {
      return NextResponse.json(
        {
          error:
            baseUrlError instanceof Error
              ? baseUrlError.message
              : "BaseUrl da ZPRO inválida.",
        },
        { status: 400 },
      );
    }
  }

  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      provider: parsed.data.provider,
      endpoint_url: endpointUrl,
      instance_name: parsed.data.instanceName || null,
      api_token: null,
      active: parsed.data.active,
    })
    .select("id")
    .single();
  if (error || !connection) {
    return NextResponse.json(
      { error: "Não foi possível salvar a conexão." },
      { status: 500 },
    );
  }

  if (parsed.data.apiToken) {
    try {
      await saveConnectionToken(connection.id, parsed.data.apiToken);
    } catch (tokenError) {
      await supabase
        .from("whatsapp_connections")
        .delete()
        .eq("id", connection.id)
        .eq("owner_id", user.id);
      return NextResponse.json(
        {
          error:
            tokenError instanceof Error
              ? tokenError.message
              : "Não foi possível proteger o token.",
        },
        { status: 500 },
      );
    }
  }

  if (parsed.data.attendants.length) {
    const emails = parsed.data.attendants.map((item) =>
      item.email.toLowerCase(),
    );
    const userIds = await resolveUsersByEmail(emails);
    const { error: attendantsError } = await supabase
      .from("whatsapp_connection_attendants")
      .insert(
        parsed.data.attendants.map((item) => ({
          connection_id: connection.id,
          profile_name: item.profileName,
          email: item.email.toLowerCase(),
          role: item.role,
          user_id: userIds.get(item.email.toLowerCase()) || null,
        })),
      );
    if (attendantsError) {
      return NextResponse.json(
        {
          error:
            "A conexão foi criada, mas os atendentes não puderam ser vinculados.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, id: connection.id });
}
