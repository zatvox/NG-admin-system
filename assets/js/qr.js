/* =====================================================================
 * qr.js — Generación de códigos QR 100% en cliente (sin backend ni API
 * de pago). Librería qrcodejs (davidshimjs), cargada por CDN (cdnjs) de
 * forma DINÁMICA — solo cuando hace falta (renderizarQR la pide), no
 * como <script> fijo cargado siempre en app.html.
 *
 * (2026-09-30) Se cambió del paquete npm "qrcode" servido por
 * cdn.jsdelivr.net al mismo patrón ya probado y funcionando en otros
 * sistemas del usuario (qrcodejs + cdnjs, carga dinámica): con la carga
 * fija por <script src> en el <head>, si esa request fallaba (bloqueada
 * por un ad-blocker/extensión, o simplemente lenta) toda la librería
 * quedaba sin cargar y no había forma de reintentar sin recargar la
 * página completa. Cargándola bajo demanda, sólo se pide una vez (se
 * memoiza en cargaPromesa) y sólo cuando el usuario realmente abre una
 * pantalla que necesita el QR.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  var cargaPromesa = null;

  function cargarLibreria() {
    if (global.QRCode) return Promise.resolve();
    if (cargaPromesa) return cargaPromesa;
    cargaPromesa = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = CDN_URL;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        cargaPromesa = null; // permite reintentar en la siguiente llamada
        reject(new Error("No se pudo cargar la librería de QR (" + CDN_URL + ")."));
      };
      document.head.appendChild(script);
    });
    return cargaPromesa;
  }

  // Crea (o reemplaza) el QR dentro de "contenedor" (un <div> vacío —
  // qrcodejs arma su propio <canvas>/<table> interno, a diferencia de
  // otras librerías que piden un <canvas> ya creado).
  function renderizarQR(contenedor, texto) {
    return cargarLibreria().then(function () {
      contenedor.innerHTML = "";
      return new global.QRCode(contenedor, {
        text: texto,
        width: 180,
        height: 180,
        colorDark: "#0B1220",
        colorLight: "#FFFFFF",
        correctLevel: global.QRCode.CorrectLevel.M
      });
    });
  }

  // Descarga el QR como PNG. No usa el canvas de la librería tal cual:
  // lo redibuja sobre un canvas nuevo con fondo blanco sólido + un
  // margen de "zona tranquila" alrededor, para que el PNG exportado
  // siempre sea escaneable (evita el fondo transparente que en algunas
  // apps sale negro/gris al pegarlo).
  function descargarQR(contenedorId, nombreArchivo) {
    var contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;
    var origCanvas = contenedor.querySelector("canvas");
    if (!origCanvas) return;

    var margen = 16;
    var destino = document.createElement("canvas");
    destino.width = origCanvas.width + margen * 2;
    destino.height = origCanvas.height + margen * 2;
    var ctx = destino.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, destino.width, destino.height);
    ctx.drawImage(origCanvas, margen, margen);

    var link = document.createElement("a");
    link.download = (nombreArchivo || "qr") + ".png";
    link.href = destino.toDataURL("image/png");
    link.click();
  }

  global.NG_QR = { renderizar: renderizarQR, descargar: descargarQR };
})(window);
