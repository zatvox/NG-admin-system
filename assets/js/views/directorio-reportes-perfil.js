/* =====================================================================
 * views/directorio-reportes-perfil.js — Directorio de personas,
 * Reportes de avance (solo Dirección) y Mi perfil.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var S = global.NG_SHARED, H = global.NG_VIEW_HELPERS, U = global.NG_UTILS;

  // (2026-08-15) Etapa 5: el Directorio deja de ser una lista de solo
  // lectura y se convierte en la herramienta de aprobación de cuentas +
  // edición de estado, exclusiva de Líder/Dirección (ver NAV en
  // permissions.js). Todo lo que se ve/edita acá ya está respaldado por
  // usuarios_select/usuarios_update_propio en rls-policies.sql — si
  // alguien sin el rol correcto llega a este HTML, la consulta a
  // "usuarios" le devuelve cero filas y no hay nada que mostrar ni tocar.
  var ESTADO_OPTIONS_DIR = [
    { value: "activo", label: "Activo" },
    { value: "pendiente_activacion", label: "Pendiente de aprobación" },
    { value: "suspendido", label: "Suspendido" }
  ];
  var ESTADO_LABEL_DIR = {};
  ESTADO_OPTIONS_DIR.forEach(function (o) { ESTADO_LABEL_DIR[o.value] = o.label; });

  async function viewDirectorio() {
    if (!global.NG_DB) return viewDirectorioDemo();

    H.setTitle("Directorio", "Aprobación de cuentas y edición de estado — Líder / Dirección");
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h1", {}, ["Directorio"]),
        el("p", {}, ["Aprueba cuentas nuevas y edita el estado de cualquier miembro. Esta vista y sus datos están protegidos por RLS: solo Líderes y Dirección pueden verla."])
      ])
    ]));

    root.appendChild(el("div", { class: "section-title" }, ["Pendientes de aprobación"]));
    var pendSearch = el("input", { type: "text", placeholder: "Buscar por nombre o correo…", style: "width:280px;margin-bottom:12px;" });
    root.appendChild(pendSearch);
    var pendWrap = el("div", { class: "card" });
    root.appendChild(pendWrap);

    root.appendChild(el("div", { class: "section-title", style: "margin-top:26px;" }, ["Todos los miembros"]));
    var toolbar = el("div", { class: "toolbar" });
    var search = el("input", { type: "text", placeholder: "Buscar por nombre o correo…", style: "width:260px;" });
    toolbar.appendChild(search);
    root.appendChild(toolbar);
    var tableWrap = el("div", { class: "table-wrap" });
    root.appendChild(tableWrap);

    var usuarios = [];

    function estadoSelectFor(u) {
      var sel = el("select", { "aria-label": "Estado de " + u.nombre, style: "font-size:12px;padding:5px 8px;" });
      ESTADO_OPTIONS_DIR.forEach(function (o) {
        var opt = el("option", { value: o.value }, [o.label]);
        if (o.value === u.estado) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function (e) {
        var nuevo = e.target.value;
        sel.disabled = true;
        global.NG_DATA.usuarios.actualizarUsuarioAdmin(u.id, { estado: nuevo })
          .then(function () {
            global.NG_TOAST.show(u.nombre + " ahora está: " + ESTADO_LABEL_DIR[nuevo] + ".", "success");
            u.estado = nuevo; // la suscripción realtime también refrescará, esto solo evita el parpadeo
            sel.disabled = false;
            pintarTodo();
          })
          .catch(function (err) {
            sel.disabled = false; sel.value = u.estado;
            global.NG_TOAST.show(global.NG_ERR.format(err), "error");
          });
      });
      return sel;
    }

    function pintarPendientes() {
      var term = pendSearch.value.trim().toLowerCase();
      var pendientes = usuarios.filter(function (u) { return u.estado === "pendiente_activacion"; });
      if (term) {
        pendientes = pendientes.filter(function (u) {
          return (u.nombre || "").toLowerCase().indexOf(term) >= 0 || (u.email || "").toLowerCase().indexOf(term) >= 0;
        });
      }
      pendWrap.innerHTML = "";
      if (!pendientes.length) {
        pendWrap.appendChild(el("div", { class: "empty-state", style: "border:none;" }, [term ? "Nadie pendiente coincide con esa búsqueda." : "No hay cuentas esperando aprobación ahora mismo."]));
        return;
      }
      pendientes.forEach(function (u) {
        var row = el("div", { class: "toggle-row" }, [
          el("span", {}, [u.nombre + " — " + u.email])
        ]);
        var aprobarBtn = el("button", { class: "btn btn-accent", type: "button", style: "padding:6px 14px;font-size:12px;" }, ["Aprobar"]);
        aprobarBtn.addEventListener("click", function () {
          aprobarBtn.disabled = true; aprobarBtn.textContent = "Aprobando…";
          global.NG_DATA.usuarios.actualizarUsuarioAdmin(u.id, { estado: "activo" })
            .then(function () {
              global.NG_TOAST.show(u.nombre + " fue aprobado como miembro.", "success");
              u.estado = "activo";
              pintarTodo();
            })
            .catch(function (err) {
              aprobarBtn.disabled = false; aprobarBtn.textContent = "Aprobar";
              global.NG_TOAST.show(global.NG_ERR.format(err), "error");
            });
        });
        row.appendChild(aprobarBtn);
        pendWrap.appendChild(row);
      });
    }

    function pintarTabla() {
      var term = search.value.trim().toLowerCase();
      var filtrados = usuarios.filter(function (u) {
        return !term || (u.nombre || "").toLowerCase().indexOf(term) >= 0 || (u.email || "").toLowerCase().indexOf(term) >= 0;
      });
      tableWrap.innerHTML = "";
      if (!filtrados.length) { tableWrap.appendChild(el("div", { class: "empty-state", style: "border:none;" }, ["No se encontraron personas."])); return; }
      var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Nombre"]), el("th", {}, ["Correo"]), el("th", {}, ["Teléfono"]), el("th", {}, ["Estado"])])]);
      filtrados.forEach(function (u) {
        table.appendChild(el("tr", {}, [
          el("td", {}, [u.nombre]),
          el("td", {}, [u.email]),
          el("td", {}, [u.telefono || "—"]),
          el("td", {}, [estadoSelectFor(u)])
        ]));
      });
      tableWrap.appendChild(table);
    }

    function pintarTodo() { pintarPendientes(); pintarTabla(); }

    async function recargar() {
      usuarios = await global.NG_DATA.usuarios.listarTodos();
      pintarTodo();
    }

    pendSearch.addEventListener("input", U.debounce(pintarPendientes, 150));
    search.addEventListener("input", U.debounce(pintarTabla, 150));

    await recargar();

    // "…se actualiza en tiempo real…" (spec del 2026-08-15): un canal de
    // Supabase Realtime sobre la tabla "usuarios" — si otro Líder aprueba
    // o suspende a alguien, o si se registra una cuenta nueva, esta lista
    // se refresca sola sin que haya que recargar la página. Se guarda la
    // referencia en NG_STATE para poder cerrarla al salir de esta vista y
    // no ir acumulando canales abiertos cada vez que se entra a Directorio.
    if (global.NG_STATE._directorioChannel) {
      global.NG_DB.removeChannel(global.NG_STATE._directorioChannel);
      global.NG_STATE._directorioChannel = null;
    }
    global.NG_STATE._directorioChannel = global.NG_DB
      .channel("directorio-usuarios")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, function () { recargar(); })
      .subscribe();
  }

  // Modo demo (sin Supabase conectado): no hay tabla "usuarios" real ni
  // flujo de aprobación que probar, así que se mantiene el directorio de
  // solo lectura de siempre, agrupado por comisión/comando/rol.
  async function viewDirectorioDemo() {
    H.setTitle("Directorio");
    var rows = await global.NG_DATA.directorio.listar();
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [el("div", {}, [el("h1", {}, ["Directorio"]), el("p", {}, ["Personas por comisión, comando operativo y rol. (Modo demo: la aprobación de cuentas requiere Supabase conectado.)"])])]));

    var toolbar = el("div", { class: "toolbar" });
    var search = el("input", { type: "text", placeholder: "Buscar por nombre…", style: "width:220px;" });
    var filterC = el("select", {});
    filterC.appendChild(el("option", { value: "" }, ["Todas las comisiones"]));
    comisiones.forEach(function (c) { filterC.appendChild(el("option", { value: c.nombre }, [c.nombre])); });
    toolbar.appendChild(search); toolbar.appendChild(filterC);
    root.appendChild(toolbar);

    var container = el("div", { class: "table-wrap" });
    root.appendChild(container);

    function draw() {
      var term = search.value.trim().toLowerCase();
      var filtered = rows.filter(function (r) { return (!filterC.value || r.comision === filterC.value) && (!term || r.nombre.toLowerCase().indexOf(term) >= 0); });
      container.innerHTML = "";
      if (!filtered.length) { container.appendChild(el("div", { class: "empty-state", style: "border:none;" }, ["No se encontraron personas."])); return; }
      var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Nombre"]), el("th", {}, ["Rol"]), el("th", {}, ["Comisión"]), el("th", {}, ["Comando"])])]);
      filtered.forEach(function (r) {
        table.appendChild(el("tr", {}, [
          el("td", {}, [el("span", { class: "dot", style: "background:" + r.color }), r.nombre]),
          el("td", {}, [r.rol]), el("td", {}, [r.comision]), el("td", {}, [r.comando])
        ]));
      });
      container.appendChild(table);
    }
    search.addEventListener("input", U.debounce(draw, 150));
    filterC.addEventListener("change", draw);
    draw();
  }

  async function viewReportes() {
    H.setTitle("Reportes");
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [el("div", {}, [el("h1", {}, ["Reportes"]), el("p", {}, ["Avance de tareas por comisión."])])]));

    var card = el("div", { class: "card" });
    comisiones.forEach(function (c) {
      var tareas = S.allTareas([c]);
      var hechas = tareas.filter(function (t) { return t.estado === "hecho"; }).length;
      var pct = tareas.length ? Math.round(100 * hechas / tareas.length) : 0;
      card.appendChild(el("div", { class: "bar-row" }, [
        el("div", { class: "bar-label" }, [el("span", { class: "dot", style: "background:" + c.color }), c.nombre]),
        el("div", { class: "bar-track" }, [el("div", { class: "bar-fill", style: "width:" + pct + "%;background:" + c.color })]),
        el("div", { class: "bar-pct" }, [pct + "%"])
      ]));
    });
    root.appendChild(card);

    var todas = S.allTareas(comisiones);
    root.appendChild(el("div", { class: "section-title" }, ["Tareas vencidas"]));
    var vencidas = todas.filter(function (t) { return t.estado !== "hecho" && U.diasRestantes(t.fecha, global.NG_STATE.today) < 0; });
    root.appendChild(S.taskListSection(null, vencidas));

    root.appendChild(el("div", { class: "empty-state" }, ["Los reportes avanzados (exportables, por rango de fechas, por persona) están en el roadmap — ver especificaciones-sistema-comisiones.md sección 9."]));
  }

  async function viewPerfil() {
    H.setTitle("Mi perfil");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var c = p.comisionId ? S.getComision(comisiones, p.comisionId) : null;
    var s = p.subgrupoId ? S.getSubgrupo(comisiones, p.subgrupoId) : null;
    var ROL_LABEL = { direccion: "Dirección General", lider: "Líder de Comisión", coordinador: "Coordinador de Comando", miembro: "Miembro", colaborador: "Colaborador / Voluntario" };
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "profile-head" }, [
      el("div", { class: "avatar" }, [U.initials(p.nombre).toUpperCase()]),
      el("div", {}, [el("h1", { style: "margin:0;font-size:19px;" }, [p.nombre]), el("div", { style: "color:var(--text-soft);font-size:13px;margin-top:2px;" }, [ROL_LABEL[p.rol] + (c ? " · " + c.nombre : "")])])
    ]));

    root.appendChild(el("div", { class: "section-title" }, ["Pertenencias"]));
    var card = el("div", { class: "card" });
    // (2026-07-30) Antes solo mostraba UN comando (p.subgrupoId) — ahora
    // lista TODAS las membresías, porque una persona puede estar en varios
    // comandos de comisiones distintas a la vez (ej. su Macrodistrital de
    // Organización, más un comando de Eventos por su oficio).
    var ROL_MEMBRESIA_LABEL = { miembro: "Miembro", coordinador: "Coordinador/a" };
    if (p.membresias && p.membresias.length) {
      p.membresias.forEach(function (m) {
        var info = S.getSubgrupo(comisiones, m.comandoId);
        var etiqueta = info ? (info.subgrupo.nombre + " · " + info.comision.nombre) : "Comando";
        card.appendChild(S.rowKV(etiqueta, ROL_MEMBRESIA_LABEL[m.rol] || m.rol));
      });
      if (p.esLider) card.appendChild(S.rowKV("Comisión que lideras", c ? c.nombre : "—"));
    } else if (p.rol === "lider") {
      card.appendChild(S.rowKV("Comisión", c ? c.nombre : "No asignada"));
    } else {
      card.appendChild(S.rowKV("Comando operativo", "No perteneces a ningún comando todavía"));
    }
    card.appendChild(S.rowKV("Rol", ROL_LABEL[p.rol]));
    root.appendChild(card);

    // (2026-07-27) Antes "Mi perfil" era de solo lectura — ni el nombre ni
    // el teléfono se podían corregir desde la interfaz. usuarios_update_
    // propio ya lo permitía por RLS (cualquiera edita SU PROPIA fila),
    // solo faltaba el formulario.
    if (!global.NG_AUTH.isDemo) {
      root.appendChild(el("div", { class: "section-title" }, ["Datos personales"]));
      var editCard = el("div", { class: "card" });
      var nombreInput = el("input", { type: "text", value: p.nombre, placeholder: "Tu nombre completo" });
      var telInput = el("input", { type: "tel", value: p.telefono || "", placeholder: "Tu teléfono (opcional)" });
      var editErr = el("div", { class: "form-error", style: "display:none;background:#FBE9E7;color:var(--danger);border-radius:8px;padding:10px 12px;font-size:12.5px;margin-bottom:10px;" });
      editCard.appendChild(editErr);
      editCard.appendChild(el("div", { class: "field" }, [el("label", {}, ["Nombre completo"]), nombreInput]));
      editCard.appendChild(el("div", { class: "field" }, [el("label", {}, ["Teléfono"]), telInput]));
      var saveBtn = el("button", { class: "btn btn-accent", type: "button", style: "margin-top:6px;" }, ["Guardar cambios"]);
      saveBtn.addEventListener("click", function () {
        var nombre = nombreInput.value.trim();
        editErr.style.display = "none";
        if (!nombre) { editErr.textContent = "El nombre no puede quedar vacío."; editErr.style.display = "block"; return; }
        saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
        global.NG_DATA.usuarios.actualizarPerfil({ nombre: nombre, telefono: telInput.value.trim() })
          .then(function () {
            global.NG_TOAST.show("Perfil actualizado.", "success");
            if (global.NG_refreshPersonaAndGo) global.NG_refreshPersonaAndGo("#/perfil");
            else { saveBtn.disabled = false; saveBtn.textContent = "Guardar cambios"; }
          })
          .catch(function (err) {
            saveBtn.disabled = false; saveBtn.textContent = "Guardar cambios";
            editErr.textContent = global.NG_ERR.format(err); editErr.style.display = "block";
          });
      });
      editCard.appendChild(saveBtn);
      root.appendChild(editCard);
    }

    root.appendChild(el("div", { class: "section-title" }, ["Notificaciones"]));
    var card2 = el("div", { class: "card" });
    [["Nuevas tareas asignadas", true], ["Comunicados generales", true], ["Comunicados de mi comisión", true], ["Recordatorios de eventos", false]].forEach(function (item) {
      var row = el("div", { class: "toggle-row" }, [el("span", {}, [item[0]])]);
      var sw = el("label", { class: "switch" });
      var input = el("input", { type: "checkbox" }); if (item[1]) input.setAttribute("checked", "checked");
      input.addEventListener("change", function () { global.NG_TOAST.show("Preferencia actualizada (pendiente de guardar en tu perfil).", "info"); });
      sw.appendChild(input); sw.appendChild(el("span", { class: "slider" }));
      row.appendChild(sw);
      card2.appendChild(row);
    });
    root.appendChild(card2);

    if (!global.NG_AUTH.isDemo) {
      root.appendChild(el("div", { class: "section-title" }, ["Cuenta"]));
      var card3 = el("div", { class: "card" });
      card3.appendChild(S.rowKV("Correo", p.email || "—"));
      var logoutBtn = el("button", { class: "btn btn-ghost", type: "button", style: "margin-top:10px;" }, ["Cerrar sesión"]);
      logoutBtn.addEventListener("click", function () { global.NG_AUTH.logout().then(function () { window.location.href = "login.html"; }); });
      card3.appendChild(logoutBtn);
      root.appendChild(card3);
    }
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.directorio = viewDirectorio;
  global.NG_VIEWS.reportes = viewReportes;
  global.NG_VIEWS.perfil = viewPerfil;
})(window);
