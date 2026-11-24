/* Imitación mínima de google.script.run para la demo: manda cada llamada a /api/<función>. */
window.google = {
  script: {
    run: (function crear(ok, falla) {
      var api = {
        withSuccessHandler: function (f) { return crear(f, falla); },
        withFailureHandler: function (f) { return crear(ok, f); }
      };
      ['iniciar', 'buscarLugares', 'lugarEnPunto', 'calcularSalida', 'descargarPdf'].forEach(function (nombre) {
        api[nombre] = function () {
          fetch('/api/' + nombre, { method: 'POST', body: JSON.stringify(Array.prototype.slice.call(arguments)) })
            .then(function (r) { return r.json(); })
            .then(function (r) {
              if (r.ok) { if (ok) ok(r.resultado); } else if (falla) { falla(new Error(r.error)); }
            })
            .catch(function (e) { if (falla) falla(e); });
        };
      });
      return api;
    })(null, null)
  }
};
