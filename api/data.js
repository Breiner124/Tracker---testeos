// ============================================================================
// api/data.js — Función serverless de Vercel (Node.js)
// ----------------------------------------------------------------------------
// Almacén CENTRAL y COMPARTIDO de los testeos: todos los que abran el link
// leen y escriben los mismos datos.
//
//   GET  /api/data          -> { productos: <array|null> }
//   POST /api/data { productos: [...] } -> { ok: true, count: N }
//
// Usa Upstash Redis por su API REST (fetch nativo, sin librerías).
//
// DESPLIEGUE EN VERCEL (una sola vez):
//   1. En tu proyecto de Vercel: pestaña "Storage" -> "Create/Connect Store"
//      -> Marketplace -> Upstash (Redis). Acepta el plan gratuito.
//   2. Al conectarlo, Vercel inyecta automáticamente las variables de entorno
//      (KV_REST_API_URL / KV_REST_API_TOKEN, o UPSTASH_REDIS_REST_URL /
//      UPSTASH_REDIS_REST_TOKEN). Este código acepta cualquiera de las dos.
//   3. Redeploy. No hay que escribir ninguna credencial en el código.
// ============================================================================

// Clave única donde vive TODO el tracker (un solo documento compartido).
const CLAVE_REDIS = "tracker:productos";

// Lee las credenciales de Upstash desde las variables de entorno.
function credenciales() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN || "";
  return { url: url.replace(/\/+$/, ""), token };
}

// Ejecuta un comando de Redis a través de la API REST de Upstash.
// Ej.: comandoRedis(url, token, ["GET", "clave"])
async function comandoRedis(url, token, comando) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(comando)
  });
  if (!r.ok) {
    const detalle = await r.text();
    throw new Error("Redis " + r.status + ": " + detalle);
  }
  return r.json(); // { result: ... }
}

export default async function handler(req, res) {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const { url, token } = credenciales();
  if (!url || !token) {
    res.status(503).json({ error: "Almacén no configurado. Conecta Upstash Redis en Vercel (pestaña Storage)." });
    return;
  }

  try {
    // -------------------- LEER todos los productos --------------------
    if (req.method === "GET") {
      const salida = await comandoRedis(url, token, ["GET", CLAVE_REDIS]);
      let productos = null;
      if (salida && typeof salida.result === "string") {
        try { productos = JSON.parse(salida.result); } catch (_) { productos = null; }
      }
      res.status(200).json({ productos: productos });
      return;
    }

    // -------------------- GUARDAR todos los productos --------------------
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      if (!body || typeof body !== "object") body = {};

      const productos = body.productos;
      if (!Array.isArray(productos)) {
        res.status(400).json({ error: "Se esperaba un arreglo 'productos'." });
        return;
      }

      await comandoRedis(url, token, ["SET", CLAVE_REDIS, JSON.stringify(productos)]);
      res.status(200).json({ ok: true, count: productos.length });
      return;
    }

    res.status(405).json({ error: "Método no permitido." });
  } catch (err) {
    console.error("Error en /api/data:", err);
    res.status(500).json({ error: "Error accediendo al almacén de datos." });
  }
}
