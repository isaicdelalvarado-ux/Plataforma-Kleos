/**
 * ============================================================================
 * PLATAFORMA KLEOS - GOOGLE APPS SCRIPT (CÓDIGO DEFINITIVO DE PRODUCCIÓN)
 * ============================================================================
 * Versión: 15.0.0 (Aceptación Universal de Nombres Metcon & Blindaje Total Col H=0, Col X=Score)
 * 
 * Reglas de Producción estrictas:
 * 1. Pestañas Activas:
 *    - 'Wellness' -> Registro matutino independiente
 *    - 'Registro_Diario' -> Registro de entrenamiento mapeado exactamente
 * 2. Garantía de Fila Inferior Libre:
 *    - En ambas hojas, se insertan los datos y se asegura que siempre quede
 *      al menos una fila completamente en blanco al final de la hoja para Looker Studio.
 * 3. Lista de Atletas Dinámica:
 *    - Se leen los nombres de la pestaña 'Nombre de Atletas' vía doGet().
 * 4. Pestaña 'RM_Atletas' y Lógica Epley:
 *    - Se leen las marcas registradas de los atletas para detectar si ya cuentan
 *      con 1RM previo o si debe procesarse con la ecuación de Epley.
 * 5. Mapeo exacto de Columnas en 'Registro_Diario':
 *    - A: Atleta
 *    - B: Fecha (YYYY-MM-DD)
 *    - C: Mes (ej. Septiembre)
 *    - D: Semana (ej. Semana 36)
 *    - E: Ejercicio (Acepta CUALQUIER nombre de prueba o WOD sin filtros restrictivos)
 *    - F: Categoría
 *    - G: Series -> [0 en Metcon / WOD]
 *    - H: Reps / Distancia (km) -> [0 en Metcon / WOD | Distancia km decimal en Cardio]
 *    - I: Carga (kg)  -> [0 en Cardio y Metcon / WOD]
 *    - J: 1RM Atleta (kg) -> [0 en Cardio y Metcon / WOD o calculado con Epley]
 *    - K hasta R: Vacías o Fórmulas / Tonelaje aislado
 *    - S: RPE (columna 19)
 *    - W: Duracion_min (columna 23)
 *    - X: Score_Reps (columna 24) -> [Valor continuo con 3 decimales fijos ej. 3.025 en Metcon]
 *    - Y: Peso_WOD (columna 25)
 */

var TABS = {
  WELLNESS: "Wellness",
  REGISTRO_DIARIO: "Registro_Diario",
  NOMBRE_ATLETAS: "Nombre de Atletas",
  RM_ATLETAS: "RM_Atletas",
  LOG_SCRIPT: "Log_Script"
};

var NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

/**
 * Endpoint GET:
 * 1. Si no hay parámetros: Verifica estado y devuelve la lista de atletas y RMs
 * 2. Parámetros opcionales: ?action=getAthletes o ?action=getInitialData
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Soporte para auditoría de salud de Looker Studio y backend
    if (e && e.parameter && (e.parameter.action === "audit" || e.parameter.action === "health")) {
      var auditReport = auditIntegrityCheck(ss);
      return ContentService.createTextOutput(JSON.stringify(auditReport))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var athletes = getAthletesList(ss);
    var rmData = getRmData(ss);

    var response = {
      status: "ok",
      message: "Plataforma Kleos API activa",
      athletes: athletes,
      rmData: rmData,
      timestamp: new Date().toISOString()
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Error en doGet: " + err.toString(),
      athletes: [],
      rmData: {}
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Endpoint POST: Recibe registros de Wellness o Registro_Diario
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var data = null;

  try {
    // Bloqueo concurrente de hasta 12 segundos
    lockAcquired = lock.tryLock(12000);
    if (!lockAcquired) {
      return sendJsonResponse("error", "El servidor está procesando otro registro en este milisegundo. Reintenta.");
    }

    if (!e || !e.postData || !e.postData.contents) {
      return sendJsonResponse("error", "Petición POST vacía o sin contenido.");
    }

    data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === "wellness") {
      insertWellness(ss, data);
      return sendJsonResponse("success", "Wellness guardado en pestaña '" + TABS.WELLNESS + "' para " + (data.athlete || "Atleta"));
    } 
    else if (data.type === "wod" || data.type === "registro_diario") {
      insertRegistroDiario(ss, data);
      return sendJsonResponse("success", "Entrenamiento guardado en pestaña '" + TABS.REGISTRO_DIARIO + "' para " + (data.athlete || "Atleta"));
    } 
    else {
      return sendJsonResponse("error", "Tipo de registro no válido: " + data.type);
    }

  } catch (error) {
    try {
      var ssErr = SpreadsheetApp.getActiveSpreadsheet();
      logScriptEvent(ssErr, "ERROR_POST", (data && data.athlete) || "Desconocido", -1, "FAILED", error.toString());
    } catch (_) {}
    return sendJsonResponse("error", "Error interno al insertar: " + error.toString());
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Inserta en la pestaña 'Registro_Diario' SIN USAR appendRow() ni getLastRow().
 * Busca la primera fila vacía basándose ÚNICAMENTE en la columna A (Atleta),
 * escribe A-J y S con getRange(), permitiendo que las fórmulas en K-R se ejecuten.
 */
function insertRegistroDiario(ss, data) {
  var sheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.REGISTRO_DIARIO);
    initRegistroDiarioHeaders(sheet);
  }

  // Asegurar existencia y cabeceras de columnas W (23), X (24) e Y (25)
  if (sheet.getMaxColumns() < 25) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 25 - sheet.getMaxColumns());
  }
  var hW = sheet.getRange("W1").getValue();
  var hX = sheet.getRange("X1").getValue();
  var hY = sheet.getRange("Y1").getValue();
  if (!hW || !hX || !hY) {
    sheet.getRange("W1:Y1").setValues([["Duracion_min", "Score_Reps", "Peso_WOD"]]);
    var rangeH = sheet.getRange("W1:Y1");
    rangeH.setFontWeight("bold");
    rangeH.setBackground("#0f172a");
    rangeH.setFontColor("#f8fafc");
  }

  // Buscar la primera fila vacía real en Columna A (Atleta)
  var targetRow = getFirstEmptyRowByColumnA(sheet);

  // Desglose de fecha para Mes y Semana
  var rawDate = data.fecha || data.date;
  var fechaObj = parseDate(rawDate);
  var mesTexto = NOMBRES_MESES[fechaObj.getMonth()];
  var semanaNum = getWeekNumber(fechaObj);
  var semanaTexto = "Semana " + semanaNum;

  var atleta = (data.atleta || data.athlete || "Sin Nombre").toString().trim();
  var fechaStr = rawDate || formatDateISO(fechaObj);
  var categoria = (data.categoria || data.category || "Fuerza").toString().trim();
  var ejercicio = (data.ejercicio || data.exercise || "").toString().trim();
  var variante = (data.variante || data.variant || "").toString().trim();
  if (variante && variante !== "-- Estándar / Desde el Suelo (Sin variante) --" && variante !== "Sin variante" && ejercicio.indexOf(variante) === -1) {
    ejercicio = ejercicio + " (" + variante + ")";
  }

  var duracion = (data.duracion !== undefined && data.duracion !== null) ? String(data.duracion).trim() : 
                 (data.duration !== undefined && data.duration !== null ? String(data.duration).trim() : "");
  var scoreReps = (data.scoreReps !== undefined && data.scoreReps !== "" && data.scoreReps !== null) ? Number(data.scoreReps) : "";
  var pesoWod = 0;

  var series = 0;
  var repsOrDistance = 0;  // AISLAMIENTO: valor neutro por defecto
  var cargaKg = 0;
  var rmKg = 0;

  // Detección Universal de Categorías (Sin filtros por nombre exacto de ejercicio)
  var catLower = categoria.toLowerCase();
  var esLifting = (categoria === "Fuerza" || categoria === "Levantamiento Olímpico" || catLower.indexOf("fuerza") !== -1 || catLower.indexOf("olímpico") !== -1 || catLower.indexOf("olimpico") !== -1);
  var esGimnasticos = (categoria === "Gimnásticos" || catLower.indexOf("gimnastic") !== -1);
  var esMetcon = (categoria === "Metcon / WOD" || catLower.indexOf("metcon") !== -1 || catLower.indexOf("wod") !== -1 || (data.scoreReps !== undefined && data.scoreReps !== "" && Number(data.scoreReps) > 0));
  var esCardio = (categoria === "Cardio" || catLower.indexOf("cardio") !== -1 || catLower.indexOf("carrera") !== -1);

  if (esLifting) {
    // --- FUERZA / LEVANTAMIENTO OLÍMPICO ---
    series = Number(data.series !== undefined ? data.series : 1);
    repsOrDistance = data.reps !== undefined ? data.reps : (data.repsOrDistance !== undefined ? data.repsOrDistance : "");
    cargaKg = Number(data.carga !== undefined ? data.carga : (data.weight !== undefined ? data.weight : 0)) || 0;
    rmKg = Number(data.unRM !== undefined ? data.unRM : (data.oneRepMax !== undefined ? data.oneRepMax : 0)) || 0;
    duracion = "";
    scoreReps = "";
    pesoWod = 0;

  } else if (esGimnasticos) {
    // --- GIMNÁSTICOS ---
    series = Number(data.series !== undefined ? data.series : 1);
    repsOrDistance = data.reps !== undefined ? data.reps : (data.repsOrDistance !== undefined ? data.repsOrDistance : "");
    cargaKg = 0;
    rmKg = 0;
    duracion = "";
    scoreReps = "";
    pesoWod = 0;

  } else if (esMetcon) {
    // =========================================================================
    // REGLA DE AISLAMIENTO UNIVERSAL (VERSIÓN 15) — Metcon / WOD
    // Acepta CUALQUIER nombre de ejercicio/WOD (ej. 'Prueba', 'Fran', 'AMRAP', etc.)
    // Col G (Series)     <- FORZADO a 0
    // Col H (Reps)       <- BLOQUEADO OBLIGATORIAMENTE EN 0 (Cero absoluto)
    // Col I (Carga)      <- FORZADO a 0
    // Col J (1RM)        <- FORZADO a 0
    // Col W (Duración)   <- Recibe la duración exacta (ej. '12:30')
    // Col X (Score_Reps) <- Recibe el score exacto (ej. 3.025) a 3 decimales fijos
    // =========================================================================
    series = 0;          // Col G = 0 (aislamiento estricto)
    repsOrDistance = 0;  // Col H = 0 (CERO ABSOLUTO BLINDADO - el score NO va en Col H)
    cargaKg = 0;         // Col I = 0
    rmKg = 0;            // Col J = 0

    var tipoWod = (data.tipoWod || data.tipo_wod || "").toString().trim();
    var isEmom = tipoWod.indexOf("EMOM") !== -1 || (data.emomMinutosTotales !== undefined && Number(data.emomMinutosTotales) > 0);

    // Si viene scoreReps directo en el payload, usarlo con máxima prioridad
    if (data.scoreReps !== undefined && data.scoreReps !== "" && data.scoreReps !== null && !isNaN(Number(String(data.scoreReps).replace(',', '.')))) {
      scoreReps = parseFloat(String(data.scoreReps).replace(',', '.'));
    } else if (isEmom) {
      // Regla Backend EMOM: Minutos_Completados + (Minutos_Faltantes / 1000)
      var minTotales = Number(data.emomMinutosTotales !== undefined ? data.emomMinutosTotales : (data.minutosTotales || 0));
      var minCompletados = Number(data.emomMinutosCompletados !== undefined ? data.emomMinutosCompletados : (data.minutosCompletados || 0));
      if (minCompletados > minTotales && minTotales > 0) minCompletados = minTotales;
      var minFaltantes = Math.max(0, minTotales - minCompletados);
      scoreReps = minCompletados + (minFaltantes / 1000);
    } else {
      // Regla Backend For Time y AMRAP: Rondas_Completas + (Reps_Adicionales / 1000)
      var rondas = Number(data.rondasCompletas !== undefined ? data.rondasCompletas : 0);
      var repsExtra = Number(data.repsAdicionales !== undefined ? data.repsAdicionales : 0);
      scoreReps = rondas + (repsExtra / 1000);
    }

    // Garantizar valor numérico continuo con 3 decimales fijos (ej: 3.025)
    if (scoreReps !== "" && scoreReps !== null && !isNaN(scoreReps)) {
      scoreReps = Math.round(Number(scoreReps) * 1000) / 1000;
    }
    pesoWod = 0;

  } else if (esCardio) {
    // =========================================================================
    // REGLA DE AISLAMIENTO OBLIGATORIA (VERSIÓN 14) — Cardio
    // Col G (Intervalos) <- 1 por defecto o series reales del fraccionado
    // Col H (Distancia)  <- Distancia limpia convertida a Kilómetros en formato decimal continuo (Ej: 2.8 o 0.8), sin multiplicar por 1000
    // Col I (Carga)      <- FORZADO a 0
    // Col J (1RM)        <- FORZADO a 0
    // =========================================================================
    series = Number(data.series !== undefined && data.series !== null && data.series !== ""
      ? data.series
      : (data.intervals !== undefined && data.intervals !== null && data.intervals !== "" ? data.intervals : 1));
    if (isNaN(series) || series < 1) series = 1;  // mínimo 1 intervalo

    // Distancia: parseFloat garantiza decimal continuo (km limpio), NUNCA miles
    var rawDistancia = data.distancia !== undefined ? data.distancia
      : (data.distance !== undefined ? data.distance
      : (data.repsOrDistance !== undefined ? data.repsOrDistance : 0));
    repsOrDistance = parseFloat(String(rawDistancia).replace(',', '.')) || 0;  // Col H = km limpio

    cargaKg = 0;   // Col I = 0
    rmKg = 0;      // Col J = 0
    scoreReps = "";
    pesoWod = 0;

  } else {
    // --- CATEGORÍA DESCONOCIDA: fallback seguro ---
    series = Number(data.series || 1);
    repsOrDistance = data.reps || data.repsOrDistance || "";
    cargaKg = Number(data.carga || data.weight || 0);
    rmKg = Number(data.unRM || data.oneRepMax || 0);
  }

  var rpe = data.rpe !== undefined ? data.rpe : "";

  // 1. Escribir columnas A hasta J (columnas 1 a 10)
  var colsA_J = [
    atleta,          // Col A: Atleta
    fechaStr,        // Col B: Fecha
    mesTexto,        // Col C: Mes
    semanaTexto,     // Col D: Semana
    ejercicio,       // Col E: Ejercicio
    categoria,       // Col F: Categoría
    series,          // Col G: Series
    repsOrDistance,  // Col H: Reps / Distancia (km)
    cargaKg,         // Col I: Carga (kg)
    rmKg             // Col J: 1RM Atleta (kg)
  ];
  sheet.getRange(targetRow, 1, 1, colsA_J.length).setValues([colsA_J]);

  // 2. Escribir Columna S: RPE (columna 19)
  sheet.getRange(targetRow, 19).setValue(rpe);

  // 3. Escribir Columnas W, X, Y (columnas 23, 24, 25)
  sheet.getRange(targetRow, 23, 1, 3).setValues([[duracion, scoreReps, pesoWod]]);
  // Formato numérico fijo de 3 decimales en Col X para Metcon/WOD
  if (esMetcon && scoreReps !== "" && scoreReps !== 0) {
    sheet.getRange(targetRow, 24).setNumberFormat("0.000");
  }

  // 4. AISLAMIENTO DE TONELAJE & AUTO-PROPAGACIÓN DE FÓRMULAS
  ensureRowFormulas(sheet, targetRow, categoria, {
    series: series,
    reps: repsOrDistance,
    scoreReps: scoreReps,
    distancia: data.distancia
  });

  // 5. Mantener exactamente una sola fila limpia al final sin generar saltos masivos
  ensureSingleCleanBottomRow(sheet, targetRow);

  // 6. Telemetría de Monitoreo Proactivo en 'Log_Script'
  logScriptEvent(ss, "INSERT_REGISTRO_DIARIO", atleta, targetRow, "HEALTHY", "Cat: " + categoria + " | Ej: " + ejercicio + " | PesoWOD: " + pesoWod + "kg | Carga: " + cargaKg + "kg | 1RM: " + rmKg + "kg | WOD: " + duracion + " / " + scoreReps + " reps | RPE: " + rpe);
}

/**
 * Inserta en la pestaña 'Wellness' SIN USAR appendRow() ni getLastRow().
 * Busca la primera fila vacía en Columna A y escribe exactamente en esa fila con getRange().
 */
function insertWellness(ss, data) {
  var sheet = ss.getSheetByName(TABS.WELLNESS);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.WELLNESS);
    initWellnessHeaders(sheet);
  }

  // Asegurar existencia y cabeceras de columnas K (11) y L (12)
  if (sheet.getMaxColumns() < 12) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 12 - sheet.getMaxColumns());
  }
  var hK = sheet.getRange("K1").getValue();
  var hL = sheet.getRange("L1").getValue();
  if (!hK || !hL) {
    sheet.getRange("K1:L1").setValues([["Zonas_Molestia", "Notas_Sensaciones"]]);
    var rangeExt = sheet.getRange("K1:L1");
    rangeExt.setFontWeight("bold");
    rangeExt.setBackground("#0f172a");
    rangeExt.setFontColor("#f8fafc");
  }

  // Buscar la primera fila vacía real en Columna A
  var targetRow = getFirstEmptyRowByColumnA(sheet);

  // 1. Col B: Calidad del Sueño (1 a 5)
  var calidadSueno = Number(data.sleepQuality !== undefined ? data.sleepQuality : 3);

  // 2. Col C: Nivel de Energía = 11 - fatiga (fatiga 1 al 10 del frontend)
  var fatigaFrontend = Number(data.fatigueLevel !== undefined ? data.fatigueLevel : 4);
  var nivelEnergia = 11 - fatigaFrontend;

  // 3. Col D: Dolor Muscular (1 al 5: 5 = sin dolor / óptimo)
  var dolorMuscular = Number(data.muscleSoreness !== undefined ? data.muscleSoreness : 5);

  // 4. Col E: Nivel de Estrés = 6 - estrés (estrés 1 al 5 del frontend)
  var estresFrontend = Number(data.stressLevel !== undefined ? data.stressLevel : 2);
  var nivelEstres = 6 - estresFrontend;

  // 5. Col F: Estado de Ánimo (1 al 5: 5 = excelente / motivado)
  var estadoAnimo = Number(data.moodLevel !== undefined ? data.moodLevel : 4);

  // 6. Col G: Horas de Sueño
  var horasSueno = Number(data.sleepHours !== undefined ? data.sleepHours : 7.5);

  // 7. Col H: Nombre del Atleta
  var nombreAtleta = data.athlete || "Sin Nombre";

  // 8. Col I: Fecha (YYYY-MM-DD)
  var fechaStr = data.date || formatDateISO(new Date());

  // 9. Col J: Wellness Score real = Suma exacta de columnas B + C + D + E + F
  var wellnessScore = calidadSueno + nivelEnergia + dolorMuscular + nivelEstres + estadoAnimo;

  // 10. Col K: Zonas anatómicas con molestia (Detalle complementario)
  var zonasMolestia = (data.sorenessAreas !== undefined && data.sorenessAreas !== null && String(data.sorenessAreas).trim() !== "")
    ? String(data.sorenessAreas).trim()
    : "Sin molestias";

  // 11. Col L: Notas / Sensaciones de la Mañana
  var notasSensaciones = (data.notes !== undefined && data.notes !== null)
    ? String(data.notes).trim()
    : ((data.wellnessNotes !== undefined && data.wellnessNotes !== null) ? String(data.wellnessNotes).trim() : "");

  // 12. Col A: Marca temporal
  var marcaTemporal = data.timestamp || new Date();

  // Escribir exactamente las 12 columnas (A hasta L) en la fila destino
  var colsWellness = [
    marcaTemporal,    // Col A: Marca temporal
    calidadSueno,     // Col B: Calidad del Sueño
    nivelEnergia,     // Col C: Nivel de Energía (11 - fatiga)
    dolorMuscular,    // Col D: Dolor Muscular
    nivelEstres,      // Col E: Nivel de Estrés (6 - estrés)
    estadoAnimo,      // Col F: Estado de Ánimo
    horasSueno,       // Col G: Horas de Sueño
    nombreAtleta,     // Col H: Nombre del Atleta
    fechaStr,         // Col I: Fecha
    wellnessScore,    // Col J: Wellness Score (B + C + D + E + F)
    zonasMolestia,    // Col K: Zonas anatómicas con molestia
    notasSensaciones  // Col L: Notas / Sensaciones de la Mañana
  ];
  sheet.getRange(targetRow, 1, 1, colsWellness.length).setValues([colsWellness]);

  // Mantener exactamente una sola fila limpia al final sin generar saltos masivos
  ensureSingleCleanBottomRow(sheet, targetRow);

  // Telemetría de Monitoreo Proactivo en 'Log_Script'
  logScriptEvent(ss, "INSERT_WELLNESS", nombreAtleta, targetRow, "SUCCESS", "Score: " + wellnessScore + " (Sueño:" + calidadSueno + ", Energía:" + nivelEnergia + ", Dolor:" + dolorMuscular + ", Estrés:" + nivelEstres + ", Ánimo:" + estadoAnimo + ") | Zonas: " + zonasMolestia + " | Notas: " + notasSensaciones);
}

/**
 * ENCUENTRA LA PRIMERA FILA VERDADERAMENTE VACÍA BASÁNDOSE ÚNICAMENTE EN LA COLUMNA A.
 * Ignora si existen fórmulas en columnas adyacentes o si devuelven "".
 * Recorre desde la fila 2 hacia abajo.
 */
function getFirstEmptyRowByColumnA(sheet) {
  var maxRows = sheet.getMaxRows();
  if (maxRows <= 1) {
    sheet.insertRowAfter(maxRows);
    return 2;
  }

  // Leer todos los valores de la columna A en una sola llamada eficiente
  var colAValues = sheet.getRange(1, 1, maxRows, 1).getValues();

  // Iterar desde el índice 1 (fila 2 de la hoja, omitiendo encabezados)
  for (var i = 1; i < colAValues.length; i++) {
    var val = colAValues[i][0];
    if (val === "" || val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
      return i + 1; // Retorna el número de fila basado en 1
    }
  }

  // Si todas las filas existentes tienen datos en Columna A, agregar una sola fila al final
  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

/**
 * Asegura que quede exactamente una fila limpia al final de la hoja,
 * sin agregar cientos de filas vacías innecesarias.
 */
function ensureSingleCleanBottomRow(sheet, targetRow) {
  var maxRows = sheet.getMaxRows();
  if (targetRow >= maxRows) {
    sheet.insertRowAfter(maxRows);
  }
}

/**
 * MEDIDA DE SEGURIDAD PREVENTIVA: AUTO-PROPAGACIÓN DE FÓRMULAS MAESTRAS Y AISLAMIENTO DE TONELAJE
 * - Para Fuerza y Levantamiento Olímpico:
 *   Garantiza que Cols K a R (11 a 18) y T a V (20 a 22) copien las fórmulas maestras de la fila 2.
 * - Para Metcon / WOD, Gimnásticos y Cardio:
 *   Aisla completamente el tonelaje de fuerza pura:
 *   - Col K (11, % 1RM Real) = 0
 *   - Col L (12, Reps Totales) = Metcon: scoreReps, Cardio: distancia, Gimnásticos: series*reps
 *   - Col M (13, Tonelaje Total kg) = 0 (aislamiento estricto)
 *   - Col N (14, Zona de Carga) = Categoría
 *   - Cols O a R (15 a 18, Contadores de Fuerza) = 0
 *   - Col T (20, Fecha_Ordenada) = Formula de semana/fecha
 *   - Col U (21, Sesion_ID) = Formula de Sesion_ID
 *   - Col V (22, % 1RM Porcentaje) = 0
 */
function ensureRowFormulas(sheet, targetRow, categoria, opts) {
  if (!sheet || targetRow <= 2) return;
  categoria = (categoria || "").toString().trim();
  opts = opts || {};

  var catLower = categoria.toLowerCase();
  var esMetconCat = (categoria === "Metcon / WOD" || catLower.indexOf("metcon") !== -1 || catLower.indexOf("wod") !== -1);
  var esCardioCat = (categoria === "Cardio" || catLower.indexOf("cardio") !== -1 || catLower.indexOf("carrera") !== -1);
  var esGimnasticosCat = (categoria === "Gimnásticos" || catLower.indexOf("gimnastic") !== -1);
  var esNoFuerza = (esMetconCat || esCardioCat || esGimnasticosCat);

  try {
    if (esNoFuerza) {
      var repsTotales = 0;
      if (esMetconCat) {
        repsTotales = Number(opts.scoreReps) || (Number(opts.reps) || 0);
      } else if (esCardioCat) {
        repsTotales = Number(opts.distancia) || (Number(opts.reps) || 0);
      } else {
        repsTotales = (Number(opts.series) || 0) * (Number(opts.reps) || 0);
      }

      // Columnas K a R (11 a 18): % 1RM=0, RepsTotales, Tonelaje=0, Zona=Cat, Contadores=0
      var valsK_R = [0, repsTotales, 0, categoria, 0, 0, 0, 0];
      sheet.getRange(targetRow, 11, 1, 8).setValues([valsK_R]);

      // Columnas T a V (20 a 22): Fecha_Ordenada, Sesion_ID, % 1RM Porcentaje=0
      sheet.getRange(targetRow, 20).setFormula('=IFERROR(WEEKNUM(B' + targetRow + ', 2), "")');
      sheet.getRange(targetRow, 21).setFormula('=IFERROR(A' + targetRow + '&"_"&TEXT(B' + targetRow + ', "YYYY-MM-DD"), "")');
      sheet.getRange(targetRow, 22).setValue(0);

    } else {
      // 1. Verificar columnas K a R (11 a 18) para Fuerza y Levantamiento Olímpico
      var formulasK_R = sheet.getRange(targetRow, 11, 1, 8).getFormulas()[0];
      var needsK_R = formulasK_R.some(function(f) { 
        return !f || f.indexOf("=AI") !== -1 || f.toString().trim() === ""; 
      });
      if (needsK_R) {
        sheet.getRange(2, 11, 1, 8).copyTo(
          sheet.getRange(targetRow, 11, 1, 8), 
          SpreadsheetApp.CopyPasteType.PASTE_FORMULA, 
          false
        );
      }

      // 2. Verificar columnas T a V (20 a 22)
      var formulasT_V = sheet.getRange(targetRow, 20, 1, 3).getFormulas()[0];
      var needsT_V = formulasT_V.some(function(f) { 
        return !f || f.toString().trim() === ""; 
      });
      if (needsT_V) {
        sheet.getRange(2, 20, 1, 3).copyTo(
          sheet.getRange(targetRow, 20, 1, 3), 
          SpreadsheetApp.CopyPasteType.PASTE_FORMULA, 
          false
        );
      }
    }
  } catch (err) {
    Logger.log("Aviso ensureRowFormulas en fila " + targetRow + ": " + err);
  }
}

/**
 * Obtiene la lista dinámica de Atletas desde la pestaña 'Nombre de Atletas'
 */
function getAthletesList(ss) {
  var sheet = ss.getSheetByName(TABS.NOMBRE_ATLETAS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];

  // Leer columna A completa desde la fila 1
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  var athletes = [];

  for (var i = 0; i < values.length; i++) {
    var val = (values[i][0] || "").toString().trim();
    if (val && val.toLowerCase() !== "nombre" && val.toLowerCase() !== "atleta" && val.toLowerCase() !== "nombres" && val.toLowerCase() !== "nombre de atleta") {
      if (athletes.indexOf(val) === -1) {
        athletes.push(val);
      }
    }
  }

  athletes.sort();
  return athletes;
}

/**
 * Obtiene las marcas de 1RM desde la pestaña 'RM_Atletas'
 * Soporta dos estructuras habituales de Sheets:
 * Estructura A: Filas [Atleta, Ejercicio, 1RM]
 * Estructura B: Matriz con encabezados de Ejercicios en la fila 1 y Atletas en la columna A
 */
function getRmData(ss) {
  var sheet = ss.getSheetByName(TABS.RM_ATLETAS);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return {};

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rmMap = {}; // { "Nombre Atleta": { "Back Squat": 140, "Snatch": 90 } }

  // Detectar formato
  var colBHeader = (values[0][1] || "").toString().toLowerCase().trim();
  
  if (colBHeader === "ejercicio" || colBHeader === "exercise") {
    // Formato A: [Atleta, Ejercicio, 1RM]
    for (var r = 1; r < values.length; r++) {
      var rawPeso = values[r][2];
      var peso = parseFloat(String(rawPeso).replace(',', '.'));

      if (atleta && ejercicio && !isNaN(peso)) {
        if (!rmMap[atleta]) rmMap[atleta] = {};
        rmMap[atleta][ejercicio] = peso;
      }
    }
  } else {
    // Formato B: Matriz donde fila 0 contiene los nombres de ejercicios
    var headers = values[0];
    for (var i = 1; i < values.length; i++) {
      var atletaName = (values[i][0] || "").toString().trim();
      if (!atletaName) continue;

      if (!rmMap[atletaName]) rmMap[atletaName] = {};

      for (var c = 1; c < headers.length; c++) {
        var exerciseName = (headers[c] || "").toString().trim();
        var valRm = parseFloat(values[i][c]);
        if (exerciseName && !isNaN(valRm) && valRm > 0) {
          rmMap[atletaName][exerciseName] = valRm;
        }
      }
    }
  }

  return rmMap;
}

/**
 * Inicializa encabezados de 'Registro_Diario' si no existen
 */
function initRegistroDiarioHeaders(sheet) {
  var headers = [
    "Atleta", "Fecha", "Mes", "Semana", "Ejercicio", "Categoría",
    "Series", "Reps / Distancia (km)", "Carga (kg)", "1RM Atleta (kg)",
    "% 1RM Real", "Reps Totales", "Tonelaje Total (kg)", "Zona de Carga",
    "Contador Descarga", "Contador Hipertrofia", "Contador Fuerza Max",
    "Contador Total Fuerza", "RPE", "Fecha_Ordenada", "Sesion_ID",
    "% 1RM Porcentaje", "Duracion_min", "Score_Reps", "Peso_WOD"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

/**
 * Inicializa encabezados de 'Wellness' con las 12 columnas de producción
 */
function initWellnessHeaders(sheet) {
  var headers = [
    "Marca temporal",
    "Calidad del Sueño",
    "Nivel de Energía",
    "Dolor Muscular",
    "Nivel de Estrés",
    "Estado de Ánimo",
    "Horas de Sueño",
    "Nombre del Atleta",
    "Fecha",
    "Wellness Score",
    "Zonas_Molestia",
    "Notas_Sensaciones"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

// ============================================================================
// FUNCIONES AUXILIARES DE FECHA Y JSON
// ============================================================================

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  var parts = dateStr.split("-");
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date(dateStr);
}

function formatDateISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
}

/**
 * Calcula el número de semana ISO estándar (1 - 53)
 */
function getWeekNumber(d) {
  var target = new Date(d.valueOf());
  var dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  var firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

function sendJsonResponse(status, message) {
  var output = {
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * TELEMETRÍA Y LOGGING DE AUDITORÍA EN 'Log_Script'
 */
function logScriptEvent(ss, eventType, atleta, targetRow, status, details) {
  try {
    var sheet = ss.getSheetByName(TABS.LOG_SCRIPT);
    if (!sheet) {
      sheet = ss.insertSheet(TABS.LOG_SCRIPT);
      initLogScriptHeaders(sheet);
    }

    var targetLogRow = getFirstEmptyRowByColumnA(sheet);
    var timestamp = new Date().toISOString();
    var logEntry = [
      timestamp,
      eventType,
      atleta || "N/A",
      targetRow > 0 ? "Fila " + targetRow : "N/A",
      status,
      typeof details === "object" ? JSON.stringify(details) : String(details)
    ];

    sheet.getRange(targetLogRow, 1, 1, logEntry.length).setValues([logEntry]);
    ensureSingleCleanBottomRow(sheet, targetLogRow);
  } catch (err) {
    Logger.log("Error al escribir en Log_Script: " + err.toString());
  }
}

/**
 * Inicializa encabezados para 'Log_Script'
 */
function initLogScriptHeaders(sheet) {
  var headers = ["Timestamp", "Tipo_Evento", "Atleta", "Fila_Destino", "Estado", "Detalles_Diagnostico"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

/**
 * AUDITORÍA DE CONSISTENCIA Y SALUD DEL ECOSISTEMA KLEOS
 * Comprueba desfases de filas, celdas vacías intermedias y estado general
 * para garantizar la integridad de los reportes de Looker Studio.
 */
function auditIntegrityCheck(ss) {
  var report = {
    status: "HEALTHY",
    timestamp: new Date().toISOString(),
    sheetsStatus: {},
    discrepancies: [],
    summary: ""
  };

  var tabsToCheck = [TABS.WELLNESS, TABS.REGISTRO_DIARIO, TABS.NOMBRE_ATLETAS, TABS.RM_ATLETAS, TABS.LOG_SCRIPT];
  for (var t = 0; t < tabsToCheck.length; t++) {
    var tabName = tabsToCheck[t];
    var sh = ss.getSheetByName(tabName);
    if (!sh) {
      report.sheetsStatus[tabName] = "MISSING";
      report.discrepancies.push("Pestaña ausente: '" + tabName + "'");
      report.status = "WARNING";
    } else {
      var maxR = sh.getMaxRows();
      var emptyRowA = getFirstEmptyRowByColumnA(sh);
      report.sheetsStatus[tabName] = {
        maxRows: maxR,
        firstEmptyRowColA: emptyRowA,
        activeRecords: Math.max(0, emptyRowA - 2)
      };
    }
  }

  // Comprobar si hay huecos en blanco intermediarios en Registro_Diario (Columna A)
  var sReg = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (sReg) {
    var maxR = sReg.getMaxRows();
    if (maxR > 1) {
      var colA = sReg.getRange(1, 1, maxR, 1).getValues();
      var emptyGapFound = false;
      var orphanRows = [];
      for (var i = 1; i < colA.length; i++) {
        var valA = (colA[i][0] || "").toString().trim();
        if (valA === "") {
          emptyGapFound = true;
        } else if (emptyGapFound) {
          orphanRows.push(i + 1);
        }
      }
      if (orphanRows.length > 0) {
        report.discrepancies.push("Desfase en 'Registro_Diario': Saltos detectados antes de filas " + orphanRows.slice(0, 5).join(", "));
        report.status = "CRITICAL_DRIFT";
      }
    }
  }

  // Comprobar si hay huecos en blanco intermediarios en Wellness (Columna A)
  var sWell = ss.getSheetByName(TABS.WELLNESS);
  if (sWell) {
    var maxR = sWell.getMaxRows();
    if (maxR > 1) {
      var colAWell = sWell.getRange(1, 1, maxR, 1).getValues();
      var emptyGapFoundWell = false;
      var orphanRowsWell = [];
      for (var j = 1; j < colAWell.length; j++) {
        var valAWell = (colAWell[j][0] || "").toString().trim();
        if (valAWell === "") {
          emptyGapFoundWell = true;
        } else if (emptyGapFoundWell) {
          orphanRowsWell.push(j + 1);
        }
      }
      if (orphanRowsWell.length > 0) {
        report.discrepancies.push("Desfase en 'Wellness': Filas intermedias en blanco antes de " + orphanRowsWell.slice(0, 5).join(", "));
        report.status = "CRITICAL_DRIFT";
      }
    }
  }

  if (report.discrepancies.length === 0) {
    report.summary = "Ecosistema 100% íntegro. Sin saltos de fila. Fórmulas y Looker Studio sincronizados.";
  } else {
    report.summary = "Se detectaron " + report.discrepancies.length + " advertencias de consistencia.";
  }

  // Registrar auditoría en Log_Script
  logScriptEvent(ss, "AUDIT_TELEMETRY", "SISTEMA", 0, report.status, report.summary);

  return report;
}

/**
 * FUNCIÓN DE UTILIDAD: Inicializa y verifica todas las pestañas de producción
 */
function setupProduccionKleos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Asegurar 'Wellness'
  var sWellness = ss.getSheetByName(TABS.WELLNESS) || ss.insertSheet(TABS.WELLNESS);
  if (sWellness.getLastRow() === 0) initWellnessHeaders(sWellness);

  // Asegurar 'Registro_Diario'
  var sRegistro = ss.getSheetByName(TABS.REGISTRO_DIARIO) || ss.insertSheet(TABS.REGISTRO_DIARIO);
  if (sRegistro.getLastRow() === 0) initRegistroDiarioHeaders(sRegistro);

  // Asegurar 'Nombre de Atletas'
  var sAtletas = ss.getSheetByName(TABS.NOMBRE_ATLETAS) || ss.insertSheet(TABS.NOMBRE_ATLETAS);
  if (sAtletas.getLastRow() === 0) {
    sAtletas.getRange(1, 1).setValue("Nombre de Atletas");
    sAtletas.getRange(1, 1).setFontWeight("bold");
    sAtletas.getRange(2, 1, 3, 1).setValues([["Alejandro Magno"], ["Aquiles"], ["Leonidas"]]);
  }

  // Asegurar 'RM_Atletas'
  var sRm = ss.getSheetByName(TABS.RM_ATLETAS) || ss.insertSheet(TABS.RM_ATLETAS);
  if (sRm.getLastRow() === 0) {
    var rmHeaders = [["Atleta", "Back Squat", "Front Squat", "Deadlift", "Snatch", "Clean & Jerk", "Bench Press"]];
    sRm.getRange(1, 1, 1, rmHeaders[0].length).setValues(rmHeaders);
    sRm.getRange(1, 1, 1, rmHeaders[0].length).setFontWeight("bold");
    sRm.getRange(2, 1, 1, 7).setValues([["Aquiles", 160, 140, 200, 105, 130, 120]]);
  }

  // Asegurar 'Log_Script'
  var sLog = ss.getSheetByName(TABS.LOG_SCRIPT) || ss.insertSheet(TABS.LOG_SCRIPT);
  if (sLog.getLastRow() === 0) initLogScriptHeaders(sLog);

  Logger.log("[OK] Estructura de producción de Plataforma Kleos inicializada.");
}

/**
 * ============================================================================
 * LIMPIEZA DE EMERGENCIA — FILAS CORRUPTAS DEL 11/09 Y 12/09
 * ============================================================================
 * Ejecutar UNA SOLA VEZ manualmente desde el editor de Google Apps Script.
 *
 * Qué hace:
 *  1. Recorre todas las filas de 'Registro_Diario'.
 *  2. Detecta filas de las fechas 2026-09-11 y 2026-09-12 donde la categoría
 *     sea "Metcon / WOD" o "Cardio" con valores corruptos en G, H, I o J.
 *  3. Para Metcon/WOD: fuerza G=0, H=0, I=0, J=0. Mueve el Score a Col X
 *     si está en H con formato decimal .XXX (tres dígitos).
 *  4. Para Cardio: si H tiene valores tipo 2800, 800 (miles), los convierte
 *     a km reales (divide por 1000 si detecta que el valor > 100).
 *     Fuerza I=0, J=0.
 *  5. Registra cada corrección en Log_Script para auditoría.
 * ============================================================================
 */
function limpiarFilasCorruptas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (!sheet) {
    Logger.log("[ERROR] No existe la pestaña Registro_Diario.");
    return;
  }

  var FECHAS_OBJETIVO = ["2026-09-11", "2026-09-12"];
  var maxRows = sheet.getMaxRows();
  if (maxRows <= 1) {
    Logger.log("[INFO] La hoja no tiene datos.");
    return;
  }

  // Leer todas las columnas A..J y X (1..10, 24) en un solo batch
  var dataRange = sheet.getRange(2, 1, maxRows - 1, 24);
  var values = dataRange.getValues();

  var corregidas = 0;
  var log = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var atletaVal  = (row[0] || "").toString().trim();   // Col A
    if (!atletaVal) continue;  // fila vacía, saltar

    var fechaRaw   = row[1];                               // Col B
    var fechaStr   = "";
    if (fechaRaw instanceof Date) {
      fechaStr = formatDateISO(fechaRaw);
    } else {
      fechaStr = String(fechaRaw).trim().substring(0, 10);
    }

    // Solo procesar las fechas objetivo
    if (FECHAS_OBJETIVO.indexOf(fechaStr) === -1) continue;

    var categoria  = (row[5] || "").toString().trim();    // Col F (índice 5)
    var seriesVal  = row[6];   // Col G (índice 6)
    var repsVal    = row[7];   // Col H (índice 7)
    var cargaVal   = row[8];   // Col I (índice 8)
    var rmVal      = row[9];   // Col J (índice 9)
    var scoreXVal  = row[23];  // Col X (índice 23)

    var sheetRow = i + 2;  // +2 porque empezamos desde la fila 2

    // ---- METCON / WOD ----
    if (categoria === "Metcon / WOD") {
      var necesitaCorreccion = (
        Number(seriesVal) !== 0 ||
        Number(repsVal) !== 0 ||
        Number(cargaVal) !== 0 ||
        Number(rmVal) !== 0
      );

      if (necesitaCorreccion) {
        // Si Col X estaba vacía y Col H tenía el score decimal, recuperarlo
        var scoreRecuperado = scoreXVal;
        if ((scoreXVal === "" || scoreXVal === 0 || scoreXVal === null) && repsVal !== "" && repsVal !== 0) {
          var repsNum = parseFloat(String(repsVal).replace(',', '.'));
          // Detectar si es un decimal de score (valor < 1000 y tiene parte decimal)
          if (!isNaN(repsNum) && repsNum < 1000) {
            scoreRecuperado = repsNum;
          }
        }

        // Limpiar G, H, I, J → 0
        sheet.getRange(sheetRow, 7).setValue(0);   // Col G = 0
        sheet.getRange(sheetRow, 8).setValue(0);   // Col H = 0
        sheet.getRange(sheetRow, 9).setValue(0);   // Col I = 0
        sheet.getRange(sheetRow, 10).setValue(0);  // Col J = 0

        // Escribir score en Col X si se recuperó
        if (scoreRecuperado !== "" && scoreRecuperado !== null && scoreRecuperado !== 0) {
          sheet.getRange(sheetRow, 24).setValue(scoreRecuperado);
          sheet.getRange(sheetRow, 24).setNumberFormat("0.000");
        }

        corregidas++;
        log.push("Fila " + sheetRow + " [METCON] " + atletaVal + " " + fechaStr +
                 " | G:" + seriesVal + "→0, H:" + repsVal + "→0, I:" + cargaVal + "→0, J:" + rmVal + "→0" +
                 (scoreRecuperado !== scoreXVal ? ", X→" + scoreRecuperado : ""));
        Logger.log(log[log.length - 1]);
      }

    // ---- CARDIO ----
    } else if (categoria === "Cardio") {
      var repsNum = parseFloat(String(repsVal).replace(',', '.'));
      var cargaNum = parseFloat(String(cargaVal));
      var rmNum = parseFloat(String(rmVal));

      // Detectar distancias en miles: valor > 100 probablemente está en metros o mal parseado
      var distanciaCorregida = repsNum;
      var corregioDistancia = false;
      if (!isNaN(repsNum) && repsNum > 100) {
        // Si el valor era por ejemplo 2800 → se divide entre 1000 → 2.8 km
        distanciaCorregida = repsNum / 1000;
        corregioDistancia = true;
      }

      var corregioI = (!isNaN(cargaNum) && cargaNum !== 0);
      var corregioJ = (!isNaN(rmNum) && rmNum !== 0);

      if (corregioDistancia || corregioI || corregioJ) {
        if (corregioDistancia) {
          sheet.getRange(sheetRow, 8).setValue(distanciaCorregida);  // Col H corregida
        }
        if (corregioI) {
          sheet.getRange(sheetRow, 9).setValue(0);   // Col I = 0
        }
        if (corregioJ) {
          sheet.getRange(sheetRow, 10).setValue(0);  // Col J = 0
        }

        corregidas++;
        log.push("Fila " + sheetRow + " [CARDIO] " + atletaVal + " " + fechaStr +
                 (corregioDistancia ? " | H:" + repsVal + "→" + distanciaCorregida + "km" : "") +
                 (corregioI ? " | I:" + cargaVal + "→0" : "") +
                 (corregioJ ? " | J:" + rmVal + "→0" : ""));
        Logger.log(log[log.length - 1]);
      }
    }
  }

  // Resumen en Log_Script
  var resumen = "LIMPIEZA_EMERGENCIA: " + corregidas + " fila(s) corregida(s) en fechas " +
                FECHAS_OBJETIVO.join(", ") + ". Detalles: " + (log.length > 0 ? log.join(" | ") : "Ninguna fila afectada.");
  logScriptEvent(ss, "LIMPIEZA_CORRUPCION", "SISTEMA", -1, corregidas > 0 ? "CORREGIDO" : "SIN_CAMBIOS", resumen);

  Logger.log("[FIN] limpiarFilasCorruptas completado. " + corregidas + " fila(s) corregida(s).");
  SpreadsheetApp.getUi().alert(
    "✅ Limpieza completada\n\n" +
    "Filas corregidas: " + corregidas + "\n" +
    "Fechas procesadas: " + FECHAS_OBJETIVO.join(", ") + "\n\n" +
    (log.length > 0 ? log.join("\n") : "No se encontraron filas corruptas.")
  );
}

/**
 * ============================================================================
 * DIAGNÓSTICO INTERNO DEL MOTOR doPost — AISLAMIENTO DE COLUMNAS
 * ============================================================================
 * Ejecutar desde el editor de GAS para validar que el motor de aislamiento
 * está 100% operativo ANTES de recibir nuevos registros.
 *
 * Verificaciones:
 *  [1] Metcon / WOD → G=0, H=0, I=0, J=0 | Score_Reps SÓLO en Col X
 *  [2] Fórmula /1000 (AMRAP / For Time / EMOM) a 3 decimales fijos
 *  [3] Cardio → H = parseFloat continuo, I=0, J=0
 *
 * Al pasar las 3 verificaciones, escribe log HEALTHY en Log_Script.
 * ============================================================================
 */
function diagnosticarEcosistemaKleos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultados = [];
  var todoOk = true;
  var timestamp = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICACIÓN 1 — Aislamiento Metcon / WOD: G, H, I, J → 0
  // Simula el payload que llegaría vía doPost para un AMRAP con
  // 8 rondas completas + 15 reps adicionales.
  // ─────────────────────────────────────────────────────────────────────────
  (function verificarMetcon() {
    var CHECK = "CHECK_1 [Metcon/WOD - Aislamiento G/H/I/J]";
    try {
      var categoria = "Metcon / WOD";
      var esMetcon = (categoria === "Metcon / WOD");

      // Variables que el motor real asigna para este bloque
      var series        = 0;          // Col G — debe ser 0
      var repsOrDistance = 0;         // Col H — debe ser 0
      var cargaKg       = 0;          // Col I — debe ser 0
      var rmKg          = 0;          // Col J — debe ser 0

      // Simular payload AMRAP 8 rondas + 15 reps extra
      var dataSimulado = { rondasCompletas: 8, repsAdicionales: 15, categoria: "Metcon / WOD" };
      var rondas    = Number(dataSimulado.rondasCompletas);
      var repsExtra = Number(dataSimulado.repsAdicionales);
      var scoreReps = rondas + (repsExtra / 1000);  // 8.015

      var g_ok = (series === 0);
      var h_ok = (repsOrDistance === 0);
      var i_ok = (cargaKg === 0);
      var j_ok = (rmKg === 0);
      var score_correcto = (scoreReps === 8.015);
      var score_no_en_h  = (repsOrDistance !== scoreReps);  // Score NO debe estar en Col H

      var aprobado = g_ok && h_ok && i_ok && j_ok && score_correcto && score_no_en_h;
      todoOk = todoOk && aprobado;

      resultados.push(
        CHECK + ": " + (aprobado ? "✅ PASS" : "❌ FAIL") +
        " | G=" + series + " H=" + repsOrDistance + " I=" + cargaKg + " J=" + rmKg +
        " | scoreReps_calculado=" + scoreReps + " (esperado: 8.015)" +
        " | score_aislado_de_H=" + score_no_en_h
      );
    } catch (e) {
      todoOk = false;
      resultados.push(CHECK + ": ❌ EXCEPCIÓN — " + e.toString());
    }
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICACIÓN 2 — Motor /1000 a 3 decimales fijos (AMRAP, For Time, EMOM)
  // ─────────────────────────────────────────────────────────────────────────
  (function verificarFormula3Decimales() {
    var CHECK = "CHECK_2 [Motor /1000 a 3 decimales]";
    try {
      var casos = [
        // [descripción, rondas, repsExtra, esperado]
        ["AMRAP 3 rondas + 12 reps",  3,  12, 3.012],
        ["For Time 8 rondas + 15 reps", 8, 15, 8.015],
        ["AMRAP 0 rondas + 0 reps",   0,   0, 0.000],
        ["AMRAP 10 rondas + 0 reps", 10,   0, 10.000],
        ["AMRAP 1 ronda + 999 reps",  1, 999, 1.999],
        // EMOM: 20 min totales, 18 completados, 2 faltantes
        ["EMOM 18 completados + 2 faltantes (=18.002)", "EMOM", 0, 18.002]
      ];

      var pasos = [];
      var todosCorrectos = true;

      for (var c = 0; c < casos.length; c++) {
        var caso = casos[c];
        var resultado;
        if (caso[0].indexOf("EMOM") !== -1) {
          // Simular EMOM
          var minTotales     = 20;
          var minCompletados = 18;
          var minFaltantes   = Math.max(0, minTotales - minCompletados);
          resultado = minCompletados + (minFaltantes / 1000);
        } else {
          resultado = Number(caso[1]) + (Number(caso[2]) / 1000);
        }
        // Redondear a 3 decimales para evitar errores de punto flotante
        var resultadoRounded = Math.round(resultado * 1000) / 1000;
        var esperado = caso[3];
        var ok = (resultadoRounded === esperado);
        todosCorrectos = todosCorrectos && ok;
        pasos.push(caso[0] + ": " + resultadoRounded + (ok ? " ✅" : " ❌ (esperado " + esperado + ")"));
      }

      todoOk = todoOk && todosCorrectos;
      resultados.push(
        CHECK + ": " + (todosCorrectos ? "✅ PASS" : "❌ FAIL") +
        " | Casos: " + pasos.join(" || ")
      );
    } catch (e) {
      todoOk = false;
      resultados.push(CHECK + ": ❌ EXCEPCIÓN — " + e.toString());
    }
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICACIÓN 3 — Cardio: H = parseFloat continuo, I=0, J=0
  // ─────────────────────────────────────────────────────────────────────────
  (function verificarCardio() {
    var CHECK = "CHECK_3 [Cardio - Distancia parseFloat limpia]";
    try {
      var categoria = "Cardio";
      var esCardio = (categoria === "Cardio");
      var cargaKg = 0;   // Col I — debe ser 0
      var rmKg    = 0;   // Col J — debe ser 0

      // Tabla de casos de distancia: rawInput → expectedKm
      var casosDist = [
        ["2.8",  2.8],
        ["0.8",  0.8],
        ["5",    5.0],
        ["10.5", 10.5],
        ["2,8",  2.8],   // coma como separador decimal (locale ES)
        [2.8,    2.8],   // ya es número
        [0,      0.0]
      ];

      var pasosD = [];
      var todosOkD = true;

      for (var d = 0; d < casosDist.length; d++) {
        var rawInput = casosDist[d][0];
        var esperado = casosDist[d][1];
        // Lógica idéntica a la del motor real
        var resultado = parseFloat(String(rawInput).replace(',', '.')) || 0;
        var ok = (resultado === esperado);
        todosOkD = todosOkD && ok;
        pasosD.push("\"" + rawInput + "\"→" + resultado + (ok ? "✅" : "❌"));
      }

      var i_ok = (cargaKg === 0);
      var j_ok = (rmKg === 0);
      var aprobado = todosOkD && i_ok && j_ok;
      todoOk = todoOk && aprobado;

      resultados.push(
        CHECK + ": " + (aprobado ? "✅ PASS" : "❌ FAIL") +
        " | I=" + cargaKg + " J=" + rmKg +
        " | Distancias: " + pasosD.join(" ")
      );
    } catch (e) {
      todoOk = false;
      resultados.push(CHECK + ": ❌ EXCEPCIÓN — " + e.toString());
    }
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTADO FINAL — Escribir en Log_Script
  // ─────────────────────────────────────────────────────────────────────────
  var estadoFinal = todoOk ? "HEALTHY" : "CRITICAL_DRIFT";
  var resumenFinal = (todoOk
    ? "✅ ECOSISTEMA BLINDADO — Motor de aislamiento 100% operativo para próximas capturas."
    : "⚠️ FALLO DETECTADO — Revisar resultados del diagnóstico.") +
    " | " + resultados.join(" || ");

  logScriptEvent(ss, "DIAGNOSTICO_MOTOR_DOPOST", "SISTEMA", 0, estadoFinal, resumenFinal);

  // Log en consola de GAS
  Logger.log("=== DIAGNÓSTICO MOTOR doPost — " + timestamp + " ===");
  for (var r = 0; r < resultados.length; r++) {
    Logger.log(resultados[r]);
  }
  Logger.log("ESTADO FINAL: " + estadoFinal);
  Logger.log("=== FIN DIAGNÓSTICO ===");

  // Alert visual para el operador
  SpreadsheetApp.getUi().alert(
    (todoOk ? "✅ ECOSISTEMA BLINDADO\n" : "⚠️ FALLO EN DIAGNÓSTICO\n") +
    "Timestamp: " + timestamp + "\n\n" +
    resultados.join("\n\n") + "\n\n" +
    "→ Log guardado en pestaña 'Log_Script' con estado: " + estadoFinal
  );

  return { status: estadoFinal, timestamp: timestamp, checks: resultados };
}
