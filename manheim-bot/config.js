module.exports = {
  // Texto (parcial, tal cual aparece truncado) de cada chip de búsqueda guardada en Manheim.
  // "Emmanuel 2026 2" no tiene tope de millas/grado/MMR en Manheim — el bot aplica
  // esos rangos por su cuenta (ver filterRanges) sobre lo que traiga esa búsqueda.
  savedSearches: [
    'TEPIC - KIA FORTE',
    'TEPIC - VW',
    'Emmanuel 2026 2',
  ],

  // Rangos que TEPIC ya trae aplicados desde Manheim, pero que Emmanuel 2026 2 no
  // filtra — se validan aquí para que ninguna búsqueda se salga del criterio de negocio.
  filterRanges: {
    odometerMax: 125000,
    gradeMin: 1.0,
    gradeMax: 3.0,
    mmrMin: 1500,
    mmrMax: 4000,
  },

  // Modelos con riesgo de CVT: excluidos por default (Sentra/Versa ya te fallaron dos veces).
  blacklistModels: ['sentra', 'versa', 'altima', 'rogue', 'juke'],

  // Excepción: transmisión manual no tiene CVT (ej. Sentra NISMO).
  blacklistExceptionTransmission: 'manual',

  // Excepción: un Sentra/Versa/etc. con poco kilometraje probablemente se vende por un
  // choque imprevisto, no porque falló la CVT (esa falla típica ocurre entre 90k-130k mi).
  // Se permite SOLO si además no hay ninguna señal de problema de motor/transmisión.
  blacklistMileageException: 70000,

  // Palabras que, si aparecen en daños o anuncios, delatan un problema mecánico real
  // (no cosmético) y descartan el auto sin importar kilometraje ni marca/modelo.
  mechanicalKeywords: ['transmission', 'engine', 'drivetrain', 'cvt', 'slips', 'hard shift', 'check engine'],

  // Financieras subprime: mayor probabilidad de que el auto sea repo/abandono
  // (no descarta, solo agrega nota de advertencia).
  subprimeLenders: ['westlake', 'santander', 'credit acceptance'],
};
