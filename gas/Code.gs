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
  RM_ATLETAS: "RM_Atletas",
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
      version: "18.1.0",
      message: "Plataforma Kleos API activa - Versión 18.1 (Gemini Flash & Escáner Wellness Conectados)",
      athletes: athletes,
      rmData: rmData,
      geminiConnected: !!getGeminiApiKey(),
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
  var rawEjercicio = (data.ejercicio || data.exercise || "").toString().trim();
  var variante = (data.variante || data.variant || "").toString().trim();

  var duracion = (data.duracion !== undefined && data.duracion !== null) ? String(data.duracion).trim() : 
                 (data.duration !== undefined && data.duration !== null ? String(data.duration).trim() : "");
  var scoreReps = 0;
  var pesoWod = 0;

  var series = 0;
  var repsOrDistance = 0;  // AISLAMIENTO: valor neutro por defecto
  var cargaKg = 0;
  var rmKg = 0;

  // Intercepción inteligente de scoreReps / scorereps en cualquier formato
  var rawScoreReps = (data.scoreReps !== undefined && data.scoreReps !== null && data.scoreReps !== "") ? data.scoreReps :
                     ((data.scorereps !== undefined && data.scorereps !== null && data.scorereps !== "") ? data.scorereps :
                     ((data.ScoreReps !== undefined && data.ScoreReps !== null && data.ScoreReps !== "") ? data.ScoreReps :
                     ((data.score_reps !== undefined && data.score_reps !== null && data.score_reps !== "") ? data.score_reps : null)));

  // Detección Universal de Categorías (Sin filtros por nombre exacto de ejercicio)
  var catLower = categoria.toLowerCase();
  var esLifting = (categoria === "Fuerza" || categoria === "Levantamiento Olímpico" || catLower.indexOf("fuerza") !== -1 || catLower.indexOf("olímpico") !== -1 || catLower.indexOf("olimpico") !== -1);
  var esGimnasticos = (categoria === "Gimnásticos" || catLower.indexOf("gimnastic") !== -1);
  var esMetcon = (categoria === "Metcon / WOD" || catLower.indexOf("metcon") !== -1 || catLower.indexOf("wod") !== -1 || rawScoreReps !== null);
  var esCardio = (categoria === "Cardio" || catLower.indexOf("cardio") !== -1 || catLower.indexOf("carrera") !== -1);

  // AUDITORÍA Y HOMOLOGACIÓN SEMÁNTICA DE WODs (GEMINI 1.5 FLASH)
  var ejercicio = rawEjercicio;
  if (esMetcon) {
    ejercicio = homologarNombreWODConGemini(rawEjercicio);
  }
  if (variante && variante !== "-- Estándar / Desde el Suelo (Sin variante) --" && variante !== "Sin variante" && ejercicio.indexOf(variante) === -1) {
    ejercicio = ejercicio + " (" + variante + ")";
  }

  if (esLifting) {
    // --- FUERZA / LEVANTAMIENTO OLÍMPICO ---
    series = Number(data.series !== undefined ? data.series : 1);
    repsOrDistance = data.reps !== undefined ? data.reps : (data.repsOrDistance !== undefined ? data.repsOrDistance : "");
    cargaKg = Number(data.carga !== undefined ? data.carga : (data.weight !== undefined ? data.weight : 0)) || 0;
    rmKg = Number(data.unRM !== undefined ? data.unRM : (data.oneRepMax !== undefined ? data.oneRepMax : 0)) || 0;

    // REGLA DE EQUIVALENCIA ABSOLUTA DE 1RM: JERKS Y COMPLEX OLÍMPICOS
    var ejLower = ejercicio.toLowerCase();
    var isJerkMovement = (ejLower.indexOf("push jerk") !== -1 || ejLower.indexOf("split jerk") !== -1 || (ejLower.indexOf("jerk") !== -1 && ejLower.indexOf("clean & jerk") === -1 && ejLower.indexOf("clean and jerk") === -1));
    var isSnatchComplex = (ejLower.indexOf("snatch complex") !== -1);
    var isCleanComplex = (ejLower.indexOf("clean complex") !== -1);

    if (rmKg === 0 || isJerkMovement || isSnatchComplex || isCleanComplex) {
      try {
        var allRm = getRmData(ss);
        if (allRm && allRm[atleta]) {
          if (isSnatchComplex) {
            var scVal = allRm[atleta]["Snatch"] || allRm[atleta]["Snatch Complex"] || allRm[atleta]["Power Snatch"];
            if (scVal && Number(scVal) > 0) rmKg = Number(scVal);
          } else if (isCleanComplex) {
            var ccVal = allRm[atleta]["Clean Squat"] || allRm[atleta]["Clean Complex"] || allRm[atleta]["Squat Clean"] || allRm[atleta]["Clean"] || allRm[atleta]["Clean & Jerk"] || allRm[atleta]["Power Clean"];
            if (ccVal && Number(ccVal) > 0) rmKg = Number(ccVal);
          } else if (isJerkMovement) {
            var jVal = allRm[atleta]["Jerk"] || allRm[atleta]["Push Jerk"] || allRm[atleta]["Split Jerk"];
            if (jVal && Number(jVal) > 0) rmKg = Number(jVal);
          } else if (rmKg === 0 && allRm[atleta][rawEjercicio]) {
            rmKg = Number(allRm[atleta][rawEjercicio]) || 0;
          }
        }
      } catch (_) {}
    }

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
    // REGLA DE AISLAMIENTO UNIVERSAL (VERSIÓN 18) — Metcon / WOD + GEMINI 1.5 FLASH
    // Intercepta 'scoreReps' o 'scorereps' en cualquier variante de Metcon / WOD
    // Col G (Series)     <- FORZADO a 0
    // Col H (Reps)       <- BLOQUEADO OBLIGATORIAMENTE EN 0 (Cero absoluto)
    // Col I (Carga)      <- FORZADO a 0
    // Col J (1RM)        <- FORZADO a 0
    // Col W (Duración)   <- Recibe la duración exacta (ej. '12:30')
    // Col X (Score_Reps) <- Formato numérico estricto de 3 decimales universales (ej. 3.025)
    // =========================================================================
    series = 0;          // Col G = 0 (aislamiento estricto)
    repsOrDistance = 0;  // Col H = 0 (CERO ABSOLUTO BLINDADO - el score NO va en Col H)
    cargaKg = 0;         // Col I = 0
    rmKg = 0;            // Col J = 0

    var tipoWod = (data.tipoWod || data.tipo_wod || "").toString().trim();
    var isEmom = tipoWod.indexOf("EMOM") !== -1 || (data.emomMinutosTotales !== undefined && Number(data.emomMinutosTotales) > 0);

    // Prioridad 1: Intercepción de scoreReps / scorereps directo
    if (rawScoreReps !== null) {
      var parsedDirect = parseFloat(String(rawScoreReps).replace(',', '.'));
      if (!isNaN(parsedDirect)) {
        scoreReps = parsedDirect;
      } else {
        // Conexión con Gemini 1.5 Flash en AI Studio para parseo inteligente de descripciones complejas
        var geminiParsed = parseScoreWithGemini(rawScoreReps);
        if (geminiParsed !== null && !isNaN(geminiParsed)) {
          scoreReps = geminiParsed;
        } else {
          scoreReps = 0;
        }
      }
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

    // Garantizar formato numérico estricto universal con 3 decimales fijos (ej: 3.025)
    if (scoreReps !== "" && scoreReps !== null && !isNaN(scoreReps)) {
      scoreReps = Math.round(Number(scoreReps) * 1000) / 1000;
    } else {
      scoreReps = 0;
    }
    pesoWod = 0;

  } else if (esCardio) {
    // =========================================================================
    // REGLA MATEMÁTICA Y BLINDAJE CARDIO (METROS A KM & SERIES × DISTANCIA)
    // Col G (Series)      <- Series reales del fraccionado (mínimo 1)
    // Col H (Distancia)   <- Normalizado estrictamente a KM (>=100 dividido entre 1000, ej: 400 -> 0.400, 3700 -> 3.700)
    // Col L (Kilometraje) <- Multiplicación estricta Series × Distancia en km (ej. 3 × 0.400 = 1.200 km)
    // Col I (Carga)       <- FORZADO a 0
    // Col J (1RM)         <- FORZADO a 0
    // =========================================================================
    series = Number(data.series !== undefined && data.series !== null && data.series !== ""
      ? data.series
      : (data.intervals !== undefined && data.intervals !== null && data.intervals !== "" ? data.intervals : 1));
    if (isNaN(series) || series < 1) series = 1;

    var rawDistancia = data.distancia !== undefined ? data.distancia
      : (data.distance !== undefined ? data.distance
      : (data.repsOrDistance !== undefined ? data.repsOrDistance : 0));
    
    repsOrDistance = parseCardioDistance(rawDistancia);

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
  // Col H (repsOrDistance) para Metcon / WOD está 100% bloqueada en 0 absoluto
  var colsA_J = [
    atleta,          // Col A: Atleta
    fechaStr,        // Col B: Fecha
    mesTexto,        // Col C: Mes
    semanaTexto,     // Col D: Semana
    ejercicio,       // Col E: Ejercicio
    categoria,       // Col F: Categoría
    series,          // Col G: Series
    repsOrDistance,  // Col H: Reps / Distancia (km) [BLOQUEADO EN 0 ABSOLUTO EN METCON]
    cargaKg,         // Col I: Carga (kg)
    rmKg             // Col J: 1RM Atleta (kg)
  ];
  sheet.getRange(targetRow, 1, 1, colsA_J.length).setValues([colsA_J]);

  // 2. Escribir Columna S: RPE (columna 19)
  sheet.getRange(targetRow, 19).setValue(rpe);

  // 3. Escribir Columnas W, X, Y (columnas 23, 24, 25)
  sheet.getRange(targetRow, 23, 1, 3).setValues([[duracion, scoreReps, pesoWod]]);
  
  if (esCardio) {
    var totalKmCardio = Math.round(series * repsOrDistance * 1000) / 1000;
    sheet.getRange(targetRow, 8).setValue(repsOrDistance);
    sheet.getRange(targetRow, 11, 1, 8).setValues([[0, totalKmCardio, 0, categoria, 0, 0, 0, 0]]);
  }

  // 4. AISLAMIENTO DE TONELAJE & AUTO-PROPAGACIÓN DE FÓRMULAS
  ensureRowFormulas(sheet, targetRow, categoria, {
    series: series,
    reps: repsOrDistance,
    scoreReps: scoreReps,
    distancia: repsOrDistance
  });

  SpreadsheetApp.flush();

  // 5. Mantener exactamente una sola fila limpia al final sin generar saltos masivos
  ensureSingleCleanBottomRow(sheet, targetRow);

  // 6. Telemetría de Monitoreo Proactivo en 'Log_Script'
  logScriptEvent(ss, "INSERT_REGISTRO_DIARIO", atleta, targetRow, "HEALTHY", "Cat: " + categoria + " | Ej: " + ejercicio + " | PesoWOD: " + pesoWod + "kg | Carga: " + cargaKg + "kg | 1RM: " + rmKg + "kg | WOD: " + duracion + " / Score_Reps(X): " + scoreReps + " | Col H: " + repsOrDistance + " | RPE: " + rpe);
  SpreadsheetApp.flush();
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
 * Obtiene las marcas de 1RM desde la pestaña 'RM_Atletas'
 */
function getRmData(ss) {
  var sheet = ss.getSheetByName(TABS.RM_ATLETAS);
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

  // REGLA DE EQUIVALENCIA ABSOLUTA DE 1RM: JERKS Y COMPLEX OLÍMPICOS
  for (var ath in rmMap) {
    // Puente Jerks
    var jVal = rmMap[ath]["Jerk"] || rmMap[ath]["Push Jerk"] || rmMap[ath]["Split Jerk"];
    if (jVal) {
      if (!rmMap[ath]["Jerk"]) rmMap[ath]["Jerk"] = jVal;
      if (!rmMap[ath]["Push Jerk"]) rmMap[ath]["Push Jerk"] = jVal;
      if (!rmMap[ath]["Split Jerk"]) rmMap[ath]["Split Jerk"] = jVal;
    }
    // Puente Snatch Complex -> Snatch
    var sVal = rmMap[ath]["Snatch"] || rmMap[ath]["Snatch Complex"] || rmMap[ath]["Power Snatch"];
    if (sVal) {
      if (!rmMap[ath]["Snatch Complex"]) rmMap[ath]["Snatch Complex"] = sVal;
    }
    // Puente Clean Complex -> Clean Squat
    var cVal = rmMap[ath]["Clean Squat"] || rmMap[ath]["Clean Complex"] || rmMap[ath]["Squat Clean"] || rmMap[ath]["Clean"] || rmMap[ath]["Clean & Jerk"];
    if (cVal) {
      if (!rmMap[ath]["Clean Complex"]) rmMap[ath]["Clean Complex"] = cVal;
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
 */
function auditIntegrityCheck(ss) {
  var report = {
    status: "HEALTHY",
    version: "18.1.0",
    geminiStatus: !!getGeminiApiKey() ? "API_KEY_CONFIGURED" : "API_KEY_MISSING",
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

