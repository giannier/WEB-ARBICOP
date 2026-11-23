/* ==========================================================================
   ARBICOP - libro.js
   Libro de Reclamaciones: cascading ubigeo selects, in-browser validation and
   submission to /api/reclamo.php (token from /api/token.php).

   Validation here is a convenience, NOT security: the validation that counts
   lives in api/src/Validator.php.
   ========================================================================== */
(function () {
  "use strict";

  var form = document.getElementById("rt_form_libro");
  if (!form) return;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^[+]?[0-9()\s.-]{6,25}$/;
  var SUPPORT_MAIL = form.getAttribute("data-support-mail") || "";
  var statusBox = document.getElementById("lr-status");
  var submitBtn = document.getElementById("guardar_libro_reclamacion");

  var sending = false;
  var minWait = 6;
  var loadedAt = Date.now();
  var ubigeo = null;

  function $(id) { return document.getElementById(id); }

  /* ---------- Date shown in the read-only "fecha" field ---------- */
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  /* ---------- Ubigeo (static JSON, no admin-ajax) ---------- */
  function fill(select, items, placeholder) {
    select.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);
    items.forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
    });
    select.disabled = items.length === 0;
  }

  function initUbigeo() {
    var dep = $("dep"), prov = $("prov"), dist = $("dist");
    fetch(form.getAttribute("data-ubigeo"), { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        ubigeo = data;
        fill(dep, data.map(function (d) { return d.n; }), "Seleccionar departamento");
        dep.disabled = false;
      })
      .catch(function () {
        showStatus("error", "No pudimos cargar la lista de departamentos. Recarga la página" +
          (SUPPORT_MAIL ? " o escríbenos a " + SUPPORT_MAIL : "") + ".");
      });

    dep.addEventListener("change", function () {
      var d = (ubigeo || []).filter(function (x) { return x.n === dep.value; })[0];
      fill(prov, d ? d.p.map(function (p) { return p.n; }) : [], "Seleccionar provincia");
      fill(dist, [], "Seleccionar distrito");
    });
    prov.addEventListener("change", function () {
      var d = (ubigeo || []).filter(function (x) { return x.n === dep.value; })[0];
      var p = d ? d.p.filter(function (x) { return x.n === prov.value; })[0] : null;
      fill(dist, p ? p.d : [], "Seleccionar distrito");
    });
  }

  /* ---------- Token: requested on page load, binds the submission to this session ---------- */
  function requestToken() {
    fetch("/api/token.php", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        $("lr-token").value = d.token || "";
        if (d.min_wait) minWait = d.min_wait;
        loadedAt = Date.now();
      })
      .catch(function () {
        showStatus("error", "No pudimos preparar el formulario. Recarga la página" +
          (SUPPORT_MAIL ? " o escríbenos a " + SUPPORT_MAIL : "") + ".");
      });
  }

  /* ---------- Minor: guardian fields ---------- */
  var GUARDIAN = ["nombre_tutor", "correo_tutor", "tipo_doc_tutor", "nro_doc_tutor"];
  function syncMinor() {
    var yes = $("si").checked;
    ["title_tutor", "datos_tutor", "doc_tutor"].forEach(function (id) { $(id).hidden = !yes; });
    GUARDIAN.forEach(function (name) {
      var c = form.elements[name];
      if (yes) {
        c.setAttribute("required", "required");
      } else {
        c.removeAttribute("required");
        c.value = "";
        clearError(c);
      }
    });
  }

  /* ---------- Errors ---------- */
  function errBox(name) { return form.querySelector('.lr-err[data-for="' + name + '"]'); }

  function setError(control, message) {
    var box = errBox(control.name);
    if (box) {
      box.textContent = message;
      box.id = "err-" + control.name;
    }
    if (control.type !== "radio") {
      control.setAttribute("aria-invalid", "true");
      if (box) control.setAttribute("aria-describedby", box.id);
    }
  }

  function clearError(control) {
    var box = errBox(control.name);
    if (box) box.textContent = "";
    control.removeAttribute("aria-invalid");
    control.removeAttribute("aria-describedby");
  }

  function validateField(c) {
    if (c.closest("[hidden]") || c.disabled && c.name !== "prov" && c.name !== "dist") return true;
    var v = (c.value || "").trim();
    var message = "";

    if (c.type === "checkbox") {
      if (c.required && !c.checked) {
        message = c.name === "acepto"
          ? "Debes aceptar la declaración jurada para continuar."
          : "Debes aceptar la política de privacidad.";
      }
    } else if (c.required && v === "") {
      message = c.tagName === "SELECT" ? "Selecciona una opción." : "Este campo es obligatorio.";
    } else if (v !== "") {
      if (c.type === "email" && !EMAIL_RE.test(v)) message = "Ingresa un correo válido.";
      else if (c.type === "tel" && !PHONE_RE.test(v)) message = "Ingresa un celular válido.";
      else if (c.name === "nro_doc" || c.name === "nro_doc_tutor") {
        var type = form.elements[c.name === "nro_doc" ? "tipo_doc" : "tipo_doc_tutor"].value;
        var digits = v.replace(/[^A-Za-z0-9]/g, "");
        if (type === "DNI" && !/^\d{8}$/.test(digits)) message = "El DNI debe tener 8 dígitos.";
        else if (type === "RUC" && !/^\d{11}$/.test(digits)) message = "El RUC debe tener 11 dígitos.";
        else if (digits.length < 5) message = "El número de documento es demasiado corto.";
      } else if (c.name === "detalle_reclamo" && v.length < 20) {
        message = "Cuéntanos un poco más, con al menos 20 caracteres.";
      } else if (c.name === "pedido_cliente" && v.length < 10) {
        message = "Indica qué solicitas (mínimo 10 caracteres).";
      } else if (c.name === "monto_reclamado") {
        var n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
        if (isNaN(n) || n < 0 || !/^[0-9]+([.,][0-9]{1,2})?$/.test(v.replace(/\s/g, ""))) {
          message = "El monto no es válido (ejemplo: 150.00).";
        }
      } else if (c.type === "text" && c.required && v.length < 2) {
        message = "Este campo es demasiado corto.";
      }
    }

    if (message) { setError(c, message); return false; }
    clearError(c);
    return true;
  }

  function validateMinorChoice() {
    var picked = form.querySelector('input[name="flag_menor"]:checked');
    var box = errBox("flag_menor");
    if (!picked) {
      if (box) box.textContent = "Indica si eres menor de edad.";
      return false;
    }
    if (box) box.textContent = "";
    return true;
  }

  /* ---------- Status banner ---------- */
  function showStatus(kind, message) {
    statusBox.hidden = false;
    statusBox.className = "lr-status lr-status--" + kind;
    statusBox.textContent = message;
  }
  function hideStatus() { statusBox.hidden = true; statusBox.textContent = ""; }

  /* ---------- Submit ---------- */
  function showSuccess(d) {
    var done = $("lr-done");
    $("lr-claim-number").textContent = d.claim_number || "";
    $("lr-done-text").textContent = d.message || "";
    var link = $("lr-download");
    if (d.download_url && /^\/api\/hoja\.php\?/.test(d.download_url)) {
      link.href = d.download_url;
      link.hidden = false;
    }
    form.hidden = true;
    done.hidden = false;
    done.focus();
    done.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    hideStatus();

    var firstInvalid = null;
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), function (c) {
      if (c.type === "hidden" || c.type === "submit" || c.type === "radio" || c.readOnly || !c.name) return;
      if (c.name === "website_alt") return;
      if (!validateField(c) && !firstInvalid) firstInvalid = c;
    });
    var okMinor = validateMinorChoice();
    if (!okMinor && !firstInvalid) firstInvalid = $("si");

    if (firstInvalid) {
      firstInvalid.focus();
      showStatus("error", "Revisa los campos marcados.");
      return;
    }

    // The server rejects too-fast submissions; warn here before burning the token.
    if ((Date.now() - loadedAt) / 1000 < minWait) {
      showStatus("error", "Un momento, estamos preparando el envío. Vuelve a pulsar «Enviar» en unos segundos.");
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    var label = submitBtn.value;
    submitBtn.value = "Registrando…";

    fetch("/api/reclamo.php", { method: "POST", credentials: "same-origin", cache: "no-store", body: new FormData(form) })
      .then(function (r) {
        return r.json().then(function (d) { return { status: r.status, data: d }; });
      })
      .then(function (r) {
        var d = r.data || {};
        if (d.ok) { showSuccess(d); return; }
        if (d.errors) {
          Object.keys(d.errors).forEach(function (field) {
            var control = form.elements[field];
            if (control && control.tagName) setError(control, d.errors[field]);
            else if (errBox(field)) errBox(field).textContent = d.errors[field];
          });
        }
        showStatus("error", d.message || "No pudimos registrar tu reclamo. Inténtalo de nuevo.");
        if (r.status === 419 || r.status === 403) requestToken();
      })
      .catch(function () {
        showStatus("error", "No pudimos conectar con el servidor. Revisa tu conexión" +
          (SUPPORT_MAIL ? " o escríbenos a " + SUPPORT_MAIL : "") + ".");
      })
      .finally(function () {
        sending = false;
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
        submitBtn.value = label;
      });
  }

  function init() {
    $("fch_reclamo").value = today();
    initUbigeo();
    requestToken();
    Array.prototype.forEach.call(form.querySelectorAll(".edad"), function (r) {
      r.addEventListener("change", function () { syncMinor(); validateMinorChoice(); });
    });
    syncMinor();
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), function (c) {
      if (c.type === "hidden" || c.type === "submit" || c.type === "radio" || !c.name) return;
      c.addEventListener("blur", function () { validateField(c); });
      c.addEventListener("change", function () {
        if (c.getAttribute("aria-invalid") === "true") validateField(c);
      });
    });
    form.addEventListener("submit", onSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
