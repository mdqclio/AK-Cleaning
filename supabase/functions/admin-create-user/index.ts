// supabase/functions/admin-create-user/index.ts
// Edge Function: creación de cuentas SERVER-SIDE (Bloque 2 de docs/auditoria.md).
//
// POR QUÉ EXISTE (hallazgos C1/C2 + ALTO "signUp hijackea la sesión del admin"):
// El flujo viejo (panel/{staff,users,providers}-api.js) hacía supabase.auth.signUp()
// desde el browser del admin. Eso:
//   1. reemplazaba la sesión del admin por la del usuario nuevo (rol='empleada'),
//      con un setSession() de restauración "poco confiable";
//   2. obligaba a llamar RPCs SECURITY DEFINER GRANTeados a `authenticated`, que
//      corrían con la sesión del usuario nuevo y por eso NO podían verificar que
//      el invocador real fuera admin → residual "empleada se auto-asigna owner".
//
// Esta función corre con SERVICE_ROLE y VERIFICA server-side que quien llama es
// owner/superadmin antes de crear nada. El rol del nuevo usuario se fija acá, del
// lado servidor, nunca confiando en el cliente. Cierra el residual de Bloque 1.
//
// Deploy: ver README.md en esta carpeta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLES_PERMITIDOS_CALLER = ["owner", "superadmin"];
const ROLES_ASIGNABLES = ["owner", "admin", "compras", "empleada", "proveedor"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Server misconfigured (missing env)" }, 500);
  }

  // Cliente admin (service_role): bypasea RLS. NUNCA exponer esta key al browser.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Autenticar al invocador por su JWT (header Authorization) ───────────
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);

  const { data: callerAuth, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerAuth?.user) {
    return json({ error: "Invalid session" }, 401);
  }

  // ── 2. Verificar que el invocador es owner/superadmin (server-side) ────────
  const { data: callerRow, error: rowErr } = await admin
    .from("usuarios")
    .select("rol, activo")
    .eq("auth_id", callerAuth.user.id)
    .single();

  if (rowErr || !callerRow || callerRow.activo !== true ||
      !ROLES_PERMITIDOS_CALLER.includes(callerRow.rol)) {
    return json({ error: "Forbidden: requires owner/superadmin" }, 403);
  }

  // ── 3. Validar payload ─────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const rol = String(body.rol ?? "");
  const nombre = String(body.nombre ?? "").trim();
  const apellido = String(body.apellido ?? "").trim();
  const telefono = body.telefono ? String(body.telefono) : null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (!ROLES_ASIGNABLES.includes(rol)) {
    return json({ error: `Invalid role: ${rol}` }, 400);
  }
  // superadmin nunca se crea por esta vía (solo SQL manual)
  if (rol === "superadmin") {
    return json({ error: "superadmin cannot be provisioned via API" }, 400);
  }

  // Campos extra para empleada
  const empleada = rol === "empleada" ? {
    tipo_contrato: body.tipo_contrato ?? null,
    fecha_inicio: body.fecha_inicio ?? null,
    tipos_servicio: Array.isArray(body.tipos_servicio) ? body.tipos_servicio : [],
    notas: body.notas ?? null,
    tarifa_hora: body.tarifa_hora ?? null,
  } : null;

  // ── 4. Crear la cuenta Auth (el trigger fn_handle_new_user crea usuarios) ──
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { nombre, apellido },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message || "User creation failed";
    const status = /already.*registered|exists/i.test(msg) ? 409 : 400;
    return json({ error: msg }, status);
  }
  const newAuthId = created.user.id;

  // ── 5. Fijar perfil + rol del lado servidor (caller ya verificado admin) ───
  // El trigger corrió en la misma transacción del createUser → la fila ya existe.
  const { data: usuarioRow, error: updErr } = await admin
    .from("usuarios")
    .update({ nombre, apellido, telefono, rol, activo: true })
    .eq("auth_id", newAuthId)
    .select("id")
    .single();

  if (updErr || !usuarioRow) {
    // Rollback: borrar la cuenta auth para no dejar huérfanos
    await admin.auth.admin.deleteUser(newAuthId);
    return json({ error: "Profile init failed: " + (updErr?.message ?? "no row") }, 500);
  }

  // ── 6. Si es empleada, insertar fila en empleadas ──────────────────────────
  if (empleada) {
    const { error: empErr } = await admin.from("empleadas").insert({
      usuario_id: usuarioRow.id,
      tipo_contrato: empleada.tipo_contrato,
      fecha_inicio: empleada.fecha_inicio,
      tipos_servicio: empleada.tipos_servicio,
      notas: empleada.notas,
      tarifa_hora: empleada.tarifa_hora,
    });
    if (empErr) {
      await admin.auth.admin.deleteUser(newAuthId); // borra usuarios via FK cascade si aplica
      return json({ error: "Empleada init failed: " + empErr.message }, 500);
    }
  }

  // ── 7. Generar link de invitación/recovery para que el admin lo comparta ───
  // No depende de SMTP: devolvemos el action_link. Si hay SMTP configurado,
  // podés cambiar a inviteUserByEmail() para enviarlo automáticamente.
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  return json({
    ok: true,
    usuario_id: usuarioRow.id,
    auth_id: newAuthId,
    action_link: linkData?.properties?.action_link ?? null,
  });
});
