const { createClient } = require("@supabase/supabase-js");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function cleanEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function isAuthorized(req) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret) {
    return true;
  }

  const header = String(req.headers.authorization || "");
  return header === `Bearer ${secret}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL || process.env.URL_SUPABASE);
  const serviceKey = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  if (!supabaseUrl || !serviceKey) {
    return json(res, 503, { ok: false, error: "Supabase not configured" });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error, count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true });

    if (error) {
      return json(res, 500, {
        ok: false,
        error: error.message,
        code: error.code || null,
      });
    }

    return json(res, 200, { ok: true, pinged: true, customerCount: count });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "erro desconhecido",
    });
  }
};
