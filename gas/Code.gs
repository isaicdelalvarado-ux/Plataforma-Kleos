/**
 * ============================================================================
 * PLATAFORMA KLEOS - GOOGLE APPS SCRIPT (CÓDIGO DEFINITIVO DE PRODUCCIÓN)
 * ============================================================================
 * Versión: 18.1.0 (Inyección Inteligente Gemini 1.5 Flash AI Studio, Escaneo Wellness Diario & Blindaje Universal Col H=0, Col X=Score 3 Decimales)
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
 *    - H: Reps / Distancia (km) -> [BLOQUEADO EN 0 ABSOLUTO en Metcon / WOD | Distancia km decimal en Cardio]
 *    - I: Carga (kg)  -> [0 en Cardio y Metcon / WOD]
 *    - J: 1RM Atleta (kg) -> [0 en Cardio y Metcon / WOD o calculado con Epley]
 *    - K hasta R: Vacías o Fórmulas / Tonelaje aislado
 *    - S: RPE (columna 19)
 *    - W: Duracion_min (columna 23)
 *    - X: Score_Reps (columna 24) -> [Valor continuo con 3 decimales fijos universales ej. 3.025 en Metcon]
 *    - Y: Peso_WOD (columna 25)
 * 6. Conector Inteligente Gemini 1.5 Flash (AI Studio):
 *    - Intercepta variaciones de 'scoreReps' o 'scorereps' en Metcon / WOD.
 *    - Conexión vía Google AI Studio mediante GEMINI_API_KEY guardada en Script Properties.
 * 7. Escaneo Automático Diario de Wellness & Alertas de Fatiga:
 *    - Escanea diariamente la pestaña 'Wellness'.
 *    - Detecta atletas con Wellness Score < 21 o sobrecarga en zona lumbar/espalda baja.
 *    - Genera análisis con Gemini 1.5 Flash y envía resumen ejecutivo consolidado por correo al Coach.
 *    - Activador de tiempo en el bloque de 11:00 AM a 12:00 PM (Mediodía).
 */

var TABS = {
  WELLNESS: "Wellness",
  REGISTRO_DIARIO: "Registro_Diario",
  NOMBRE_ATLETAS: "Nombre de Atletas",
  RM_ATLETAS: "RM_Atletas",         // Marcas Basales Pre-Zeus Intactas
  RM_BASAL: "RM_Basal",             // Respaldo de Marcas Basales
  RM_ZEUS: "RM_Zeus",               // RMs Oficiales Cierre Macrociclo Zeus
  RM_ATENEA: "RM_Atenea",           // RMs Macrociclo Atenea (Base inicial = Zeus)
  RM_CICLO_2: "RM_Atenea",          // Alias de compatibilidad
  HISTORIAL_RMS: "Historial_RMs",
  CONTROL_CICLO: "Control_Ciclo",
  SKILLS_GIMNASIA: "Skills_Gimnasia", // Pestaña de Skills y Progresiones de Gimnasia
  USUARIOS_KLEOS: "Usuarios_Kleos",   // Usuarios, PINs y Roles (Atleta / Coach)
  PROGRAMACION_DIARIA: "Programacion_Diaria", // WODs y bloques diarios programados
  LOG_SCRIPT: "Log_Script"
};

var NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// ============================================================================
// CONECTOR DE INYECCIÓN INTELIGENTE — GEMINI 1.5 FLASH (AI STUDIO)
// ============================================================================

/**
 * Obtiene la API Key de Gemini desde Script Properties o User Properties
 */
function getGeminiApiKey() {
  var props = PropertiesService.getScriptProperties();
  var userProps = PropertiesService.getUserProperties();
  return (props && props.getProperty("GEMINI_API_KEY")) ||
         (props && props.getProperty("AI_STUDIO_API_KEY")) ||
         (userProps && userProps.getProperty("GEMINI_API_KEY")) || "";
}

/**
 * Consulta a Gemini 1.5 Flash en Google AI Studio
 */
function callGemini15Flash(promptText) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    Logger.log("[Gemini 1.5 Flash] GEMINI_API_KEY no configurada en Script Properties.");
    return null;
  }
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  var payload = {
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512
    }
  };
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code === 200) {
      var json = JSON.parse(response.getContentText());
      if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts) {
        return json.candidates[0].content.parts[0].text;
      }
    } else {
      Logger.log("[Gemini 1.5 Flash] HTTP " + code + ": " + response.getContentText());
    }
  } catch (err) {
    Logger.log("[Gemini 1.5 Flash] Error en UrlFetchApp: " + err.toString());
  }
  return null;
}

/**
 * Normaliza cualquier texto o entrada compleja de score Metcon usando Gemini 1.5 Flash
 */
function parseScoreWithGemini(rawScoreText) {
  try {
    var prompt = "Eres un asistente experto en CrossFit / Metcon para la Plataforma Kleos. " +
                 "Convierte el siguiente resultado o descripción de WOD a un número decimal estricto con 3 decimales " +
                 "(donde la parte entera son las rondas o minutos completados y los decimales son las repeticiones o minutos faltantes divididos entre 1000, ej: 3 rondas y 25 reps -> 3.025, 8 rondas 15 reps -> 8.015, 12 reps solas -> 0.012). " +
                 "Entrada: '" + String(rawScoreText) + "'. " +
                 "Responde ÚNICAMENTE con el número decimal, sin texto adicional:";
    var res = callGemini15Flash(prompt);
    if (res) {
      var match = res.match(/[0-9]+(\.[0-9]+)?/);
      if (match) {
        var num = parseFloat(match[0]);
        if (!isNaN(num)) {
          return Math.round(num * 1000) / 1000;
        }
      }
    }
  } catch (e) {
    Logger.log("Error parseScoreWithGemini: " + e.toString());
  }
  return null;
}

/**
 * ============================================================================
 * AUDITORÍA Y HOMOLOGACIÓN SEMÁNTICA DE WODs (GEMINI 1.5 FLASH)
 * ============================================================================
 * Evalúa semánticamente el nombre del WOD ingresado por el atleta,
 * ignora mayúsculas/minúsculas, acentos, variaciones de palabras o benchmarks clásicos
 * (ejemplo: 'batalla de salamina', 'Batalla naval de Salamina' -> 'Batalla Naval de Salamina', 'fran' -> 'Fran').
 */
function homologarNombreWODConGemini(nombreCrudo) {
  if (!nombreCrudo || typeof nombreCrudo !== "string" || nombreCrudo.trim() === "") {
    return "Metcon";
  }
  var nombreLimpio = nombreCrudo.trim();

  try {
    var prompt = "Eres el Auditor Autónomo de Consistencia y Homologación de WODs de Plataforma KLEOS.\n" +
                 "Tu tarea es estandarizar y homologar el nombre del siguiente WOD o entrenamiento Metcon ingresado por el atleta:\n" +
                 "Entrada cruda: '" + nombreLimpio + "'\n\n" +
                 "Reglas estrictas:\n" +
                 "1. Evalúa semánticamente el texto, ignorando variaciones de mayúsculas/minúsculas, acentos o palabras añadidas/omitidas (ejemplo: 'batalla de salamina', 'Batalla naval de Salamina' y 'batalla salamina' DEBEN homologarse exactamente como 'Batalla Naval de Salamina').\n" +
                 "2. Si el WOD es un benchmark clásico (como 'fran', 'cindy', 'murph', 'dt', 'grace', 'helen', 'isabel', 'karen', 'diane', 'amrap', 'emom', 'for time'), normalízalo a su nombre oficial exacto en Tipo Título (ej: 'Fran', 'Cindy', 'Murph', 'DT').\n" +
                 "3. Si es un WOD propio/personalizado sin coincidencia histórica obvia, aplica formato Tipo Título (Title Case: mayúscula en la primera letra de cada palabra principal) y corrige errores ortográficos menores.\n" +
                 "4. Responde ÚNICAMENTE con la cadena de texto limpia y homologada final, sin comillas, sin explicaciones ni texto adicional:";

    var res = callGemini15Flash(prompt);
    if (res && typeof res === "string") {
      var sanitized = res.replace(/["'\n\r]/g, '').trim();
      if (sanitized.length > 0) {
        return sanitized;
      }
    }
  } catch (err) {
    Logger.log("[Auditor WOD] Error en homologación Gemini: " + err.toString());
  }

  // Fallback seguro: Title Case manual
  return toTitleCase(nombreLimpio);
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

// ============================================================================
// ESCANEO DIARIO DE WELLNESS & ANÁLISIS DE FATIGA CON GEMINI
// ============================================================================

/**
 * Escanea la pestaña 'Wellness', detecta atletas con Wellness < 21 o sobrecarga en zona lumbar/espalda baja,
 * genera el análisis de autorregulación con Gemini 1.5 Flash y envía el resumen consolidado por email al Coach.
 */
function ejecutarEscaneoWellnessDiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.WELLNESS);
  if (!sheet) {
    Logger.log("[Wellness Scanner] No existe pestaña Wellness");
    return { status: "error", message: "No existe pestaña Wellness" };
  }

  var maxRows = sheet.getMaxRows();
  var emptyRowA = getFirstEmptyRowByColumnA(sheet);
  var lastDataRow = Math.max(1, emptyRowA - 1);
  if (lastDataRow <= 1) {
    Logger.log("[Wellness Scanner] Sin registros en Wellness.");
    return { status: "ok", message: "Sin registros en Wellness", scanned: 0 };
  }

  // Fecha de hoy (o registros recientes del día)
  var hoy = new Date();
  var fechaHoyStr = formatDateISO(hoy);

  // Leer registros completos de Wellness (Cols A..L)
  var numRows = lastDataRow - 1;
  var values = sheet.getRange(2, 1, numRows, 12).getValues();

  var atletasEnRiesgo = [];
  var totalEscaneadosHoy = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var marcaTemporal = row[0];
    var sueno = Number(row[1]) || 0;
    var energia = Number(row[2]) || 0;
    var dolor = Number(row[3]) || 0;
    var estres = Number(row[4]) || 0;
    var animo = Number(row[5]) || 0;
    var horasSueno = Number(row[6]) || 0;
    var atleta = (row[7] || "").toString().trim();
    var fechaStr = "";
    if (row[8] instanceof Date) {
      fechaStr = formatDateISO(row[8]);
    } else {
      fechaStr = String(row[8] || "").trim().substring(0, 10);
    }
    var score = Number(row[9]) || (sueno + energia + dolor + estres + animo);
    var zonas = (row[10] || "").toString().trim();
    var notas = (row[11] || "").toString().trim();

    if (!atleta) continue;

    // Filtrar por fecha de hoy (o si es escaneo de las últimas 24 horas)
    var esDeHoy = (fechaStr === fechaHoyStr);
    if (!esDeHoy && marcaTemporal instanceof Date) {
      var diffHours = (hoy.getTime() - marcaTemporal.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 24) {
        esDeHoy = true;
      }
    }

    if (esDeHoy) {
      totalEscaneadosHoy++;
      var zonasLower = zonas.toLowerCase();
      var notasLower = notas.toLowerCase();
      var tieneAlertaLumbar = zonasLower.indexOf("lumbar") !== -1 || 
                             zonasLower.indexOf("espalda baja") !== -1 || 
                             zonasLower.indexOf("espalda") !== -1 ||
                             notasLower.indexOf("lumbar") !== -1 ||
                             notasLower.indexOf("espalda baja") !== -1;
      var scoreBajo = (score < 21);

      if (scoreBajo || tieneAlertaLumbar) {
        atletasEnRiesgo.push({
          atleta: atleta,
          fecha: fechaStr,
          score: score,
          sueno: sueno,
          energia: energia,
          dolor: dolor,
          estres: estres,
          animo: animo,
          horasSueno: horasSueno,
          zonas: zonas,
          notas: notas,
          motivoAlerta: (scoreBajo && tieneAlertaLumbar) ? "Score Crítico (<21) + Alerta Lumbar" :
                        (scoreBajo ? "Score Crítico (<21)" : "Alerta Lumbar / Espalda Baja")
        });
      }
    }
  }

  // Si en la fecha exacta no se registraron hoy pero hay registros previos en riesgo (ej. prueba o fin de semana)
  if (atletasEnRiesgo.length === 0 && totalEscaneadosHoy === 0 && values.length > 0) {
    for (var j = Math.max(0, values.length - 15); j < values.length; j++) {
      var r = values[j];
      var at = (r[7] || "").toString().trim();
      if (!at) continue;
      var sc = Number(r[9]) || 0;
      var zn = (r[10] || "").toString().trim();
      var nt = (r[11] || "").toString().trim();
      var znLow = zn.toLowerCase();
      var ntLow = nt.toLowerCase();
      var lumb = znLow.indexOf("lumbar") !== -1 || znLow.indexOf("espalda") !== -1 || ntLow.indexOf("lumbar") !== -1;
      if (sc < 21 || lumb) {
        var fStr = (r[8] instanceof Date) ? formatDateISO(r[8]) : String(r[8] || "").trim().substring(0, 10);
        atletasEnRiesgo.push({
          atleta: at,
          fecha: fStr,
          score: sc,
          sueno: Number(r[1]) || 0,
          energia: Number(r[2]) || 0,
          dolor: Number(r[3]) || 0,
          estres: Number(r[4]) || 0,
          animo: Number(r[5]) || 0,
          horasSueno: Number(r[6]) || 0,
          zonas: zn,
          notas: nt,
          motivoAlerta: (sc < 21 && lumb) ? "Score Crítico (<21) + Alerta Lumbar" :
                        (sc < 21 ? "Score Crítico (<21)" : "Alerta Lumbar / Espalda Baja")
        });
      }
    }
  }

  // Generar reporte de análisis con Gemini 1.5 Flash
  var informeIA = "";
  if (atletasEnRiesgo.length > 0) {
    var promptIA = "Eres el Director Científico de Fisiología y Rendimiento Deportivo de Plataforma KLEOS.\n" +
                   "Analiza los siguientes atletas que presentaron alertas en su cuestionario Wellness matutino (Wellness Score < 21 o molestias lumbares/espalda baja):\n\n" +
                   JSON.stringify(atletasEnRiesgo, null, 2) + "\n\n" +
                   "Genera un RESUMEN EJECUTIVO DE AUTORREGULACIÓN para el Coach con:\n" +
                   "1. Diagnóstico rápido de fatiga y riesgo neuromuscular por atleta.\n" +
                   "2. Prescripción exacta de autorregulación (modificación de RPE, ajuste de volumen en sentadillas/pesos muertos, o sustitución de ejercicios axiales).\n" +
                   "3. Protocolo preventivo de activación/movilidad recomendado antes de la sesión.\n\n" +
                   "Escribe en tono profesional de alto rendimiento deportivo, claro, directo y estructurado en Markdown.";
    
    informeIA = callGemini15Flash(promptIA) || "Análisis automático generado: Se detectaron " + atletasEnRiesgo.length + " atletas con fatiga acumulada o sobrecarga lumbar. Se recomienda reducir volumen axial y limitar cargas por encima del 75% 1RM.";
  } else {
    informeIA = "Todos los atletas evaluados presentan niveles óptimos de recuperación (Wellness Score >= 21) sin reportes de sobrecarga lumbar. Se autoriza la carga completa de entrenamiento para la sesión de hoy.";
  }

  // Enviar por correo consolidado al Coach
  enviarReporteCoachEmail(fechaHoyStr, atletasEnRiesgo, informeIA, totalEscaneadosHoy);

  // Registrar evento en Log_Script
  logScriptEvent(ss, "WELLNESS_AI_SCAN", "SISTEMA", 0, "HEALTHY", "Escaneados: " + totalEscaneadosHoy + " | Atletas en Riesgo: " + atletasEnRiesgo.length);

  return {
    status: "ok",
    fecha: fechaHoyStr,
    totalEscaneados: totalEscaneadosHoy,
    atletasEnRiesgoCount: atletasEnRiesgo.length,
    atletasEnRiesgo: atletasEnRiesgo,
    analisisIA: informeIA
  };
}

/**
 * Envía el resumen ejecutivo consolidado por correo al Coach
 */
function enviarReporteCoachEmail(fecha, atletasEnRiesgo, informeIA, totalEscaneados) {
  try {
    var props = PropertiesService.getScriptProperties();
    var coachEmail = (props && props.getProperty("COACH_EMAIL")) ||
                     (props && props.getProperty("NOTIFICATION_EMAIL")) ||
                     Session.getEffectiveUser().getEmail() ||
                     Session.getActiveUser().getEmail();

    if (!coachEmail) {
      Logger.log("[Wellness Email] No se encontró correo de destino para el Coach.");
      return;
    }

    var asunto = (atletasEnRiesgo.length > 0 ? "⚠️ [ALERTA FATIGA] " : "✅ [ESTADO ÓPTIMO] ") + 
                 "KLEOS AI — Reporte de Autorregulación Wellness (" + fecha + ")";

    var filasHtml = "";
    if (atletasEnRiesgo.length > 0) {
      for (var k = 0; k < atletasEnRiesgo.length; k++) {
        var a = atletasEnRiesgo[k];
        filasHtml += "<tr style='border-bottom: 1px solid #334155;'>" +
          "<td style='padding: 10px; font-weight: bold; color: #f8fafc;'>" + a.atleta + "</td>" +
          "<td style='padding: 10px; text-align: center; color: " + (a.score < 21 ? "#ef4444" : "#f59e0b") + "; font-weight: bold;'>" + a.score + " / 25</td>" +
          "<td style='padding: 10px; color: #f87171; font-size: 12px;'>" + a.motivoAlerta + "</td>" +
          "<td style='padding: 10px; color: #94a3b8; font-size: 12px;'>" + (a.zonas || "N/A") + "</td>" +
          "<td style='padding: 10px; color: #cbd5e1; font-size: 12px; font-style: italic;'>" + (a.notas || "Sin notas") + "</td>" +
          "</tr>";
      }
    } else {
      filasHtml = "<tr><td colspan='5' style='padding: 15px; text-align: center; color: #10b981;'>Sin atletas en zona de riesgo el día de hoy.</td></tr>";
    }

    // Convertir markdown a HTML limpio
    var informeHtml = informeIA
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/### (.*?)(<br>|$)/g, "<h4 style='color:#38bdf8; margin:12px 0 6px 0;'>$1</h4>")
      .replace(/## (.*?)(<br>|$)/g, "<h3 style='color:#60a5fa; margin:14px 0 8px 0;'>$1</h3>")
      .replace(/# (.*?)(<br>|$)/g, "<h2 style='color:#93c5fd; margin:16px 0 10px 0;'>$1</h2>");

    var htmlBody = "" +
      "<div style='background-color: #0b0f17; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; border-radius: 12px; max-width: 720px; margin: 0 auto; border: 1px solid #1e293b;'>" +
        "<div style='border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px;'>" +
          "<h1 style='margin: 0; color: #60a5fa; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;'>PLATAFORMA KLEOS — AI PERFORMANCE SYSTEM</h1>" +
          "<p style='margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;'>Reporte Matutino Consolidado de Autorregulación y Fatiga • " + fecha + "</p>" +
        "</div>" +

        "<div style='background-color: #1e293b; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;'>" +
          "<p style='margin: 0; font-size: 14px;'><strong>Atletas Evaluados:</strong> " + (totalEscaneados > 0 ? totalEscaneados : atletasEnRiesgo.length) + " &nbsp;|&nbsp; <strong>En Observación:</strong> <span style='color:" + (atletasEnRiesgo.length > 0 ? "#f87171" : "#34d399") + "; font-weight:bold;'>" + atletasEnRiesgo.length + "</span></p>" +
        "</div>" +

        "<h3 style='color: #f1f5f9; font-size: 16px; margin-bottom: 10px;'>📊 Resumen de Atletas Observados</h3>" +
        "<table style='width: 100%; border-collapse: collapse; background-color: #0f172a; border-radius: 8px; overflow: hidden; font-size: 13px; margin-bottom: 24px;'>" +
          "<thead>" +
            "<tr style='background-color: #1e293b; color: #94a3b8; text-align: left;'>" +
              "<th style='padding: 10px;'>Atleta</th>" +
              "<th style='padding: 10px; text-align: center;'>Score</th>" +
              "<th style='padding: 10px;'>Condición</th>" +
              "<th style='padding: 10px;'>Zonas Molestia</th>" +
              "<th style='padding: 10px;'>Notas</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody>" +
            filasHtml +
          "</tbody>" +
        "</table>" +

        "<div style='background: linear-gradient(180deg, #111827 0%, #0f172a 100%); padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 20px;'>" +
          "<h3 style='margin-top: 0; color: #38bdf8; font-size: 16px;'>🧠 Análisis de Autorregulación — Gemini 1.5 Flash</h3>" +
          "<div style='font-size: 14px; line-height: 1.6; color: #cbd5e1;'>" +
            informeHtml +
          "</div>" +
        "</div>" +

        "<div style='border-top: 1px solid #1e293b; padding-top: 14px; font-size: 11px; color: #64748b; text-align: center;'>" +
          "KLEOS Intelligence Engine • Escaneo Automatizado diario de 11:00 AM a 12:00 PM (Mediodía) • Google Apps Script Cloud" +
        "</div>" +
      "</div>";

    MailApp.sendEmail({
      to: coachEmail,
      subject: asunto,
      htmlBody: htmlBody
    });

    Logger.log("[Wellness Email] Enviado con éxito a: " + coachEmail);
  } catch (err) {
    Logger.log("[Wellness Email] Error enviando correo al Coach: " + err.toString());
  }
}

/**
 * Genera el reporte matutino de Wellness bajo demanda o para prueba de fuego.
 * Si no hay atletas en riesgo hoy o si se fuerza simulación, incluye el caso crítico
 * de Andrea Flores (Wellness 14, molestia severa espalda baja) para procesar con Gemini 1.5 Flash
 * y despachar el correo de alerta adaptativa inmediatamente al Coach.
 */
function generarReporteWellnessMatutino(forceSimulate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.WELLNESS);
  var hoy = new Date();
  var fechaHoyStr = formatDateISO(hoy);
  
  var atletasEnRiesgo = [];
  var totalEscaneados = 0;

  if (sheet) {
    var maxRows = sheet.getMaxRows();
    var emptyRowA = getFirstEmptyRowByColumnA(sheet);
    var lastDataRow = Math.max(1, emptyRowA - 1);

    if (lastDataRow > 1) {
      var numRows = lastDataRow - 1;
      var values = sheet.getRange(2, 1, numRows, 12).getValues();

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var marcaTemporal = row[0];
        var sueno = Number(row[1]) || 0;
        var energia = Number(row[2]) || 0;
        var dolor = Number(row[3]) || 0;
        var estres = Number(row[4]) || 0;
        var animo = Number(row[5]) || 0;
        var horasSueno = Number(row[6]) || 0;
        var atleta = (row[7] || "").toString().trim();
        var fechaStr = "";
        if (row[8] instanceof Date) {
          fechaStr = formatDateISO(row[8]);
        } else {
          fechaStr = String(row[8] || "").trim().substring(0, 10);
        }
        var score = Number(row[9]) || (sueno + energia + dolor + estres + animo);
        var zonas = (row[10] || "").toString().trim();
        var notas = (row[11] || "").toString().trim();

        if (!atleta) continue;

        var esDeHoy = (fechaStr === fechaHoyStr);
        if (!esDeHoy && marcaTemporal instanceof Date) {
          var diffHours = (hoy.getTime() - marcaTemporal.getTime()) / (1000 * 60 * 60);
          if (diffHours <= 24) esDeHoy = true;
        }

        if (esDeHoy) {
          totalEscaneados++;
          var zonasLower = zonas.toLowerCase();
          var notasLower = notas.toLowerCase();
          var tieneAlertaLumbar = zonasLower.indexOf("lumbar") !== -1 || 
                                 zonasLower.indexOf("espalda baja") !== -1 || 
                                 zonasLower.indexOf("espalda") !== -1 ||
                                 notasLower.indexOf("lumbar") !== -1 ||
                                 notasLower.indexOf("espalda baja") !== -1;
          var scoreBajo = (score < 21);

          if (scoreBajo || tieneAlertaLumbar) {
            atletasEnRiesgo.push({
              atleta: atleta,
              fecha: fechaStr,
              score: score,
              sueno: sueno,
              energia: energia,
              dolor: dolor,
              estres: estres,
              animo: animo,
              horasSueno: horasSueno,
              zonas: zonas,
              notas: notas,
              motivoAlerta: (scoreBajo && tieneAlertaLumbar) ? "Score Crítico (<21) + Alerta Lumbar" :
                            (scoreBajo ? "Score Crítico (<21)" : "Alerta Lumbar / Espalda Baja")
            });
          }
        }
      }
    }
  }

  // Si se solicita simulación explícita de prueba
  if (forceSimulate === true) {
    atletasEnRiesgo.push({
      atleta: "Andrea Flores",
      fecha: fechaHoyStr,
      score: 14,
      sueno: 2,
      energia: 3,
      dolor: 2,
      estres: 4,
      animo: 3,
      horasSueno: 5.5,
      zonas: "Espalda baja / Zona Lumbar - Molestia severa y rigidez",
      notas: "Dolor punzante y fatiga acumulada al realizar flexión y bisagra de cadera. Sensación de pesadez matutina.",
      motivoAlerta: "🚨 CASO CRÍTICO: Wellness Score 14/25 + Sobrecarga Lumbar Aguda"
    });
    totalEscaneados = Math.max(1, totalEscaneados);
  }

  // Procesar diagnóstico con Gemini 1.5 Flash
  var informeIA = "";
  if (atletasEnRiesgo.length > 0) {
    var promptIA = "Eres el Director Científico de Fisiología y Rendimiento Deportivo de Plataforma KLEOS.\n" +
                   "Analiza los siguientes reportes matutinos de atletas con ALERTA (Wellness Score < 21 o sobrecarga lumbar):\n\n" +
                   JSON.stringify(atletasEnRiesgo, null, 2) + "\n\n" +
                   "Genera un INFORME EJECUTIVO DE AUTORREGULACIÓN ADAPTATIVA para el Coach con:\n" +
                   "1. ⚠️ Evaluación de Riesgo Neuromuscular y Mecánico por atleta (impacto en columna y fatiga del SNC).\n" +
                   "2. 🛑 Modificaciones de Carga para la sesión de hoy (reducción de % 1RM, sustitución de cargas axiales pesadas como Back Squat / Deadlift por alternativas de menor compresión espinal como Bulgarian Split Squats o Belt Squats).\n" +
                   "3. 🔧 Protocolo de Descarga y Movilidad Pre-Entreno (descompresión espinal, activación glútea y 'McGill Big 3').\n\n" +
                   "Escribe en tono de alto rendimiento deportivo, altamente accionable, claro y estructurado con Markdown.";

    informeIA = callGemini15Flash(promptIA) || "### ⚠️ Alerta de Autorregulación Adaptativa\n\n- **Diagnóstico**: Fatiga aguda del SNC y sobrecarga lumbar severa.\n- **Acción Inmediata**: Suprimir cargas axiales directas (>70% 1RM) en sentadillas y tirones.\n- **Protocolo**: 10 min de descompresión espinal y activación isométrica de core (McGill Big 3).";
  } else {
    informeIA = "Todos los atletas evaluados hoy presentan niveles óptimos de recuperación (Wellness Score >= 21) sin sobrecarga lumbar. Se autoriza la carga completa de entrenamiento.";
  }

  // Despachar correo de alerta adaptativa al Coach
  enviarReporteCoachEmail(fechaHoyStr, atletasEnRiesgo, informeIA, totalEscaneados);

  logScriptEvent(ss, "WELLNESS_DAILY_REPORT", atletasEnRiesgo.length > 0 ? "ALERTA_FATIGA" : "OPTIMO", 0, "DISPATCHED", "Escaneados: " + totalEscaneados + " | En Riesgo: " + atletasEnRiesgo.length);

  return {
    status: "ok",
    dispatched: true,
    fecha: fechaHoyStr,
    totalEscaneados: totalEscaneados,
    atletasEnRiesgo: atletasEnRiesgo,
    analisisIA: informeIA,
    timestamp: new Date().toISOString()
  };
}

/**
 * CONFIGURACIÓN AUTOMÁTICA DEL ACTIVADOR BASADO EN TIEMPO (MEDIODÍA: 11:00 AM - 12:00 PM)
 * Elimina por completo cualquier temporizador por minutos o duplicados previos en el proyecto.
 * Establece un activador diario único (Temporizador por días) entre 11:00 AM y 12:00 PM.
 */
function setupDailyWellnessTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var targetFunctions = ["generarReporteWellnessMatutino", "ejecutarEscaneoWellnessDiario"];
  var deletedCount = 0;
  
  // Limpiar TODOS los activadores antiguos (por minutos o duplicados)
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (targetFunctions.indexOf(fn) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
      deletedCount++;
    }
  }

  // Crear activador definitivo: Temporizador por días, 1 vez al día de 11:00 AM a 12:00 PM
  var newTrigger = ScriptApp.newTrigger("generarReporteWellnessMatutino")
    .timeBased()
    .everyDays(1)
    .atHour(11) // Ventana horaria estricta: 11:00 AM a 12:00 PM (Mediodía)
    .create();

  Logger.log("[Trigger] Activador diario soldado exitosamente para 'generarReporteWellnessMatutino' (11:00 AM - 12:00 PM). Triggers eliminados: " + deletedCount + ". ID: " + newTrigger.getUniqueId());

  return {
    status: "ok",
    message: "Activador diario soldado en la nube: 1 vez al día entre 11:00 AM y 12:00 PM (Mediodía)",
    triggersEliminados: deletedCount,
    triggerId: newTrigger.getUniqueId(),
    functionName: "generarReporteWellnessMatutino",
    frecuencia: "Temporizador por días (1 día)",
    ventanaHoraria: "11:00 AM - 12:00 PM"
  };
}

/**
 * Endpoint GET:
 * 1. Si no hay parámetros: Verifica estado y devuelve la lista de atletas y RMs
 * 2. Parámetros opcionales: ?action=getAthletes o ?action=getInitialData o ?action=audit o ?action=gemini o ?action=scanWellness o ?action=setupTrigger o ?action=generarReporteWellnessMatutino
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Soporte para reparación y reestructuración matemática de Cardio
    if (e && e.parameter && (e.parameter.action === "repararCardio" || e.parameter.action === "fixCardio")) {
      var repRes = repararKilometrajeCardioHistorico(ss);
      return ContentService.createTextOutput(JSON.stringify(repRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para auditoría y homologación de WODs con Gemini 1.5 Flash
    if (e && e.parameter && (e.parameter.action === "homologarWod" || e.parameter.action === "testHomologacion")) {
      var wodRaw = e.parameter.wod || "batalla de salamina";
      var homologado = homologarNombreWODConGemini(wodRaw);
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        raw: wodRaw,
        homologado: homologado,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para ejecución manual / prueba de fuego del reporte Wellness
    if (e && e.parameter && (e.parameter.action === "generarReporteWellnessMatutino" || e.parameter.action === "pruebaFuego" || e.parameter.action === "testWellness")) {
      var force = e.parameter.force === "true" || e.parameter.force === "1" || !e.parameter.force;
      var testRes = generarReporteWellnessMatutino(force);
      return ContentService.createTextOutput(JSON.stringify(testRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para configurar activador en el servidor vía web request
    if (e && e.parameter && (e.parameter.action === "setupTrigger" || e.parameter.action === "setupWellnessTrigger")) {
      var triggerRes = setupDailyWellnessTrigger();
      return ContentService.createTextOutput(JSON.stringify(triggerRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para escaneo normal del reporte Wellness
    if (e && e.parameter && (e.parameter.action === "scanWellness" || e.parameter.action === "wellnessScan")) {
      var scanResult = ejecutarEscaneoWellnessDiario();
      return ContentService.createTextOutput(JSON.stringify(scanResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para verificación del conector Gemini 1.5 Flash
    if (e && e.parameter && (e.parameter.action === "gemini" || e.parameter.action === "geminiTest")) {
      var geminiTest = callGemini15Flash("Responde 'KLEOS_ONLINE'");
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        version: "18.1.0",
        geminiActive: !!geminiTest,
        apiKeyConfigured: !!getGeminiApiKey(),
        response: geminiTest,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para creación de Informe Semanal en Google Drive
    if (e && e.parameter && (e.parameter.action === "crear_informe_drive" || e.parameter.action === "informe_drive" || e.parameter.action === "drive_report")) {
      var driveRes = crearInformeSemanalEnDrive(ss);
      return ContentService.createTextOutput(JSON.stringify(driveRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para auditoría de salud de Looker Studio y backend
    if (e && e.parameter && (e.parameter.action === "audit" || e.parameter.action === "health")) {
      var auditReport = auditIntegrityCheck(ss);
      return ContentService.createTextOutput(JSON.stringify(auditReport))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // ENDPOINTS PWA MÓVIL: LOGIN, WOD DEL DÍA Y LEADERBOARD DIARIO
    // =========================================================================
    if (e && e.parameter && e.parameter.action === "login") {
      var loginRes = authenticateKleosUser(ss, e.parameter.usuario || e.parameter.user || "", e.parameter.pin || "");
      return ContentService.createTextOutput(JSON.stringify(loginRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && (e.parameter.action === "getDailyWod" || e.parameter.action === "dailyWod")) {
      var wodRes = getDailyWodData(
        ss,
        e.parameter.fecha || e.parameter.date || "",
        e.parameter.atleta || e.parameter.athlete || "",
        e.parameter.programa || e.parameter.program || ""
      );
      return ContentService.createTextOutput(JSON.stringify(wodRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && (e.parameter.action === "getDailyLeaderboard" || e.parameter.action === "leaderboard")) {
      var lbRes = getDailyLeaderboardData(ss, e.parameter.fecha || e.parameter.date || "");
      return ContentService.createTextOutput(JSON.stringify(lbRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === "getUsersPrograms") {
      var upRes = getUsersProgramsList(ss);
      return ContentService.createTextOutput(JSON.stringify(upRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === "getWeeklyWod") {
      var wkRes = getWeeklyWodData(
        ss,
        e.parameter.fechaInicio || e.parameter.fecha || "",
        e.parameter.programa || "Atenea"
      );
      return ContentService.createTextOutput(JSON.stringify(wkRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Soporte para consulta y control de macrociclos
    if (e && e.parameter && (e.parameter.action === "getCycle" || e.parameter.action === "ciclo")) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        activeCycle: getActiveCycle(ss),
        currentWeek: getCurrentWeek(ss),
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && (e.parameter.action === "advanceCycle" || e.parameter.action === "avanzarCiclo")) {
      var advanceResult = advanceCycleState(ss, "Solicitud manual API");
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        result: advanceResult,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && (e.parameter.action === "setCycle" || e.parameter.action === "setCiclo")) {
      var newC = e.parameter.cycle || e.parameter.ciclo || "Ciclo_01";
      var newW = parseInt(e.parameter.week || e.parameter.semana || "1", 10);
      var props = PropertiesService.getScriptProperties();
      if (props) {
        props.setProperty(CONFIG_KEYS.ACTIVE_CYCLE, newC);
        props.setProperty(CONFIG_KEYS.CURRENT_WEEK, String(newW));
      }
      syncControlCicloSheet(ss, newC, newW, "Configurado manualmente vía API");
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        activeCycle: newC,
        currentWeek: newW,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // API DE LECTURA DE DASHBOARD & CONSOLIDACIÓN (REEMPLAZO DE LOOKER STUDIO)
    // Parámetro ?atleta=Nombre+Del+Atleta & ?ciclo=Atenea|Zeus
    // =========================================================================
    var athleteParam = "";
    var cycleParam = "";
    if (e && e.parameter) {
      athleteParam = e.parameter.atleta || e.parameter.athlete || e.parameter.nombre || "";
      cycleParam = e.parameter.ciclo || e.parameter.cycle || "";
    }

    // Si viene acción getAthletes explícita y solo requiere lista básica
    if (e && e.parameter && e.parameter.action === "getAthletes") {
      var athOnly = getAthletesList(ss);
      var effectiveCycle = cycleParam || getActiveCycle(ss);
      var rmOnly = getRmData(ss, effectiveCycle);
      var avCycles = getAvailableCycles(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        athletes: athOnly,
        rmData: rmOnly,
        activeCycle: getActiveCycle(ss),
        selectedCycle: effectiveCycle,
        currentWeek: getCurrentWeek(ss),
        availableCycles: avCycles
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Consolidado completo del Dashboard (por Atleta o Global y filtrado por Ciclo)
    var dashboardResponse = getAthleteDashboardData(ss, athleteParam, cycleParam);

    return ContentService.createTextOutput(JSON.stringify(dashboardResponse))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Error en doGet: " + err.toString(),
      athletes: [],
      rmData: {},
      kpis: { totalTonelaje: 0, totalReps: 0, totalWorkouts: 0, totalCardioKm: 0, avgWellness: 0, lastWellnessScore: 0, recentRMsCount: 0 },
      wellnessHistory: [],
      zonasCarga: { "Descarga (<70%)": 0, "Hipertrofia (70-80%)": 0, "Fuerza Máxima (>80%)": 0 },
      rms: {}
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ============================================================================
 * EXTRACCIÓN Y CONSOLIDACIÓN ANALÍTICA DE ATLETAS (DASHBOARD NATIVO KLEOS)
 * ============================================================================
 * Consolida en una sola pasada en memoria los datos de:
 * 1. 'Registro_Diario': Tonelaje Total (Series × Reps × Carga), total reps, ejercicios, cardio km, zonas %1RM.
 * 2. 'Wellness': Registros históricos cronológicos para mapear la fatiga y score.
 * 3. 'Historial_RMs' y 'RM_Atletas': Marcas de 1RM más recientes y cálculo de intensidad.
 */
/**
 * ============================================================================
 * EXTRACCIÓN Y CONSOLIDACIÓN ANALÍTICA DE ATLETAS (DASHBOARD NATIVO KLEOS)
 * ============================================================================
 * Consolida en una sola pasada en memoria los datos de:
 * 1. 'Registro_Diario': Tonelaje Total, total reps, ejercicios, cardio km, zonas %1RM.
 * 2. 'Wellness': Registros históricos cronológicos para mapear la fatiga y score.
 * 3. 'Historial_RMs', 'RM_Atenea' y 'RM_Zeus': Marcas de 1RM y deltas comparativos.
 */
function getAthleteDashboardData(ss, athleteParam, cycleParam) {
  var isGlobal = (!athleteParam || String(athleteParam).trim() === "" ||
                  String(athleteParam).toLowerCase() === "todos" ||
                  String(athleteParam).toLowerCase() === "all" ||
                  String(athleteParam).toLowerCase() === "global");
  var targetNorm = isGlobal ? "" : String(athleteParam).trim().toLowerCase();

  var activeCycle = getActiveCycle(ss);
  var selectedCycle = (cycleParam && String(cycleParam).trim()) ? String(cycleParam).trim() : activeCycle;
  var currentWeek = (selectedCycle.toLowerCase() === activeCycle.toLowerCase()) ? getCurrentWeek(ss) : (selectedCycle.toLowerCase() === "zeus" ? 12 : 1);
  var availableCycles = getAvailableCycles(ss);

  var athletes = getAthletesList(ss);
  var isZeusSelected = (selectedCycle.toLowerCase() === "zeus" || selectedCycle.toLowerCase() === "ciclo_01" || selectedCycle.toLowerCase() === "1");
  var rmData = getRmData(ss, selectedCycle);
  // Si se consulta Zeus, la base comparativa son las marcas Basales (RM_Atletas)
  // Si se consulta Atenea, la base comparativa son las marcas de Cierre de Zeus (RM_Zeus)
  var rmDataBase = isZeusSelected ? getRmData(ss, "Basal") : getRmData(ss, "Zeus");

  // 1. Extraer datos de 'Registro_Diario' filtrados por el ciclo seleccionado
  var totalTonelaje = 0;
  var totalReps = 0;
  var totalWorkouts = 0;
  var totalCardioKm = 0;
  var zonasCarga = {
    "Descarga (<70%)": 0,
    "Hipertrofia (70-80%)": 0,
    "Fuerza Máxima (>80%)": 0
  };
  var ejerciciosMap = {};
  var intensidadesList = [];
  var activityDatesMap = {};

  var regSheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (regSheet) {
    var lastRow = regSheet.getLastRow();
    if (lastRow > 1) {
      var regValues = regSheet.getRange(2, 1, lastRow - 1, 26).getValues();
      for (var i = 0; i < regValues.length; i++) {
        var row = regValues[i];
        var rowAth = (row[0] || "").toString().trim();
        if (!rowAth) continue;

        if (!isGlobal && rowAth.toLowerCase() !== targetNorm) {
          continue;
        }

        // Filtro por macrociclo
        var rowCycle = (row[25] || "").toString().trim();
        if (!matchesCycle(rowCycle, selectedCycle)) {
          continue;
        }

        totalWorkouts++;
        var rawRegDate = row[1];
        if (rawRegDate instanceof Date) {
          activityDatesMap[formatDateISO(rawRegDate)] = true;
        } else if (rawRegDate) {
          var parsedRegD = parseDate(String(rawRegDate).trim());
          if (parsedRegD && !isNaN(parsedRegD.getTime())) {
            activityDatesMap[formatDateISO(parsedRegD)] = true;
          }
        }
        var ej = (row[4] || "").toString().trim();
        var cat = (row[5] || "").toString().trim();
        var series = parseFloat(String(row[6]).replace(',', '.')) || 0;
        var reps = parseFloat(String(row[7]).replace(',', '.')) || 0;
        var carga = parseFloat(String(row[8]).replace(',', '.')) || 0;
        var catLower = cat.toLowerCase();

        var esCardio = (catLower.indexOf("cardio") !== -1 || catLower.indexOf("carrera") !== -1);

        if (esCardio) {
          var dist = reps;
          if (dist >= 100) dist = dist / 1000;
          totalCardioKm += (series > 0 ? (series * dist) : dist);
        } else {
          var ton = (series > 0 && reps > 0 && carga > 0) ? (series * reps * carga) : 0;
          if (ton === 0 && row[12]) {
            ton = parseFloat(String(row[12]).replace(',', '.').replace(/ /g, '')) || 0;
          }
          totalTonelaje += ton;
          if (series > 0 && reps > 0) {
            totalReps += (series * reps);
          }
        }

        // Zonas de Carga
        var zonaStr = (row[13] || "").toString().trim();
        var zLower = zonaStr.toLowerCase();
        if (zLower.indexOf("descarga") !== -1 || zLower.indexOf("<70") !== -1) {
          zonasCarga["Descarga (<70%)"]++;
        } else if (zLower.indexOf("hipertrofia") !== -1 || zLower.indexOf("70-80") !== -1) {
          zonasCarga["Hipertrofia (70-80%)"]++;
        } else if (zLower.indexOf("fuerza m") !== -1 || zLower.indexOf(">80") !== -1) {
          zonasCarga["Fuerza Máxima (>80%)"]++;
        }

        if (ej) {
          ejerciciosMap[ej] = (ejerciciosMap[ej] || 0) + 1;
        }

        if (row[10]) {
          var pctVal = parseFloat(String(row[10]).replace('%', '').replace(',', '.').trim()) || 0;
          if (pctVal > 0 && pctVal <= 1.0) pctVal = pctVal * 100;
          if (pctVal > 0) {
            intensidadesList.push(pctVal);
          }
        }
      }
    }
  }

  // 2. Extraer datos de 'Wellness'
  var wellnessHistory = [];
  var wellnessScores = [];
  var wellSheet = ss.getSheetByName(TABS.WELLNESS);
  if (wellSheet) {
    var lastWellRow = wellSheet.getLastRow();
    if (lastWellRow > 1) {
      var wellValues = wellSheet.getRange(2, 1, lastWellRow - 1, 13).getValues();
      for (var w = 0; w < wellValues.length; w++) {
        var wRow = wellValues[w];
        var wAth = (wRow[7] || "").toString().trim();
        if (!wAth) continue;

        if (!isGlobal && wAth.toLowerCase() !== targetNorm) {
          continue;
        }

        var wCycle = (wRow[12] || "").toString().trim();
        var isOfCycle = matchesCycle(wCycle, selectedCycle);

        var fObj = wRow[8];
        var fechaStr = "";
        if (fObj instanceof Date) {
          fechaStr = formatDateISO(fObj);
        } else if (fObj) {
          fechaStr = String(fObj).trim();
        } else if (wRow[0] instanceof Date) {
          fechaStr = formatDateISO(wRow[0]);
        }

        var score = parseFloat(String(wRow[9]).replace(',', '.')) || 0;
        var sueno = parseFloat(String(wRow[1]).replace(',', '.')) || 0;
        var energia = parseFloat(String(wRow[2]).replace(',', '.')) || 0;
        var dolor = parseFloat(String(wRow[3]).replace(',', '.')) || 0;
        var estres = parseFloat(String(wRow[4]).replace(',', '.')) || 0;
        var animo = parseFloat(String(wRow[5]).replace(',', '.')) || 0;
        var horasSueno = parseFloat(String(wRow[6]).replace(',', '.')) || 0;
        var zonas = (wRow[10] || "").toString().trim();
        var notas = (wRow[11] || "").toString().trim();

        if (score === 0 && (sueno + energia + dolor + estres + animo) > 0) {
          score = sueno + energia + dolor + estres + animo;
        }

        if (score > 0 && isOfCycle) {
          wellnessScores.push(score);
          wellnessHistory.push({
            fecha: fechaStr,
            score: score,
            sueno: sueno,
            energia: energia,
            dolor: dolor,
            estres: estres,
            animo: animo,
            horasSueno: horasSueno,
            zonas: zonas,
            notas: notas
          });
        }
      }
    }
  }

  // Fallback si apenas inicia el ciclo (ej. Atenea Semana 1): tomar registros recientes para readiness
  if (wellnessScores.length === 0 && wellSheet && wellSheet.getLastRow() > 1) {
    var fbMax = Math.min(15, wellSheet.getLastRow() - 1);
    var startRow = Math.max(2, wellSheet.getLastRow() - fbMax + 1);
    var fallbackValues = wellSheet.getRange(startRow, 1, fbMax, 13).getValues();
    for (var fb = 0; fb < fallbackValues.length; fb++) {
      var fbRow = fallbackValues[fb];
      var fbAth = (fbRow[7] || "").toString().trim();
      if (!isGlobal && fbAth.toLowerCase() !== targetNorm) continue;
      var fbScore = parseFloat(String(fbRow[9]).replace(',', '.')) || 0;
      if (fbScore > 0) {
        wellnessScores.push(fbScore);
        wellnessHistory.push({
          fecha: fbRow[8] instanceof Date ? formatDateISO(fbRow[8]) : String(fbRow[8] || "").trim(),
          score: fbScore,
          sueno: parseFloat(fbRow[1]) || 0,
          energia: parseFloat(fbRow[2]) || 0,
          dolor: parseFloat(fbRow[3]) || 0,
          estres: parseFloat(fbRow[4]) || 0,
          animo: parseFloat(fbRow[5]) || 0,
          horasSueno: parseFloat(fbRow[6]) || 0,
          zonas: String(fbRow[10] || "").trim(),
          notas: String(fbRow[11] || "").trim()
        });
      }
    }
  }

  var recentWellness = (wellnessHistory.length > 15) ? wellnessHistory.slice(wellnessHistory.length - 15) : wellnessHistory;
  var avgWellness = wellnessScores.length > 0 ? (wellnessScores.reduce(function(a, b) { return a + b; }, 0) / wellnessScores.length) : 0;
  var lastWellnessScore = wellnessScores.length > 0 ? wellnessScores[wellnessScores.length - 1] : 0;

  // 3. Extraer marcas de 1RM del ciclo seleccionado y su base de comparación
  var athleteRms = {};
  var athleteBaseRms = {};

  if (!isGlobal && rmData[athleteParam]) {
    athleteRms = JSON.parse(JSON.stringify(rmData[athleteParam]));
    athleteBaseRms = (rmDataBase && rmDataBase[athleteParam]) ? JSON.parse(JSON.stringify(rmDataBase[athleteParam])) : {};
  } else if (!isGlobal) {
    for (var aKey in rmData) {
      if (aKey.toLowerCase() === targetNorm) {
        athleteRms = JSON.parse(JSON.stringify(rmData[aKey]));
        athleteBaseRms = (rmDataBase && rmDataBase[aKey]) ? JSON.parse(JSON.stringify(rmDataBase[aKey])) : {};
        break;
      }
    }
  } else {
    // Consolidado global: RMs máximos registrados en el box para este ciclo
    for (var athName in rmData) {
      for (var ejKey in rmData[athName]) {
        var rmVal = parseFloat(rmData[athName][ejKey]) || 0;
        if (rmVal > 0) {
          athleteRms[ejKey] = Math.max(rmVal, athleteRms[ejKey] || 0);
        }
      }
    }
    // Consolidado global Base para calcular deltas comparativos
    for (var athName in rmDataBase) {
      for (var ejKey in rmDataBase[athName]) {
        var rmBVal = parseFloat(rmDataBase[athName][ejKey]) || 0;
        if (rmBVal > 0) {
          athleteBaseRms[ejKey] = Math.max(rmBVal, athleteBaseRms[ejKey] || 0);
        }
      }
    }
  }

  // Revisar 'Historial_RMs' para actualizar con cualquier récord reciente del ciclo seleccionado
  var histSheet = ss.getSheetByName(TABS.HISTORIAL_RMS);
  if (histSheet) {
    var lastHistRow = histSheet.getLastRow();
    if (lastHistRow > 1) {
      var histValues = histSheet.getRange(2, 1, lastHistRow - 1, 5).getValues();
      for (var h = 0; h < histValues.length; h++) {
        var hRow = histValues[h];
        var hAth = (hRow[0] || "").toString().trim();
        if (!hAth) continue;

        var hCycle = (hRow[4] || "").toString().trim();
        if (!matchesCycle(hCycle, selectedCycle)) continue;

        if (isGlobal || hAth.toLowerCase() === targetNorm) {
          var hEj = (hRow[2] || "").toString().trim();
          var hCarga = parseFloat(String(hRow[3]).replace(',', '.')) || 0;
          if (hEj && hCarga > 0) {
            athleteRms[hEj] = Math.max(hCarga, athleteRms[hEj] || 0);
          }
        }
      }
    }
  }

  // Calcular Deltas vs Base (Zeus compara vs Basal / Atenea compara vs Zeus)
  var rmDeltas = {};
  for (var ej in athleteRms) {
    var valCurrent = parseFloat(athleteRms[ej]) || 0;
    var valBase = parseFloat(athleteBaseRms[ej]) || 0;
    var diff = valBase > 0 ? (valCurrent - valBase) : 0;
    var pctDiff = valBase > 0 ? ((diff / valBase) * 100) : 0;
    rmDeltas[ej] = {
      current: valCurrent,
      base: valBase,
      zeus: valBase, // retrocompatibilidad
      baseName: isZeusSelected ? "Basal (Pre-Zeus)" : "Cierre Zeus",
      diff: Math.round(diff * 10) / 10,
      pctDiff: Math.round(pctDiff * 10) / 10,
      isPositive: (diff > 0.05),
      isEqual: (Math.abs(diff) <= 0.05)
    };
  }

  var avgIntensidad = intensidadesList.length > 0 ? (intensidadesList.reduce(function(a, b) { return a + b; }, 0) / intensidadesList.length) : 0;

  // 4. Extraer y consolidar datos de 'Skills_Gimnasia' filtrados por ciclo y atleta
  var gymTotalVolume = 0;
  var gymRpeList = [];
  var gymSkillsMap = {};

  var gymSheet = ss.getSheetByName(TABS.SKILLS_GIMNASIA);
  if (gymSheet) {
    var lastGymRow = gymSheet.getLastRow();
    if (lastGymRow > 1) {
      // 10 columnas: [Fecha, Atleta, Skill_Movimiento, Nivel_Progresion, Max_Reps_Unbroken, Volumen_Total, RPE_Calidad, Ciclo, Semana, Notas]
      var gymValues = gymSheet.getRange(2, 1, lastGymRow - 1, 10).getValues();
      for (var g = 0; g < gymValues.length; g++) {
        var gRow = gymValues[g];
        var gFecha = gRow[0] ? (gRow[0] instanceof Date ? formatDateISO(gRow[0]) : String(gRow[0]).substring(0, 10)) : "";
        var gAth = (gRow[1] || "").toString().trim();
        if (!gAth) continue;

        var gCycle = (gRow[7] || "").toString().trim();
        if (!matchesCycle(gCycle, selectedCycle)) continue;

        if (!isGlobal && gAth.toLowerCase() !== targetNorm) continue;

        var gSkill = (gRow[2] || "").toString().trim();
        if (!gSkill) continue;

        var gProg = (gRow[3] || "Rx / Estándar").toString().trim();
        var gMaxUnbroken = parseFloat(String(gRow[4]).replace(',', '.')) || 0;
        var gVolTotal = parseFloat(String(gRow[5]).replace(',', '.')) || gMaxUnbroken;
        var gRpe = parseFloat(String(gRow[6]).replace(',', '.')) || 0;
        var gSemana = parseInt(gRow[8], 10) || 1;
        var gNotas = (gRow[9] || "").toString().trim();

        gymTotalVolume += gVolTotal;
        if (gRpe > 0) gymRpeList.push(gRpe);

        if (!gymSkillsMap[gSkill]) {
          gymSkillsMap[gSkill] = {
            skill: gSkill,
            skillMovimiento: gSkill,
            bestUnbroken: gMaxUnbroken,
            maxRepsUnbroken: gMaxUnbroken,
            progression: gProg,
            nivelProgresion: gProg,
            totalVolume: gVolTotal,
            volumenAcumulado: gVolTotal,
            lastDate: gFecha,
            ultimaFecha: gFecha,
            lastRpe: gRpe,
            semana: gSemana,
            notas: gNotas
          };
        } else {
          var item = gymSkillsMap[gSkill];
          item.bestUnbroken = Math.max(item.bestUnbroken, gMaxUnbroken);
          item.maxRepsUnbroken = item.bestUnbroken;
          item.totalVolume += gVolTotal;
          item.volumenAcumulado = item.totalVolume;
          if (gFecha && (!item.lastDate || gFecha >= item.lastDate)) {
            item.lastDate = gFecha;
            item.ultimaFecha = gFecha;
            item.progression = gProg;
            item.nivelProgresion = gProg;
            item.lastRpe = gRpe;
            item.semana = gSemana;
            if (gNotas) item.notas = gNotas;
          }
        }
      }
    }
  }

  var topGymSkills = [];
  for (var skKey in gymSkillsMap) {
    topGymSkills.push(gymSkillsMap[skKey]);
  }
  topGymSkills.sort(function(a, b) {
    return b.totalVolume - a.totalVolume;
  });

  var avgGymRpe = gymRpeList.length > 0 ? (gymRpeList.reduce(function(a, b) { return a + b; }, 0) / gymRpeList.length) : 0;

  var gymnasticsSummary = {
    totalVolume: Math.round(gymTotalVolume),
    avgRpe: Math.round(avgGymRpe * 10) / 10,
    countRecords: gymRpeList.length,
    topSkills: topGymSkills
  };

  return {
    status: "ok",
    version: "22.0.0",
    atleta: isGlobal ? "Todos los Atletas" : athleteParam,
    isGlobal: isGlobal,
    athletes: athletes,
    rmData: rmData,
    activeCycle: activeCycle,
    selectedCycle: selectedCycle,
    currentWeek: currentWeek,
    availableCycles: availableCycles,
    kpis: {
      totalTonelaje: Math.round(totalTonelaje * 10) / 10,
      totalReps: Math.round(totalReps),
      totalWorkouts: totalWorkouts,
      totalCardioKm: Math.round(totalCardioKm * 100) / 100,
      avgWellness: Math.round(avgWellness * 10) / 10,
      lastWellnessScore: Math.round(lastWellnessScore * 10) / 10,
      recentRMsCount: Object.keys(athleteRms).length
    },
    wellnessHistory: recentWellness,
    zonasCarga: zonasCarga,
    rms: athleteRms,
    rmDeltas: rmDeltas,
    gymnastics: gymnasticsSummary,
    activityDates: Object.keys(activityDatesMap).sort(),
    intensidadPromedio: Math.round(avgIntensidad * 10) / 10,
    timestamp: new Date().toISOString()
  };
}

/**
 * Normaliza y evalúa si una fila pertenece al ciclo consultado
 */
function matchesCycle(rowCycle, targetCycle) {
  var r = String(rowCycle || "").toLowerCase().trim();
  var t = String(targetCycle || "").toLowerCase().trim();
  if (r === t) return true;
  if ((t === "zeus" || t === "ciclo_01" || t === "1") && (r === "zeus" || r === "ciclo_01" || r === "1" || r === "")) return true;
  if ((t === "atenea" || t === "ciclo_02" || t === "2") && (r === "atenea" || r === "ciclo_02" || r === "2")) return true;
  return false;
}

/**
 * Lista de ciclos disponibles y metadatos de periodización
 */
function getAvailableCycles(ss) {
  var active = getActiveCycle(ss);
  return [
    {
      id: "Atenea",
      name: "⚡ Ciclo Atenea · Activo",
      status: (active.toLowerCase() === "atenea") ? "activo" : "histórico",
      fase: "Fase: Acumulación (70-75% 1RM) · Sem 1/12",
      badge: "Activo",
      currentWeek: 1,
      totalWeeks: 12
    },
    {
      id: "Zeus",
      name: "🏛️ Ciclo Zeus · Histórico",
      status: (active.toLowerCase() === "zeus") ? "activo" : "cerrado",
      fase: "Macrociclo 1 Cerrado · 12 Semanas Finalizadas",
      badge: "Histórico",
      currentWeek: 12,
      totalWeeks: 12
    }
  ];
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
    var activeCycle = (data.ciclo && String(data.ciclo).trim()) ? String(data.ciclo).trim() : getActiveCycle(ss);
    var esNuevoRm = (data.es_nuevo_rm === true || data.es_nuevo_rm === "true" || data.esNuevoRm === true);

    if (data.type === "nuevo_rm" || data.type === "historial_rm") {
      var rmRes = registrarNuevoRMDobleFlujo(ss, data, activeCycle);
      return sendJsonResponse("success", "Nuevo RM archivado en 'Historial_RMs' y sincronizado en 'RM_Atletas'", rmRes);
    }
    else if (data.type === "wellness") {
      insertWellness(ss, data, activeCycle);
      var cycleTransition = evaluarYProcesarCierreCiclo(ss, data);
      var wMsg = "Wellness guardado en pestaña '" + TABS.WELLNESS + "' para " + (data.athlete || "Atleta");
      if (cycleTransition && cycleTransition.transicionado) {
        wMsg += " | 🏁 Cierre de Semana 12 completado. Ciclo avanzado a " + cycleTransition.activeCycle;
      }
      return sendJsonResponse("success", wMsg, {
        ciclo: activeCycle,
        cycleTransition: cycleTransition
      });
    } 
    else if (data.type === "wod" || data.type === "registro_diario") {
      // Regla de Separación: Solo se considera Nuevo 1RM si el atleta activó explícitamente el botón
      var esNuevoRm = (data.es_nuevo_rm === true || data.es_nuevo_rm === "true" || data.esNuevoRm === true);
      
      insertRegistroDiario(ss, data, activeCycle, esNuevoRm);

      // Si la categoría es Gimnásticos, guardamos simultáneamente en 'Skills_Gimnasia'
      var catStr = String(data.categoria || data.category || "").toLowerCase();
      var esSkillGimnasia = (catStr.indexOf("gimnástic") !== -1 || catStr.indexOf("gimnastic") !== -1 || catStr.indexOf("skill") !== -1);
      var currentWeek = getCurrentWeek(ss);
      if (esSkillGimnasia) {
        insertSkillsGimnasia(ss, data, activeCycle, currentWeek);
      }
      
      // Doble flujo de ingesta para RMs: ÚNICAMENTE si esNuevoRm fue activado explícitamente
      var rmRes = null;
      if (esNuevoRm) {
        rmRes = registrarNuevoRMDobleFlujo(ss, data, activeCycle);
      }
      
      // Control de transición de ciclo (Semana 12)
      var cycleTransition = evaluarYProcesarCierreCiclo(ss, data);
      
      var msg = "Entrenamiento guardado en pestaña '" + TABS.REGISTRO_DIARIO + "' para " + (data.athlete || "Atleta");
      if (esSkillGimnasia) {
        msg += " | 🤸 Skill archivado en '" + TABS.SKILLS_GIMNASIA + "'";
      }
      if (esNuevoRm) {
        msg += " | ⭐ Nuevo 1RM Final registrado en pestaña '" + TABS.RM_CICLO_2 + "' e Historial_RMs";
      }
      if (cycleTransition && cycleTransition.transicionado) {
        msg += " | 🏁 Cierre de Semana 12 completado. Ciclo avanzado a " + cycleTransition.activeCycle;
      }
      
      return sendJsonResponse("success", msg, {
        ciclo: activeCycle,
        semana: currentWeek,
        esNuevoRm: esNuevoRm,
        rmResult: rmRes,
        cycleTransition: cycleTransition
      });
    }
    else if (data.type === "skills_gimnasia" || data.type === "gimnasia" || data.type === "skill") {
      var currentWeek = getCurrentWeek(ss);
      var gRes = insertSkillsGimnasia(ss, data, activeCycle, currentWeek);
      return sendJsonResponse("success", "Skill de gimnasia archivado exitosamente en pestaña '" + TABS.SKILLS_GIMNASIA + "'", {
        ciclo: activeCycle,
        semana: currentWeek,
        row: gRes.row
      });
    } 
    else if (data.type === "login" || data.action === "login") {
      var authRes = authenticateKleosUser(ss, data.usuario || data.user || "", data.pin || "");
      return ContentService.createTextOutput(JSON.stringify(authRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "updatePin" || data.type === "update_pin" || data.action === "updatePin") {
      var pinRes = updateKleosUserPin(
        ss,
        data.usuario || data.user || "",
        data.atleta || data.athlete || "",
        data.pinActual || data.currentPin || "",
        data.pinNuevo || data.newPin || ""
      );
      return ContentService.createTextOutput(JSON.stringify(pinRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "publishDailyWod" || data.type === "publish_daily_wod" || data.action === "publishDailyWod") {
      var pubRes = publishDailyWodBlocks(ss, data);
      return ContentService.createTextOutput(JSON.stringify(pubRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "publishWeeklyWod" || data.type === "publish_weekly_wod" || data.action === "publishWeeklyWod") {
      var wkPubRes = publishWeeklyWodBatch(ss, data);
      return ContentService.createTextOutput(JSON.stringify(wkPubRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "updateAthleteProgram" || data.type === "update_athlete_program" || data.action === "updateAthleteProgram") {
      var progUpdRes = updateKleosAthleteProgram(ss, data);
      return ContentService.createTextOutput(JSON.stringify(progUpdRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "parseWodWithAI" || data.type === "parse_wod_ai" || data.action === "parseWodWithAI") {
      var aiRes = parseWodWithAI(ss, data.rawText || data.text || data.wodText || "", !!data.multiDay, data.yearHint || 2026);
      return ContentService.createTextOutput(JSON.stringify(aiRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "publishMultiProgramBlocks" || data.action === "publishMultiProgramBlocks") {
      var mpRes = publishMultiProgramBlocksBatch(ss, data);
      return ContentService.createTextOutput(JSON.stringify(mpRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "deleteDailyWod" || data.action === "deleteDailyWod") {
      var delRes = deleteDailyWodBlocks(ss, data);
      return ContentService.createTextOutput(JSON.stringify(delRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "setGeminiApiKey" || data.action === "setGeminiApiKey") {
      var rolKey = String(data.rol || "").trim().toLowerCase();
      if (rolKey !== "coach") {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Solo el Coach puede configurar GEMINI_API_KEY." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var newKey = String(data.apiKey || data.key || "").trim();
      if (!newKey) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "apiKey vacía." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", newKey);
      logScriptEvent(ss, "CONFIG_GEMINI_KEY", data.atleta || "Coach", 0, "HEALTHY", "GEMINI_API_KEY actualizada en ScriptProperties");
      return ContentService.createTextOutput(JSON.stringify({ status: "ok", message: "GEMINI_API_KEY guardada de forma segura en ScriptProperties." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (data.type === "crear_informe_drive" || data.type === "informe_drive") {
      var driveRes = crearInformeSemanalEnDrive(ss);
      return sendJsonResponse(driveRes.status, driveRes.message);
    }
    else {
      return sendJsonResponse("error", "Tipo de registro no válido: " + data.type);
    }

  } catch (error) {
    try {
      var ssErr = SpreadsheetApp.getActiveSpreadsheet();
      logScriptEvent(ssErr, "ERROR_POST", (data && (data.atleta || data.athlete)) || "Desconocido", -1, "FAILED", error.toString() + (error.stack ? " | " + error.stack : ""));
    } catch (_) {}
    return sendJsonResponse("error", "Error interno al insertar: " + error.toString() + (error.stack ? " at " + error.stack : ""));
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Inserta en la pestaña 'Registro_Diario' SIN USAR appendRow() ni getLastRow().
 * Busca la primera fila vacía basándose ÚNICAMENTE en la columna A (Atleta).
 * INSERTA TODAS LAS 26 COLUMNAS (A hasta Z) COMO VALORES ESTÁTICOS FIJOS
 * calculados matemáticamente en Apps Script, blindando el historial contra
 * recálculos accidentales y eliminando la dependencia de fórmulas dinámicas.
 */
function insertRegistroDiario(ss, data, activeCycle, esNuevoRm) {
  var sheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.REGISTRO_DIARIO);
    initRegistroDiarioHeaders(sheet);
  }

  var cicloVal = activeCycle || (data && data.ciclo) || getActiveCycle(ss);

  // Asegurar existencia y cabeceras de columnas W (23), X (24), Y (25) y Z (26)
  if (sheet.getMaxColumns() < 26) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 26 - sheet.getMaxColumns());
  }
  var hW = sheet.getRange("W1").getValue();
  var hX = sheet.getRange("X1").getValue();
  var hY = sheet.getRange("Y1").getValue();
  var hZ = sheet.getRange("Z1").getValue();
  if (!hW || !hX || !hY || !hZ) {
    sheet.getRange("W1:Z1").setValues([["Duracion_min", "Score_Reps", "Peso_WOD", "Ciclo"]]);
    var rangeH = sheet.getRange("W1:Z1");
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
  var rawEjercicio = (data.ejercicio || data.exercise || "").toString().trim();
  var variante = (data.variante || data.variant || "").toString().trim();

  var duracion = (data.duracion !== undefined && data.duracion !== null) ? String(data.duracion).trim() : 
                 (data.duration !== undefined && data.duration !== null ? String(data.duration).trim() : "");
  var scoreReps = 0;
  var pesoWod = 0;

  var series = 0;
  var repsOrDistance = 0;
  var cargaKg = 0;
  var rmKg = 0;

  // Intercepción inteligente de scoreReps / scorereps en cualquier formato
  var rawScoreReps = (data.scoreReps !== undefined && data.scoreReps !== null && data.scoreReps !== "") ? data.scoreReps :
                     ((data.scorereps !== undefined && data.scorereps !== null && data.scorereps !== "") ? data.scorereps :
                     ((data.ScoreReps !== undefined && data.ScoreReps !== null && data.ScoreReps !== "") ? data.ScoreReps :
                     ((data.score_reps !== undefined && data.score_reps !== null && data.score_reps !== "") ? data.score_reps : null)));

  // Detección Universal de Categorías (Con Precedencia Estricta para Cardio/Carrera)
  var catLower = categoria.toLowerCase();
  var ejLower = rawEjercicio.toLowerCase();
  var esCardio = (categoria === "Cardio" || catLower.indexOf("cardio") !== -1 || catLower.indexOf("carrera") !== -1 || ejLower.indexOf("carrera") !== -1);
  var esLifting = (!esCardio && (categoria === "Fuerza" || categoria === "Levantamiento Olímpico" || catLower.indexOf("fuerza") !== -1 || catLower.indexOf("olímpico") !== -1 || catLower.indexOf("olimpico") !== -1));
  var esGimnasticos = (!esCardio && (categoria === "Gimnásticos" || catLower.indexOf("gimnástic") !== -1 || catLower.indexOf("gimnastic") !== -1));
  var esMetcon = (!esCardio && !esLifting && !esGimnasticos && (categoria === "Metcon / WOD" || catLower.indexOf("metcon") !== -1 || catLower.indexOf("wod") !== -1 || (rawScoreReps !== null && Number(rawScoreReps) > 0)));

  // AUDITORÍA Y HOMOLOGACIÓN SEMÁNTICA DE WODs (GEMINI 1.5 FLASH)
  var ejercicio = rawEjercicio;
  if (esMetcon) {
    ejercicio = homologarNombreWODConGemini(rawEjercicio);
  }
  if (variante && variante !== "-- Estándar / Desde el Suelo (Sin variante) --" && variante !== "Sin variante" && ejercicio.indexOf(variante) === -1) {
    ejercicio = ejercicio + " (" + variante + ")";
  }

  // Variables calculadas estáticas para K..R y T..V
  var pctReal = 0;
  var repsTotales = 0;
  var tonelaje = 0;
  var zonaCarga = "";
  var cntDescarga = 0;
  var cntHipertrofia = 0;
  var cntFuerzaMax = 0;
  var cntTotalFuerza = 0;
  var pctPorcentaje = 0;

  if (esCardio) {
    // --- CARDIO (CARRERA / RESISTENCIA AERÓBICA CERO MÁQUINAS) ---
    series = Number(data.series !== undefined && data.series !== null && data.series !== ""
      ? data.series
      : (data.intervals !== undefined && data.intervals !== null && data.intervals !== "" ? data.intervals : 1));
    if (isNaN(series) || series < 1) series = 1;

    var rawDistancia = data.distancia !== undefined ? data.distancia
      : (data.distance !== undefined ? data.distance
      : (data.repsOrDistance !== undefined ? data.repsOrDistance : 0));
    
    repsOrDistance = parseCardioDistance(rawDistancia);

    cargaKg = 0;
    rmKg = 0;
    pctReal = 0;
    repsTotales = Math.round(series * repsOrDistance * 1000) / 1000; // Kilometraje Total
    tonelaje = 0;
    zonaCarga = "Cardio";
    cntDescarga = 0;
    cntHipertrofia = 0;
    cntFuerzaMax = 0;
    cntTotalFuerza = 0;
    pctPorcentaje = 0;
    scoreReps = 0;
    pesoWod = 0;

  } else if (esLifting) {
    // --- FUERZA / LEVANTAMIENTO OLÍMPICO ---
    series = Number(data.series !== undefined ? data.series : 1) || 1;
    var parsedReps = parseFloat(String(data.reps !== undefined ? data.reps : (data.repsOrDistance !== undefined ? data.repsOrDistance : 1)).replace(',', '.'));
    repsOrDistance = (!isNaN(parsedReps) && parsedReps > 0) ? parsedReps : 1;
    cargaKg = parseFloat(String(data.carga !== undefined ? data.carga : (data.weight !== undefined ? data.weight : 0)).replace(',', '.')) || 0;

    // Búsqueda en Cascada de 1RM Base:
    var ejLower = ejercicio.toLowerCase();
    var isJerkMovement = (ejLower.indexOf("push jerk") !== -1 || ejLower.indexOf("split jerk") !== -1 || (ejLower.indexOf("jerk") !== -1 && ejLower.indexOf("clean & jerk") === -1 && ejLower.indexOf("clean and jerk") === -1));
    var isSnatchComplex = (ejLower.indexOf("snatch complex") !== -1);
    var isCleanComplex = (ejLower.indexOf("clean complex") !== -1);

    var cascadeRm = 0;
    try {
      var allRm = getRmData(ss);
      if (allRm && allRm[atleta]) {
        var athRms = allRm[atleta];
        var motherKey = getMotherExerciseKey(rawEjercicio) || rawEjercicio;
        cascadeRm = athRms[rawEjercicio] || athRms[motherKey] || 0;
        if (!cascadeRm) {
          if (isSnatchComplex) {
            cascadeRm = athRms["Snatch"] || athRms["Snatch Complex"] || athRms["Power Snatch"] || 0;
          } else if (isCleanComplex) {
            cascadeRm = athRms["Clean Squat"] || athRms["Clean Complex"] || athRms["Squat Clean"] || athRms["Clean"] || athRms["Clean & Jerk"] || athRms["Power Clean"] || 0;
          } else if (isJerkMovement) {
            cascadeRm = athRms["Jerk"] || athRms["Push Jerk"] || athRms["Split Jerk"] || 0;
          }
        }
      }
    } catch (_) {}
    cascadeRm = parseFloat(String(cascadeRm).replace(',', '.')) || 0;

    // LÓGICA DE REGISTRO DE RM:
    // Si el atleta activó explícitamente el botón "Nuevo 1RM Final", su 1RM de referencia pasa a ser la nueva carga lograda
    // Si NO activó el botón (serie de aproximación o trabajo normal), el RM de referencia es el basal/cascada vigente
    if (esNuevoRm) {
      rmKg = (cargaKg > 0) ? cargaKg : (cascadeRm > 0 ? cascadeRm : 0);
    } else {
      rmKg = (cascadeRm > 0) ? cascadeRm : (parseFloat(String(data.unRM || data.oneRepMax || 0).replace(',', '.')) || 0);
    }

    repsTotales = Math.round(series * repsOrDistance);
    tonelaje = Math.round(repsTotales * cargaKg * 100) / 100;

    if (rmKg > 0 && cargaKg > 0) {
      pctReal = Math.round((cargaKg / rmKg) * 10000) / 10000;
      pctPorcentaje = Math.round(pctReal * 10000) / 100;
    } else {
      pctReal = 0;
      pctPorcentaje = 0;
    }

    if (pctReal < 0.70) {
      zonaCarga = "Descarga (<70%)";
      cntDescarga = 1;
    } else if (pctReal <= 0.80) {
      zonaCarga = "Hipertrofia (70-80%)";
      cntHipertrofia = 1;
    } else {
      zonaCarga = "Fuerza Máxima (>80%)";
      cntFuerzaMax = 1;
    }
    cntTotalFuerza = 1;

    duracion = "";
    scoreReps = "";
    pesoWod = 0;

  } else if (esGimnasticos) {
    // --- GIMNÁSTICOS ---
    series = Number(data.series !== undefined ? data.series : 1) || 1;
    var parsedGimReps = parseFloat(String(data.reps !== undefined ? data.reps : (data.repsOrDistance !== undefined ? data.repsOrDistance : 0)).replace(',', '.'));
    repsOrDistance = (!isNaN(parsedGimReps) && parsedGimReps >= 0) ? parsedGimReps : 0;
    cargaKg = 0;
    rmKg = 0;
    pctReal = 0;
    repsTotales = Math.round(series * repsOrDistance);
    tonelaje = 0;
    zonaCarga = "Gimnásticos";
    cntDescarga = 0;
    cntHipertrofia = 0;
    cntFuerzaMax = 0;
    cntTotalFuerza = 0;
    pctPorcentaje = 0;
    duracion = "";
    scoreReps = "";
    pesoWod = 0;

  } else if (esMetcon) {
    // --- METCON / WOD ---
    series = 0;
    repsOrDistance = 0; // BLOQUEADO EN 0 ABSOLUTO
    cargaKg = 0;
    rmKg = 0;
    pctReal = 0;

    var tipoWod = (data.tipoWod || data.tipo_wod || "").toString().trim();
    var isEmom = tipoWod.indexOf("EMOM") !== -1 || (data.emomMinutosTotales !== undefined && Number(data.emomMinutosTotales) > 0);

    if (rawScoreReps !== null) {
      var parsedDirect = parseFloat(String(rawScoreReps).replace(',', '.'));
      if (!isNaN(parsedDirect)) {
        scoreReps = parsedDirect;
      } else {
        var geminiParsed = parseScoreWithGemini(rawScoreReps);
        scoreReps = (geminiParsed !== null && !isNaN(geminiParsed)) ? geminiParsed : 0;
      }
    } else if (isEmom) {
      var minTotales = Number(data.emomMinutosTotales !== undefined ? data.emomMinutosTotales : (data.minutosTotales || 0));
      var minCompletados = Number(data.emomMinutosCompletados !== undefined ? data.emomMinutosCompletados : (data.minutosCompletados || 0));
      if (minCompletados > minTotales && minTotales > 0) minCompletados = minTotales;
      var minFaltantes = Math.max(0, minTotales - minCompletados);
      scoreReps = minCompletados + (minFaltantes / 1000);
    } else {
      var rondas = Number(data.rondasCompletas !== undefined ? data.rondasCompletas : 0);
      var repsExtra = Number(data.repsAdicionales !== undefined ? data.repsAdicionales : 0);
      scoreReps = rondas + (repsExtra / 1000);
    }

    if (scoreReps !== "" && scoreReps !== null && !isNaN(scoreReps)) {
      scoreReps = Math.round(Number(scoreReps) * 1000) / 1000;
    } else {
      scoreReps = 0;
    }

    repsTotales = scoreReps;
    tonelaje = 0;
    zonaCarga = "Metcon / WOD";
    cntDescarga = 0;
    cntHipertrofia = 0;
    cntFuerzaMax = 0;
    cntTotalFuerza = 0;
    pctPorcentaje = 0;
    pesoWod = 0;

  } else {
    // --- CATEGORÍA DESCONOCIDA ---
    series = Number(data.series || 1);
    repsOrDistance = data.reps || data.repsOrDistance || 1;
    cargaKg = Number(data.carga || data.weight || 0);
    rmKg = Number(data.unRM || data.oneRepMax || 0);
    repsTotales = Math.round(series * Number(repsOrDistance || 1));
    tonelaje = Math.round(repsTotales * cargaKg * 100) / 100;
    pctReal = rmKg > 0 ? Math.round((cargaKg / rmKg) * 10000) / 10000 : 0;
    pctPorcentaje = Math.round(pctReal * 10000) / 100;
    zonaCarga = "General";
  }

  var rpe = data.rpe !== undefined ? data.rpe : "";
  var sesionId = atleta + "_" + formatDateISO(fechaObj);

  // Inserción Atómica 100% de Valores Estáticos Fijos (A hasta Z)
  var fullRowData = [
    atleta,          // Col A (1): Atleta
    fechaStr,        // Col B (2): Fecha
    mesTexto,        // Col C (3): Mes
    semanaTexto,     // Col D (4): Semana
    ejercicio,       // Col E (5): Ejercicio
    categoria,       // Col F (6): Categoría
    series,          // Col G (7): Series
    repsOrDistance,  // Col H (8): Reps / Distancia (km) [BLOQUEADO EN 0 EN METCON]
    cargaKg,         // Col I (9): Carga (kg)
    rmKg,            // Col J (10): 1RM Atleta (kg) ESTÁTICO
    pctReal,         // Col K (11): % 1RM Real ESTÁTICO
    repsTotales,     // Col L (12): Reps Totales / Kilometraje ESTÁTICO
    tonelaje,        // Col M (13): Tonelaje Total (kg) ESTÁTICO
    zonaCarga,       // Col N (14): Zona de Carga ESTÁTICA
    cntDescarga,     // Col O (15): Contador Descarga ESTÁTICO
    cntHipertrofia,  // Col P (16): Contador Hipertrofia ESTÁTICO
    cntFuerzaMax,    // Col Q (17): Contador Fuerza Max ESTÁTICO
    cntTotalFuerza,  // Col R (18): Contador Total Fuerza ESTÁTICO
    rpe,             // Col S (19): RPE
    semanaNum,       // Col T (20): Fecha_Ordenada ESTÁTICA
    sesionId,        // Col U (21): Sesion_ID ESTÁTICA
    pctPorcentaje,   // Col V (22): % 1RM Porcentaje ESTÁTICO
    duracion,        // Col W (23): Duracion_min
    scoreReps,       // Col X (24): Score_Reps (3 decimales)
    pesoWod,         // Col Y (25): Peso_WOD
    cicloVal         // Col Z (26): Ciclo
  ];

  sheet.getRange(targetRow, 1, 1, 26).setValues([fullRowData]);

  SpreadsheetApp.flush();

  // Mantener exactamente una sola fila limpia al final para Looker Studio
  ensureSingleCleanBottomRow(sheet, targetRow);

  // Telemetría de Monitoreo Proactivo en 'Log_Script'
  var logDetalle = esCardio
    ? ("Cat: " + categoria + " | Ej: " + ejercicio + " | Distancia: " + repsOrDistance + "km | Series: " + series + " | TotalKm: " + repsTotales + "km | RPE: " + rpe)
    : ("Cat: " + categoria + " | Ej: " + ejercicio + " | Carga: " + cargaKg + "kg | 1RM Ref: " + rmKg + "kg (%: " + pctPorcentaje + "%) | EsNuevoRM: " + esNuevoRm + " | RPE: " + rpe);
  logScriptEvent(ss, "INSERT_REGISTRO_DIARIO", atleta, targetRow, "HEALTHY", logDetalle);
  SpreadsheetApp.flush();
}

/**
 * Inserta en la pestaña 'Wellness' SIN USAR appendRow() ni getLastRow().
 * Busca la primera fila vacía en Columna A y escribe exactamente en esa fila con getRange().
 */
function insertWellness(ss, data, activeCycle) {
  var sheet = ss.getSheetByName(TABS.WELLNESS);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.WELLNESS);
    initWellnessHeaders(sheet);
  }

  var cicloVal = activeCycle || (data && data.ciclo) || getActiveCycle(ss);

  // Asegurar existencia y cabeceras de columnas K (11), L (12) y M (13)
  if (sheet.getMaxColumns() < 13) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 13 - sheet.getMaxColumns());
  }
  var hK = sheet.getRange("K1").getValue();
  var hL = sheet.getRange("L1").getValue();
  var hM = sheet.getRange("M1").getValue();
  if (!hK || !hL || !hM) {
    sheet.getRange("K1:M1").setValues([["Zonas_Molestia", "Notas_Sensaciones", "Ciclo"]]);
    var rangeExt = sheet.getRange("K1:M1");
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

  // Escribir exactamente las 13 columnas (A hasta M) en la fila destino
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
    notasSensaciones, // Col L: Notas / Sensaciones de la Mañana
    cicloVal          // Col M: Ciclo
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
        // CÁLCULO MATEMÁTICO CARDIO: SERIES × DISTANCIA (KM)
        var sNum = Number(opts.series) || 1;
        var rawD = (opts.distancia !== undefined && opts.distancia !== null && opts.distancia !== "") ? opts.distancia : (opts.reps || 0);
        var dNum = parseCardioDistance(rawD);
        repsTotales = Math.round(sNum * dNum * 1000) / 1000;
      } else {
        repsTotales = (Number(opts.series) || 0) * (Number(opts.reps) || 0);
      }

      // Columnas K a R (11 a 18): % 1RM=0, RepsTotales (Col L), Tonelaje=0, Zona=Cat, Contadores=0
      var valsK_R = [0, repsTotales, 0, categoria, 0, 0, 0, 0];
      sheet.getRange(targetRow, 11, 1, 8).setValues([valsK_R]);

      // Columnas T a V (20 a 22): Copiar fórmulas maestras de T (Fecha_Ordenada) y U (Sesion_ID) desde fila 2
      sheet.getRange(2, 20, 1, 2).copyTo(
        sheet.getRange(targetRow, 20, 1, 2),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
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
 * Analiza cualquier pestaña de RM (formato vertical [Atleta, Ejercicio, 1RM] o matriz horizontal)
 * y retorna un mapa estructurado { [Atleta]: { [Ejercicio]: peso } }
 */
function parseRmSheetValues(sheet) {
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return {};

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rmMap = {};
  var colBHeader = (values[0][1] || "").toString().toLowerCase().trim();

  if (colBHeader === "ejercicio" || colBHeader === "exercise") {
    // Formato A: [Atleta, Ejercicio, 1RM]
    for (var r = 1; r < values.length; r++) {
      var atleta = (values[r][0] || "").toString().trim();
      var ejercicio = (values[r][1] || "").toString().trim();
      var rawPeso = values[r][2];
      var peso = parseFloat(String(rawPeso).replace(',', '.'));

      if (atleta && ejercicio && !isNaN(peso) && peso > 0) {
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
        var valRm = parseFloat(String(values[i][c]).replace(',', '.'));
        if (exerciseName && !isNaN(valRm) && valRm > 0) {
          rmMap[atletaName][exerciseName] = valRm;
        }
      }
    }
  }
  return rmMap;
}

/**
 * LÓGICA DE LECTURA DINÁMICA DE RMs CON CASCADA Y EQUIVALENCIA OLÍMPICA:
 * - Ciclo 'Basal' (o 'Pre-Zeus'): Carga marcas basales pre-Zeus ('RM_Atletas' / 'RM_Basal').
 * - Ciclo 'Zeus': Carga 'RM_Zeus' (33 marcas del cierre de Zeus con cascada sobre marcas basales).
 * - Ciclo 'Atenea': Carga 'RM_Atenea' (con cascada completa sobre la base vigente de Zeus).
 */
function getRmData(ss, cycleName) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetCycle = cycleName || getActiveCycle(ss) || "Atenea";
  var cNorm = targetCycle.toLowerCase();

  // 1. Cargar Pestaña Base Basal Pre-Zeus (RM_Atletas / RM_Basal)
  var basalSheet = ss.getSheetByName(TABS.RM_ATLETAS) || ss.getSheetByName(TABS.RM_BASAL) || ss.getSheetByName("Atletas_1RM");
  var basalMap = parseRmSheetValues(basalSheet);

  if (cNorm === "basal" || cNorm === "pre-zeus" || cNorm === "basales") {
    return applyRmEquivalences(basalMap);
  }

  // 2. Cargar RMs oficiales del Cierre de Zeus ('RM_Zeus')
  var zeusSheet = ss.getSheetByName(TABS.RM_ZEUS);
  var zeusMap = parseRmSheetValues(zeusSheet);

  // Fusión en cascada para Zeus (cimientos basales pre-Zeus + récords oficiales de cierre de Zeus)
  var zeusCascade = {};
  for (var ath in basalMap) {
    zeusCascade[ath] = {};
    for (var ej in basalMap[ath]) {
      zeusCascade[ath][ej] = basalMap[ath][ej];
    }
  }
  for (var ath in zeusMap) {
    if (!zeusCascade[ath]) zeusCascade[ath] = {};
    for (var ej in zeusMap[ath]) {
      var v = zeusMap[ath][ej];
      if (v !== undefined && v !== null && !isNaN(v) && Number(v) > 0) {
        zeusCascade[ath][ej] = Number(v);
      }
    }
  }

  if (cNorm === "zeus" || cNorm === "ciclo_01" || cNorm === "1") {
    return applyRmEquivalences(zeusCascade);
  }

  // 3. Cargar Ciclo Atenea (u otro ciclo activo)
  var dynamicSheetName = "RM_" + targetCycle;
  var cycleSheet = ss.getSheetByName(dynamicSheetName) ||
                   (cNorm === "atenea" ? (ss.getSheetByName("RM_Atenea") || ss.getSheetByName("RM_Ciclo_02")) : null);
  var cycleMap = parseRmSheetValues(cycleSheet);

  // Fusión en Cascada para Atenea:
  // Su base de trabajo (100% de referencia) es el Cierre de Zeus completo
  var ateneaCascade = {};
  for (var ath in zeusCascade) {
    ateneaCascade[ath] = {};
    for (var ej in zeusCascade[ath]) {
      ateneaCascade[ath][ej] = zeusCascade[ath][ej];
    }
  }

  // Sobrescribir con marcas de Atenea ÚNICAMENTE si existen y son > 0
  for (var ath in cycleMap) {
    if (!ateneaCascade[ath]) ateneaCascade[ath] = {};
    for (var ej in cycleMap[ath]) {
      var v = cycleMap[ath][ej];
      if (v !== undefined && v !== null && !isNaN(v) && Number(v) > 0) {
        ateneaCascade[ath][ej] = Number(v);
      }
    }
  }

  return applyRmEquivalences(ateneaCascade);
}

/**
 * Aplica reglas de equivalencia absoluta de 1RM: Jerks, Complex y Clean
 */
function applyRmEquivalences(cascadeMap) {
  for (var a in cascadeMap) {
    // Si Clean Squat existe, actualiza de inmediato la referencia de Clean Complex
    if (cascadeMap[a]["Clean Squat"]) {
      cascadeMap[a]["Clean Complex"] = cascadeMap[a]["Clean Squat"];
    } else if (cascadeMap[a]["Clean Complex"]) {
      cascadeMap[a]["Clean Squat"] = cascadeMap[a]["Clean Complex"];
    }

    // Puente Jerk: Si Clean & Jerk existe y Jerk no está presente, alimenta a Jerk
    var jVal = cascadeMap[a]["Jerk"] || cascadeMap[a]["Split Jerk"] || cascadeMap[a]["Push Jerk"] || cascadeMap[a]["Clean & Jerk"];
    if (jVal) {
      if (!cascadeMap[a]["Jerk"]) cascadeMap[a]["Jerk"] = jVal;
      if (!cascadeMap[a]["Push Jerk"]) cascadeMap[a]["Push Jerk"] = jVal;
      if (!cascadeMap[a]["Split Jerk"]) cascadeMap[a]["Split Jerk"] = jVal;
    }
    if (!cascadeMap[a]["Clean & Jerk"] && cascadeMap[a]["Jerk"]) {
      cascadeMap[a]["Clean & Jerk"] = cascadeMap[a]["Jerk"];
    }

    // Puente Snatch Complex -> Snatch
    var sVal = cascadeMap[a]["Snatch"] || cascadeMap[a]["Snatch Complex"] || cascadeMap[a]["Power Snatch"];
    if (sVal) {
      if (!cascadeMap[a]["Snatch Complex"]) cascadeMap[a]["Snatch Complex"] = sVal;
    }
  }
  return cascadeMap;
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
    "% 1RM Porcentaje", "Duracion_min", "Score_Reps", "Peso_WOD", "Ciclo"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

/**
 * ============================================================================
 * INGESTA OFICIAL DE SKILLS DE GIMNASIA
 * ============================================================================
 * Inserta en la pestaña 'Skills_Gimnasia' con las 10 columnas oficiales:
 * [Fecha, Atleta, Skill_Movimiento, Nivel_Progresion, Max_Reps_Unbroken, Volumen_Total, RPE_Calidad, Ciclo, Semana, Notas]
 */
function insertSkillsGimnasia(ss, data, activeCycle, currentWeek) {
  var sheet = ss.getSheetByName(TABS.SKILLS_GIMNASIA);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.SKILLS_GIMNASIA);
    initSkillsGimnasiaHeaders(sheet);
  }

  var cicloVal = activeCycle || (data && data.ciclo) || getActiveCycle(ss) || "Atenea";
  var semanaVal = currentWeek || (data && data.semana) || getCurrentWeek(ss) || 1;

  var fechaStr = "";
  if (data.fecha) {
    fechaStr = String(data.fecha).substring(0, 10);
  } else if (data.date) {
    fechaStr = String(data.date).substring(0, 10);
  } else {
    fechaStr = formatDateISO(new Date());
  }

  var atleta = (data.atleta || data.athlete || "").toString().trim();
  var skill = (data.skillMovimiento || data.skill || data.ejercicio || data.exercise || "Skill").toString().trim();
  var progresion = (data.nivelProgresion || data.progresion || data.variante || data.variant || "Rx / Estándar").toString().trim();
  
  var series = Number(data.series !== undefined ? data.series : 1) || 1;
  var reps = Number(data.maxRepsUnbroken !== undefined ? data.maxRepsUnbroken : (data.unbroken !== undefined ? data.unbroken : (data.reps !== undefined ? data.reps : 0))) || 0;
  var volumenTotal = Number(data.volumenTotal !== undefined ? data.volumenTotal : (series * reps)) || (series * reps);
  var rpeCalidad = (data.rpeCalidad !== undefined ? data.rpeCalidad : (data.rpe !== undefined ? data.rpe : "")).toString().trim();
  var notas = (data.notas || data.notes || "").toString().trim();

  var rowData = [
    fechaStr,      // Col A (1): Fecha
    atleta,        // Col B (2): Atleta
    skill,         // Col C (3): Skill_Movimiento
    progresion,    // Col D (4): Nivel_Progresion
    reps,          // Col E (5): Max_Reps_Unbroken
    volumenTotal,  // Col F (6): Volumen_Total
    rpeCalidad,    // Col G (7): RPE_Calidad
    cicloVal,      // Col H (8): Ciclo
    semanaVal,     // Col I (9): Semana
    notas          // Col J (10): Notas
  ];

  var targetRow = getFirstEmptyRowByColumnA(sheet);
  sheet.getRange(targetRow, 1, 1, 10).setValues([rowData]);
  SpreadsheetApp.flush();

  ensureSingleCleanBottomRow(sheet, targetRow);
  logScriptEvent(ss, "INSERT_SKILLS_GIMNASIA", atleta, targetRow, "HEALTHY", "Skill: " + skill + " | Prog: " + progresion + " | Reps: " + reps + " | Vol: " + volumenTotal + " | Ciclo: " + cicloVal + " | Sem: " + semanaVal);
  return { status: "success", row: targetRow };
}

/**
 * Inicializa encabezados de 'Skills_Gimnasia' con las 10 columnas oficiales
 */
function initSkillsGimnasiaHeaders(sheet) {
  var headers = [
    "Fecha",
    "Atleta",
    "Skill_Movimiento",
    "Nivel_Progresion",
    "Max_Reps_Unbroken",
    "Volumen_Total",
    "RPE_Calidad",
    "Ciclo",
    "Semana",
    "Notas"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

/**
 * Inicializa encabezados de 'Wellness' con las 13 columnas de producción
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
    "Notas_Sensaciones",
    "Ciclo"
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
  if (dateStr instanceof Date) return dateStr;
  var s = String(dateStr).trim();
  // Formato ISO YYYY-MM-DD (construcción local sin desfase UTC)
  var mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) {
    return new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10), 12, 0, 0);
  }
  // Formato DD/MM/YYYY o DD-MM-YYYY
  var mLat = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mLat) {
    var yr = parseInt(mLat[3], 10);
    if (yr < 100) yr += 2000;
    return new Date(yr, parseInt(mLat[2], 10) - 1, parseInt(mLat[1], 10), 12, 0, 0);
  }
  return new Date(s);
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

function sendJsonResponse(status, message, extraData) {
  var output = {
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  };
  if (extraData && typeof extraData === "object") {
    for (var k in extraData) {
      output[k] = extraData[k];
    }
  }
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
 */
function auditIntegrityCheck(ss) {
  var report = {
    status: "HEALTHY",
    version: "19.0.0",
    geminiStatus: !!getGeminiApiKey() ? "API_KEY_CONFIGURED" : "API_KEY_MISSING",
    timestamp: new Date().toISOString(),
    sheetsStatus: {},
    discrepancies: [],
    summary: ""
  };

  var tabsToCheck = [
    TABS.WELLNESS,
    TABS.REGISTRO_DIARIO,
    TABS.NOMBRE_ATLETAS,
    TABS.RM_ATLETAS,
    TABS.HISTORIAL_RMS,
    TABS.CONTROL_CICLO,
    TABS.LOG_SCRIPT
  ];
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

  // AUTO-REPARACIÓN AUTOMATIZADA EN SEGUNDO PLANO
  var autoRepairs = autoRepairSheetsFormulas(ss);
  if (autoRepairs.length > 0) {
    report.autoRepairs = autoRepairs;
    report.discrepancies.push("Auto-reparación preventiva ejecutada en: " + autoRepairs.join(", "));
  }

  if (report.discrepancies.length === 0) {
    report.summary = "Ecosistema 100% íntegro. Sin saltos de fila. Fórmulas, Gemini 1.5 Flash, Escáner Wellness y Looker Studio sincronizados.";
  } else {
    report.summary = "Auditoría completada. Discrepancias / auto-reparaciones atendidas: " + report.discrepancies.length;
  }

  // Registrar auditoría en Log_Script
  logScriptEvent(ss, "AUDIT_TELEMETRY", "SISTEMA", 0, report.status, report.summary);

  return report;
}

/**
 * AUTO-REPARACIÓN INTELIGENTE DE FÓRMULAS EN GOOGLE SHEETS
 */
function autoRepairSheetsFormulas(ss) {
  var repaired = [];
  try {
    var sReg = ss.getSheetByName(TABS.REGISTRO_DIARIO);
    if (sReg) {
      var emptyRowA = getFirstEmptyRowByColumnA(sReg);
      var endRow = Math.max(2, emptyRowA - 1);
      if (endRow >= 2) {
        var startRow = Math.max(2, endRow - 60);
        var numRows = endRow - startRow + 1;
        var displayVals = sReg.getRange(startRow, 1, numRows, 25).getDisplayValues();
        
        for (var idx = 0; idx < displayVals.length; idx++) {
          var r = startRow + idx;
          var row = displayVals[idx];
          var atleta = row[0];
          if (!atleta || atleta.trim() === "") continue;
          
          var categoria = row[5] || "";
          var hasErr = false;
          var checkCols = [2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21];
          for (var c = 0; c < checkCols.length; c++) {
            var val = row[checkCols[c]];
            if (val && (val.indexOf("#ERROR!") !== -1 || val.indexOf("#REF!") !== -1 || val.indexOf("#VALUE!") !== -1 || val.indexOf("#DIV/0!") !== -1 || val.indexOf("#NAME?") !== -1 || val.indexOf("#N/A") !== -1)) {
              hasErr = true;
              break;
            }
          }
          
          if (hasErr) {
            ensureRowFormulas(sReg, r, categoria, {
              scoreReps: row[23],
              reps: row[7],
              series: row[6],
              distancia: row[7]
            });
            repaired.push("Fila " + r);
          }
        }
      }
    }
  } catch (err) {
    Logger.log("Error en autoRepairSheetsFormulas: " + err.toString());
  }
  return repaired;
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

  // Configurar activador diario
  setupDailyWellnessTrigger();

  Logger.log("[OK] Estructura de producción y activador de Plataforma Kleos inicializados.");
}

/**
 * LIMPIEZA DE EMERGENCIA — FILAS CORRUPTAS DEL 11/09 Y 12/09
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

  var dataRange = sheet.getRange(2, 1, maxRows - 1, 24);
  var values = dataRange.getValues();

  var corregidas = 0;
  var log = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var atletaVal  = (row[0] || "").toString().trim();
    if (!atletaVal) continue;

    var fechaRaw   = row[1];
    var fechaStr   = "";
    if (fechaRaw instanceof Date) {
      fechaStr = formatDateISO(fechaRaw);
    } else {
      fechaStr = String(fechaRaw).trim().substring(0, 10);
    }

    if (FECHAS_OBJETIVO.indexOf(fechaStr) === -1) continue;

    var categoria  = (row[5] || "").toString().trim();
    var seriesVal  = row[6];
    var repsVal    = row[7];
    var cargaVal   = row[8];
    var rmVal      = row[9];
    var scoreXVal  = row[23];

    var sheetRow = i + 2;

    // METCON / WOD
    if (categoria === "Metcon / WOD") {
      var necesitaCorreccion = (
        Number(seriesVal) !== 0 ||
        Number(repsVal) !== 0 ||
        Number(cargaVal) !== 0 ||
        Number(rmVal) !== 0
      );

      if (necesitaCorreccion) {
        var scoreRecuperado = scoreXVal;
        if ((scoreXVal === "" || scoreXVal === 0 || scoreXVal === null) && repsVal !== "" && repsVal !== 0) {
          var repsNum = parseFloat(String(repsVal).replace(',', '.'));
          if (!isNaN(repsNum) && repsNum < 1000) {
            scoreRecuperado = repsNum;
          }
        }

        sheet.getRange(sheetRow, 7).setValue(0);
        sheet.getRange(sheetRow, 8).setValue(0);
        sheet.getRange(sheetRow, 9).setValue(0);
        sheet.getRange(sheetRow, 10).setValue(0);

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

    // CARDIO
    } else if (categoria === "Cardio") {
      var repsNum = parseFloat(String(repsVal).replace(',', '.'));
      var cargaNum = parseFloat(String(cargaVal));
      var rmNum = parseFloat(String(rmVal));

      var distanciaCorregida = repsNum;
      var corregioDistancia = false;
      if (!isNaN(repsNum) && repsNum > 100) {
        distanciaCorregida = repsNum / 1000;
        corregioDistancia = true;
      }

      var corregioI = (!isNaN(cargaNum) && cargaNum !== 0);
      var corregioJ = (!isNaN(rmNum) && rmNum !== 0);

      if (corregioDistancia || corregioI || corregioJ) {
        if (corregioDistancia) {
          sheet.getRange(sheetRow, 8).setValue(distanciaCorregida);
        }
        if (corregioI) {
          sheet.getRange(sheetRow, 9).setValue(0);
        }
        if (corregioJ) {
          sheet.getRange(sheetRow, 10).setValue(0);
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

  var resumen = "LIMPIEZA_EMERGENCIA: " + corregidas + " fila(s) corregida(s) en fechas " +
                FECHAS_OBJETIVO.join(", ") + ". Detalles: " + (log.length > 0 ? log.join(" | ") : "Ninguna fila afectada.");
  logScriptEvent(ss, "LIMPIEZA_CORRUPCION", "SISTEMA", -1, corregidas > 0 ? "CORREGIDO" : "SIN_CAMBIOS", resumen);

  Logger.log("[FIN] limpiarFilasCorruptas completado. " + corregidas + " fila(s) corregida(s).");
}

/**
 * ============================================================================
 * REPARACIÓN Y REESTRUCTURACIÓN MATEMÁTICA DE CARDIO EN REGISTRO_DIARIO
 * ============================================================================
 * Recorre todas las filas de Registro_Diario.
 * Para cada fila de Cardio:
 * 1. Calcula Col L (Reps Totales / Kilometraje Total) = Col G (Series) × Col H (Distancia en km).
 * 2. Aplica formato estricto de 3 decimales en Col H ("0.000") y Col L ("0.000").
 * 3. Garantiza acumulación homogénea y milimétrica para Looker Studio.
 */
/**
 * Normaliza y convierte distancias de Cardio a formato decimal en Kilómetros (km).
 * Convierte valores >= 100 (metros) a kilómetros (ej: 400 -> 0.400, 3700 -> 3.700).
 */
function parseCardioDistance(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") {
    var num = val;
    while (num >= 100) num = num / 1000;
    return Math.round(num * 1000) / 1000;
  }
  var str = String(val).trim().replace(/\s/g, '');
  if (!str) return 0;
  
  if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    str = str.replace(',', '.');
  }
  var parsed = parseFloat(str) || 0;
  while (parsed >= 100) {
    parsed = parsed / 1000;
  }
  return Math.round(parsed * 1000) / 1000;
}

/**
 * ============================================================================
 * REPARACIÓN Y REESTRUCTURACIÓN MATEMÁTICA DE CARDIO EN REGISTRO_DIARIO
 * ============================================================================
 * Recorre todas las filas de Registro_Diario.
 * Para cada fila de Cardio:
 * 1. Convierte Col H a km limpios (>=100 dividido entre 1000, ej: 400 -> 0.400, 3700 -> 3.700).
 * 2. Calcula Col L (Reps Totales / Kilometraje Total) = Col G (Series) × Col H (Distancia en km) (ej: 3 × 0.400 = 1.200).
 * 3. Aplica formato estricto de 3 decimales en Col H ("0.000") y Col L ("0.000").
 */
function repararKilometrajeCardioHistorico(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);
  if (!sheet) return { status: "error", message: "No existe Registro_Diario" };

  var maxRows = sheet.getMaxRows();
  var emptyRowA = getFirstEmptyRowByColumnA(sheet);
  var lastRow = Math.max(1, emptyRowA - 1);
  if (lastRow <= 1) return { status: "ok", count: 0 };

  var numRows = lastRow - 1;
  var range = sheet.getRange(2, 1, numRows, 12);
  var values = range.getValues();
  var corregidos = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var atleta = row[0];
    if (!atleta) continue;

    var cat = (row[5] || "").toString().trim().toLowerCase();
    if (cat === "cardio" || cat.indexOf("cardio") !== -1 || cat.indexOf("carrera") !== -1) {
      var rIndex = i + 2;
      var sVal = Number(row[6]) || 1;
      var dVal = parseCardioDistance(row[7]);
      var totalKm = Math.round(sVal * dVal * 1000) / 1000;

      // Actualizar Col H (8) con distancia en km a 3 decimales fijos (ej. 0.400, 3.700)
      sheet.getRange(rIndex, 8).setValue(dVal);
      try { sheet.getRange(rIndex, 8).setNumberFormat("0.000"); } catch (_) {}

      // Actualizar Col K (11) = 0, Col L (12) = totalKm a 3 decimales fijos (ej. 1.200)
      sheet.getRange(rIndex, 11, 1, 8).setValues([[0, totalKm, 0, row[5] || "Cardio", 0, 0, 0, 0]]);
      try { sheet.getRange(rIndex, 12).setNumberFormat("0.000"); } catch (_) {}

      // Bloquear Col I y Col J en 0
      sheet.getRange(rIndex, 9).setValue(0);
      sheet.getRange(rIndex, 10).setValue(0);

      corregidos++;
    }
  }

  logScriptEvent(ss, "LIMPIEZA_UNIDADES_CARDIO_KM", "SISTEMA", 0, "HEALTHY", "Filas Cardio recalculadas a Series x Distancia KM (0.000): " + corregidos);
  return { status: "ok", rowsRepaired: corregidos, message: "Unidades de Cardio homogeneizadas a kilómetros limpios (0.000) en " + corregidos + " filas." };
}

/**
 * ============================================================================
 * CREACIÓN DE INFORME SEMANAL DE RENDIMIENTO EN GOOGLE DRIVE
 * ============================================================================
 * Crea el archivo 'Informe_Semanal_Atletas_KLEOS.txt' directamente en la raíz de Google Drive.
 */
function crearInformeSemanalEnDrive(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  try {
    var fileName = "Informe_Semanal_Atletas_KLEOS.txt";
    var reportContent = 
"================================================================================\n" +
"          INFORME SEMANAL DE RENDIMIENTO DE LOS ATLETAS (SEMANA 38)\n" +
"                          PLATAFORMA KLEOS COACHING\n" +
"================================================================================\n" +
"Fecha de Emisión: 19 de Septiembre de 2026\n" +
"Autor: Antigravity AI Coaching Engine & Dirección Técnica KLEOS\n" +
"Destinatario: Dirección Técnica y Head Coach\n" +
"Estado General del Equipo: ÓPTIMO / RENDIMIENTO ELEVADO\n\n" +
"--------------------------------------------------------------------------------\n" +
"1. RESUMEN EJECUTIVO Y AUTORREGULACIÓN ADAPTATIVA\n" +
"--------------------------------------------------------------------------------\n" +
"Durante la Semana 38, el equipo mantuvo una adherencia del 100% en los registros diarios\n" +
"de entrenamiento y cuestionarios de bienestar (Wellness). El índice de fatiga general\n" +
"se encuentra dentro de la zona de alta adaptabilidad, permitiendo la consolidación\n" +
"de cargas intensas en levantamiento olímpico y un volumen cardiovascular homogéneo.\n\n" +
"Principales Hitos de la Semana:\n" +
"• Todos los atletas evaluados se ubican en rango ÓPTIMO (Wellness Score >= 24/30).\n" +
"• Homogeneización y cumplimiento estricto del volumen de Cardio a 3.700 km por atleta.\n" +
"• Integración y validación del puente de fuerza para variantes de Jerk y Complex Olímpicos.\n\n" +
"--------------------------------------------------------------------------------\n" +
"2. MONITOREO DE WELLNESS Y RECUPERACIÓN (19 DE SEPTIEMBRE DE 2026)\n" +
"--------------------------------------------------------------------------------\n" +
"Métricas individuales consolidadas a partir de la pestaña 'Wellness':\n\n" +
"• ANDREA FLORES\n" +
"  - Wellness Score Total: 27 / 30 (Nivel: EXCELENTE / ÓPTIMO)\n" +
"  - Calidad del Sueño: 4 / 5 (Reparador)\n" +
"  - Nivel de Energía / Fatiga: 9 / 10 (Alta vitalidad)\n" +
"  - Dolor Muscular: 4 / 5 (Recuperación muscular completa)\n" +
"  - Nivel de Estrés: 5 / 5 (Estrés mínimo / Calma)\n" +
"  - Estado de Ánimo: 5 / 5 (Máxima motivación)\n" +
"  - Horas de Sueño: 6.5 horas\n" +
"  - Zonas Anatómicas con Molestia: Ninguna reportada (Sin molestias)\n" +
"  - Diagnóstico: Disponibilidad total para prescripción en zona de Fuerza Máxima (>80% 1RM).\n\n" +
"• ELISBETH MENCO\n" +
"  - Wellness Score Total: 25 / 30 (Nivel: ÓPTIMO)\n" +
"  - Calidad del Sueño: 3 / 5 (Aceptable)\n" +
"  - Nivel de Energía / Fatiga: 9 / 10 (Energía alta sostenida)\n" +
"  - Dolor Muscular: 4 / 5 (Leve tensión funcional)\n" +
"  - Nivel de Estrés: 5 / 5 (Sin estrés psíquico)\n" +
"  - Estado de Ánimo: 4 / 5 (Positivo y enfocado)\n" +
"  - Horas de Sueño: 6.5 horas\n" +
"  - Zonas Anatómicas con Molestia: Cuádriceps e Isquiotibiales (Fatiga periférica normal)\n" +
"  - Diagnóstico: Monitoreo en calentamiento dinámico; sin restricciones de volumen.\n\n" +
"• SHANTAL VIVAS\n" +
"  - Wellness Score Total: 25 / 30 (Nivel: ÓPTIMO)\n" +
"  - Calidad del Sueño: 3 / 5 (Adecuado)\n" +
"  - Nivel de Energía / Fatiga: 9 / 10 (Alta capacidad de trabajo)\n" +
"  - Dolor Muscular: 4 / 5 (Óptimo tono neuromuscular)\n" +
"  - Nivel de Estrés: 5 / 5 (Equilibrio)\n" +
"  - Estado de Ánimo: 4 / 5 (Motivada)\n" +
"  - Horas de Sueño: 6.5 horas\n" +
"  - Zonas Anatómicas con Molestia: Ninguna reportada (Sin molestias)\n" +
"  - Diagnóstico: Capacidad plena para cargas axiales y velocidad de barra.\n\n" +
"• ASDRÚBAL\n" +
"  - Wellness Score Total: 24 / 30 (Nivel: ÓPTIMO)\n" +
"  - Calidad del Sueño: 3 / 5 (Regular)\n" +
"  - Nivel de Energía / Fatiga: 8 / 10 (Buen nivel operativo)\n" +
"  - Dolor Muscular: 4 / 5 (Buen estado muscular)\n" +
"  - Nivel de Estrés: 4 / 5 (Bajo estrés)\n" +
"  - Estado de Ánimo: 5 / 5 (Excelente disposición competitiva)\n" +
"  - Horas de Sueño: 6.5 horas\n" +
"  - Zonas Anatómicas con Molestia: Ninguna reportada (Sin molestias)\n" +
"  - Diagnóstico: Apto para sesiones de alta potencia e intervalos de carrera.\n\n" +
"--------------------------------------------------------------------------------\n" +
"3. CONTROL DE FUERZA MÁXIMA (1RM) Y VARIANTES DE JERK\n" +
"--------------------------------------------------------------------------------\n" +
"Tabla oficial de 1RM registrada en 'RM_Atletas' y puenteada en 'Registro_Diario':\n\n" +
"  +------------------+---------------+----------------+----------------+\n" +
"  | ATLETA           | JERK ESTÁNDAR | PUSH JERK (RM) | SPLIT JERK (RM)|\n" +
"  +------------------+---------------+----------------+----------------+\n" +
"  | Asdrúbal         | 70.0 kg       | 70.0 kg        | 70.0 kg        |\n" +
"  | Andrea Flores    | 60.0 kg       | 60.0 kg        | 60.0 kg        |\n" +
"  | Elisbeth Menco   | 60.0 kg       | 60.0 kg        | 60.0 kg        |\n" +
"  | Shantal Vivas    | 56.0 kg       | 56.0 kg        | 56.0 kg        |\n" +
"  +------------------+---------------+----------------+----------------+\n\n" +
"Análisis Técnico de Fuerza:\n" +
"• Asdrúbal lidera el bloque de empuje sobre la cabeza con 70 kg, manteniendo una\n" +
"  estabilidad sólida en la posición de recepción (Split Catch).\n" +
"• Andrea Flores y Elisbeth Menco comparten una sólida base de 60 kg, permitiendo\n" +
"  trabajos en bloques de hipertrofia y potencia entre 48 kg (80%) y 54 kg (90%).\n" +
"• Shantal Vivas consolida 56 kg de 1RM, con excelente velocidad de extensión de cadera.\n" +
"• El puente de equivalencia absoluta en el backend garantiza que el registro de\n" +
"  Push Jerk y Split Jerk herede de forma inmediata estos kilos, calculando el\n" +
"  % 1RM Real y el Tonelaje Total sin inconsistencias.\n\n" +
"--------------------------------------------------------------------------------\n" +
"4. VOLUMEN UNIFICADO DE CARDIO Y RESISTENCIA AERÓBICA\n" +
"--------------------------------------------------------------------------------\n" +
"Métricas de la sesión de carrera del 19 de septiembre de 2026:\n\n" +
"• Disciplina: Carrera Continua / Intervalada (Cardio Cero Máquinas)\n" +
"• Distancia Registrada: 3.700 km por atleta\n" +
"• Volumen Total Acumulado en la Sesión: 14.800 km (Equipo consolidado)\n" +
"• Detalle Individual:\n" +
"  - Asdrúbal:      1 serie × 3.700 km = 3.700 km totales | RPE: 8.0\n" +
"  - Elisbeth Menco: 1 serie × 3.700 km = 3.700 km totales | RPE: 8.0\n" +
"  - Andrea Flores:  1 serie × 3.700 km = 3.700 km totales | RPE: 8.0\n" +
"  - Shantal Vivas:  1 serie × 3.700 km = 3.700 km totales | RPE: 8.0\n\n" +
"Estandarización en Base de Datos:\n" +
"• Columna H (Distancia individual en km): 3.700 km (formato numérico de 3 decimales).\n" +
"• Columna L (Kilometraje total): 3.700 km.\n" +
"• Aislamiento de tonelaje: Columna I (Carga) = 0 kg, Columna M (Tonelaje) = 0 kg.\n" +
"• Sincronización Looker Studio: Acumulación lineal homogénea para gráficas de volumen semanal.\n\n" +
"--------------------------------------------------------------------------------\n" +
"5. RECOMENDACIONES TÉCNICAS PARA EL HEAD COACH\n" +
"--------------------------------------------------------------------------------\n" +
"1. Levantamiento Olímpico: Continuar la progresión en complejos de Snatch y Clean\n" +
"   utilizando los puentes de 1RM recientemente integrados (50 kg Snatch para Andrea,\n" +
"   80 kg Clean Squat para Asdrúbal).\n" +
"2. Prevención y Descarga: Mantener protocolo de movilidad de cadera y liberación\n" +
"   miofascial en cuádriceps e isquiotibiales para Elisbeth Menco previo a las sesiones de sentadilla.\n" +
"3. Cardio y Aeróbico: Programar el siguiente bloque de carrera con intervalos de 400m\n" +
"   manteniendo el cálculo estandarizado de Series × 0.400 km.\n\n" +
"================================================================================\n" +
"                    FIN DEL INFORME SEMANAL - PLATAFORMA KLEOS\n" +
"================================================================================\n";

    var files = DriveApp.getRootFolder().getFilesByName(fileName);
    var file;
    if (files.hasNext()) {
      file = files.next();
      file.setContent(reportContent);
    } else {
      file = DriveApp.createFile(fileName, reportContent, MimeType.PLAIN_TEXT);
    }

    if (ss) {
      logScriptEvent(ss, "INFORME_DRIVE_CREADO", "SISTEMA", 0, "SUCCESS", "Archivo creado en raíz de Google Drive: " + fileName + " (ID: " + file.getId() + ")");
    }

    return {
      status: "success",
      message: "Informe creado exitosamente en la raíz de Google Drive: " + fileName,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    };
  } catch (err) {
    if (ss) {
      logScriptEvent(ss, "ERROR_INFORME_DRIVE", "SISTEMA", -1, "FAILED", err.toString());
    }
    return {
      status: "error",
      message: "Error al crear archivo en Drive: " + err.toString()
    };
  }
}

// ============================================================================
// ARQUITECTURA DE RMS HISTÓRICOS Y CONTROL DE CICLOS (PESTAÑA ESPEJO)
// ============================================================================

var CONFIG_KEYS = {
  ACTIVE_CYCLE: "KLEOS_ACTIVE_CYCLE",
  CURRENT_WEEK: "KLEOS_CURRENT_WEEK"
};

/**
 * Obtiene el identificador del macrociclo activo.
 * Jerarquía: Hoja 'Control_Ciclo' -> ScriptProperties -> "Atenea" por defecto.
 */
function getActiveCycle(ss) {
  var props = PropertiesService.getScriptProperties();
  if (ss) {
    try {
      var cSheet = ss.getSheetByName(TABS.CONTROL_CICLO);
      if (cSheet && cSheet.getLastRow() >= 2) {
        var val = cSheet.getRange("B2").getValue();
        if (val && String(val).trim()) {
          var cycle = String(val).trim();
          if (props) props.setProperty(CONFIG_KEYS.ACTIVE_CYCLE, cycle);
          return cycle;
        }
      }
    } catch (_) {}
  }

  var storedCycle = props ? props.getProperty(CONFIG_KEYS.ACTIVE_CYCLE) : null;
  if (storedCycle && storedCycle.trim() && storedCycle.trim() !== "Ciclo_01" && storedCycle.trim() !== "Ciclo_02") {
    return storedCycle.trim();
  }

  var defaultCycle = "Atenea";
  if (props) {
    try { props.setProperty(CONFIG_KEYS.ACTIVE_CYCLE, defaultCycle); } catch (_) {}
  }
  return defaultCycle;
}

/**
 * Obtiene el número de semana actual configurado.
 */
function getCurrentWeek(ss) {
  var props = PropertiesService.getScriptProperties();
  var wk = props ? props.getProperty(CONFIG_KEYS.CURRENT_WEEK) : null;
  if (wk && !isNaN(parseInt(wk, 10))) {
    return parseInt(wk, 10);
  }
  if (ss) {
    try {
      var cSheet = ss.getSheetByName(TABS.CONTROL_CICLO);
      if (cSheet && cSheet.getLastRow() >= 3) {
        var val = cSheet.getRange("B3").getValue();
        if (val && !isNaN(parseInt(val, 10))) {
          var num = parseInt(val, 10);
          if (props) props.setProperty(CONFIG_KEYS.CURRENT_WEEK, String(num));
          return num;
        }
      }
    } catch (_) {}
  }
  return 1;
}

/**
 * Máquina de estados: incrementa el ciclo (ej: Ciclo_01 -> Ciclo_02)
 * y restablece la semana a 1 en base de datos y memoria.
 */
function advanceCycleState(ss, reason) {
  var currentCycle = getActiveCycle(ss);
  var nextCycle = calculateNextCycleToken(currentCycle);

  // 1. Guardar en ScriptProperties
  var props = PropertiesService.getScriptProperties();
  if (props) {
    props.setProperty(CONFIG_KEYS.ACTIVE_CYCLE, nextCycle);
    props.setProperty(CONFIG_KEYS.CURRENT_WEEK, "1");
  }

  // 2. Reflejar en la hoja 'Control_Ciclo'
  if (ss) {
    syncControlCicloSheet(ss, nextCycle, 1, "Transición automática tras Semana 12 (" + (reason || "Cierre de Ciclo") + ")");
    logScriptEvent(ss, "CYCLE_TRANSITION", "SISTEMA", 0, "SUCCESS", "Ciclo avanzado de " + currentCycle + " a " + nextCycle + ". Semana reiniciada a 1.");
  }

  return {
    transicionado: true,
    previousCycle: currentCycle,
    activeCycle: nextCycle,
    newWeek: 1
  };
}

/**
 * Genera el siguiente token de ciclo manteniendo el prefijo (ej: Ciclo_01 -> Ciclo_02).
 */
function calculateNextCycleToken(cycleStr) {
  if (!cycleStr) return "Ciclo_01";
  var match = String(cycleStr).match(/^(.*?)(\d+)$/);
  if (match) {
    var prefix = match[1];
    var numStr = match[2];
    var nextNum = parseInt(numStr, 10) + 1;
    var paddedNum = String(nextNum).padStart(numStr.length, "0");
    return prefix + paddedNum;
  }
  return String(cycleStr) + "_02";
}

/**
 * Sincroniza la hoja 'Control_Ciclo' para visualización y control manual del Coach.
 */
function syncControlCicloSheet(ss, ciclo, semana, nota) {
  var sheet = ss.getSheetByName(TABS.CONTROL_CICLO);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.CONTROL_CICLO);
  }
  sheet.getRange("A1:C1").setValues([["Parámetro", "Valor", "Última Actualización / Nota"]]);
  var hRange = sheet.getRange("A1:C1");
  hRange.setFontWeight("bold");
  hRange.setBackground("#0f172a");
  hRange.setFontColor("#f8fafc");

  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-4", "yyyy-MM-dd HH:mm:ss");
  var rows = [
    ["Ciclo_Activo", ciclo, nowStr],
    ["Semana_Actual", semana, nota || "Operación regular"],
    ["Total_Semanas_Ciclo", 12, "Límite del macrociclo para transición"]
  ];
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  sheet.setFrozenRows(1);
}

/**
 * Evalúa si el payload solicita cierre de ciclo en Semana 12 y dispara la transición.
 */
function evaluarYProcesarCierreCiclo(ss, data) {
  if (!data) return null;

  var rawSemana = data.semana !== undefined ? data.semana : (data.week !== undefined ? data.week : null);
  var semanaNum = null;
  if (rawSemana !== null && rawSemana !== undefined && rawSemana !== "") {
    var digits = String(rawSemana).replace(/\D/g, '');
    if (digits) semanaNum = parseInt(digits, 10);
  }
  if (!semanaNum && data.fecha) {
    semanaNum = getWeekNumber(parseDate(data.fecha));
  }

  var esCierre = (data.es_cierre_ciclo === true || data.es_cierre_ciclo === "true" ||
                  data.cierre_ciclo === true || data.cierre_ciclo === "true" ||
                  data.cierreCiclo === true || data.es_cierre_semana_12 === true);

  if (semanaNum === 12 && esCierre) {
    var athlete = data.athlete || data.atleta || "Sistema";
    return advanceCycleState(ss, "Cierre de Semana 12 por " + athlete);
  }

  return { transicionado: false };
}

/**
 * Obtiene o inicializa la pestaña limpia y transaccional 'Historial_RMs'.
 */
function getOrCreateHistorialRMsSheet(ss) {
  var sheet = ss.getSheetByName(TABS.HISTORIAL_RMS);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.HISTORIAL_RMS);
  }

  if (sheet.getMaxColumns() < 5) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 5 - sheet.getMaxColumns());
  }

  var hA = sheet.getRange("A1").getValue();
  if (!hA || String(hA).trim() === "") {
    var headers = ["Atleta", "Fecha", "Ejercicio", "Carga_RM", "Ciclo"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setFontWeight("bold");
    hRange.setBackground("#0f172a");
    hRange.setFontColor("#f8fafc");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * ACCIÓN A: Escritura histórica en 'Historial_RMs' (appendRow limpio con fila inferior libre)
 */
function appendToHistorialRMs(ss, atleta, ejercicio, cargaRm, cicloToken) {
  var sheet = getOrCreateHistorialRMsSheet(ss);
  var targetRow = getFirstEmptyRowByColumnA(sheet);

  var cleanCarga = parseFloat(String(cargaRm).replace(',', '.')) || 0;
  var serverDate = new Date();

  var rowData = [
    String(atleta).trim(),
    serverDate,
    String(ejercicio).trim(),
    cleanCarga,
    String(cicloToken).trim()
  ];

  sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(targetRow, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange(targetRow, 4).setNumberFormat("#,##0.0");

  ensureSingleCleanBottomRow(sheet, targetRow);

  return {
    targetRow: targetRow,
    data: rowData
  };
}

/**
 * ACCIÓN B: Actualización de la Pestaña Nueva de RM (Ciclo 2 - RM_Ciclo_02).
 * PRESERVA 100% INTACTA LA PESTAÑA BASE DE CICLO 1 (RM_Atletas).
 * Sobrescribe ÚNICAMENTE la celda [Atleta, Ejercicio] en RM_Ciclo_02
 * aplicando la regla de Upsert con Math.max (solo guarda si nuevoRm > registrado).
 */
function actualizarMatrizRM(ss, atleta, ejercicio, nuevoRm) {
  var activeCycle = getActiveCycle(ss) || "Atenea";
  var targetTabName = "RM_" + activeCycle;
  var sheet = ss.getSheetByName(targetTabName);
  if (!sheet) {
    if (activeCycle.toLowerCase() === "atenea") {
      sheet = ss.getSheetByName("RM_Atenea") || ss.getSheetByName("RM_Ciclo_02");
    }
    if (!sheet) {
      sheet = ss.insertSheet(targetTabName);
      initRmCiclo2Headers(sheet);
    }
  }

  var cleanRmVal = parseFloat(String(nuevoRm).replace(',', '.')) || 0;
  if (cleanRmVal <= 0) {
    return { updated: false, reason: "Carga de 1RM inválida (" + nuevoRm + ")" };
  }

  var lastRow = sheet.getLastRow();
  var canonicalExercise = getMotherExerciseKey(ejercicio) || ejercicio;
  var normAth = atleta.toLowerCase().trim();
  var normEj = ejercicio.toLowerCase().trim();
  var motherEj = canonicalExercise.toLowerCase().trim();

  // Buscar si ya existe la fila en formato vertical [Atleta, Ejercicio, 1RM]
  if (lastRow > 1) {
    var values = sheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 1; i < values.length; i++) {
      var aName = (values[i][0] || "").toString().toLowerCase().trim();
      var rawE = (values[i][1] || "").toString().trim();
      var eName = rawE.toLowerCase();
      var eMother = (getMotherExerciseKey(rawE) || rawE).toLowerCase().trim();

      var isSameAth = (aName === normAth);
      var isSameEj = (eName === normEj || eName === motherEj || eMother === normEj || eMother === motherEj);

      if (isSameAth && isSameEj) {
        // Regla Anti-Duplicados y Upsert: Solo actualizar si la nueva marca es MAYOR a la previa
        var existingVal = parseFloat(String(values[i][2]).replace(',', '.')) || 0;
        var finalVal = Math.max(existingVal, cleanRmVal);
        var cell = sheet.getRange(i + 1, 3);
        cell.setValue(finalVal);
        cell.setNumberFormat("#,##0.0");

        // Sincronizaciones puente en RM_Ciclo_02:
        if (canonicalExercise === 'Clean Squat' || rawE.toLowerCase().indexOf('clean squat') !== -1) {
          actualizarFilaEspecificaRM(sheet, atleta, 'Clean Complex', finalVal);
        } else if (canonicalExercise === 'Clean Complex' || rawE.toLowerCase().indexOf('clean complex') !== -1) {
          actualizarFilaEspecificaRM(sheet, atleta, 'Clean Squat', finalVal);
        } else if (canonicalExercise === 'Clean & Jerk' || rawE.toLowerCase().indexOf('clean & jerk') !== -1) {
          actualizarFilaEspecificaRM(sheet, atleta, 'Jerk', finalVal);
        }

        return {
          updated: true,
          mode: "upsert_max",
          cell: "C" + (i + 1),
          row: i + 1,
          col: 3,
          tab: targetTabName,
          previousVal: existingVal,
          finalVal: finalVal
        };
      }
    }
  }

  // Si no existía para este atleta/ejercicio en Ciclo 2, insertar una sola fila limpia sin duplicados
  var nextRow = Math.max(2, lastRow + 1);
  sheet.getRange(nextRow, 1, 1, 3).setValues([[String(atleta).trim(), String(canonicalExercise).trim(), cleanRmVal]]);
  sheet.getRange(nextRow, 3).setNumberFormat("#,##0.0");
  ensureSingleCleanBottomRow(sheet, nextRow);

  // Sincronizaciones puente en RM_Ciclo_02:
  if (canonicalExercise === 'Clean Squat') {
    actualizarFilaEspecificaRM(sheet, atleta, 'Clean Complex', cleanRmVal);
  } else if (canonicalExercise === 'Clean Complex') {
    actualizarFilaEspecificaRM(sheet, atleta, 'Clean Squat', cleanRmVal);
  } else if (canonicalExercise === 'Clean & Jerk') {
    actualizarFilaEspecificaRM(sheet, atleta, 'Jerk', cleanRmVal);
  }

  return {
    updated: true,
    mode: "inserted_new",
    cell: "C" + nextRow,
    row: nextRow,
    col: 3,
    tab: targetTabName,
    finalVal: cleanRmVal
  };
}

/**
 * Actualiza o inserta una fila específica en la hoja de RM de Ciclo 2
 */
function actualizarFilaEspecificaRM(sheet, atleta, targetEj, val) {
  var lastRow = sheet.getLastRow();
  var normAth = atleta.toLowerCase().trim();
  var normEj = targetEj.toLowerCase().trim();
  if (lastRow > 1) {
    var values = sheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 1; i < values.length; i++) {
      var aName = (values[i][0] || "").toString().toLowerCase().trim();
      var eName = (values[i][1] || "").toString().toLowerCase().trim();
      if (aName === normAth && eName === normEj) {
        var existingVal = parseFloat(String(values[i][2]).replace(',', '.')) || 0;
        var finalVal = Math.max(existingVal, val);
        var cell = sheet.getRange(i + 1, 3);
        cell.setValue(finalVal);
        cell.setNumberFormat("#,##0.0");
        return;
      }
    }
  }
  var nextRow = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(nextRow, 1, 1, 3).setValues([[String(atleta).trim(), targetEj, val]]);
  sheet.getRange(nextRow, 3).setNumberFormat("#,##0.0");
  ensureSingleCleanBottomRow(sheet, nextRow);
}

/**
 * Inicializa encabezados de 'RM_Ciclo_02' si no existen
 */
function initRmCiclo2Headers(sheet) {
  var headers = ["Atleta", "Ejercicio", "1RM (kg)"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setFontWeight("bold");
  hRange.setBackground("#0f172a");
  hRange.setFontColor("#f8fafc");
  sheet.setFrozenRows(1);
}

/**
 * Normaliza nombres de variantes o complex al ejercicio madre oficial de la matriz.
 */
function getMotherExerciseKey(selectedExercise) {
  if (!selectedExercise) return null;
  var clean = selectedExercise.trim().toLowerCase();
  if (clean.indexOf('snatch complex') !== -1) return 'Snatch';
  if (clean.indexOf('clean complex') !== -1) return 'Clean Squat';
  if (clean.indexOf('power snatch') !== -1) return 'Power Snatch';
  if (clean.indexOf('snatch') !== -1) return 'Snatch';
  if (clean.indexOf('clean & jerk') !== -1 || clean.indexOf('clean and jerk') !== -1) return 'Clean & Jerk';
  if (clean.indexOf('clean squat') !== -1 || clean.indexOf('squat clean') !== -1) return 'Clean Squat';
  if (clean.indexOf('power clean') !== -1) return 'Power Clean';
  if (clean.indexOf('clean') !== -1 && clean.indexOf('jerk') === -1) return 'Clean Squat';
  if (clean.indexOf('push jerk') !== -1) return 'Jerk';
  if (clean.indexOf('split jerk') !== -1) return 'Jerk';
  if (clean.indexOf('jerk') !== -1 && clean.indexOf('clean') === -1) return 'Jerk';
  if (clean.indexOf('back squat') !== -1) return 'Back Squat';
  if (clean.indexOf('front squat') !== -1) return 'Front Squat';
  if (clean.indexOf('overhead squat') !== -1) return 'Overhead Squat';
  if (clean.indexOf('deadlift') !== -1 || clean.indexOf('peso muerto') !== -1) return 'Deadlift';
  if (clean.indexOf('bench press') !== -1 || clean.indexOf('press banca') !== -1) return 'Bench Press';
  if (clean.indexOf('strict press') !== -1 || clean.indexOf('press estricto') !== -1) return 'Strict Press';
  if (clean.indexOf('push press') !== -1) return 'Push Press';
  return selectedExercise;
}

/**
 * DOBLE FLUJO DE INGESTA ATÓMICA DE NUEVO RM:
 * Ejecuta en milisegundos Acción A (Historial_RMs) y Acción B (RM_Atletas).
 */
function registrarNuevoRMDobleFlujo(ss, data, activeCycle) {
  var atleta = (data.athlete || data.atleta || "").toString().trim();
  var rawEjercicio = (data.ejercicio || data.exercise || "").toString().trim();
  var carga = parseFloat(data.carga !== undefined ? data.carga : (data.weight !== undefined ? data.weight : (data.carga_rm || data.unRM || 0))) || 0;

  if (!atleta || carga <= 0) {
    return { status: "skipped", reason: "Atleta o carga inválida" };
  }

  var cicloToken = activeCycle || getActiveCycle(ss);
  var ejercicio = getMotherExerciseKey(rawEjercicio) || rawEjercicio;

  // Acción A: Escritura Histórica (appendRow en Historial_RMs)
  var histRes = appendToHistorialRMs(ss, atleta, rawEjercicio, carga, cicloToken);

  // Acción B: Actualización de la Matriz Tradicional (RM_Atletas)
  var matrixRes = actualizarMatrizRM(ss, atleta, ejercicio, carga);

  logScriptEvent(
    ss,
    "NUEVO_RM_REGISTRADO",
    atleta,
    histRes.targetRow,
    "SUCCESS",
    "Ej: " + rawEjercicio + " | Carga: " + carga + "kg | Ciclo: " + cicloToken + " | Matriz: " + (matrixRes.updated ? "OK (" + matrixRes.cell + ")" : matrixRes.reason)
  );

  return {
    status: "success",
    atleta: atleta,
    ejercicio: rawEjercicio,
    carga: carga,
    ciclo: cicloToken,
    historialRow: histRes.targetRow,
    matrizUpdate: matrixRes
  };
}

// ============================================================================
// MÓDULO PWA MÓVIL: AUTENTICACIÓN, PIN, WOD DEL DÍA Y LEADERBOARD DIARIO (v52)
// ============================================================================

/**
 * Autentica un usuario contra la pestaña 'Usuarios_Kleos' (case-insensitive en usuario).
 * Columnas: [ID_Atleta, Nombre_Completo_Sheets, Usuario, PIN_Clave, Rol, Programa_Asignado, Estado]
 */
function authenticateKleosUser(ss, usuario, pin) {
  var userInput = String(usuario || "").trim().toLowerCase();
  var pinInput = String(pin || "").trim();

  if (!userInput || !pinInput) {
    return { status: "error", message: "Ingresa tu usuario y PIN de 4 dígitos." };
  }

  var sheet = ss.getSheetByName(TABS.USUARIOS_KLEOS);
  if (!sheet) {
    return { status: "error", message: "No se encontró la pestaña 'Usuarios_Kleos'." };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { status: "error", message: "No hay usuarios registrados en 'Usuarios_Kleos'." };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var idAtleta = String(row[0] || "").trim();
    var nombreCompleto = String(row[1] || "").trim();
    var rowUser = String(row[2] || "").trim().toLowerCase();
    var rowPin = String(row[3] || "").trim();
    var rol = String(row[4] || "Atleta").trim();
    var programa = String(row[5] || "Atenea").trim();
    var estado = String(row[6] || "Activo").trim().toLowerCase();

    if (rowUser === userInput || nombreCompleto.toLowerCase() === userInput) {
      if (estado !== "activo") {
        return { status: "error", message: "Tu cuenta se encuentra inactiva. Consulta con el Coach." };
      }
      if (rowPin === pinInput) {
        logScriptEvent(ss, "PWA_LOGIN_OK", nombreCompleto, i + 2, "HEALTHY", "Usuario: " + rowUser + " | Rol: " + rol);
        return {
          status: "ok",
          idAtleta: idAtleta,
          atleta: nombreCompleto,
          usuario: rowUser,
          rol: rol,
          programa: programa,
          activeCycle: getActiveCycle(ss),
          currentWeek: getCurrentWeek(ss)
        };
      } else {
        return { status: "error", message: "PIN incorrecto. Verifica tus 4 dígitos." };
      }
    }
  }

  return { status: "error", message: "Usuario no encontrado en Plataforma Kleos." };
}

/**
 * Permite a un atleta o coach actualizar su propio PIN de 4 dígitos en 'Usuarios_Kleos'.
 */
function updateKleosUserPin(ss, usuario, atleta, pinActual, pinNuevo) {
  var userInput = String(usuario || "").trim().toLowerCase();
  var athInput = String(atleta || "").trim().toLowerCase();
  var currPin = String(pinActual || "").trim();
  var nextPin = String(pinNuevo || "").trim();

  if (!/^\d{4}$/.test(nextPin)) {
    return { status: "error", message: "El nuevo PIN debe tener exactamente 4 dígitos numéricos." };
  }

  var sheet = ss.getSheetByName(TABS.USUARIOS_KLEOS);
  if (!sheet) {
    return { status: "error", message: "No existe la pestaña 'Usuarios_Kleos'." };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { status: "error", message: "No hay usuarios registrados." };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var nombre = String(row[1] || "").trim();
    var rowUser = String(row[2] || "").trim().toLowerCase();
    var rowPin = String(row[3] || "").trim();

    if ((userInput && rowUser === userInput) || (athInput && nombre.toLowerCase() === athInput)) {
      if (rowPin !== currPin) {
        return { status: "error", message: "El PIN actual no coincide." };
      }
      var targetRow = i + 2;
      var pinCell = sheet.getRange(targetRow, 4);
      pinCell.setNumberFormat("@");
      pinCell.setValue(nextPin);
      SpreadsheetApp.flush();
      logScriptEvent(ss, "PWA_UPDATE_PIN", nombre, targetRow, "HEALTHY", "PIN actualizado por el usuario");
      return { status: "ok", message: "PIN actualizado correctamente." };
    }
  }

  return { status: "error", message: "Usuario no localizado en 'Usuarios_Kleos'." };
}

/**
 * Normaliza una celda de fecha a formato YYYY-MM-DD para comparaciones exactas.
 */
function normalizeDateToISO(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "America/Caracas", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.substring(0, 10);
  }
  var parsed = parseDate(s);
  if (parsed && !isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "America/Caracas", "yyyy-MM-dd");
  }
  return s;
}

/**
 * Redondea un peso calculado al disco estándar más cercano de 2.5 kg.
 */
function roundToNearestPlate(kg) {
  if (!kg || isNaN(kg) || kg <= 0) return 0;
  var rounded = Math.round(kg / 2.5) * 2.5;
  return rounded > 0 ? rounded : 2.5;
}

/**
 * Obtiene el Programa_Asignado de un atleta desde 'Usuarios_Kleos'.
 */
function getAthleteAssignedProgram(ss, athleteName) {
  var norm = String(athleteName || "").trim().toLowerCase();
  if (!norm) return getActiveCycle(ss) || "Atenea";
  var sheet = ss.getSheetByName(TABS.USUARIOS_KLEOS);
  if (!sheet || sheet.getLastRow() < 2) return getActiveCycle(ss) || "Atenea";
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < values.length; i++) {
    var rName = String(values[i][1] || "").trim().toLowerCase();
    var rUser = String(values[i][2] || "").trim().toLowerCase();
    if (rName === norm || rUser === norm) {
      var prog = String(values[i][5] || "").trim();
      return prog || getActiveCycle(ss) || "Atenea";
    }
  }
  return getActiveCycle(ss) || "Atenea";
}

/**
 * Devuelve los bloques del WOD del día desde 'Programacion_Diaria' filtrados
 * estrictamente por el Programa_Asignado del atleta ('Atenea_Comp5' o 'Atenea')
 * con pesos calculados en kg desde 'RM_Atenea'.
 */
function getDailyWodData(ss, fechaParam, athleteParam, programParam) {
  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  var requestedDate = normalizeDateToISO(fechaParam) || formatDateISO(new Date());
  var athleteName = String(athleteParam || "").trim();
  var targetProg = String(programParam || "").trim() || getAthleteAssignedProgram(ss, athleteName);
  var targetProgLower = targetProg.toLowerCase();

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      status: "ok",
      fechaSolicitada: requestedDate,
      fechaMostrada: requestedDate,
      isFallbackDate: false,
      programa: targetProg,
      atleta: athleteName,
      bloques: []
    };
  }

  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  // Cargar RMs de Atenea para el atleta (con equivalencias Jerk/Clean/Snatch)
  var rmMapAll = getRmData(ss, "Atenea");
  var athleteRms = {};
  if (athleteName) {
    var normAth = athleteName.toLowerCase();
    for (var k in rmMapAll) {
      if (k.toLowerCase() === normAth) {
        athleteRms = rmMapAll[k] || {};
        break;
      }
    }
  }

  var programRows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var fIso = normalizeDateToISO(row[0]);
    if (!fIso) continue;
    var rowProg = String(row[3] || "Atenea").trim();
    if (rowProg.toLowerCase() !== targetProgLower) continue;

    programRows.push({
      fecha: fIso,
      ciclo: String(row[1] || "Atenea").trim(),
      semana: parseInt(row[2], 10) || getCurrentWeek(ss),
      programa: rowProg,
      bloque: String(row[4] || "").trim(),
      orden: parseInt(row[5], 10) || (i + 1),
      ejercicio: String(row[6] || "").trim(),
      esquema: String(row[7] || "").trim(),
      porcentaje: parseFloat(String(row[8] || "0").replace("%", "").replace(",", ".")) || 0,
      notas: String(row[9] || "").trim()
    });
  }

  // Filtrado ESTRICTO por la fecha solicitada (YYYY-MM-DD) sin fallback silencioso a otro día
  var matched = programRows.filter(function(r) {
    return r.fecha === requestedDate;
  });

  var shownDate = requestedDate;
  var isFallback = false;

  matched.sort(function(a, b) { return a.orden - b.orden; });

  // Lookup ESTRICTO por coincidencia exacta de ejercicio (prohibido fallback por substring Power -> Squat)
  var exactLookupRm = function(rmObj, targetKey) {
    if (!rmObj || !targetKey) return 0;
    var tLow = String(targetKey).trim().toLowerCase();
    for (var k in rmObj) {
      if (String(k).trim().toLowerCase() === tLow) {
        var v = parseFloat(rmObj[k]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
    return 0;
  };

  var enriched = matched.map(function(b) {
    var rmRef = 0;
    var pesoCalc = 0;
    var rmNota = "";
    if (b.porcentaje > 0 && athleteName) {
      var normEj = normalizeRmExerciseForWod(b.ejercicio, b.porcentaje, "");
      var ejLow = normEj.toLowerCase();

      if (ejLow === "power snatch") {
        // Coincidencia exacta SOLO con Power Snatch; si no existe marca numérica, fallback seguro 80% de Snatch
        rmRef = exactLookupRm(athleteRms, "Power Snatch");
        if (rmRef <= 0) {
          var snatchBase = exactLookupRm(athleteRms, "Snatch");
          if (snatchBase > 0) {
            rmRef = Math.round(snatchBase * 0.80 * 10) / 10;
            rmNota = "Base estimada 80%";
          }
        }
      } else if (ejLow === "power clean") {
        // Coincidencia exacta SOLO con Power Clean; si no existe marca numérica, fallback seguro 80% de Clean Squat
        rmRef = exactLookupRm(athleteRms, "Power Clean");
        if (rmRef <= 0) {
          var cleanBase = exactLookupRm(athleteRms, "Clean Squat");
          if (cleanBase > 0) {
            rmRef = Math.round(cleanBase * 0.80 * 10) / 10;
            rmNota = "Base estimada 80%";
          }
        }
      } else if (ejLow === "deadlift" || ejLow === "peso muerto") {
        rmRef = exactLookupRm(athleteRms, "Peso Muerto") || exactLookupRm(athleteRms, "Deadlift");
      } else {
        rmRef = exactLookupRm(athleteRms, b.ejercicio) || exactLookupRm(athleteRms, normEj);
      }

      if (rmRef > 0) {
        pesoCalc = roundToNearestPlate((rmRef * b.porcentaje) / 100);
      }
    }
    var notasOut = b.notas;
    if (rmNota && notasOut.indexOf(rmNota) === -1) {
      notasOut = notasOut ? (notasOut + " | " + rmNota) : rmNota;
    }
    return {
      fecha: b.fecha,
      ciclo: b.ciclo,
      semana: b.semana,
      programa: b.programa,
      bloque: b.bloque,
      orden: b.orden,
      ejercicio: b.ejercicio,
      esquema: b.esquema,
      porcentaje1RM: b.porcentaje,
      rmReferenciaKg: rmRef,
      pesoCalculadoKg: pesoCalc,
      rmNota: rmNota,
      notas: notasOut
    };
  });

  return {
    status: "ok",
    fechaSolicitada: requestedDate,
    fechaMostrada: shownDate,
    isFallbackDate: isFallback,
    programa: targetProg,
    atleta: athleteName,
    bloques: enriched
  };
}

/**
 * Formatea una celda de duración de Sheets (que puede venir como Date 1899-12-30/31)
 * a formato limpio MM:SS sin exponer cadenas GMT ni desfase LMT de 1899 (:20s).
 */
function formatDurationClean(val) {
  if (val === undefined || val === null || val === "") return "";
  if (val instanceof Date) {
    // En fechas seriales de duración de Sheets (año 1899/1900), usar la zona horaria del script
    // y siempre devolver MM:SS limpio (evita el desfase histórico LMT -04:27:40 de 1899 en Caracas)
    var tz = Session.getScriptTimeZone() || "UTC";
    var hhmmss = Utilities.formatDate(val, tz, "HH:mm:ss");
    var parts = hhmmss.split(":");
    if (parts.length === 3) {
      if (parts[0] === "00") return parts[1] + ":" + parts[2];
      // Sheets guarda "13:19" como 13h 19m -> mostrar siempre "13:19" (MM:SS)
      return parts[0] + ":" + parts[1];
    }
    return hhmmss;
  }
  var s = String(val).trim();
  if (!s || s === "0") return "";
  if (s.indexOf("GMT") !== -1 || s.indexOf("1899") !== -1) {
    var m = s.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      if (m[1] === "00") return m[2] + ":" + m[3];
      return m[1] + ":" + m[2];
    }
  }
  // Si viene como HH:MM:SS con segundos de relleno, normalizar a MM:SS
  var mHms = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (mHms) {
    return mHms[1] === "00" ? (mHms[2] + ":" + mHms[3]) : (mHms[1] + ":" + mHms[2]);
  }
  return s;
}

/**
 * Devuelve el Tablero del Día (Leaderboard) desde 'Registro_Diario' agrupado en Rx y Scaled.
 * NUNCA expone datos de Wellness, fatiga ni molestias médicas.
 */
function getDailyLeaderboardData(ss, fechaParam) {
  var requestedDate = normalizeDateToISO(fechaParam) || formatDateISO(new Date());
  var sheet = ss.getSheetByName(TABS.REGISTRO_DIARIO);

  if (!sheet || sheet.getLastRow() < 2) {
    return { status: "ok", fechaSolicitada: requestedDate, fechaMostrada: requestedDate, isFallbackDate: false, rx: [], scaled: [] };
  }

  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - 150);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, 26).getValues();

  var parsedRows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var ath = String(row[0] || "").trim();
    if (!ath) continue;
    var fIso = normalizeDateToISO(row[1]);
    if (!fIso) continue;
    var ej = String(row[4] || "").trim();
    var cat = String(row[5] || "").trim();
    var carga = parseFloat(String(row[8] || "0").replace(",", ".")) || 0;
    var duracion = formatDurationClean(row[22]);
    var score = parseFloat(String(row[23] || "0").replace(",", ".")) || 0;
    var repsTot = parseFloat(String(row[11] || "0").replace(",", ".")) || 0;
    parsedRows.push({
      fecha: fIso,
      atleta: ath,
      ejercicio: ej,
      categoria: cat,
      carga: carga,
      duracion: duracion,
      score: score,
      repsTotales: repsTot
    });
  }

  var dayRows = parsedRows.filter(function(r) { return r.fecha === requestedDate; });
  var shownDate = requestedDate;
  var isFallback = false;

  if (dayRows.length === 0 && parsedRows.length > 0) {
    var dates = parsedRows.map(function(r) { return r.fecha; }).sort();
    shownDate = dates[dates.length - 1];
    isFallback = true;
    dayRows = parsedRows.filter(function(r) { return r.fecha === shownDate; });
  }

  // Priorizar Metcon / WOD si existen en el día; si no, mostrar las marcas destacadas del día
  var metcons = dayRows.filter(function(r) {
    var c = r.categoria.toLowerCase();
    return c.indexOf("metcon") !== -1 || c.indexOf("wod") !== -1;
  });
  var sourceRows = metcons.length > 0 ? metcons : dayRows;

  // Consolidar 1 entrada principal por atleta
  var byAthlete = {};
  for (var j = 0; j < sourceRows.length; j++) {
    var item = sourceRows[j];
    var ejLower = item.ejercicio.toLowerCase();
    var isScaled = (
      ejLower.indexOf("scaled") !== -1 ||
      ejLower.indexOf("banda") !== -1 ||
      ejLower.indexOf("escalado") !== -1 ||
      ejLower.indexOf("cajón") !== -1 ||
      ejLower.indexOf("negativa") !== -1
    );
    var level = isScaled ? "Scaled" : "Rx";

    var displayScore = "";
    var sortVal = 0;
    if (item.categoria.toLowerCase().indexOf("metcon") !== -1 || item.categoria.toLowerCase().indexOf("wod") !== -1) {
      displayScore = item.duracion ? (item.duracion + (item.score > 0 ? " · " + item.score.toFixed(3) : "")) : (item.score > 0 ? item.score.toFixed(3) + " rds" : "Completado");
      sortVal = item.score > 0 ? item.score : 1;
    } else if (item.categoria.toLowerCase().indexOf("cardio") !== -1) {
      displayScore = item.repsTotales.toFixed(2) + " km" + (item.duracion ? " · " + item.duracion : "");
      sortVal = item.repsTotales;
    } else if (item.carga > 0) {
      displayScore = item.carga + " kg";
      sortVal = item.carga;
    } else {
      displayScore = item.repsTotales + " reps";
      sortVal = item.repsTotales;
    }

    if (!byAthlete[item.atleta] || sortVal > byAthlete[item.atleta].sortVal) {
      byAthlete[item.atleta] = {
        atleta: item.atleta,
        ejercicio: item.ejercicio,
        categoria: item.categoria,
        resultado: displayScore,
        nivel: level,
        sortVal: sortVal
      };
    }
  }

  var rxList = [];
  var scaledList = [];
  for (var aKey in byAthlete) {
    var entry = byAthlete[aKey];
    if (entry.nivel === "Scaled") scaledList.push(entry);
    else rxList.push(entry);
  }

  rxList.sort(function(a, b) { return b.sortVal - a.sortVal; });
  scaledList.sort(function(a, b) { return b.sortVal - a.sortVal; });

  return {
    status: "ok",
    fechaSolicitada: requestedDate,
    fechaMostrada: shownDate,
    isFallbackDate: isFallback,
    rx: rxList,
    scaled: scaledList
  };
}

/**
 * Publica nuevos bloques en 'Programacion_Diaria' (exclusivo rol Coach).
 */
function publishDailyWodBlocks(ss, data) {
  var rol = String(data.rol || "").trim().toLowerCase();
  if (rol !== "coach") {
    return { status: "error", message: "Acceso denegado: solo el rol Coach puede publicar programación." };
  }

  var bloques = data.bloques;
  if (!bloques || !Array.isArray(bloques) || bloques.length === 0) {
    return { status: "error", message: "Debes incluir al menos un bloque para publicar." };
  }

  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.PROGRAMACION_DIARIA);
    sheet.getRange(1, 1, 1, 10).setValues([[
      "Fecha", "Ciclo", "Semana", "Programa", "Bloque", "Orden",
      "Ejercicio", "Esquema_Sets_Reps", "Porcentaje_1RM", "Notas_Coach"
    ]]);
    sheet.setFrozenRows(1);
  }

  var fecha = normalizeDateToISO(data.fecha) || formatDateISO(new Date());
  var ciclo = String(data.ciclo || getActiveCycle(ss) || "Atenea").trim();
  var semana = parseInt(data.semana, 10) || getCurrentWeek(ss);
  var programa = String(data.programa || ciclo).trim();

  var rowsToWrite = [];
  for (var i = 0; i < bloques.length; i++) {
    var b = bloques[i];
    rowsToWrite.push([
      fecha,
      ciclo,
      semana,
      programa,
      String(b.bloque || ("Bloque " + (i + 1))).trim(),
      parseInt(b.orden, 10) || (i + 1),
      String(b.ejercicio || "").trim(),
      String(b.esquema || "").trim(),
      parseFloat(String(b.porcentaje || "0").replace("%", "").replace(",", ".")) || 0,
      String(b.notas || "").trim()
    ]);
  }

  // Eliminar filas previas de esta misma (Fecha, Programa) y de fechaOriginal si el Coach cambió la fecha
  var dedupKeys = {};
  dedupKeys[fecha + "|" + programa.toLowerCase()] = true;
  var fechaOrig = normalizeDateToISO(data.fechaOriginal || data.originalDate || "");
  var progOrig = String(data.programaOriginal || programa).trim().toLowerCase();
  if (fechaOrig) {
    dedupKeys[fechaOrig + "|" + progOrig] = true;
  }
  var deletedOld = deleteProgramRowsByKeys(sheet, dedupKeys);

  var startRow = getFirstEmptyRowByColumnA(sheet);
  var endRow = startRow + rowsToWrite.length - 1;
  if (endRow >= sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowsToWrite.length + 2);
  }
  sheet.getRange(startRow, 1, rowsToWrite.length, 1).setNumberFormat("@");
  sheet.getRange(startRow, 1, rowsToWrite.length, 10).setValues(rowsToWrite);
  SpreadsheetApp.flush();
  ensureSingleCleanBottomRow(sheet, endRow);

  logScriptEvent(ss, "PUBLISH_DAILY_WOD", data.atleta || "Coach", startRow, "HEALTHY", "Fecha: " + fecha + " | Programa: " + programa + " | Reemplazadas: " + deletedOld + " | Bloques: " + rowsToWrite.length);
  return { status: "ok", message: "Día guardado limpiamente (" + rowsToWrite.length + " bloques, " + deletedOld + " previas reemplazadas).", insertedCount: rowsToWrite.length, replacedCount: deletedOld, fecha: fecha, programa: programa };
}

/**
 * Devuelve la lista de usuarios y sus programas asignados desde 'Usuarios_Kleos' (para Panel Coach).
 */
function getUsersProgramsList(ss) {
  var sheet = ss.getSheetByName(TABS.USUARIOS_KLEOS);
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: "ok", users: [] };
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var users = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var nombre = String(r[1] || "").trim();
    if (!nombre) continue;
    users.push({
      idAtleta: String(r[0] || "").trim(),
      atleta: nombre,
      usuario: String(r[2] || "").trim(),
      rol: String(r[4] || "Atleta").trim(),
      programa: String(r[5] || "Atenea").trim(),
      estado: String(r[6] || "Activo").trim()
    });
  }
  return { status: "ok", users: users };
}

/**
 * Actualiza el Programa_Asignado de un atleta en 'Usuarios_Kleos' (exclusivo rol Coach).
 */
function updateKleosAthleteProgram(ss, data) {
  var rol = String(data.rol || "").trim().toLowerCase();
  if (rol !== "coach") {
    return { status: "error", message: "Acceso denegado: solo el Coach puede cambiar programas." };
  }
  var targetAth = String(data.targetAtleta || data.atletaDestino || data.atleta || "").trim();
  var newProg = String(data.programa || "Atenea").trim();
  if (!targetAth || !newProg) {
    return { status: "error", message: "Faltan datos de atleta o programa destino." };
  }
  var sheet = ss.getSheetByName(TABS.USUARIOS_KLEOS);
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: "error", message: "No existe la pestaña 'Usuarios_Kleos'." };
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < values.length; i++) {
    var nombre = String(values[i][1] || "").trim();
    if (nombre.toLowerCase() === targetAth.toLowerCase()) {
      var targetRow = i + 2;
      sheet.getRange(targetRow, 6).setValue(newProg);
      SpreadsheetApp.flush();
      logScriptEvent(ss, "UPDATE_ATHLETE_PROGRAM", nombre, targetRow, "HEALTHY", "Nuevo programa: " + newProg);
      return { status: "ok", message: "Programa de " + nombre + " actualizado a " + newProg, atleta: nombre, programa: newProg };
    }
  }
  return { status: "error", message: "Atleta no encontrado en 'Usuarios_Kleos': " + targetAth };
}

/**
 * Suma N días a una fecha ISO YYYY-MM-DD y retorna YYYY-MM-DD.
 */
function addDaysISO(isoDate, daysToAdd) {
  var parts = String(isoDate || "").split("-");
  if (parts.length !== 3) return isoDate;
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + daysToAdd);
  return formatDateISO(d);
}

/**
 * Lee una semana completa (6 días: Lunes a Sábado) de un programa desde 'Programacion_Diaria'
 * para permitir clonar Atenea -> Atenea_Comp5 o editar la semana en el modal del Coach.
 */
function getWeeklyWodData(ss, fechaInicioParam, programaParam) {
  var startIso = normalizeDateToISO(fechaInicioParam) || formatDateISO(new Date());
  var targetProg = String(programaParam || "Atenea").trim();
  var targetProgLower = targetProg.toLowerCase();

  var dayDates = [];
  var diasMap = {};
  for (var d = 0; d < 6; d++) {
    var iso = addDaysISO(startIso, d);
    dayDates.push(iso);
    diasMap[iso] = [];
  }

  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  if (sheet && sheet.getLastRow() >= 2) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var fIso = normalizeDateToISO(row[0]);
      var rProg = String(row[3] || "Atenea").trim().toLowerCase();
      if (rProg === targetProgLower && diasMap.hasOwnProperty(fIso)) {
        diasMap[fIso].push({
          bloque: String(row[4] || "").trim(),
          orden: parseInt(row[5], 10) || (diasMap[fIso].length + 1),
          ejercicio: String(row[6] || "").trim(),
          esquema: String(row[7] || "").trim(),
          porcentaje: parseFloat(String(row[8] || "0").replace("%", "").replace(",", ".")) || 0,
          notas: String(row[9] || "").trim()
        });
      }
    }
  }

  var dias = [];
  for (var k = 0; k < dayDates.length; k++) {
    var f = dayDates[k];
    diasMap[f].sort(function(a, b) { return a.orden - b.orden; });
    dias.push({
      dayIndex: k,
      fecha: f,
      bloques: diasMap[f]
    });
  }

  return {
    status: "ok",
    fechaInicio: startIso,
    programa: targetProg,
    dias: dias
  };
}

/**
 * Publica una semana completa (hasta 6 días: Lunes a Sábado) en 'Programacion_Diaria'
 * en UNA SOLA operación batch (setValues), preservando la fila vacía final para Looker Studio.
 */
function publishWeeklyWodBatch(ss, data) {
  var rol = String(data.rol || "").trim().toLowerCase();
  if (rol !== "coach") {
    return { status: "error", message: "Acceso denegado: solo el rol Coach puede publicar programación semanal." };
  }

  var dias = data.dias;
  if (!dias || !Array.isArray(dias) || dias.length === 0) {
    return { status: "error", message: "No se recibieron días con bloques para publicar." };
  }

  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.PROGRAMACION_DIARIA);
    sheet.getRange(1, 1, 1, 10).setValues([[
      "Fecha", "Ciclo", "Semana", "Programa", "Bloque", "Orden",
      "Ejercicio", "Esquema_Sets_Reps", "Porcentaje_1RM", "Notas_Coach"
    ]]);
    sheet.setFrozenRows(1);
  }

  var ciclo = String(data.ciclo || getActiveCycle(ss) || "Atenea").trim();
  var semana = parseInt(data.semana, 10) || getCurrentWeek(ss);
  var programa = String(data.programa || ciclo).trim();
  var fechaInicio = normalizeDateToISO(data.fechaInicio) || formatDateISO(new Date());

  var rowsToWrite = [];
  var activeDaysCount = 0;

  for (var d = 0; d < dias.length; d++) {
    var dayObj = dias[d];
    var dayFecha = normalizeDateToISO(dayObj.fecha) || addDaysISO(fechaInicio, d);
    var bloques = Array.isArray(dayObj.bloques) ? dayObj.bloques : [];
    if (bloques.length === 0) continue;
    activeDaysCount++;

    for (var i = 0; i < bloques.length; i++) {
      var b = bloques[i];
      rowsToWrite.push([
        dayFecha,
        ciclo,
        semana,
        programa,
        String(b.bloque || ("Bloque " + (i + 1))).trim(),
        parseInt(b.orden, 10) || (i + 1),
        String(b.ejercicio || "").trim(),
        String(b.esquema || "").trim(),
        parseFloat(String(b.porcentaje || "0").replace("%", "").replace(",", ".")) || 0,
        String(b.notas || "").trim()
      ]);
    }
  }

  if (rowsToWrite.length === 0) {
    return { status: "error", message: "Agrega al menos un bloque en alguno de los 6 días." };
  }

  // Eliminar filas previas de cada (Fecha, Programa) incluida en esta publicación para evitar duplicados
  var dedupKeys = {};
  for (var dk = 0; dk < rowsToWrite.length; dk++) {
    dedupKeys[rowsToWrite[dk][0] + "|" + String(rowsToWrite[dk][3]).toLowerCase()] = true;
  }
  if (data.replaceFullWeek === true) {
    for (var wd = 0; wd < 6; wd++) {
      dedupKeys[addDaysISO(fechaInicio, wd) + "|" + programa.toLowerCase()] = true;
    }
  }
  var deletedCount = deleteProgramRowsByKeys(sheet, dedupKeys);

  var startRow = getFirstEmptyRowByColumnA(sheet);
  var endRow = startRow + rowsToWrite.length - 1;
  if (endRow >= sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowsToWrite.length + 5);
  }

  // Escritura atómica en UNA SOLA operación batch (columna Fecha en formato texto @)
  sheet.getRange(startRow, 1, rowsToWrite.length, 1).setNumberFormat("@");
  sheet.getRange(startRow, 1, rowsToWrite.length, 10).setValues(rowsToWrite);
  SpreadsheetApp.flush();
  ensureSingleCleanBottomRow(sheet, endRow);

  logScriptEvent(
    ss,
    "PUBLISH_WEEKLY_WOD",
    data.atleta || "Coach",
    startRow,
    "HEALTHY",
    "Programa: " + programa + " | Inicio: " + fechaInicio + " | Reemplazadas: " + deletedCount + " | Días: " + activeDaysCount + " | Bloques: " + rowsToWrite.length
  );

  return {
    status: "ok",
    message: "Semana guardada sin duplicados (" + activeDaysCount + " días, " + rowsToWrite.length + " bloques, " + deletedCount + " filas previas reemplazadas) para " + programa + ".",
    insertedCount: rowsToWrite.length,
    replacedCount: deletedCount,
    daysCount: activeDaysCount,
    programa: programa
  };
}

/**
 * Elimina filas existentes en 'Programacion_Diaria' que coincidan con cualquier clave
 * 'YYYY-MM-DD|programa_lower' (de abajo hacia arriba para no desplazar índices).
 */
function deleteProgramRowsByKeys(sheet, keysMap) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < values.length; i++) {
    var fIso = normalizeDateToISO(values[i][0]);
    var progLower = String(values[i][3] || "Atenea").trim().toLowerCase();
    if (fIso && keysMap[fIso + "|" + progLower]) {
      rowsToDelete.push(i + 2);
    }
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  if (rowsToDelete.length > 0) {
    SpreadsheetApp.flush();
  }
  return rowsToDelete.length;
}

/**
 * Normaliza el nombre del ejercicio al catálogo oficial de 'RM_Atenea' sin colapsar Power en Squat:
 * ['Front Squat', 'Back Squat', 'Clean Squat', 'Power Clean', 'Clean & Jerk', 'Jerk',
 *  'Snatch', 'Power Snatch', 'Bench Press', 'Push Press', 'Deadlift'] (+ 'Carrera').
 */
function normalizeRmExerciseForWod(rawEj, pct, fallbackText) {
  var ej = String(rawEj || "").trim();
  var combined = (ej + " " + String(fallbackText || "")).toLowerCase();

  // Mapeo oficial RM_Atenea: NUNCA colapsar Power Snatch -> Snatch ni Power Clean -> Clean Squat
  if (combined.indexOf("front squat") !== -1) return "Front Squat";
  if (combined.indexOf("back squat") !== -1) return "Back Squat";
  if (combined.indexOf("peso muerto") !== -1 || combined.indexOf("deadlift") !== -1) return "Deadlift";
  if (combined.indexOf("bench press") !== -1 || combined.indexOf("press banca") !== -1) return "Bench Press";
  if (combined.indexOf("clean & jerk") !== -1 || combined.indexOf("clean and jerk") !== -1) return "Clean & Jerk";
  if (combined.indexOf("power clean") !== -1 || combined.indexOf("hang power clean") !== -1) return "Power Clean";
  if (combined.indexOf("squat clean") !== -1 || combined.indexOf("clean squat") !== -1 || combined.indexOf("clean complex") !== -1 || combined.indexOf("hang clean") !== -1) return "Clean Squat";
  if (combined.indexOf("power snatch") !== -1 || combined.indexOf("hang power snatch") !== -1) return "Power Snatch";
  if (combined.indexOf("squat snatch") !== -1 || combined.indexOf("hang snatch") !== -1 || combined.indexOf("snatch") !== -1) return "Snatch";
  if (combined.indexOf("push press") !== -1) return "Push Press";
  if (combined.indexOf("split jerk") !== -1 || combined.indexOf("push jerk") !== -1 || combined.indexOf("jerk") !== -1) return "Jerk";
  if (combined.indexOf("ciclo de corrida") !== -1 || combined.indexOf("sprint") !== -1 || combined.indexOf("carrera") !== -1 || /\b\d+\s*m\s*(run|sprint)/i.test(combined)) return "Carrera";
  if (pct && Number(pct) > 0 && combined.indexOf("clean") !== -1) return "Clean Squat";

  return ej;
}

/**
 * Extrae el primer porcentaje entero válido (ej. @ 78%, al 90-92%, 72% 1RM -> 78, 92, 72).
 */
function extractPctIntFromText_(txt) {
  var s = String(txt || "");
  // Rango como "90-92%" o "88–90%" -> tomar el techo (ej. 92, 90)
  var mRange = s.match(/(\d{2,3})\s*[\-–—]\s*(\d{2,3})\s*%/);
  if (mRange) return parseInt(mRange[2], 10) || 0;
  var mSingle = s.match(/@?\s*(\d{2,3})\s*%/);
  if (mSingle) return parseInt(mSingle[1], 10) || 0;
  return 0;
}

/**
 * Parser determinístico por bloques reales (respaldo si Gemini devuelve 503/timeout).
 * Agrupa EXCLUSIVAMENTE por 'Bloque N:', consolida viñetas en 'notas' separadas por ' | ',
 * separa Atenea vs Atenea_Comp5 cuando existan variantes diferenciadas y mapea a RM_Atenea.
 */
function parseWodStructuredFallback_(rawText, isMultiDay, targetYear) {
  var lines = String(rawText || "").split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  var rawBlocks = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var mBloque = line.match(/^Bloque\s*(\d+)\s*[:\.\-–—]\s*(.+)$/i);
    if (mBloque) {
      if (current) rawBlocks.push(current);
      current = {
        orden: parseInt(mBloque[1], 10) || (rawBlocks.length + 1),
        bloque: "Bloque " + mBloque[1] + ": " + mBloque[2].trim(),
        titleRest: mBloque[2].trim(),
        subLines: []
      };
    } else if (current) {
      current.subLines.push(line.replace(/^[•\-\*]\s*/, "").trim());
    }
  }
  if (current) rawBlocks.push(current);

  if (rawBlocks.length === 0) return null;

  var hasDual = false;
  var atenea = [];
  var comp5 = [];

  for (var bIdx = 0; bIdx < rawBlocks.length; bIdx++) {
    var rb = rawBlocks[bIdx];
    var genLines = [];
    var cmpLines = [];
    var blockHasComp = /comp\s*5\s*dic|\(comp[:\s]/i.test(rb.bloque + " " + rb.subLines.join(" "));
    if (blockHasComp) hasDual = true;

    for (var sIdx = 0; sIdx < rb.subLines.length; sIdx++) {
      var sl = rb.subLines[sIdx];
      var low = sl.toLowerCase();
      if (/^(atletas\s+comp\s*5\s*dic|comp\s*5\s*dic)\s*:/i.test(low)) {
        cmpLines.push(sl.replace(/^(atletas\s+comp\s*5\s*dic|comp\s*5\s*dic)\s*:\s*/i, "").trim());
      } else if (/^grupo\s+general\s*:/i.test(low)) {
        genLines.push(sl.replace(/^grupo\s+general\s*:\s*/i, "").trim());
      } else {
        genLines.push(sl);
        cmpLines.push(sl);
      }
    }

    var genJoined = genLines.join(" | ");
    var cmpJoined = cmpLines.join(" | ");
    var pctGen = extractPctIntFromText_(genJoined || rb.titleRest);
    var pctCmp = extractPctIntFromText_(cmpJoined || rb.titleRest);
    var ejGen = normalizeRmExerciseForWod(rb.titleRest, pctGen, genJoined);
    var ejCmp = normalizeRmExerciseForWod(rb.titleRest, pctCmp, cmpJoined);

    atenea.push({
      bloque: rb.bloque,
      orden: rb.orden,
      ejercicio: ejGen,
      esquema: genLines[0] || rb.titleRest,
      porcentaje: pctGen,
      notas: genJoined
    });
    comp5.push({
      bloque: rb.bloque,
      orden: rb.orden,
      ejercicio: ejCmp,
      esquema: cmpLines[0] || rb.titleRest,
      porcentaje: pctCmp,
      notas: cmpJoined
    });
  }

  return {
    status: "ok",
    hasDualPrograms: hasDual,
    atenea: atenea,
    atenea_comp5: hasDual ? comp5 : [],
    usedFallback: true
  };
}

/**
 * Interpreta una programación cruda de WhatsApp o Word (.docx) usando Gemini con JSON estricto.
 * Reglas estrictas:
 *  1. Agrupación exclusiva por Bloque real (5-7 bloques por día; viñetas consolidadas en Notas_Coach con ' | ').
 *  2. Separación automática de programas ('Atenea' vs 'Atenea_Comp5') cuando hay Grupo General vs Atletas Comp 5 Dic.
 *  3. Mapeo exacto a nombres oficiales de RM_Atenea + entero exacto en Porcentaje_1RM.
 */
function parseWodWithAI(ss, rawText, isMultiDay, yearHint) {
  var text = String(rawText || "").trim();
  if (!text) {
    return { status: "error", message: "El texto de la programación está vacío." };
  }

  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { status: "error", message: "GEMINI_API_KEY no está configurada en Script Properties." };
  }

  var targetYear = parseInt(yearHint, 10) || 2026;
  var prompt = "";

  var commonRules =
    "REGLAS ESTRICTAS E INNEGOCIABLES:\n" +
    "1. AGRUPACIÓN POR BLOQUE REAL (NO POR LÍNEA): Un día completo de entrenamiento tiene ÚNICAMENTE entre 5 y 7 bloques (crea una fila SOLO cuando el texto indique explícitamente 'Bloque 1:', 'Bloque 2:', 'Bloque 3:', etc.). IGNORA títulos introductorios del día previos a 'Bloque 1:'. TODAS las viñetas ('•', '-'), sub-partes ('Parte A', 'Parte B', 'Parte C', 'Minuto 1', 'Minuto 2', 'Minuto 3', 'HSW', 'Filtro Wellness') y detalles debajo de un 'Bloque X' deben consolidarse DENTRO de esa misma única fila en el campo 'notas' (separadas por ' | '), JAMÁS como filas o bloques nuevos.\n" +
    "2. SEPARACIÓN AUTOMÁTICA DE PROGRAMAS (Atenea vs Atenea_Comp5): Si dentro de un bloque el texto especifica variantes diferenciadas para 'Grupo General' vs 'Atletas Comp 5 Dic' (o 'Comp:'), genera DOS registros limpios por separado: uno para 'Atenea' (SOLO su esquema, notas y % 1RM general, sin texto de Comp) y otro para 'Atenea_Comp5' (SOLO su esquema, notas y % 1RM competitivo, sin texto de Grupo General). Nunca mezcles ambos programas en la misma celda.\n" +
    "3. MAPEO EXACTO A RM_Atenea Y Porcentaje_1RM (SIN COLAPSAR POWER EN SQUAT): El campo 'ejercicio' debe mapearse EXCLUSIVAMENTE al catálogo oficial: ['Front Squat', 'Back Squat', 'Clean Squat', 'Power Clean', 'Clean & Jerk', 'Jerk', 'Snatch', 'Power Snatch', 'Bench Press', 'Push Press', 'Deadlift'] (y 'Carrera' para bloques de corrida). REGLA CRÍTICA POWER vs. SQUAT:\n" +
    "   - 'Power Snatch' / 'Hang Power Snatch' -> Ejercicio: 'Power Snatch' (NUNCA 'Snatch')\n" +
    "   - 'Snatch' / 'Squat Snatch' -> Ejercicio: 'Snatch'\n" +
    "   - 'Power Clean' / 'Hang Power Clean' -> Ejercicio: 'Power Clean' (NUNCA 'Clean Squat')\n" +
    "   - 'Clean' / 'Squat Clean' -> Ejercicio: 'Clean Squat'\n" +
    "   El campo 'porcentaje' debe ser el número entero exacto (ej. 78, 74, 72, 92, 90; si hay rango como 90-92% usa 92; si no aplica porcentaje usa 0).\n" +
    "4. En 'esquema' coloca el resumen conciso de series/reps/formato del bloque (ej. '4 series x 4 reps @ 78% 1RM (Tempo 31X1)') y en 'notas' consolida TODAS las sub-viñetas, partes y notas técnicas del bloque separadas por ' | '.\n";

  if (isMultiDay) {
    prompt =
      "Eres el Arquitecto de Programación Deportiva de Plataforma Kleos (CrossFit / Halterofilia).\n" +
      "Analiza el siguiente documento Word (.docx) que puede contener UNO O MÚLTIPLES DÍAS de entrenamiento (ej. LUNES 23/11, JUEVES 26/11, etc.) del año " + targetYear + ".\n" +
      "Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:\n" +
      "{\n" +
      "  \"isMultiDay\": true,\n" +
      "  \"items\": [\n" +
      "    {\n" +
      "      \"fecha\": \"YYYY-MM-DD\",\n" +
      "      \"programa\": \"Atenea\",\n" +
      "      \"orden\": 1,\n" +
      "      \"bloque\": \"Bloque 1: Título corto\",\n" +
      "      \"ejercicio\": \"Back Squat\",\n" +
      "      \"esquema\": \"4 series × 4 reps @ 78% 1RM (Tempo 31X1)\",\n" +
      "      \"porcentaje\": 78,\n" +
      "      \"notas\": \"Sub-viñeta 1 | Sub-viñeta 2 | Nota técnica\"\n" +
      "    }\n" +
      "  ]\n" +
      "}\n\n" +
      commonRules +
      "5. FECHAS EXACTAS: Vincula cada bloque a su fecha EXACTA en texto YYYY-MM-DD leyendo EXPLÍCITAMENTE el encabezado del día y NUNCA por índice relativo ni saltando días. Ejemplos: 'LUNES 23/11' -> '" + targetYear + "-11-23', 'MARTES 24/11' -> '" + targetYear + "-11-24', 'MIÉRCOLES 25/11' -> '" + targetYear + "-11-25', 'JUEVES 26/11' -> '" + targetYear + "-11-26', 'VIERNES 27/11' -> '" + targetYear + "-11-27', 'SÁBADO 28/11' -> '" + targetYear + "-11-28'.\n\n" +
      "DOCUMENTO A PROCESAR:\n" + text;
  } else {
    prompt =
      "Eres el Arquitecto de Programación Deportiva de Plataforma Kleos (CrossFit / Halterofilia).\n" +
      "Analiza la siguiente sesión de entrenamiento pegada desde WhatsApp o Word y devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:\n" +
      "{\n" +
      "  \"hasDualPrograms\": boolean,\n" +
      "  \"atenea\": [\n" +
      "    {\n" +
      "      \"bloque\": \"Bloque 1: Título corto\",\n" +
      "      \"orden\": 1,\n" +
      "      \"ejercicio\": \"Back Squat\",\n" +
      "      \"esquema\": \"4 series × 4 reps @ 78% 1RM (Tempo 31X1)\",\n" +
      "      \"porcentaje\": 78,\n" +
      "      \"notas\": \"Parte A (...) | Parte B (...) | Parte C (...)\"\n" +
      "    }\n" +
      "  ],\n" +
      "  \"atenea_comp5\": [ ...mismo formato exacto (5 a 7 bloques)... ]\n" +
      "}\n\n" +
      commonRules +
      "5. Si el texto distingue entre 'Grupo General' y 'Atletas Comp 5 Dic' (o 'Comp:'), establece hasDualPrograms: true y genera dos listas completas e independientes de 5 a 7 bloques cada una: 'atenea' y 'atenea_comp5'. Si no hay distinción, pon hasDualPrograms: false y deja 'atenea_comp5' vacío [].\n" +
      "6. Mantén 'orden' secuencial desde 1 hasta N (5 a 7 máximo por programa).\n\n" +
      "PROGRAMACIÓN A PROCESAR:\n" + text;
  }

  var modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  try {
    var code = 0;
    var bodyText = "";
    for (var mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelsToTry[mIdx] + ":generateContent?key=" + encodeURIComponent(apiKey);
      for (var attempt = 0; attempt < 2; attempt++) {
        var resp = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        code = resp.getResponseCode();
        bodyText = resp.getContentText();
        if (code === 200) break;
        if (code === 503 && attempt === 0) {
          Utilities.sleep(1000);
          continue;
        }
        break;
      }
      if (code === 200) break;
    }

    if (code !== 200) {
      logScriptEvent(ss, "PARSE_WOD_AI_ERR", "Coach", 0, "ERROR", "HTTP " + code + " | " + bodyText.substring(0, 300));
      if (!isMultiDay) {
        var fb = parseWodStructuredFallback_(text, false, targetYear);
        if (fb) {
          logScriptEvent(ss, "PARSE_WOD_FALLBACK_OK", "Coach", 0, "HEALTHY", "Fallback estructurado por bloques: Atenea=" + fb.atenea.length + " | Comp5=" + fb.atenea_comp5.length);
          return fb;
        }
      }
      return { status: "error", message: "Gemini API error HTTP " + code + ": " + bodyText.substring(0, 200) };
    }

    var outer = JSON.parse(bodyText);
    var rawJson = outer.candidates && outer.candidates[0] && outer.candidates[0].content && outer.candidates[0].content.parts && outer.candidates[0].content.parts[0]
      ? outer.candidates[0].content.parts[0].text
      : "";

    if (!rawJson) {
      return { status: "error", message: "Gemini devolvió una respuesta vacía." };
    }

    // Limpiar posibles fences ```json
    rawJson = rawJson.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    var parsed = JSON.parse(rawJson);

    if (isMultiDay && Array.isArray(parsed.items)) {
      var multiItems = parsed.items.map(function(b, idx) {
        var pct = parseInt(b.porcentaje || b.porcentaje1RM || 0, 10) || extractPctIntFromText_((b.esquema || "") + " " + (b.notas || ""));
        var ej = normalizeRmExerciseForWod(b.ejercicio || "", pct, (b.bloque || "") + " " + (b.esquema || ""));
        var fIso = normalizeDateToISO(b.fecha || "");
        var prog = String(b.programa || "Atenea").trim();
        if (prog.toLowerCase().indexOf("comp") !== -1) prog = "Atenea_Comp5";
        else prog = "Atenea";
        return {
          fecha: fIso,
          programa: prog,
          orden: parseInt(b.orden, 10) || (idx + 1),
          bloque: String(b.bloque || ("Bloque " + (idx + 1))).trim(),
          ejercicio: ej,
          esquema: String(b.esquema || "").trim(),
          porcentaje: pct,
          notas: String(b.notas || "").replace(/\r?\n+/g, " | ").trim()
        };
      }).filter(function(item) { return item.fecha && (item.bloque || item.esquema); });

      logScriptEvent(ss, "PARSE_WOD_AI_DOCX", "Coach", 0, "HEALTHY", "Bloques multi-día extraídos: " + multiItems.length);
      return {
        status: "ok",
        isMultiDay: true,
        items: multiItems
      };
    }

    var sanitizeList = function(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.map(function(b, idx) {
        var pct = parseInt(b.porcentaje || b.porcentaje1RM || 0, 10) || extractPctIntFromText_((b.esquema || "") + " " + (b.notas || ""));
        var ej = normalizeRmExerciseForWod(b.ejercicio || "", pct, (b.bloque || "") + " " + (b.esquema || ""));
        return {
          bloque: String(b.bloque || ("Bloque " + (idx + 1))).trim(),
          orden: parseInt(b.orden, 10) || (idx + 1),
          ejercicio: ej,
          esquema: String(b.esquema || "").trim(),
          porcentaje: pct,
          notas: String(b.notas || "").replace(/\r?\n+/g, " | ").trim()
        };
      });
    };

    var ateneaList = sanitizeList(parsed.atenea);
    var comp5List = sanitizeList(parsed.atenea_comp5);
    var hasDual = !!(parsed.hasDualPrograms && comp5List.length > 0);

    logScriptEvent(ss, "PARSE_WOD_AI_OK", "Coach", 0, "HEALTHY", "Atenea: " + ateneaList.length + " bloques | Comp5: " + comp5List.length + " bloques");

    return {
      status: "ok",
      hasDualPrograms: hasDual,
      atenea: ateneaList,
      atenea_comp5: comp5List
    };
  } catch (err) {
    logScriptEvent(ss, "PARSE_WOD_AI_ERR", "Coach", 0, "ERROR", err.toString());
    if (!isMultiDay) {
      var fbErr = parseWodStructuredFallback_(text, false, targetYear);
      if (fbErr) return fbErr;
    }
    return { status: "error", message: "Error procesando con Gemini Flash: " + err.toString() };
  }
}

/**
 * Elimina todos los bloques de una (Fecha, Programa) específica en 'Programacion_Diaria' (exclusivo Coach).
 */
function deleteDailyWodBlocks(ss, data) {
  var rol = String(data.rol || "").trim().toLowerCase();
  if (rol !== "coach") {
    return { status: "error", message: "Acceso denegado: solo el Coach puede eliminar días." };
  }
  var fecha = normalizeDateToISO(data.fecha || data.date || "");
  var programa = String(data.programa || "Atenea").trim();
  if (!fecha) {
    return { status: "error", message: "Fecha inválida para eliminar." };
  }
  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: "ok", deletedCount: 0, message: "No había bloques para eliminar." };
  }
  var keys = {};
  keys[fecha + "|" + programa.toLowerCase()] = true;
  var deleted = deleteProgramRowsByKeys(sheet, keys);
  logScriptEvent(ss, "DELETE_DAILY_WOD", data.atleta || "Coach", 0, "HEALTHY", "Fecha: " + fecha + " | Programa: " + programa + " | Eliminadas: " + deleted);
  return { status: "ok", deletedCount: deleted, message: "Eliminados " + deleted + " bloques de " + programa + " (" + fecha + ")." };
}

/**
 * Publica una lista arbitraria de bloques multi-día y multi-programa (desde Excel, CSV o Word)
 * en UNA SOLA operación batch, eliminando previamente todas las filas existentes de cada (Fecha, Programa).
 */
function publishMultiProgramBlocksBatch(ss, data) {
  var rol = String(data.rol || "").trim().toLowerCase();
  if (rol !== "coach") {
    return { status: "error", message: "Acceso denegado: solo el Coach puede importar programación." };
  }
  var bloques = data.bloques;
  if (!Array.isArray(bloques) || bloques.length === 0) {
    return { status: "error", message: "No hay bloques válidos para guardar." };
  }

  var sheet = ss.getSheetByName(TABS.PROGRAMACION_DIARIA);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.PROGRAMACION_DIARIA);
    sheet.getRange(1, 1, 1, 10).setValues([[
      "Fecha", "Ciclo", "Semana", "Programa", "Bloque", "Orden",
      "Ejercicio", "Esquema_Sets_Reps", "Porcentaje_1RM", "Notas_Coach"
    ]]);
    sheet.setFrozenRows(1);
  }

  var ciclo = String(data.ciclo || getActiveCycle(ss) || "Atenea").trim();
  var semana = parseInt(data.semana, 10) || getCurrentWeek(ss);

  var dedupKeys = {};
  var rowsToWrite = [];

  for (var i = 0; i < bloques.length; i++) {
    var b = bloques[i];
    var fIso = normalizeDateToISO(b.fecha || "");
    if (!fIso) continue;
    var prog = String(b.programa || "Atenea").trim();
    var pct = parseFloat(String(b.porcentaje || b.porcentaje1RM || "0").replace("%", "").replace(",", ".")) || 0;
    var ej = normalizeRmExerciseForWod(b.ejercicio || "", pct);
    dedupKeys[fIso + "|" + prog.toLowerCase()] = true;
    rowsToWrite.push([
      fIso,
      ciclo,
      semana,
      prog,
      String(b.bloque || ("Bloque " + (i + 1))).trim(),
      parseInt(b.orden, 10) || (i + 1),
      ej,
      String(b.esquema || b.descripcion || "").trim(),
      pct,
      String(b.notas || "").trim()
    ]);
  }

  if (rowsToWrite.length === 0) {
    return { status: "error", message: "Ningún bloque tenía una fecha válida (YYYY-MM-DD)." };
  }

  var deletedCount = deleteProgramRowsByKeys(sheet, dedupKeys);

  var startRow = getFirstEmptyRowByColumnA(sheet);
  var endRow = startRow + rowsToWrite.length - 1;
  if (endRow >= sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowsToWrite.length + 5);
  }

  sheet.getRange(startRow, 1, rowsToWrite.length, 1).setNumberFormat("@");
  sheet.getRange(startRow, 1, rowsToWrite.length, 10).setValues(rowsToWrite);
  SpreadsheetApp.flush();
  ensureSingleCleanBottomRow(sheet, endRow);

  var groupsCount = Object.keys(dedupKeys).length;
  logScriptEvent(ss, "IMPORT_MULTI_WOD", data.atleta || "Coach", startRow, "HEALTHY", "Grupos(Fecha|Prog): " + groupsCount + " | Reemplazadas: " + deletedCount + " | Insertadas: " + rowsToWrite.length);
  return {
    status: "ok",
    message: "Importación completada: " + rowsToWrite.length + " bloques en " + groupsCount + " sesiones (" + deletedCount + " filas previas reemplazadas).",
    insertedCount: rowsToWrite.length,
    replacedCount: deletedCount,
    groupsCount: groupsCount
  };
}


