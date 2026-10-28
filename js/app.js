/**
 * PLATAFORMA KLEOS - CONTROLADOR DE PRODUCCIÓN
 * Gestión de Atletas Dinámicos, Lógica de Cardio (Carrera) y Ecuación Epley de 1RM
 */

document.addEventListener('DOMContentLoaded', () => {
  // Claves de Almacenamiento Local
  const STORAGE_KEYS = {
    ATHLETE: 'kleos_athlete_name',
    SCRIPT_URL: 'kleos_script_url',
    LAST_WELLNESS: 'kleos_last_wellness_record',
    LAST_WOD: 'kleos_last_wod_record',
    CACHED_ATHLETES: 'kleos_cached_athletes',
    CACHED_RM: 'kleos_cached_rm_data'
  };

  // URL Oficial del Web App en Google Cloud / Google Apps Script (Versión Definitiva 24/7 - Alta Concurrencia)
  const OFFICIAL_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzBrbeleVQHEDqLG3iiF7bsR7jxY8wGCYjWfJUmRU-YFv3H73ro2tnvW57HJw6n_qwEmw/exec';
  const OBSOLETE_HASHES = [
    'AKfycbzvS6EK5kVhPDbJgePYMjUA9AM5npOdDYnau9Iu6MxZ7c-sRSJhClZbK3thRLr0JQZq8A',
    'AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh'
  ];

  let savedUrl = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL);
  // Auto-actualizar si no existe, apunta a entorno no válido o si el cliente tenía en caché una versión anterior
  const isObsolete = !savedUrl || !savedUrl.startsWith('https://script.google.com/') || OBSOLETE_HASHES.some(h => savedUrl.indexOf(h) !== -1);
  if (isObsolete || savedUrl !== OFFICIAL_SCRIPT_URL) {
    savedUrl = OFFICIAL_SCRIPT_URL;
    localStorage.setItem(STORAGE_KEYS.SCRIPT_URL, OFFICIAL_SCRIPT_URL);
  }
  let currentScriptUrl = savedUrl;

  // Memoria en vivo de datos
  let rmDataStore = {};
  let athletesList = [];

  // Elementos Principales del DOM
  const athleteSelect = document.getElementById('athleteSelect');
  const btnRefreshAthletes = document.getElementById('btnRefreshAthletes');
  const statusDot = document.getElementById('statusDot');
  const btnConfig = document.getElementById('btnConfig');
  const configModal = document.getElementById('configModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const scriptUrlInput = document.getElementById('scriptUrlInput');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const testResultMsg = document.getElementById('testResultMsg');

  // Badges y Avisos
  const wellnessStatusBadge = document.getElementById('wellnessStatusBadge');
  const wodStatusBadge = document.getElementById('wodStatusBadge');
  const wellnessNotice = document.getElementById('wellnessNotice');
  const wellnessNoticeText = document.getElementById('wellnessNoticeText');
  const wodNotice = document.getElementById('wodNotice');
  const wodNoticeText = document.getElementById('wodNoticeText');

  // Campos de Registro Diario (WOD / Cardio / Fuerza / Gimnásticos)
  const wodDateInput = document.getElementById('wodDate');
  const wodCategory = document.getElementById('wodCategory');
  const groupExercise = document.getElementById('groupExercise');
  const lblExercise = document.getElementById('lblExercise');
  const wodExercise = document.getElementById('wodExercise');
  const customWodGroup = document.getElementById('customWodGroup');
  const wodCustomName = document.getElementById('wodCustomName');
  const variantGroup = document.getElementById('variantGroup');
  const wodVariant = document.getElementById('wodVariant');
  const variantBadge = document.getElementById('variantBadge');
  const cardioNoticeBox = document.getElementById('cardioNoticeBox');
  const groupTipoWod = document.getElementById('groupTipoWod');
  const wodTipoWod = document.getElementById('wodTipoWod');
  const groupDuration = document.getElementById('groupDuration');
  const lblDuration = document.getElementById('lblDuration');
  const wodDuration = document.getElementById('wodDuration');
  const groupTimeCap = document.getElementById('groupTimeCap');
  const wodTimeCapFinished = document.getElementById('wodTimeCapFinished');
  const groupRoundsCompleted = document.getElementById('groupRoundsCompleted');
  const wodRoundsCompleted = document.getElementById('wodRoundsCompleted');
  const groupExtraReps = document.getElementById('groupExtraReps');
  const wodExtraReps = document.getElementById('wodExtraReps');
  const groupEmomTotalMinutes = document.getElementById('groupEmomTotalMinutes');
  const wodEmomTotalMinutes = document.getElementById('wodEmomTotalMinutes');
  const groupEmomCompletedMinutes = document.getElementById('groupEmomCompletedMinutes');
  const wodEmomCompletedMinutes = document.getElementById('wodEmomCompletedMinutes');
  const badgeScoreCalculado = document.getElementById('badgeScoreCalculado');
  const groupScoreReps = document.getElementById('groupScoreReps');
  const wodScoreReps = document.getElementById('wodScoreReps');
  const groupPesoWod = document.getElementById('groupPesoWod');
  const wodPesoWod = document.getElementById('wodPesoWod');
  const groupSeries = document.getElementById('groupSeries');
  const lblSeries = document.getElementById('lblSeries');
  const wodSeries = document.getElementById('wodSeries');
  const groupReps = document.getElementById('groupReps');
  const lblRepsOrDistance = document.getElementById('lblRepsOrDistance');
  const wodReps = document.getElementById('wodReps');
  const groupWeight = document.getElementById('groupWeight');
  const wodWeight = document.getElementById('wodWeight');
  const group1RM = document.getElementById('group1RM');
  const wod1RM = document.getElementById('wod1RM');
  const rmStatusBadge = document.getElementById('rmStatusBadge');
  const source1RMTag = document.getElementById('source1RMTag');
  const groupRpe = document.getElementById('groupRpe');
  const lblRpe = document.getElementById('lblRpe');
  const wodRpe = document.getElementById('wodRpe');

  // Calculadora Epley
  const epleyBox = document.getElementById('epleyBox');
  const epleyWeight = document.getElementById('epleyWeight');
  const epleyReps = document.getElementById('epleyReps');
  const epleyResultBadge = document.getElementById('epleyResultBadge');
  const btnApplyEpley = document.getElementById('btnApplyEpley');

  // =========================================================================
  // CATÁLOGO DE VARIANTES TÉCNICAS POR EJERCICIO MADRE
  // =========================================================================
  const EXERCISE_VARIANTS = {
    'Snatch': [
      'Estándar / Desde el Suelo',
      'High Hang (Colgante Alto)',
      'Low Hang (Colgante Bajo)',
      'Desde Tacos (Blocks)',
      'Power Snatch (Potencia)',
      'Muscle Snatch',
      'Pausa en Recepción',
      'Pausa en Rodillas'
    ],
    'Clean & Jerk': [
      'Estándar / Desde el Suelo',
      'High Hang Clean & Jerk',
      'Low Hang Clean & Jerk',
      'Desde Tacos (Blocks)',
      'Power Clean & Split Jerk',
      'Power Clean & Push Jerk'
    ],
    'Clean Squat': [
      'Estándar / Desde el Suelo',
      'High Hang (Colgante Alto)',
      'Low Hang (Colgante Bajo)',
      'Desde Tacos (Blocks)',
      'Pausa en Recepción',
      'Power Clean (Potencia)'
    ],
    'Clean': [
      'Estándar / Desde el Suelo',
      'High Hang (Colgante Alto)',
      'Low Hang (Colgante Bajo)',
      'Desde Tacos (Blocks)',
      'Power Clean (Potencia)'
    ],
    'Power Snatch': [
      'Desde el Suelo',
      'High Hang',
      'Low Hang',
      'Desde Tacos (Blocks)'
    ],
    'Power Clean': [
      'Desde el Suelo',
      'High Hang',
      'Low Hang',
      'Desde Tacos (Blocks)'
    ],
    'Snatch Complex': [
      'Snatch + Overhead Squat',
      'Power Snatch + Hang Snatch',
      'Snatch + Hang Snatch + OHS',
      'High Hang + Low Hang Snatch',
      'Snatch Pull + Snatch'
    ],
    'Clean Complex': [
      'Clean + Front Squat + Jerk',
      'Power Clean + Hang Clean + Jerk',
      'Clean + Jerk + Jerk',
      'Clean Pull + Clean Squat',
      'Hang Clean + Front Squat'
    ],
    'Back Squat': [
      'Estándar (Completa)',
      'Pausa (3s en el Fondo)',
      'Box Squat (Caja)',
      'Tempo Lento (3-1-X-1)',
      '1 y 1/4 (Repetición y Cuarto)'
    ],
    'Front Squat': [
      'Estándar (Completa)',
      'Pausa en el Fondo',
      'Desde Pines / Tacos',
      'Tempo Lento'
    ],
    'Deadlift': [
      'Convencional (Suelo)',
      'Sumo',
      'Desde Tacos / Bloques',
      'Déficit',
      'Rumano (RDL)',
      'Pausa en Rodillas'
    ],
    'Bench Press': [
      'Estándar',
      'Pausa en Pecho',
      'Agarre Estrecho',
      'Spoto Press (Pausa en el Aire)',
      'Desde Pines / Tacos'
    ],
    'Strict Press': [
      'Estándar de Pie',
      'Z-Press (Sentado en Suelo)',
      'Desde Pines'
    ],
    'Push Press': [
      'Estándar',
      'Pausa en Dip',
      'Tras Nuca'
    ],
    'Jerk': [
      'Estándar (Split / Push)',
      'Push Jerk',
      'Split Jerk',
      'Power Jerk',
      'Tras Nuca (Behind the Neck)',
      'Desde Soportes / Tacos'
    ],
    'Push Jerk': [
      'Estándar',
      'Pausa en Recepción (Catch)',
      'Tras Nuca',
      'Desde Soportes'
    ],
    'Split Jerk': [
      'Estándar',
      'Pausa en Tijera (Split Catch)',
      'Tras Nuca',
      'Desde Soportes'
    ],
    'Overhead Squat': [
      'Estándar',
      'Pausa en el Fondo',
      'Desde Soportes'
    ]
  };

  function getMotherExerciseKey(selectedExercise) {
    if (!selectedExercise) return null;
    const clean = selectedExercise.trim().toLowerCase();
    for (const key of Object.keys(EXERCISE_VARIANTS)) {
      if (key.toLowerCase() === clean) return key;
    }
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
    if (clean.indexOf('deadlift') !== -1) return 'Deadlift';
    if (clean.indexOf('bench press') !== -1) return 'Bench Press';
    if (clean.indexOf('strict press') !== -1) return 'Strict Press';
    if (clean.indexOf('push press') !== -1) return 'Push Press';
    return null;
  }

  function updateVariantOptions() {
    let vGroup = document.getElementById('variantGroup');
    let vSelect = document.getElementById('wodVariant');
    let vBadge = document.getElementById('variantBadge');

    if (!vGroup && wodExercise) {
      vGroup = document.createElement('div');
      vGroup.id = 'variantGroup';
      vGroup.className = 'form-group full-width';
      vGroup.style.display = 'none';
      vGroup.innerHTML = `
        <div class="label-with-badge">
          <label for="wodVariant">Variante Técnica (High Hang, Low Hang, Desde Tacos...)</label>
          <span id="variantBadge" class="badge">Variantes Disponibles</span>
        </div>
        <select id="wodVariant">
          <option value="">-- Estándar / Desde el Suelo (Sin variante) --</option>
        </select>
      `;
      const parentFormGroup = wodExercise.closest('.form-group');
      if (parentFormGroup) {
        parentFormGroup.insertAdjacentElement('afterend', vGroup);
      }
      vSelect = document.getElementById('wodVariant');
      vBadge = document.getElementById('variantBadge');

      if (vSelect) {
        vSelect.addEventListener('change', () => {
          updateExerciseRmState();
        });
      }
    }

    if (!vGroup || !vSelect) return;

    const currentCat = wodCategory ? wodCategory.value : 'Fuerza';
    if (currentCat !== 'Fuerza' && currentCat !== 'Levantamiento Olímpico') {
      vGroup.style.display = 'none';
      return;
    }

    const rawExercise = (wodExercise.value || '').trim();
    const motherKey = getMotherExerciseKey(rawExercise);

    if (motherKey && EXERCISE_VARIANTS[motherKey] && EXERCISE_VARIANTS[motherKey].length > 0) {
      const variants = EXERCISE_VARIANTS[motherKey];
      vSelect.innerHTML = '<option value="">-- Estándar / Desde el Suelo (Sin variante) --</option>';

      variants.forEach(variant => {
        if (variant.toLowerCase().indexOf('estándar') === -1) {
          const opt = document.createElement('option');
          opt.value = variant;
          opt.textContent = `⚡ ${variant}`;
          vSelect.appendChild(opt);
        }
      });

      vGroup.style.display = 'block';
      if (vBadge) {
        vBadge.textContent = `${motherKey}: ${variants.length - 1} variantes técnicas`;
        vBadge.className = 'badge';
      }
    } else {
      vSelect.innerHTML = '<option value="">-- Sin variantes para este ejercicio --</option>';
      vGroup.style.display = 'none';
    }
  }

  // =========================================================================
  // GESTIÓN DE TIME CAP Y SCORE MATEMÁTICO DE 3 POSICIONES DECIMALES (COL X)
  // =========================================================================
  // GESTIÓN INTEGRAL DE FORMATOS METCON (FOR TIME, AMRAP, EMOM)
  // Formato matemático universal de TRES (3) decimales (/1000) en Col X ('Score_Reps')
  // =========================================================================
  function updateMetconScorePreview() {
    if (!wodScoreReps) return;

    const tipoWod = (wodTipoWod ? wodTipoWod.value : 'Por Tiempo (For Time)');
    const isForTime = tipoWod.indexOf('Time') !== -1 || tipoWod.indexOf('Tiempo') !== -1;
    const isAmrap = tipoWod.indexOf('AMRAP') !== -1;
    const isEmom = tipoWod.indexOf('EMOM') !== -1;

    // Regla: Si no estamos en Metcon / WOD, salir
    if (wodCategory && wodCategory.value !== 'Metcon / WOD') return;

    if (isForTime) {
      // -----------------------------------------------------------------------
      // A. SI TIPO DE WOD == "For Time"
      // -----------------------------------------------------------------------
      if (groupTimeCap) groupTimeCap.style.display = 'block';
      if (groupRoundsCompleted) groupRoundsCompleted.style.display = 'block';
      if (groupEmomTotalMinutes) groupEmomTotalMinutes.style.display = 'none';
      if (groupEmomCompletedMinutes) groupEmomCompletedMinutes.style.display = 'none';

      // Rondas Completadas SIEMPRE debe ser 100% editable por el atleta
      if (wodRoundsCompleted) {
        wodRoundsCompleted.readOnly = false;
        wodRoundsCompleted.disabled = false;
        wodRoundsCompleted.style.opacity = '1';
        wodRoundsCompleted.style.cursor = 'text';
      }

      const isNoTermino = wodTimeCapFinished && wodTimeCapFinished.value === 'NO';

      if (isNoTermino) {
        // Si [NO]: Muestra de forma obligatoria el campo abierto de repeticiones adicionales
        if (groupExtraReps) groupExtraReps.style.display = 'block';
        if (wodExtraReps) {
          wodExtraReps.readOnly = false;
          wodExtraReps.disabled = false;
        }
      } else {
        // Si [SÍ]: Oculta el campo de repeticiones adicionales
        if (groupExtraReps) groupExtraReps.style.display = 'none';
        if (wodExtraReps) wodExtraReps.value = '';
      }

      let rondas = parseInt(wodRoundsCompleted ? wodRoundsCompleted.value : 0, 10);
      if (isNaN(rondas) || rondas < 0) rondas = 0;

      let extraReps = 0;
      if (isNoTermino && wodExtraReps) {
        extraReps = parseInt(wodExtraReps.value, 10);
        if (isNaN(extraReps) || extraReps < 0) extraReps = 0;
      }

      // Fórmula: Rondas_Completas + (Reps_Adicionales / 1000)
      const scoreVal = (rondas + (extraReps / 1000)).toFixed(3);
      wodScoreReps.value = scoreVal;

      if (badgeScoreCalculado) {
        if (!isNoTermino) {
          badgeScoreCalculado.textContent = `${scoreVal} (For Time: ${rondas} rondas completas)`;
        } else {
          badgeScoreCalculado.textContent = `${scoreVal} (For Time: ${rondas}R + ${extraReps} reps extras)`;
        }
      }

    } else if (isAmrap) {
      // -----------------------------------------------------------------------
      // B. SI TIPO DE WOD == "AMRAP"
      // ¡REGLA ESTRICTA!: NO muestres el selector de "¿Terminó el WOD?"
      // -----------------------------------------------------------------------
      if (groupTimeCap) groupTimeCap.style.display = 'none';
      if (groupEmomTotalMinutes) groupEmomTotalMinutes.style.display = 'none';
      if (groupEmomCompletedMinutes) groupEmomCompletedMinutes.style.display = 'none';

      // Despliega de forma directa y abierta dos campos numéricos para el atleta:
      // "Rondas Completadas" (Input entero libre)
      // "Repeticiones Adicionales" (Input entero libre)
      if (groupRoundsCompleted) groupRoundsCompleted.style.display = 'block';
      if (wodRoundsCompleted) {
        wodRoundsCompleted.readOnly = false;
        wodRoundsCompleted.disabled = false;
        wodRoundsCompleted.style.opacity = '1';
        wodRoundsCompleted.style.cursor = 'text';
      }
      if (groupExtraReps) groupExtraReps.style.display = 'block';
      if (wodExtraReps) {
        wodExtraReps.readOnly = false;
        wodExtraReps.disabled = false;
      }

      let rondas = parseInt(wodRoundsCompleted ? wodRoundsCompleted.value : 0, 10);
      if (isNaN(rondas) || rondas < 0) rondas = 0;

      let extraReps = parseInt(wodExtraReps ? wodExtraReps.value : 0, 10);
      if (isNaN(extraReps) || extraReps < 0) extraReps = 0;

      // Fórmula: Rondas_Completas + (Reps_Adicionales / 1000)
      const scoreVal = (rondas + (extraReps / 1000)).toFixed(3);
      wodScoreReps.value = scoreVal;

      if (badgeScoreCalculado) {
        badgeScoreCalculado.textContent = `${scoreVal} (AMRAP: ${rondas}R + ${extraReps} reps)`;
      }

    } else if (isEmom) {
      // -----------------------------------------------------------------------
      // C. SI TIPO DE WOD == "EMOM"
      // ¡REGLA ESTRICTA!: NO muestres el selector de "¿Terminó el WOD?" ni repeticiones adicionales ni rondas
      // -----------------------------------------------------------------------
      if (groupTimeCap) groupTimeCap.style.display = 'none';
      if (groupRoundsCompleted) groupRoundsCompleted.style.display = 'none';
      if (groupExtraReps) groupExtraReps.style.display = 'none';

      // Despliega de forma directa dos campos numéricos específicos para el atleta:
      // "Minutos Totales del EMOM" (ej: 16)
      // "Minutos Completados con Éxito" (ej: 14)
      if (groupEmomTotalMinutes) groupEmomTotalMinutes.style.display = 'block';
      if (groupEmomCompletedMinutes) groupEmomCompletedMinutes.style.display = 'block';
      if (wodEmomTotalMinutes) {
        wodEmomTotalMinutes.readOnly = false;
        wodEmomTotalMinutes.disabled = false;
      }
      if (wodEmomCompletedMinutes) {
        wodEmomCompletedMinutes.readOnly = false;
        wodEmomCompletedMinutes.disabled = false;
      }

      let minTotales = parseInt(wodEmomTotalMinutes ? wodEmomTotalMinutes.value : 0, 10);
      if (isNaN(minTotales) || minTotales < 0) minTotales = 0;

      let minCompletados = parseInt(wodEmomCompletedMinutes ? wodEmomCompletedMinutes.value : 0, 10);
      if (isNaN(minCompletados) || minCompletados < 0) minCompletados = 0;
      if (minCompletados > minTotales && minTotales > 0) minCompletados = minTotales;

      let minFaltantes = Math.max(0, minTotales - minCompletados);

      // Fórmula EMOM: Valor_Columna_X = Minutos_Completados + (Minutos_Faltantes / 1000)
      const scoreVal = (minCompletados + (minFaltantes / 1000)).toFixed(3);
      wodScoreReps.value = scoreVal;

      if (badgeScoreCalculado) {
        if (minFaltantes === 0) {
          badgeScoreCalculado.textContent = `${scoreVal} (EMOM: ${minCompletados}/${minTotales} min al 100%)`;
        } else {
          badgeScoreCalculado.textContent = `${scoreVal} (EMOM: ${minCompletados}/${minTotales} min | Faltaron ${minFaltantes} min)`;
        }
      }

      // Sincronizar duración si está vacía
      if (wodDuration && (!wodDuration.value || wodDuration.value === '07:50' || wodDuration.value === '16:00')) {
        wodDuration.value = `${minTotales.toString().padStart(2, '0')}:00`;
      }
    }
  }

  if (wodTipoWod) {
    wodTipoWod.addEventListener('change', () => {
      const tipo = wodTipoWod.value;
      if (tipo.indexOf('AMRAP') !== -1) {
        if (wodRoundsCompleted && (!wodRoundsCompleted.value || wodRoundsCompleted.value === '3' || wodRoundsCompleted.value === '4')) {
          wodRoundsCompleted.value = 8;
        }
        if (wodExtraReps && (!wodExtraReps.value || wodExtraReps.value === '0')) {
          wodExtraReps.value = 15;
        }
      } else if (tipo.indexOf('EMOM') !== -1) {
        if (wodEmomTotalMinutes && !wodEmomTotalMinutes.value) {
          wodEmomTotalMinutes.value = 16;
        }
        if (wodEmomCompletedMinutes && !wodEmomCompletedMinutes.value) {
          wodEmomCompletedMinutes.value = 16;
        }
      } else {
        // For Time
        if (wodRoundsCompleted && (!wodRoundsCompleted.value || wodRoundsCompleted.value === '8')) {
          wodRoundsCompleted.value = 4;
        }
      }
      updateMetconScorePreview();
    });
  }

  if (wodTimeCapFinished) {
    wodTimeCapFinished.addEventListener('change', () => {
      if (wodTimeCapFinished.value === 'NO') {
        // Al seleccionar NO, sugerir 3 solo si estaba vacío o en 4
        if (wodRoundsCompleted && (!wodRoundsCompleted.value || wodRoundsCompleted.value === '4')) {
          wodRoundsCompleted.value = 3;
        }
        if (wodExtraReps) {
          wodExtraReps.focus();
        }
      } else {
        // Al seleccionar SÍ, sugerir 4 solo si estaba vacío o en 3
        if (wodRoundsCompleted && (!wodRoundsCompleted.value || wodRoundsCompleted.value === '3')) {
          wodRoundsCompleted.value = 4;
        }
        if (wodExtraReps) {
          wodExtraReps.value = '';
        }
      }
      updateMetconScorePreview();
    });
  }

  if (wodRoundsCompleted) {
    wodRoundsCompleted.addEventListener('input', updateMetconScorePreview);
  }

  if (wodExtraReps) {
    wodExtraReps.addEventListener('input', updateMetconScorePreview);
  }

  if (wodEmomTotalMinutes) {
    wodEmomTotalMinutes.addEventListener('input', updateMetconScorePreview);
  }

  if (wodEmomCompletedMinutes) {
    wodEmomCompletedMinutes.addEventListener('input', updateMetconScorePreview);
  }

  // Fechas predeterminadas
  const todayStr = new Date().toISOString().split('T')[0];
  const wellnessDateInput = document.getElementById('wellnessDate');
  if (wellnessDateInput) wellnessDateInput.value = todayStr;
  if (wodDateInput) wodDateInput.value = todayStr;

  // Inicializar estado de conexión y badges
  updateConnectionStatus();
  updateSessionStatusIndicators();

  // Cargar Caché previo de Atletas y RMs
  try {
    const cachedAthletes = localStorage.getItem(STORAGE_KEYS.CACHED_ATHLETES);
    if (cachedAthletes) {
      athletesList = JSON.parse(cachedAthletes);
      renderAthletesSelect(athletesList);
    }
    const cachedRm = localStorage.getItem(STORAGE_KEYS.CACHED_RM);
    if (cachedRm) {
      rmDataStore = JSON.parse(cachedRm);
    }
  } catch (_) { }

  // Sincronizar atletas desde Google Sheets
  fetchAthletesAndRm();
  updateVariantOptions();

  // =========================================================================
  // CONSUMO DINÁMICO DE 'Nombre de Atletas' Y 'RM_Atletas'
  // =========================================================================
  async function fetchAthletesAndRm() {
    if (!currentScriptUrl) {
      // Si aún no hay URL, suministrar atletas griegos de muestra
      if (athletesList.length === 0) {
        athletesList = ["Alejandro Magno", "Aquiles", "Leonidas", "Hércules", "Odiseo"];
        renderAthletesSelect(athletesList);
      }
      return;
    }

    try {
      athleteSelect.innerHTML = '<option disabled selected>🔄 Conectando con Google Sheets...</option>';
      const response = await fetch(currentScriptUrl, { method: 'GET', mode: 'cors' });

      if (response.ok) {
        const data = await response.json();

        if (data.athletes && Array.isArray(data.athletes) && data.athletes.length > 0) {
          athletesList = data.athletes;
          localStorage.setItem(STORAGE_KEYS.CACHED_ATHLETES, JSON.stringify(athletesList));
        }

        if (data.rmData && typeof data.rmData === 'object') {
          rmDataStore = data.rmData;
          localStorage.setItem(STORAGE_KEYS.CACHED_RM, JSON.stringify(rmDataStore));
        }

        if (data.activeCycle) {
          localStorage.setItem('kleos_active_cycle', data.activeCycle);
          const lblCiclo = document.getElementById('lblCicloActivo');
          if (lblCiclo) lblCiclo.textContent = `🔄 Macrociclo: ${data.activeCycle}`;
        }

        renderAthletesSelect(athletesList);
        updateExerciseRmState();
      } else {
        renderAthletesSelect(athletesList);
      }
    } catch (err) {
      console.warn('Usando lista local de atletas:', err);
      renderAthletesSelect(athletesList);
    }
  }

  function renderAthletesSelect(list) {
    athleteSelect.innerHTML = '';

    if (!list || list.length === 0) {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "Sin atletas (haz clic en ⚙️ para conectar Sheets)";
      athleteSelect.appendChild(opt);
      return;
    }

    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Selecciona tu Atleta --";
    defaultOpt.disabled = true;
    athleteSelect.appendChild(defaultOpt);

    const saved = localStorage.getItem(STORAGE_KEYS.ATHLETE);
    let matched = false;

    list.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (saved && saved.toLowerCase() === name.toLowerCase()) {
        opt.selected = true;
        matched = true;
      }
      athleteSelect.appendChild(opt);
    });

    if (!matched && list.length > 0) {
      athleteSelect.selectedIndex = 1; // Seleccionar el primero por comodidad
      localStorage.setItem(STORAGE_KEYS.ATHLETE, athleteSelect.value);
    }
    renderDashboardAthletesSelect(list);
  }

  athleteSelect.addEventListener('change', (e) => {
    localStorage.setItem(STORAGE_KEYS.ATHLETE, e.target.value);
    updateExerciseRmState();
    // Sincronizar con el dashboard si el usuario lo tiene en perfil individual
    const dashSelect = document.getElementById('dashboardAthleteSelect');
    if (dashSelect && dashSelect.value !== 'todos') {
      dashSelect.value = e.target.value;
      if (typeof loadDashboardData === 'function' && tabDashboard && tabDashboard.classList.contains('active')) {
        loadDashboardData(e.target.value);
      }
    }
  });

  if (btnRefreshAthletes) {
    btnRefreshAthletes.addEventListener('click', async () => {
      showToast('Sincronizando atletas desde Google Sheets...', 'success');
      await fetchAthletesAndRm();
      showToast('Lista de atletas actualizada', 'success');
    });
  }

  // =========================================================================
  // GESTIÓN DE ACCESO ENTRE SECCIONES INDEPENDIENTES (HUB CARDS)
  // =========================================================================
  const tabWellness = document.getElementById('tabWellness');
  const tabWod = document.getElementById('tabWod');
  const tabDashboard = document.getElementById('tabDashboard');
  const panelWellness = document.getElementById('panelWellness');
  const panelWod = document.getElementById('panelWod');
  const panelDashboard = document.getElementById('panelDashboard');

  function switchSection(target) {
    [tabWellness, tabWod, tabDashboard].forEach(t => {
      if (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });
    [panelWellness, panelWod, panelDashboard].forEach(p => {
      if (p) p.classList.remove('active');
    });

    if (target === 'wellness') {
      if (tabWellness) {
        tabWellness.classList.add('active');
        tabWellness.setAttribute('aria-selected', 'true');
      }
      if (panelWellness) panelWellness.classList.add('active');
    } else if (target === 'wod') {
      if (tabWod) {
        tabWod.classList.add('active');
        tabWod.setAttribute('aria-selected', 'true');
      }
      if (panelWod) panelWod.classList.add('active');
    } else if (target === 'dashboard') {
      if (tabDashboard) {
        tabDashboard.classList.add('active');
        tabDashboard.setAttribute('aria-selected', 'true');
      }
      if (panelDashboard) panelDashboard.classList.add('active');

      // Cargar datos del dashboard al entrar
      const curSelect = document.getElementById('dashboardAthleteSelect');
      const targetAth = curSelect ? curSelect.value : 'todos';
      if (typeof loadDashboardData === 'function') {
        loadDashboardData(targetAth);
      }
    }
  }

  if (tabWellness) tabWellness.addEventListener('click', () => switchSection('wellness'));
  if (tabWod) tabWod.addEventListener('click', () => switchSection('wod'));
  if (tabDashboard) tabDashboard.addEventListener('click', () => switchSection('dashboard'));

  // =========================================================================
  // GESTIÓN DINÁMICA DE CATEGORÍAS, RPE Y LÓGICA DE 1RM / WOD
  // =========================================================================

  function updateRpeOptions(category) {
    if (!wodRpe) return;
    const currentVal = wodRpe.value;
    wodRpe.innerHTML = '';

    let options = [];
    if (category === 'Fuerza' || category === 'Levantamiento Olímpico') {
      options = [
        { val: '10', text: '10 - Fallo absoluto / Máximo esfuerzo' },
        { val: '9.5', text: '9.5 - Muy pesado (1 rep en reserva dudosa)' },
        { val: '9', text: '9 - Muy pesado (1 rep en reserva sólida)', selected: true },
        { val: '8.5', text: '8.5 - Duro pero controlado (1-2 reps en reserva)' },
        { val: '8', text: '8 - Esfuerzo controlado (2 reps en reserva)' },
        { val: '7.5', text: '7.5 - Buen ritmo (2-3 reps en reserva)' },
        { val: '7', text: '7 - Esfuerzo submáximo (3 reps en reserva)' },
        { val: '6', text: '6 - Submáximo (3 a 4 reps en reserva)' },
        { val: '5', text: '5 o menos - Calentamiento / Técnica básica' }
      ];
    } else if (category === 'Gimnásticos') {
      options = [
        { val: '10', text: '10 - Fallo motor absoluto / Incapacidad técnica' },
        { val: '9.5', text: '9.5 - Pérdida de forma inminente' },
        { val: '9', text: '9 - Pérdida de forma / Fatiga neuromuscular alta' },
        { val: '8.5', text: '8.5 - Esfuerzo alto demandante' },
        { val: '8', text: '8 - Esfuerzo alto con control técnico sólido', selected: true },
        { val: '7.5', text: '7.5 - Buen control motor' },
        { val: '7', text: '7 - Control motor bueno / Esfuerzo submáximo' },
        { val: '6', text: '6 - Fluidez técnica sin fatiga' },
        { val: '5', text: '5 o menos - Activación / Calentamiento' }
      ];
    } else if (category === 'Metcon / WOD') {
      options = [
        { val: '10', text: '10 - Fallo táctico total / "Crash and Burn" (Let it rip)' },
        { val: '9.5', text: '9.5 - Vaciado crítico extremo' },
        { val: '9', text: '9 - Vaciado crítico / Hiperventilación intensa', selected: true },
        { val: '8.5', text: '8.5 - Acidosis muy alta' },
        { val: '8', text: '8 - Acidosis alta / Ritmo duro (5 a 15 min)' },
        { val: '7.5', text: '7.5 - Umbral exigente' },
        { val: '7', text: '7 - Umbral sostenible (>15 min)' },
        { val: '6', text: '6 - Ritmo aeróbico cómodo (Zona 2 / Conversacional)' },
        { val: '5', text: '5 o menos - Regenerativo / Recuperación' }
      ];
    } else if (category === 'Cardio') {
      options = [
        { val: '10', text: '10 - Ritmo de carrera agónico / Sprint final' },
        { val: '9.5', text: '9.5 - Ritmo de prueba máxima' },
        { val: '9', text: '9 - Hiperventilación / Ritmo muy duro' },
        { val: '8.5', text: '8.5 - Ritmo umbral anaeróbico' },
        { val: '8', text: '8 - Ritmo de tempo fuerte y sostenido' },
        { val: '7.5', text: '7.5 - Ritmo de media maratón / crucero' },
        { val: '7', text: '7 - Ritmo aeróbico sostenible (Zona 3)', selected: true },
        { val: '6', text: '6 - Ritmo aeróbico conversacional (Zona 2)' },
        { val: '5', text: '5 o menos - Trote suave de calentamiento / regenerativo' }
      ];
    } else {
      options = [
        { val: '10', text: '10 - Máximo esfuerzo' },
        { val: '9', text: '9 - Muy duro' },
        { val: '8', text: '8 - Duro pero controlado', selected: true },
        { val: '7', text: '7 - Moderado a alto' },
        { val: '6', text: '6 - Moderado' },
        { val: '5', text: '5 o menos - Ligero' }
      ];
    }

    options.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.val;
      opt.textContent = optData.text;
      if (currentVal && currentVal === optData.val) {
        opt.selected = true;
      } else if (!currentVal && optData.selected) {
        opt.selected = true;
      }
      wodRpe.appendChild(opt);
    });
  }

  function lookupAndApply1RM(athlete, exercise, motherKey) {
    let registeredRm = null;

    if (athlete && rmDataStore[athlete]) {
      const athleteRms = rmDataStore[athlete];
      const lookupKeys = [exercise, motherKey];
      if (motherKey === 'Jerk' || exercise === 'Jerk' || exercise.toLowerCase().indexOf('jerk') !== -1) {
        if (exercise.toLowerCase().indexOf('clean & jerk') === -1) {
          lookupKeys.push('Jerk', 'Push Jerk', 'Split Jerk');
        }
      }
      if (motherKey === 'Snatch' || exercise === 'Snatch' || exercise === 'Snatch Complex' || exercise.toLowerCase().indexOf('snatch') !== -1) {
        lookupKeys.push('Snatch', 'Snatch Complex', 'Power Snatch');
      }
      if (motherKey === 'Clean Squat' || exercise === 'Clean Squat' || exercise === 'Clean Complex' || exercise.toLowerCase().indexOf('clean') !== -1) {
        lookupKeys.push('Clean Squat', 'Clean Complex', 'Squat Clean', 'Clean', 'Clean & Jerk', 'Power Clean');
      }
      for (const k of lookupKeys) {
        if (k && athleteRms[k] !== undefined && athleteRms[k] !== null && athleteRms[k] !== '') {
          const parsed = parseFloat(athleteRms[k]);
          if (!isNaN(parsed) && parsed > 0) {
            registeredRm = parsed;
            break;
          }
        }
      }
      if (!registeredRm || isNaN(registeredRm) || registeredRm <= 0) {
        const exKey = Object.keys(athleteRms).find(k => {
          const lk = k.toLowerCase().trim();
          if (lk === exercise.toLowerCase().trim() || lk === motherKey.toLowerCase().trim()) return true;
          if (motherKey === 'Clean Squat' || exercise === 'Clean Squat') {
            return lk === 'clean squat' || lk === 'squat clean' || lk === 'clean';
          }
          return false;
        });
        if (exKey && athleteRms[exKey]) {
          registeredRm = parseFloat(athleteRms[exKey]);
        }
      }
    }

    if (registeredRm && registeredRm > 0) {
      wod1RM.value = registeredRm;
      source1RMTag.textContent = '1RM Hoja';
      source1RMTag.className = 'source-tag';
      rmStatusBadge.textContent = `✅ 1RM ${motherKey}: ${registeredRm} kg`;
      rmStatusBadge.className = 'badge';
      if (epleyBox) epleyBox.style.display = 'none';
    } else {
      wod1RM.value = '';
      source1RMTag.textContent = 'Calcular con Epley';
      source1RMTag.className = 'source-tag';
      rmStatusBadge.textContent = `⚠️ Sin 1RM en 'RM_Atletas' (${motherKey})`;
      rmStatusBadge.className = 'badge badge-warning';
      if (epleyBox) epleyBox.style.display = 'block';

      if (wodWeight && wodWeight.value && parseFloat(wodWeight.value) > 0) {
        epleyWeight.value = wodWeight.value;
      }
      recalculateEpley();
    }
  }

  function updateExerciseRmState() {
    const category = wodCategory.value;
    const exercise = wodExercise.value;
    const athlete = athleteSelect.value;
    const motherKey = getMotherExerciseKey(exercise) || exercise;

    // Regla: Ocultar siempre cardioNoticeBox
    if (cardioNoticeBox) cardioNoticeBox.style.display = 'none';

    // Actualizar escala de RPE según categoría
    updateRpeOptions(category);

    if (category === 'Fuerza' || category === 'Levantamiento Olímpico') {
      // 1. FUERZA / LEVANTAMIENTO OLÍMPICO (incluyendo Clean Squat, Snatch, Back Squat, Jerk, Peso Muerto)
      if (lblExercise) lblExercise.textContent = 'Columna E: Ejercicio';
      if (groupSeries) groupSeries.style.display = 'block';
      if (lblSeries) lblSeries.textContent = 'Columna G: Series';
      if (groupReps) groupReps.style.display = 'block';
      if (lblRepsOrDistance) lblRepsOrDistance.textContent = 'Columna H: Reps';
      if (wodReps) wodReps.placeholder = 'Ej: 5 (o 3, 8, 10...)';
      if (groupWeight) groupWeight.style.display = 'block';
      if (wodWeight) wodWeight.disabled = false;
      if (group1RM) group1RM.style.display = 'block';
      if (wod1RM) wod1RM.disabled = false;

      if (groupTipoWod) groupTipoWod.style.display = 'none';
      if (groupDuration) groupDuration.style.display = 'none';
      if (groupScoreReps) groupScoreReps.style.display = 'none';
      if (groupPesoWod) groupPesoWod.style.display = 'none';
      if (customWodGroup) customWodGroup.style.display = 'none';

      if (lblRpe) lblRpe.textContent = 'Columna S: RPE de la Sesión (Borg CR-10 / Barra Pesada)';

      lookupAndApply1RM(athlete, exercise, motherKey);

    } else if (category === 'Gimnásticos') {
      // 2. GIMNÁSTICOS (Skill / Peso Corporal)
      if (lblExercise) lblExercise.textContent = 'Columna E: Ejercicio';
      if (groupSeries) groupSeries.style.display = 'block';
      if (lblSeries) lblSeries.textContent = 'Columna G: Series';
      if (groupReps) groupReps.style.display = 'block';
      const isDistanceSkill = exercise.toLowerCase().indexOf('walk') !== -1 || exercise.toLowerCase().indexOf('metros') !== -1;
      if (lblRepsOrDistance) lblRepsOrDistance.textContent = isDistanceSkill ? 'Columna H: Metros' : 'Columna H: Repeticiones';
      if (wodReps) wodReps.placeholder = isDistanceSkill ? 'Ej: 10 (metros)' : 'Ej: 12 reps';

      if (groupWeight) groupWeight.style.display = 'none';
      if (wodWeight) { wodWeight.value = 0; wodWeight.disabled = true; }
      if (group1RM) group1RM.style.display = 'none';
      if (wod1RM) { wod1RM.value = 0; wod1RM.disabled = true; }
      if (epleyBox) epleyBox.style.display = 'none';

      if (groupTipoWod) groupTipoWod.style.display = 'none';
      if (groupDuration) groupDuration.style.display = 'none';
      if (groupScoreReps) groupScoreReps.style.display = 'none';
      if (groupPesoWod) groupPesoWod.style.display = 'none';
      if (customWodGroup) customWodGroup.style.display = 'none';

      if (lblRpe) lblRpe.textContent = 'Columna S: RPE de la Sesión (Borg CR-10)';
      if (rmStatusBadge) {
        rmStatusBadge.textContent = '🤸 Gimnásticos (Carga = 0 kg | 1RM = 0)';
        rmStatusBadge.className = 'badge';
      }

    } else if (category === 'Metcon / WOD') {
      // 3. METCON / WOD
      if (lblExercise) lblExercise.textContent = 'Columna E: Nombre del WOD';
      if (groupTipoWod) groupTipoWod.style.display = 'block';
      if (groupDuration) groupDuration.style.display = 'block';
      if (lblDuration) lblDuration.textContent = 'Columna W: Tiempo / Duración (MM:SS) *Obligatorio*';
      if (wodDuration) wodDuration.placeholder = 'Ej: 07:50 o 18:30 (Obligatorio)';

      if (groupScoreReps) groupScoreReps.style.display = 'block';
      updateMetconScorePreview();

      // Ocultar peso WOD y componentes de fuerza pura
      if (groupPesoWod) groupPesoWod.style.display = 'none';
      if (groupSeries) groupSeries.style.display = 'none';
      if (groupReps) groupReps.style.display = 'none';
      if (groupWeight) groupWeight.style.display = 'none';
      if (wodWeight) { wodWeight.value = 0; wodWeight.disabled = true; }
      if (group1RM) group1RM.style.display = 'none';
      if (wod1RM) { wod1RM.value = 0; wod1RM.disabled = true; }
      if (epleyBox) epleyBox.style.display = 'none';

      if (customWodGroup) {
        customWodGroup.style.display = (exercise === 'Metcon Personalizado') ? 'block' : 'none';
      }

      if (lblRpe) lblRpe.textContent = 'Columna S: RPE de la Sesión (Borg CR-10: 1 al 10)';
      if (rmStatusBadge) {
        rmStatusBadge.textContent = '⏱️ Metcon / WOD (Score: Rondas + Reps/1000 | Tonelaje = 0)';
        rmStatusBadge.className = 'badge';
      }

    } else if (category === 'Cardio') {
      // 4. CARDIO (Carrera Cero Máquinas)
      if (lblExercise) lblExercise.textContent = 'Columna E: Disciplina Cardio';
      if (groupSeries) groupSeries.style.display = 'block';
      if (lblSeries) lblSeries.textContent = 'Columna G: Intervalos / Series';
      if (wodSeries && (!wodSeries.value || wodSeries.value === '0')) wodSeries.value = 1;

      if (groupReps) groupReps.style.display = 'block';
      if (lblRepsOrDistance) lblRepsOrDistance.textContent = 'Columna H: Distancia (km)';
      if (wodReps) wodReps.placeholder = 'Ej: 5.000 (km)';

      if (groupDuration) groupDuration.style.display = 'block';
      if (lblDuration) lblDuration.textContent = 'Columna W: Tiempo Total (MM:SS)';
      if (wodDuration) wodDuration.placeholder = 'Ej: 24:30';

      if (groupWeight) groupWeight.style.display = 'none';
      if (wodWeight) { wodWeight.value = 0; wodWeight.disabled = true; }
      if (group1RM) group1RM.style.display = 'none';
      if (wod1RM) { wod1RM.value = 0; wod1RM.disabled = true; }
      if (epleyBox) epleyBox.style.display = 'none';
      if (groupTipoWod) groupTipoWod.style.display = 'none';
      if (groupScoreReps) groupScoreReps.style.display = 'none';
      if (groupPesoWod) groupPesoWod.style.display = 'none';
      if (customWodGroup) customWodGroup.style.display = 'none';

      if (lblRpe) lblRpe.textContent = 'Columna S: RPE de la Sesión (Borg CR-10)';
      if (rmStatusBadge) {
        rmStatusBadge.textContent = '🏃 Cardio Carrera (Carga = 0 | 1RM = 0)';
        rmStatusBadge.className = 'badge';
      }
    } else {
      // 5. OTRO / GENERAL
      if (lblExercise) lblExercise.textContent = 'Columna E: Ejercicio / Actividad';
      if (groupSeries) groupSeries.style.display = 'block';
      if (lblSeries) lblSeries.textContent = 'Columna G: Series';
      if (groupReps) groupReps.style.display = 'block';
      if (lblRepsOrDistance) lblRepsOrDistance.textContent = 'Columna H: Reps / Cantidad';
      if (wodReps) wodReps.placeholder = 'Ej: 5';
      if (groupWeight) groupWeight.style.display = 'block';
      if (wodWeight) wodWeight.disabled = false;
      if (group1RM) group1RM.style.display = 'block';
      if (wod1RM) wod1RM.disabled = false;
      if (groupTipoWod) groupTipoWod.style.display = 'none';
      if (groupDuration) groupDuration.style.display = 'none';
      if (groupScoreReps) groupScoreReps.style.display = 'none';
      if (groupPesoWod) groupPesoWod.style.display = 'none';
      if (customWodGroup) customWodGroup.style.display = 'none';
      if (lblRpe) lblRpe.textContent = 'Columna S: RPE de la Sesión (Borg CR-10)';
      lookupAndApply1RM(athlete, exercise, motherKey);
    }

    // Ocultar selectores de Time Cap, Rondas y EMOM fuera de Metcon
    if (category !== 'Metcon / WOD') {
      if (groupTipoWod) groupTipoWod.style.display = 'none';
      if (groupTimeCap) groupTimeCap.style.display = 'none';
      if (groupRoundsCompleted) groupRoundsCompleted.style.display = 'none';
      if (groupExtraReps) groupExtraReps.style.display = 'none';
      if (groupEmomTotalMinutes) groupEmomTotalMinutes.style.display = 'none';
      if (groupEmomCompletedMinutes) groupEmomCompletedMinutes.style.display = 'none';
    }
  }

  wodCategory.addEventListener('change', () => {
    const cat = wodCategory.value;
    if (cat === 'Cardio') {
      wodExercise.value = 'Carrera';
    } else if (cat === 'Gimnásticos') {
      if (['Pull Ups', 'Chest to Bar', 'Bar Muscle Ups', 'Ring Muscle Ups', 'Handstand Push Ups', 'Handstand Walk', 'Toes to Bar', 'Pistols', 'Rope Climb', 'Dips'].indexOf(wodExercise.value) === -1) {
        wodExercise.value = 'Pull Ups';
      }
    } else if (cat === 'Metcon / WOD') {
      if (['Fran', 'Cindy', 'Murph', 'Grace', 'Isabel', 'Helen', 'Diane', 'DT', 'Fight Gone Bad', 'Metcon Personalizado'].indexOf(wodExercise.value) === -1) {
        wodExercise.value = 'Fran';
      }
    } else if (cat === 'Fuerza' || cat === 'Levantamiento Olímpico') {
      const allowedLifting = [
        'Back Squat', 'Front Squat', 'Deadlift', 'Snatch', 'Power Snatch', 'Snatch Complex',
        'Clean Squat', 'Power Clean', 'Clean & Jerk', 'Clean Complex',
        'Jerk', 'Push Jerk', 'Split Jerk',
        'Bench Press', 'Strict Press', 'Push Press', 'Overhead Squat', 'Thruster'
      ];
      if (allowedLifting.indexOf(wodExercise.value) === -1) {
        wodExercise.value = cat === 'Levantamiento Olímpico' ? 'Snatch' : 'Back Squat';
      }
    }
    updateVariantOptions();
    updateExerciseRmState();
  });

  wodExercise.addEventListener('change', () => {
    const ex = wodExercise.value;
    // Sincronización inteligente de categoría según ejercicio
    if (['Clean Squat', 'Snatch', 'Clean & Jerk', 'Power Clean', 'Power Snatch', 'Snatch Complex', 'Clean Complex', 'Jerk', 'Push Jerk', 'Split Jerk'].indexOf(ex) !== -1) {
      if (wodCategory.value !== 'Levantamiento Olímpico' && wodCategory.value !== 'Fuerza') {
        wodCategory.value = 'Levantamiento Olímpico';
      }
    } else if (['Back Squat', 'Front Squat', 'Deadlift', 'Bench Press', 'Strict Press', 'Push Press', 'Overhead Squat', 'Thruster'].indexOf(ex) !== -1) {
      if (wodCategory.value !== 'Fuerza' && wodCategory.value !== 'Levantamiento Olímpico') {
        wodCategory.value = 'Fuerza';
      }
    } else if (['Carrera', 'Remo (Row)', 'SkiErg', 'Bicicleta / Echo Bike'].indexOf(ex) !== -1) {
      wodCategory.value = 'Cardio';
    } else if (['Fran', 'Cindy', 'Murph', 'Grace', 'Isabel', 'Helen', 'Diane', 'DT', 'Fight Gone Bad', 'Metcon Personalizado'].indexOf(ex) !== -1) {
      wodCategory.value = 'Metcon / WOD';
    } else if (['Pull Ups', 'Chest to Bar', 'Bar Muscle Ups', 'Ring Muscle Ups', 'Handstand Push Ups', 'Handstand Walk', 'Toes to Bar', 'Pistols', 'Rope Climb', 'Dips'].indexOf(ex) !== -1) {
      wodCategory.value = 'Gimnásticos';
    }

    if (customWodGroup) {
      customWodGroup.style.display = (wodExercise.value === 'Metcon Personalizado') ? 'block' : 'none';
    }
    updateVariantOptions();
    updateExerciseRmState();
  });

  if (wodVariant) {
    wodVariant.addEventListener('change', () => {
      updateExerciseRmState();
    });
  }

  // Ecuación de Epley: 1RM = Peso * (1 + Reps / 30)
  function recalculateEpley() {
    const w = parseFloat(epleyWeight.value);
    const r = parseFloat(epleyReps.value);

    if (!isNaN(w) && w > 0 && !isNaN(r) && r > 0) {
      const epley1RM = Math.round((w * (1 + r / 30)) * 10) / 10;
      epleyResultBadge.textContent = `${epley1RM} kg`;
      epleyResultBadge.dataset.val = epley1RM;
    } else {
      epleyResultBadge.textContent = '-- kg';
      epleyResultBadge.dataset.val = '';
    }
  }

  if (epleyWeight && epleyReps) {
    epleyWeight.addEventListener('input', recalculateEpley);
    epleyReps.addEventListener('input', recalculateEpley);
  }

  if (btnApplyEpley) {
    btnApplyEpley.addEventListener('click', () => {
      const calculated = epleyResultBadge.dataset.val;
      if (calculated && parseFloat(calculated) > 0) {
        wod1RM.value = calculated;
        source1RMTag.textContent = 'Epley Estimado';
        rmStatusBadge.textContent = `⚡ 1RM Epley: ${calculated} kg`;
        rmStatusBadge.className = 'badge';
        showToast(`1RM de ${calculated} kg calculado con Epley aplicado a la sesión`, 'success');
      } else {
        showToast('Ingresa el peso y las repeticiones para calcular el 1RM con Epley', 'error');
        epleyWeight.focus();
      }
    });
  }

  // =========================================================================
  // CONTROLES INTERACTIVOS DE WELLNESS & PREVIEW EN VIVO
  // =========================================================================
  const sleepHours = document.getElementById('sleepHours');
  const valSleepHours = document.getElementById('valSleepHours');
  if (sleepHours && valSleepHours) {
    sleepHours.addEventListener('input', (e) => {
      valSleepHours.textContent = `${e.target.value}h`;
    });
  }

  function updateLiveWellnessScore() {
    const b = parseInt(document.getElementById('sleepQuality').value, 10) || 3;
    const fatiga = parseInt(document.getElementById('fatigueLevel').value, 10) || 4;
    const c = 11 - fatiga;
    const d = parseInt(document.getElementById('muscleSoreness').value, 10) || 5;
    const estres = parseInt(document.getElementById('stressLevel').value, 10) || 2;
    const e = 6 - estres;
    const f = parseInt(document.getElementById('moodLevel').value, 10) || 4;

    const totalScore = b + c + d + e + f;

    const badge = document.getElementById('liveWellnessBadge');
    if (badge) {
      badge.textContent = `Score: ${totalScore} / 30 pts`;
      if (totalScore >= 25) {
        badge.style.color = '#10b981';
      } else if (totalScore >= 18) {
        badge.style.color = 'var(--greek-cyan)';
      } else if (totalScore >= 12) {
        badge.style.color = '#f59e0b';
      } else {
        badge.style.color = '#ef4444';
      }
    }

    const stressBadge = document.getElementById('stressBadge');
    if (stressBadge) {
      stressBadge.textContent = `Nivel Guardado: ${e} pts (6 - ${estres})`;
    }

    const sorenessBadge = document.getElementById('sorenessBadge');
    if (sorenessBadge) {
      const labels = { 1: '1 - Severo', 2: '2 - Alto', 3: '3 - Moderado', 4: '4 - Leve', 5: '5 - Sin Dolor (Óptimo)' };
      sorenessBadge.textContent = labels[d] || `${d} pts`;
    }

    const moodBadge = document.getElementById('moodBadge');
    if (moodBadge) {
      const labels = { 1: '1 - Muy Bajo', 2: '2 - Bajo', 3: '3 - Normal', 4: '4 - Positivo', 5: '5 - Excelente' };
      moodBadge.textContent = labels[f] || `${f} pts`;
    }
  }

  function initSegmentedControls() {
    const segmentedGroups = document.querySelectorAll('.segmented-control');
    segmentedGroups.forEach(group => {
      const hiddenInput = document.getElementById(group.dataset.name);
      const buttons = group.querySelectorAll('.seg-btn');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (hiddenInput) {
            hiddenInput.value = btn.dataset.value;
            updateLiveWellnessScore();
          }
        });
      });
    });
  }
  initSegmentedControls();

  // Escala de Fatiga 1-10
  const fatigueGroup = document.getElementById('fatigueGroup');
  const fatigueLevel = document.getElementById('fatigueLevel');
  const fatigueBadge = document.getElementById('fatigueBadge');
  const fatigueDescriptions = {
    1: 'Nivel 1 - Fresco (Energía Col C = 10)', 2: 'Nivel 2 - Descansado (Energía = 9)', 3: 'Nivel 3 - Ligero cansancio (Energía = 8)',
    4: 'Nivel 4 - Moderada (Energía = 7)', 5: 'Nivel 5 - Cansancio normal (Energía = 6)', 6: 'Nivel 6 - Notoria (Energía = 5)',
    7: 'Nivel 7 - Sobrecarga (Energía = 4)', 8: 'Nivel 8 - Severa (Energía = 3)', 9: 'Nivel 9 - Agotamiento (Energía = 2)', 10: 'Nivel 10 - Límite (Energía = 1)'
  };

  if (fatigueGroup) {
    for (let i = 1; i <= 10; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `scale-btn ${i === 4 ? 'active' : ''}`;
      btn.textContent = i;
      btn.dataset.val = i;
      btn.addEventListener('click', () => {
        fatigueGroup.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        fatigueLevel.value = i;
        fatigueBadge.textContent = fatigueDescriptions[i];
        updateLiveWellnessScore();
      });
      fatigueGroup.appendChild(btn);
    }
  }

  // Inicializar cálculo inicial en vivo
  updateLiveWellnessScore();

  // Chips de Dolor
  const sorenessChips = document.getElementById('sorenessChips');
  const sorenessAreasInput = document.getElementById('sorenessAreas');
  if (sorenessChips) {
    const chips = sorenessChips.querySelectorAll('.chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.value;
        if (val === 'Sin molestias') {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        } else {
          const noPainChip = sorenessChips.querySelector('[data-value="Sin molestias"]');
          if (noPainChip) noPainChip.classList.remove('active');
          chip.classList.toggle('active');
          const anyActive = Array.from(chips).some(c => c.classList.contains('active'));
          if (!anyActive && noPainChip) noPainChip.classList.add('active');
        }
        const selected = Array.from(sorenessChips.querySelectorAll('.chip.active')).map(c => c.dataset.value);
        sorenessAreasInput.value = selected.join(', ');
      });
    });
  }

  // =========================================================================
  // GESTIÓN DEL MODAL DE CONFIGURACIÓN
  // =========================================================================
  btnConfig.addEventListener('click', () => {
    scriptUrlInput.value = currentScriptUrl;
    testResultMsg.textContent = '';
    configModal.classList.add('active');
    configModal.setAttribute('aria-hidden', 'false');
  });

  function closeModal() {
    configModal.classList.remove('active');
    configModal.setAttribute('aria-hidden', 'true');
  }

  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) closeModal();
  });

  btnSaveConfig.addEventListener('click', async () => {
    const url = scriptUrlInput.value.trim();
    currentScriptUrl = url;
    localStorage.setItem(STORAGE_KEYS.SCRIPT_URL, url);
    updateConnectionStatus();
    closeModal();
    showToast('Configuración guardada. Sincronizando atletas...', 'success');
    await fetchAthletesAndRm();
  });

  btnTestConnection.addEventListener('click', async () => {
    const url = scriptUrlInput.value.trim();
    if (!url) {
      testResultMsg.textContent = '❌ Por favor ingresa la URL de la Web App';
      testResultMsg.className = 'test-msg error';
      return;
    }
    testResultMsg.textContent = '⏳ Probando conexión y leyendo atletas...';
    testResultMsg.className = 'test-msg';

    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        const data = await response.json();
        const numAthletes = data.athletes ? data.athletes.length : 0;
        testResultMsg.textContent = `✅ Conectado. ${numAthletes} atletas encontrados en 'Nombre de Atletas'`;
        testResultMsg.className = 'test-msg success';
      } else {
        testResultMsg.textContent = `⚠️ Respuesta HTTP: ${response.status}. Revisa permisos 'Cualquier usuario'`;
        testResultMsg.className = 'test-msg error';
      }
    } catch (_) {
      if (url.includes('script.google.com/macros/s/')) {
        testResultMsg.textContent = '✅ URL válida de Google Apps Script. Lista para envíos.';
        testResultMsg.className = 'test-msg success';
      } else {
        testResultMsg.textContent = '❌ No se pudo contactar el script.';
        testResultMsg.className = 'test-msg error';
      }
    }
  });

  function updateConnectionStatus() {
    if (currentScriptUrl && currentScriptUrl.startsWith('https://script.google.com')) {
      statusDot.className = 'status-dot connected';
      statusDot.title = 'Conectado a Google Apps Script';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusDot.title = 'Falta configurar URL de Google Apps Script';
    }
  }

  function updateSessionStatusIndicators() {
    try {
      const lastWellnessRaw = localStorage.getItem(STORAGE_KEYS.LAST_WELLNESS);
      if (lastWellnessRaw) {
        const lastWellness = JSON.parse(lastWellnessRaw);
        if (lastWellness.date === todayStr) {
          if (wellnessStatusBadge) {
            wellnessStatusBadge.textContent = `✅ Enviado hoy (${lastWellness.time})`;
            wellnessStatusBadge.classList.add('sent');
          }
          if (wellnessNotice && wellnessNoticeText) {
            wellnessNotice.style.display = 'flex';
            wellnessNoticeText.textContent = `✅ Formulario de la Mañana registrado hoy a las ${lastWellness.time}. Puedes actualizarlo si lo necesitas.`;
          }
        }
      }

      const lastWodRaw = localStorage.getItem(STORAGE_KEYS.LAST_WOD);
      if (lastWodRaw) {
        const lastWod = JSON.parse(lastWodRaw);
        if (lastWod.date === todayStr) {
          if (wodStatusBadge) {
            wodStatusBadge.textContent = `✅ Registrado (${lastWod.time})`;
            wodStatusBadge.classList.add('sent');
          }
          if (wodNotice && wodNoticeText) {
            wodNotice.style.display = 'flex';
            wodNoticeText.textContent = `✅ Entrenamiento registrado hoy a las ${lastWod.time}. Puedes registrar otra serie o sesión.`;
          }
        }
      }
    } catch (_) { }
  }

  // =========================================================================
  // ENVÍO DE DATOS RESPETANDO ESQUEMA ESTRICTO DE GOOGLE SHEETS
  // =========================================================================
  async function submitPayload(type, data, submitButton) {
    const athlete = athleteSelect.value.trim();
    if (!athlete) {
      showToast('Por favor selecciona tu nombre de Atleta arriba', 'error');
      athleteSelect.focus();
      return false;
    }

    if (!currentScriptUrl) {
      showToast('Falta configurar la URL de Google Apps Script (haz clic en el engranaje ⚙️)', 'error');
      btnConfig.click();
      return false;
    }

    const now = new Date();
    const formattedTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const payload = {
      type: type,
      athlete: athlete,
      timestamp: formattedTimestamp,
      ...data
    };

    submitButton.classList.add('loading');
    submitButton.disabled = true;

    // Timeout de 25 segundos para evitar que la interfaz quede congelada si la conexión móvil es lenta
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(currentScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        result = { status: 'success' };
      }

      if (result.status === 'success' || response.ok) {
        const sheetName = type === 'wellness' ? 'Wellness' : 'Registro_Diario';
        showToast(`✅ Guardado con éxito en '${sheetName}' (fila inferior libre para Looker Studio)`, 'success');
        return { success: true, ...result };
      } else {
        throw new Error(result.message || 'Error al insertar en Google Sheets');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error al enviar registro:', error);
      const sheetName = type === 'wellness' ? 'Wellness' : 'Registro_Diario';
      if (error.name === 'AbortError') {
        showToast(`⏱️ Solicitud enviada hacia '${sheetName}'. El servidor sigue procesando en segundo plano.`, 'success');
        return { success: true, timeout: true };
      } else {
        showToast(`Registro enviado hacia '${sheetName}'. Si no aparece, verifica permisos 'Cualquier usuario'`, 'success');
        return { success: true, fallback: true };
      }
    } finally {
      submitButton.classList.remove('loading');
      submitButton.disabled = false;
    }
  }

  // 1. Envío Formulario de la Mañana -> Pestaña 'Wellness'
  const formWellness = document.getElementById('formWellness');
  const btnSubmitWellness = document.getElementById('btnSubmitWellness');

  formWellness.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const data = {
        date: document.getElementById('wellnessDate').value,
        sleepHours: parseFloat(document.getElementById('sleepHours').value) || 7.5,
        sleepQuality: parseInt(document.getElementById('sleepQuality').value, 10) || 3,
        fatigueLevel: parseInt(document.getElementById('fatigueLevel').value, 10) || 4,
        muscleSoreness: parseInt(document.getElementById('muscleSoreness').value, 10) || 5,
        stressLevel: parseInt(document.getElementById('stressLevel').value, 10) || 2,
        moodLevel: parseInt(document.getElementById('moodLevel').value, 10) || 4,
        sorenessAreas: document.getElementById('sorenessAreas').value,
        notes: document.getElementById('wellnessNotes').value.trim(),
        ciclo: localStorage.getItem('kleos_active_cycle') || 'Ciclo_01'
      };

      const success = await submitPayload('wellness', data, btnSubmitWellness);
      if (success) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem(STORAGE_KEYS.LAST_WELLNESS, JSON.stringify({ date: todayStr, time: timeStr }));
        updateSessionStatusIndicators();
        document.getElementById('wellnessNotes').value = '';
      }
    } catch (err) {
      console.error('Error en formulario Wellness:', err);
      showToast('Ocurrió un error inesperado al procesar el formulario de la mañana', 'error');
    } finally {
      if (btnSubmitWellness) {
        btnSubmitWellness.classList.remove('loading');
        btnSubmitWellness.disabled = false;
      }
    }
  });

  // 2. Envío Registro Post-Entrenamiento -> Pestaña 'Registro_Diario'
  // Columnas: A (Atleta), B (Fecha), C (Mes), D (Semana), E (Ejercicio), F (Cat), G (Series), H (Reps/Km), I (Carga), J (1RM), S (RPE), W (Duracion), X (Score), Y (Peso_WOD)
  const formWod = document.getElementById('formWod');
  const btnSubmitWod = document.getElementById('btnSubmitWod');

  formWod.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const athlete = athleteSelect ? athleteSelect.value.trim() : '';
      if (!athlete) {
        showToast('Por favor selecciona tu nombre de Atleta arriba', 'error');
        if (athleteSelect) athleteSelect.focus();
        return;
      }

      const category = wodCategory.value;
      let exercise = wodExercise.value;

      if (category === 'Metcon / WOD' && exercise === 'Metcon Personalizado') {
        const customName = wodCustomName && wodCustomName.value.trim();
        if (customName) exercise = customName;
      }

      const vSelect = document.getElementById('wodVariant');
      const variantVal = (vSelect && vSelect.value) ? vSelect.value.trim() : '';
      const finalExercise = (variantVal && variantVal.toLowerCase().indexOf('estándar') === -1)
        ? `${exercise} (${variantVal})`
        : exercise;

      let seriesVal = 0;
      let repsVal = 0;
      let weightVal = 0;
      let rmVal = 0;
      let distanciaVal = 0;
      let duracionVal = '';
      let scoreRepsVal = 0;
      let pesoWodVal = 0;

      let rondasVal = 0;
      let extraVal = 0;
      let emomTotalesVal = 0;
      let emomCompletadosVal = 0;

      if (category === 'Fuerza' || category === 'Levantamiento Olímpico') {
        const repsRaw = wodReps ? wodReps.value.trim() : '';
        if (!repsRaw) {
          showToast('⚠️ Por favor indica las Repeticiones realizadas (ej: 5)', 'error');
          if (wodReps) wodReps.focus();
          return;
        }
        seriesVal = parseInt(document.getElementById('wodSeries').value, 10) || 1;
        repsVal = repsRaw;
        weightVal = parseFloat(wodWeight.value) || 0;
        rmVal = parseFloat(wod1RM.value) || 0;
        duracionVal = '';
        scoreRepsVal = 0;
        pesoWodVal = 0;
      } else if (category === 'Gimnásticos') {
        const repsRaw = wodReps ? wodReps.value.trim() : '';
        if (!repsRaw) {
          showToast('⚠️ Por favor indica las Repeticiones o Metros completados', 'error');
          if (wodReps) wodReps.focus();
          return;
        }
        seriesVal = parseInt(document.getElementById('wodSeries').value, 10) || 1;
        repsVal = repsRaw;
        weightVal = 0;
        rmVal = 0;
        duracionVal = '';
        scoreRepsVal = 0;
        pesoWodVal = 0;
      } else if (category === 'Metcon / WOD') {
        duracionVal = wodDuration ? wodDuration.value.trim() : '';
        if (!duracionVal) {
          showToast('⚠️ Por favor indica el Tiempo / Duración (MM:SS) del WOD (obligatorio)', 'error');
          if (wodDuration) wodDuration.focus();
          return;
        }

        const tipo = wodTipoWod ? wodTipoWod.value : 'Por Tiempo (For Time)';
        const isForTime = tipo.indexOf('Time') !== -1 || tipo.indexOf('Tiempo') !== -1;
        const isAmrap = tipo.indexOf('AMRAP') !== -1;
        const isEmom = tipo.indexOf('EMOM') !== -1;

        if (isEmom) {
          emomTotalesVal = parseInt(wodEmomTotalMinutes ? wodEmomTotalMinutes.value : 16, 10) || 0;
          emomCompletadosVal = parseInt(wodEmomCompletedMinutes ? wodEmomCompletedMinutes.value : 0, 10) || 0;
          if (emomCompletadosVal > emomTotalesVal) emomCompletadosVal = emomTotalesVal;
          const minFaltantes = Math.max(0, emomTotalesVal - emomCompletadosVal);
          // Fórmula EMOM: Valor_Columna_X = Minutos_Completados + (Minutos_Faltantes / 1000)
          scoreRepsVal = (emomCompletadosVal + (minFaltantes / 1000)).toFixed(3);
          rondasVal = emomCompletadosVal;
          extraVal = minFaltantes;
        } else if (isAmrap) {
          rondasVal = parseInt(wodRoundsCompleted ? wodRoundsCompleted.value : 0, 10) || 0;
          extraVal = parseInt(wodExtraReps ? wodExtraReps.value : 0, 10) || 0;
          // Fórmula AMRAP: Valor_Columna_X = Rondas_Completas + (Reps_Adicionales / 1000)
          scoreRepsVal = (rondasVal + (extraVal / 1000)).toFixed(3);
        } else {
          // For Time
          const isFinished = wodTimeCapFinished ? (wodTimeCapFinished.value === 'SI') : true;
          rondasVal = parseInt(wodRoundsCompleted ? wodRoundsCompleted.value : 4, 10) || 0;
          extraVal = isFinished ? 0 : (parseInt(wodExtraReps ? wodExtraReps.value : 0, 10) || 0);
          // Fórmula For Time: Valor_Columna_X = Rondas_Completas + (Reps_Adicionales / 1000)
          scoreRepsVal = (rondasVal + (extraVal / 1000)).toFixed(3);
        }

        seriesVal = 0;
        repsVal = 0; // OBLIGATORIO: Reps en Columna H debe ser CERO ABSOLUTO para Metcon
        pesoWodVal = 0;
        weightVal = 0; // Se aísla el tonelaje de fuerza pura en 0
        rmVal = 0;
      } else if (category === 'Cardio') {
        const distRaw = wodReps ? wodReps.value.trim() : '';
        if (!distRaw) {
          showToast('⚠️ Por favor indica la Distancia recorrida en km (ej: 5.0)', 'error');
          if (wodReps) wodReps.focus();
          return;
        }
        seriesVal = parseInt(document.getElementById('wodSeries').value, 10) || 1;
        distanciaVal = parseFloat(distRaw) || 0;
        repsVal = distanciaVal;
        duracionVal = wodDuration ? wodDuration.value.trim() : '';
        weightVal = 0;
        rmVal = 0;
        scoreRepsVal = 0;
        pesoWodVal = 0;
      } else {
        seriesVal = parseInt(document.getElementById('wodSeries').value, 10) || 1;
        repsVal = wodReps ? wodReps.value.trim() : '1';
        weightVal = parseFloat(wodWeight.value) || 0;
        rmVal = parseFloat(wod1RM.value) || 0;
        pesoWodVal = 0;
      }

      const tipoWodVal = (category === 'Metcon / WOD' && wodTipoWod) ? wodTipoWod.value : 'N/A';

      const data = {
        fecha: wodDateInput.value,
        categoria: category,
        ejercicio: finalExercise,
        variante: variantVal,
        tipoWod: tipoWodVal,
        series: (category === 'Metcon / WOD') ? 0 : seriesVal,
        reps: (category === 'Metcon / WOD') ? 0 : repsVal,
        carga: weightVal,
        unRM: rmVal,
        distancia: distanciaVal,
        duracion: duracionVal,
        scoreReps: (category === 'Metcon / WOD') ? parseFloat(scoreRepsVal) : 0,
        rondasCompletas: rondasVal,
        repsAdicionales: extraVal,
        emomMinutosTotales: emomTotalesVal,
        emomMinutosCompletados: emomCompletadosVal,
        pesoWod: pesoWodVal,
        rpe: document.getElementById('wodRpe').value,
        es_nuevo_rm: !!(document.getElementById('wodEsNuevoRm') && document.getElementById('wodEsNuevoRm').checked),
        es_cierre_ciclo: !!(document.getElementById('wodCierreCiclo') && document.getElementById('wodCierreCiclo').checked),
        ciclo: localStorage.getItem('kleos_active_cycle') || 'Ciclo_01',
        // Retrocompatibilidad
        date: wodDateInput.value,
        category: category,
        exercise: finalExercise,
        seriesOrIntervals: (category === 'Metcon / WOD') ? 0 : seriesVal,
        repsOrDistance: category === 'Cardio' ? distanciaVal : ((category === 'Metcon / WOD') ? 0 : repsVal),
        weight: weightVal,
        oneRepMax: rmVal,
        duration: duracionVal
      };

      // Capturar marca anterior para la alerta de PR
      let previousRm = 0;
      if (athlete && rmDataStore[athlete]) {
        const motherKey = getMotherExerciseKey(exercise) || exercise;
        previousRm = parseFloat(rmDataStore[athlete][motherKey] || rmDataStore[athlete][exercise] || 0) || 0;
      }
      if (!previousRm && wod1RM && wod1RM.value) {
        previousRm = parseFloat(wod1RM.value) || 0;
      }
      const nuevoRmRegistrado = weightVal > 0 ? weightVal : rmVal;

      // REGLA DE SEPARACIÓN: Solo es Nuevo 1RM si el atleta activó explícitamente el toggle
      const chkEsNuevo = document.getElementById('wodEsNuevoRm');
      const esNuevoRm = !!(chkEsNuevo && chkEsNuevo.checked);
      data.es_nuevo_rm = esNuevoRm;

      const submitRes = await submitPayload('registro_diario', data, btnSubmitWod);
      const isSuccess = !!submitRes && (submitRes === true || submitRes.success === true || submitRes.status === 'success');
      if (isSuccess) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem(STORAGE_KEYS.LAST_WOD, JSON.stringify({ date: todayStr, time: timeStr }));
        updateSessionStatusIndicators();

        // Si fue un nuevo récord personal (por toggle explícito local o confirmación del servidor), disparar celebración
        const serverConfirmedRm = submitRes && (submitRes.esNuevoRm === true || (submitRes.data && submitRes.data.esNuevoRm === true));
        if (esNuevoRm || serverConfirmedRm) {
          const motherKey = getMotherExerciseKey(finalExercise) || finalExercise;
          if (!rmDataStore[athlete]) rmDataStore[athlete] = {};
          rmDataStore[athlete][motherKey] = nuevoRmRegistrado;
          rmDataStore[athlete][finalExercise] = nuevoRmRegistrado;
          localStorage.setItem(STORAGE_KEYS.CACHED_RM, JSON.stringify(rmDataStore));

          if (wod1RM) wod1RM.value = nuevoRmRegistrado;
          if (source1RMTag) source1RMTag.textContent = 'Nuevo 1RM (Ciclo 2)';
          if (rmStatusBadge) {
            rmStatusBadge.textContent = `⭐ Nuevo 1RM ${motherKey}: ${nuevoRmRegistrado} kg`;
            rmStatusBadge.className = 'badge';
          }

          triggerPRAlert(finalExercise, previousRm, nuevoRmRegistrado);
        }

        if (chkEsNuevo) chkEsNuevo.checked = false;
        const chkCierre = document.getElementById('wodCierreCiclo');
        if (chkCierre) chkCierre.checked = false;

        // Si fue un nuevo RM o cierre de ciclo, refrescar el estado de atletas y RMs en segundo plano
        if (esNuevoRm || serverConfirmedRm || data.es_cierre_ciclo) {
          fetchAthletesAndRm();
        }

        // Limpiar campos según modalidad
        if (category === 'Fuerza' || category === 'Levantamiento Olímpico') {
          if (wodReps) wodReps.value = '';
          if (wodWeight) wodWeight.value = '';
        } else if (category === 'Gimnásticos') {
          if (wodReps) wodReps.value = '';
        } else if (category === 'Metcon / WOD') {
          if (wodDuration) wodDuration.value = '';
          if (wodExtraReps) wodExtraReps.value = '';
          if (wodRoundsCompleted) wodRoundsCompleted.value = '4';
          if (wodEmomTotalMinutes) wodEmomTotalMinutes.value = '16';
          if (wodEmomCompletedMinutes) wodEmomCompletedMinutes.value = '16';
          if (wodCustomName) wodCustomName.value = '';
          updateMetconScorePreview();
        } else if (category === 'Cardio') {
          if (wodReps) wodReps.value = '';
          if (wodDuration) wodDuration.value = '';
        }
        if (vSelect) vSelect.selectedIndex = 0;
      }
    } catch (err) {
      console.error('Error procesando formulario WOD:', err);
      showToast('Ocurrió un error inesperado al procesar el registro.', 'error');
    } finally {
      if (btnSubmitWod) {
        btnSubmitWod.classList.remove('loading');
        btnSubmitWod.disabled = false;
      }
    }
  });

  // =========================================================================
  // SISTEMA DE NOTIFICACIONES TOAST
  // =========================================================================
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '⚡' : '⚠️';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-leave');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4500);
  }

  // =========================================================================
  // ALERTA Y MODAL CELEBRATORIO DE NUEVO RÉCORD PERSONAL (PR)
  // =========================================================================
  function playFanfareSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = ctx.currentTime + (idx * 0.11);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.28, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.36);
      });
    } catch (_) {}
  }

  window.triggerPRAlert = function(ejercicio, viejoRm, nuevoRm) {
    const elEx = document.getElementById('pr-exercise-name');
    const elOld = document.getElementById('old-rm-val');
    const elNew = document.getElementById('new-rm-val');
    const overlay = document.getElementById('pr-alert-overlay');

    if (elEx) elEx.innerText = (ejercicio || 'EJERCICIO').toUpperCase();
    if (elOld) elOld.innerText = (viejoRm && parseFloat(viejoRm) > 0) ? `${viejoRm} kg` : '-- kg';
    if (elNew) elNew.innerText = `${nuevoRm || 0} kg`;
    if (overlay) overlay.style.display = 'flex';

    // Fanfarria auditiva
    playFanfareSound();

    // Ráfaga épica de confetti dorado y azul
    if (typeof confetti === 'function') {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#e6b422', '#38bdf8', '#22c55e', '#f59e0b', '#ffffff']
        });
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 60,
            origin: { x: 0 },
            colors: ['#e6b422', '#38bdf8', '#f59e0b']
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 60,
            origin: { x: 1 },
            colors: ['#e6b422', '#38bdf8', '#f59e0b']
          });
        }, 300);
      } catch (_) {}
    }
  };

  window.dismissPRAlert = function() {
    const overlay = document.getElementById('pr-alert-overlay');
    if (overlay) overlay.style.display = 'none';
  };

  const prAlertOverlay = document.getElementById('pr-alert-overlay');
  if (prAlertOverlay) {
    prAlertOverlay.addEventListener('click', (e) => {
      if (e.target === prAlertOverlay) window.dismissPRAlert();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.dismissPRAlert();
    }
  });

  // =========================================================================
  // CONTROLADOR DASHBOARD NATIVO KLEOS (REEMPLAZO DE LOOKER STUDIO)
  // =========================================================================

  let chartWellnessInstance = null;
  let chartZonasInstance = null;
  let currentDashboardAthlete = 'todos';
  let cachedDashboardData = null;

  const dashboardAthleteSelect = document.getElementById('dashboardAthleteSelect');
  const btnRefreshDashboard = document.getElementById('btnRefreshDashboard');
  const dashboardLoadingOverlay = document.getElementById('dashboardLoadingOverlay');
  const dashboardActiveAthleteName = document.getElementById('dashboardActiveAthleteName');
  const dashboardAthleteTag = document.getElementById('dashboardAthleteTag');
  const dashboardLastUpdatedText = document.getElementById('dashboardLastUpdatedText');

  // KPI elements
  const kpiPgaValue = document.getElementById('kpiPgaValue');
  const kpiPgaBar = document.getElementById('kpiPgaBar');
  const factorWellnessVal = document.getElementById('factorWellnessVal');
  const factorTonelajeVal = document.getElementById('factorTonelajeVal');
  const factorCardioVal = document.getElementById('factorCardioVal');
  const kpiTonelajeValue = document.getElementById('kpiTonelajeValue');
  const kpiTotalReps = document.getElementById('kpiTotalReps');
  const kpiTotalWorkouts = document.getElementById('kpiTotalWorkouts');
  const kpiTotalCardio = document.getElementById('kpiTotalCardio');
  const kpiStatusBadge = document.getElementById('kpiStatusBadge');
  const kpiStatusText = document.getElementById('kpiStatusText');
  const kpiStatusDesc = document.getElementById('kpiStatusDesc');

  // Chart summary badges & legends
  const chartWellnessAvg = document.getElementById('chartWellnessAvg');
  const chartIntensidadAvg = document.getElementById('chartIntensidadAvg');
  const legendDescargaVal = document.getElementById('legendDescargaVal');
  const legendHipertrofiaVal = document.getElementById('legendHipertrofiaVal');
  const legendFuerzaVal = document.getElementById('legendFuerzaVal');
  const dashboardRmsGrid = document.getElementById('dashboardRmsGrid');
  const dashboardRmsCountPill = document.getElementById('dashboardRmsCountPill');

  function renderDashboardAthletesSelect(list) {
    if (!dashboardAthleteSelect) return;
    const currentVal = dashboardAthleteSelect.value;
    dashboardAthleteSelect.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'todos';
    allOpt.textContent = '🌟 Todos los Atletas (Consolidado Global)';
    dashboardAthleteSelect.appendChild(allOpt);

    if (list && Array.isArray(list)) {
      list.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (currentVal && currentVal.toLowerCase() === name.toLowerCase()) {
          opt.selected = true;
        }
        dashboardAthleteSelect.appendChild(opt);
      });
    }

    if (!currentVal || currentVal === 'todos') {
      dashboardAthleteSelect.value = 'todos';
    }
  }

  async function loadDashboardData(targetAthlete) {
    const athlete = (targetAthlete && targetAthlete.trim()) ? targetAthlete.trim() : 'todos';
    currentDashboardAthlete = athlete;

    // Estado de carga visual
    if (dashboardLoadingOverlay) dashboardLoadingOverlay.style.display = 'flex';
    if (btnRefreshDashboard) btnRefreshDashboard.classList.add('loading');

    try {
      const url = `${currentScriptUrl}?atleta=${encodeURIComponent(athlete)}`;
      const response = await fetch(url, { method: 'GET', mode: 'cors' });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      if (!data || data.status === 'error') {
        throw new Error(data && data.message ? data.message : 'Error desconocido al consultar analítica');
      }

      cachedDashboardData = data;
      renderDashboardView(data);

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (dashboardLastUpdatedText) {
        dashboardLastUpdatedText.textContent = `Última sincronización: ${timeStr}`;
      }

    } catch (err) {
      console.error('Error cargando analítica de dashboard:', err);
      showToast(`Error al cargar métricas: ${err.message}`, 'error');
      // Inyectar valores seguros por defecto para no congelar la UI
      renderDashboardView({
        atleta: athlete === 'todos' ? 'Todos los Atletas' : athlete,
        isGlobal: (athlete === 'todos'),
        kpis: { totalTonelaje: 0, totalReps: 0, totalWorkouts: 0, totalCardioKm: 0, avgWellness: 0, lastWellnessScore: 0, recentRMsCount: 0 },
        wellnessHistory: [],
        zonasCarga: { 'Descarga (<70%)': 0, 'Hipertrofia (70-80%)': 0, 'Fuerza Máxima (>80%)': 0 },
        rms: {}
      });
    } finally {
      if (dashboardLoadingOverlay) dashboardLoadingOverlay.style.display = 'none';
      if (btnRefreshDashboard) btnRefreshDashboard.classList.remove('loading');
    }
  }

  function renderDashboardView(data) {
    const isGlobal = (data.isGlobal === true || data.atleta === 'Todos los Atletas' || currentDashboardAthlete === 'todos');
    const atletaNombre = data.atleta || (isGlobal ? 'Todos los Atletas' : currentDashboardAthlete);

    // Banner de identificación
    if (dashboardActiveAthleteName) dashboardActiveAthleteName.textContent = atletaNombre;
    if (dashboardAthleteTag) {
      dashboardAthleteTag.textContent = isGlobal ? 'Consolidado General' : 'Perfil Individual';
    }

    // Asegurar sincronización del select
    if (dashboardAthleteSelect && dashboardAthleteSelect.value !== currentDashboardAthlete) {
      dashboardAthleteSelect.value = currentDashboardAthlete;
    }

    // Extracción limpia y segura con parseFloat controlado
    const kpis = data.kpis || {};
    const tonnage = parseFloat(kpis.totalTonelaje) || 0;
    const reps = parseInt(kpis.totalReps, 10) || 0;
    const workouts = parseInt(kpis.totalWorkouts, 10) || 0;
    const cardioKm = parseFloat(kpis.totalCardioKm) || 0;
    const avgWellness = parseFloat(kpis.avgWellness) || 0;
    const lastWellness = parseFloat(kpis.lastWellnessScore) || 0;

    // =========================================================================
    // CÁLCULO DINÁMICO CLIENTE DEL PGA ACTUAL (%)
    // Ponderación: Wellness 40% + Tonelaje 30% + Cardio 30%
    // =========================================================================
    const wellScoreEffective = avgWellness > 0 ? avgWellness : (lastWellness > 0 ? lastWellness : 20);
    // Wellness component (40%): escala 0 a 30 normalizada
    const pgaWellness = Math.min(100, (wellScoreEffective / 30) * 100) * 0.40;

    // Tonelaje component (30%): volumen acumulado referencial
    const targetTonnage = isGlobal ? 100000 : 15000;
    const pgaTonelaje = Math.min(100, (tonnage / targetTonnage) * 100) * 0.30;

    // Cardio component (30%): distancia cardio o adherencia de sesiones
    const targetCardio = isGlobal ? 100 : 15;
    const pgaCardio = Math.min(100, (cardioKm > 0 ? (cardioKm / targetCardio) * 100 : (workouts / (isGlobal ? 200 : 25)) * 100)) * 0.30;

    // PGA Final
    const pga = Math.min(100, Math.max(0, Math.round(pgaWellness + pgaTonelaje + pgaCardio)));

    // Render KPI 1: PGA
    if (kpiPgaValue) kpiPgaValue.textContent = `${pga}%`;
    if (kpiPgaBar) kpiPgaBar.style.width = `${pga}%`;
    if (factorWellnessVal) factorWellnessVal.textContent = `${(Math.round(pgaWellness * 10) / 10).toFixed(1)}%`;
    if (factorTonelajeVal) factorTonelajeVal.textContent = `${(Math.round(pgaTonelaje * 10) / 10).toFixed(1)}%`;
    if (factorCardioVal) factorCardioVal.textContent = `${(Math.round(pgaCardio * 10) / 10).toFixed(1)}%`;

    // Render KPI 2: Tonelaje
    if (kpiTonelajeValue) {
      kpiTonelajeValue.textContent = `${tonnage.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg`;
    }
    if (kpiTotalReps) kpiTotalReps.textContent = reps.toLocaleString('es-ES');
    if (kpiTotalWorkouts) kpiTotalWorkouts.textContent = workouts.toLocaleString('es-ES');
    if (kpiTotalCardio) kpiTotalCardio.textContent = `${cardioKm.toFixed(1)} km`;

    // Render KPI 3: Estado Operativo
    if (kpiStatusBadge && kpiStatusText && kpiStatusDesc) {
      kpiStatusBadge.classList.remove('status-optimo', 'status-estable', 'status-precaucion');

      if (pga >= 80) {
        kpiStatusBadge.classList.add('status-optimo');
        kpiStatusText.textContent = '⚡ ÓPTIMO';
        kpiStatusDesc.textContent = 'Capacidad neuromuscular y recuperación óptimas. Atleta preparado para alta intensidad y pruebas de RM.';
      } else if (pga >= 60) {
        kpiStatusBadge.classList.add('status-estable');
        kpiStatusText.textContent = '⚖️ ESTABLE';
        kpiStatusDesc.textContent = 'Carga y recuperación equilibradas. Proceder con el plan prescrito manteniendo buena hidratación y descanso.';
      } else {
        kpiStatusBadge.classList.add('status-precaucion');
        kpiStatusText.textContent = '⚠️ PRECAUCIÓN';
        kpiStatusDesc.textContent = 'Fatiga acumulada detectada o Wellness crítico (<21). Se prescribe autorregulación y limitar volumen axial.';
      }
    }

    // Render Gráficos
    renderWellnessTrendChart(data.wellnessHistory || []);
    renderZonasCargaChart(data.zonasCarga || {});
    renderRmsGrid(data.rms || {});

    // Badges complementarios
    if (chartWellnessAvg) {
      chartWellnessAvg.textContent = avgWellness > 0 ? `${avgWellness.toFixed(1)} / 30` : 'Sin datos';
    }
    if (chartIntensidadAvg) {
      const avgInt = parseFloat(data.intensidadPromedio) || 0;
      chartIntensidadAvg.textContent = avgInt > 0 ? `${avgInt.toFixed(1)}%` : '--%';
    }
  }

  function renderWellnessTrendChart(history) {
    const canvas = document.getElementById('chartWellnessTrend');
    if (!canvas) return;

    if (chartWellnessInstance) {
      chartWellnessInstance.destroy();
      chartWellnessInstance = null;
    }

    // Inyectar datos seguros por defecto si el historial está vacío
    let labels = [];
    let scores = [];

    if (history && history.length > 0) {
      labels = history.map(h => {
        const raw = h.fecha || '';
        if (raw.indexOf('-') !== -1) {
          const parts = raw.split('-');
          return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : raw;
        }
        if (raw.indexOf('/') !== -1) {
          const parts = raw.split('/');
          return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : raw;
        }
        return raw.substring(0, 5);
      });
      scores = history.map(h => parseFloat(h.score) || 0);
    } else {
      labels = ['Día 1', 'Día 2', 'Día 3', 'Día 4', 'Día 5'];
      scores = [0, 0, 0, 0, 0];
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

    chartWellnessInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Wellness Score',
          data: scores,
          borderColor: '#38bdf8',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#38bdf8'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#38bdf8',
            bodyColor: '#f8fafc',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function(ctx) {
                return `Score: ${ctx.parsed.y} / 30 pts`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: {
            min: 0,
            max: 30,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 11 }, stepSize: 5 }
          }
        }
      }
    });
  }

  function renderZonasCargaChart(zonas) {
    const canvas = document.getElementById('chartZonasCarga');
    if (!canvas) return;

    if (chartZonasInstance) {
      chartZonasInstance.destroy();
      chartZonasInstance = null;
    }

    const descarga = parseFloat(zonas['Descarga (<70%)']) || 0;
    const hipertrofia = parseFloat(zonas['Hipertrofia (70-80%)']) || 0;
    const fuerza = parseFloat(zonas['Fuerza Máxima (>80%)']) || 0;

    // Actualizar leyenda
    if (legendDescargaVal) legendDescargaVal.textContent = `${descarga} series`;
    if (legendHipertrofiaVal) legendHipertrofiaVal.textContent = `${hipertrofia} series`;
    if (legendFuerzaVal) legendFuerzaVal.textContent = `${fuerza} series`;

    const totalZonas = descarga + hipertrofia + fuerza;
    const dataVals = totalZonas > 0 ? [descarga, hipertrofia, fuerza] : [1, 1, 1];
    const bgColors = totalZonas > 0 ? ['#38bdf8', '#22c55e', '#f59e0b'] : ['#334155', '#475569', '#64748b'];

    const ctx = canvas.getContext('2d');
    chartZonasInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Descarga (<70%)', 'Hipertrofia (70-80%)', 'Fuerza Máxima (>80%)'],
        datasets: [{
          data: dataVals,
          backgroundColor: bgColors,
          borderColor: '#0f172a',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(ctx) {
                if (totalZonas === 0) return 'Sin registros de fuerza';
                const val = ctx.parsed;
                const pct = Math.round((val / totalZonas) * 100);
                return `${ctx.label}: ${val} series (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderRmsGrid(rms) {
    if (!dashboardRmsGrid) return;
    dashboardRmsGrid.innerHTML = '';

    const keys = Object.keys(rms || {});
    if (dashboardRmsCountPill) {
      dashboardRmsCountPill.textContent = `${keys.length} RMs Registrados`;
    }

    if (keys.length === 0) {
      dashboardRmsGrid.innerHTML = '<div class="rms-empty-msg">El atleta no posee marcas registradas aún.</div>';
      return;
    }

    keys.sort().forEach(ej => {
      const peso = parseFloat(rms[ej]) || 0;
      const tile = document.createElement('div');
      tile.className = 'rm-tile';
      tile.innerHTML = `
        <span class="rm-tile-name" title="${ej}">${ej}</span>
        <span class="rm-tile-weight">${peso.toLocaleString('es-ES', { maximumFractionDigits: 1 })}<span>kg</span></span>
      `;
      dashboardRmsGrid.appendChild(tile);
    });
  }

  // Listeners para el Dashboard
  if (dashboardAthleteSelect) {
    dashboardAthleteSelect.addEventListener('change', (e) => {
      loadDashboardData(e.target.value);
    });
  }

  if (btnRefreshDashboard) {
    btnRefreshDashboard.addEventListener('click', () => {
      const selected = dashboardAthleteSelect ? dashboardAthleteSelect.value : currentDashboardAthlete;
      loadDashboardData(selected);
    });
  }
});
// Atajo de teclado de emergencia para abrir la configuración (Ctrl + Q)
document.addEventListener('keydown', function (event) {
  if (event.ctrlKey && (event.key === 'q' || event.key === 'Q')) {
    event.preventDefault();
    const configModal = document.getElementById('configModal');
    const scriptUrlInput = document.getElementById('scriptUrlInput');
    if (configModal) {
      if (scriptUrlInput) {
        scriptUrlInput.value = localStorage.getItem('kleos_script_url') || '';
      }
      configModal.classList.add('active');
      configModal.setAttribute('aria-hidden', 'false');
      console.log("⚡ Ventana de configuración abierta con atajo Ctrl + Q");
    }
  }
});
