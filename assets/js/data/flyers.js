/* =====================================================================
 * data/flyers.js — Piezas gráficas de la landing pública (index.html).
 * Publicar es exclusivo de Dirección (ver rls-policies.sql). No hay
 * dataset de ejemplo en modo demo — como el Foro, esto solo tiene sentido
 * con Supabase conectado.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  function mapFlyer(f) {
    return {
      id: f.id, titulo: f.titulo, descripcion: f.descripcion,
      imagenUrl: f.imagen_url, orden: f.orden, activo: f.activo
    };
  }

  async function listar() {
    if (!db) return [];
    var { data, error } = await db.from("flyers").select("*").order("orden", { ascending: true });
    if (error) throw error;
    return (data || []).map(mapFlyer);
  }

  // (2026-08-15) Sube el archivo elegido en el modal directamente al
  // bucket "flyers" (Storage) — el usuario ya no necesita subir la imagen
  // a mano y pegar el link, el sistema arma la URL pública sola. Nombre de
  // archivo único (uuid + extensión) para no pisar imágenes con el mismo
  // nombre subidas por dos flyers distintos.
  async function subirImagen(file) {
    if (!file) return null;
    var extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || "");
    var ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
    var nombreArchivo = (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "." + ext;
    var { error } = await db.storage.from("flyers").upload(nombreArchivo, file, {
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) throw error;
    var { data } = db.storage.from("flyers").getPublicUrl(nombreArchivo);
    return data.publicUrl;
  }

  async function crear(payload) {
    if (!db) { global.NG_TOAST && global.NG_TOAST.show("Esto requiere Supabase conectado.", "info"); return null; }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var imagenUrl = payload.imagenFile ? await subirImagen(payload.imagenFile) : (payload.imagenUrl || null);
    if (!imagenUrl) throw new Error("Selecciona una imagen para el flyer.");
    var { error } = await db.from("flyers").insert({
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      imagen_url: imagenUrl,
      orden: payload.orden ? Number(payload.orden) : 0,
      activo: payload.activo !== false,
      created_by: userData.user.id
    });
    if (error) throw error;
  }

  async function actualizar(id, payload) {
    if (!db) return null;
    var cambios = {
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      orden: payload.orden ? Number(payload.orden) : 0,
      activo: payload.activo !== false
    };
    // Si no se eligió un archivo nuevo, se conserva la imagen que ya tenía
    // (payload.imagenUrl viaja como el valor actual desde modal-openers.js).
    if (payload.imagenFile) cambios.imagen_url = await subirImagen(payload.imagenFile);
    else if (payload.imagenUrl) cambios.imagen_url = payload.imagenUrl;
    var { error } = await db.from("flyers").update(cambios).eq("id", id);
    if (error) throw error;
  }

  async function eliminar(id) {
    if (!db) return null;
    var { error } = await db.from("flyers").delete().eq("id", id);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.flyers = { listar: listar, crear: crear, actualizar: actualizar, eliminar: eliminar };
})(window);
