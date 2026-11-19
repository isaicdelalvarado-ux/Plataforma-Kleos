#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
🏛️ PLATAFORMA KLEOS - AGENTE VIGILANTE E2E (QA AUTOMATION & AUTO-HEALING v3.0)
================================================================================
Supervisa de forma autónoma y continua la salud integral de la plataforma:

1. AUDITORÍA E2E WEB, DOM & FRONTEND:
   - Conectividad, latencia y respuesta del Google Apps Script Web App (?action=audit).
   - Verificación de sintaxis JS real (node -c js/app.js).
   - Validación de existencia de IDs críticos del DOM en index.html y js/app.js.
   - Protección anti-bloqueo: cero <select> con disabled forzado, cero trampas readOnly,
     y anti-regresión del bucle de reinicio en #wodVariant (Gimnásticos).
   - Consistencia de cache-busting (?v=...) entre css/styles.css y js/app.js en index.html.
   - Pruebas E2E del Dashboard API para Consolidado Global y atletas nuevos (Elibert Rangel,
     Luisana Rojas) garantizando cero NaN / undefined.

2. AUDITORÍA E2E DE CONTRATO DE DATOS EN GOOGLE SHEETS:
   - Registro_Diario (A..Z):
     * Detección inmediata si una corrida (Cardio/Carrera) cayó como Metcon / WOD.
     * Detección de registros recientes sin Ciclo (Col Z).
     * Cero errores de fórmula (#ERROR!, #REF!, #VALUE!, #DIV/0!).
     * Aislamiento metabólico garantizado en Metcon y Cardio (Carga=0, 1RM=0, Tonelaje=0).
     * Verificación de fila vacía final para Looker Studio.
   - Skills_Gimnasia (A..J):
     * Validación de columnas, tipos numéricos (Max_Reps_Unbroken, Volumen_Total),
       Nivel_Progresion, Ciclo y Semana.
   - Wellness (A..M):
     * Consistencia de Wellness Score (Col J = B+C+D+E+F) y presencia de Ciclo (Col M).
   - Control_Ciclo & RMs (RM_Atletas, RM_Zeus, RM_Atenea, Nombre de Atletas).
"""

import sys
import os
import re
import time
import json
import subprocess
import urllib.request
import urllib.parse
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

SPREADSHEET_ID = "1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o"
SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzBrbeleVQHEDqLG3iiF7bsR7jxY8wGCYjWfJUmRU-YFv3H73ro2tnvW57HJw6n_qwEmw/exec"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "estado_salud_kleos.json")
LOG_FILE = os.path.join(BASE_DIR, "vigilante.log")

CRITICAL_DOM_IDS = [
    "athleteSelect", "dashboardAthleteSelect", "filtro-ciclo",
    "wodCategory", "wodExercise", "wodVariant", "variantGroup",
    "wodSeries", "wodReps", "wodWeight", "wod1RM", "wodDuration",
    "wodScoreReps", "wodRpe", "epleyBox", "dashboardGymBlock",
    "gymSkillsGrid", "formWellness", "formWod"
]

def log_event(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def audit_web_and_frontend():
    """Audita el endpoint de backend, pruebas E2E del Dashboard y calidad del Frontend."""
    results = {
        "ok": True,
        "endpoint_health": "UNKNOWN",
        "latency_sec": 0,
        "js_syntax_ok": False,
        "critical_dom_ids_ok": True,
        "select_locks_free": True,
        "cache_busting_ok": True,
        "cache_versions": {},
        "clean_squat_in_api": False,
        "clean_squat_in_local_code": False,
        "readonly_trap_free": True,
        "dashboard_e2e_ok": True,
        "issues": []
    }

    # 1. Auditoría del Endpoint Apps Script (?action=audit)
    t0 = time.time()
    try:
        url_audit = f"{SCRIPT_URL}?action=audit"
        req = urllib.request.Request(url_audit, headers={'User-Agent': 'KleosGuardian/3.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            elapsed = round(time.time() - t0, 3)
            results["latency_sec"] = elapsed
            if resp.getcode() == 200:
                raw = resp.read().decode('utf-8')
                data = json.loads(raw)
                results["endpoint_health"] = data.get("status", "HEALTHY")
                if data.get("discrepancies"):
                    results["issues"].extend(data.get("discrepancies"))
            else:
                results["ok"] = False
                results["issues"].append(f"HTTP code {resp.getcode()} en ?action=audit")
    except Exception as e:
        results["ok"] = False
        results["endpoint_health"] = "OFFLINE"
        results["issues"].append(f"Falla conexión Apps Script: {str(e)}")

    # 2. Pruebas E2E del Dashboard API (Global + Atletas Nuevos)
    for target in ["todos", "Elibert Rangel", "Luisana Rojas"]:
        try:
            url_dash = f"{SCRIPT_URL}?atleta={urllib.parse.quote(target)}&ciclo=Atenea"
            req_d = urllib.request.Request(url_dash, headers={'User-Agent': 'KleosGuardian/3.0'})
            with urllib.request.urlopen(req_d, timeout=15) as resp_d:
                raw_d = resp_d.read().decode('utf-8')
                data_d = json.loads(raw_d)
                if "Clean Squat" in raw_d or "Squat Clean" in raw_d:
                    results["clean_squat_in_api"] = True
                if data_d.get("status") != "ok" or "NaN" in raw_d or "undefined" in raw_d:
                    results["dashboard_e2e_ok"] = False
                    results["ok"] = False
                    results["issues"].append(f"DASHBOARD E2E FALLIDO para '{target}': status={data_d.get('status')} o NaN/undefined detectado")
        except Exception as e:
            results["dashboard_e2e_ok"] = False
            results["ok"] = False
            results["issues"].append(f"Error E2E Dashboard para '{target}': {e}")

    # 3. Verificación de sintaxis JS con Node (node -c js/app.js)
    app_js = os.path.join(BASE_DIR, "js", "app.js")
    if os.path.exists(app_js):
        try:
            proc = subprocess.run(["node", "-c", app_js], capture_output=True, text=True, timeout=10)
            if proc.returncode == 0:
                results["js_syntax_ok"] = True
            else:
                results["js_syntax_ok"] = False
                results["ok"] = False
                results["issues"].append(f"ERROR DE SINTAXIS EN js/app.js: {proc.stderr.strip()}")
        except Exception as e:
            results["issues"].append(f"No se pudo ejecutar verificación node -c: {e}")

    # 4. Auditoría DOM, Cache-Busting y anti-bloqueos en index.html
    index_html = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_html):
        try:
            with open(index_html, "r", encoding="utf-8", errors="ignore") as f:
                content_html = f.read()

            if "Clean Squat" in content_html or "Squat Clean" in content_html:
                results["clean_squat_in_local_code"] = True
            else:
                results["issues"].append("ALERTA: 'Clean Squat' no encontrado en index.html")
                results["ok"] = False

            # IDs críticos del DOM
            missing_ids = [cid for cid in CRITICAL_DOM_IDS if f'id="{cid}"' not in content_html]
            if missing_ids:
                results["critical_dom_ids_ok"] = False
                results["ok"] = False
                results["issues"].append(f"IDs CRÍTICOS FALTANTES en index.html: {', '.join(missing_ids)}")

            # Verificar que ningún <select> tenga atributo disabled en HTML
            disabled_selects = re.findall(r'<select[^>]*\bdisabled\b[^>]*>', content_html, flags=re.IGNORECASE)
            if disabled_selects:
                results["select_locks_free"] = False
                results["ok"] = False
                results["issues"].append(f"SELECT DESHABILITADO EN HTML: {disabled_selects}")

            # Consistencia de cache-busting (?v=...)
            m_css = re.search(r'css/styles\.css\?v=([0-9A-Za-z._-]+)', content_html)
            m_js = re.search(r'js/app\.js\?v=([0-9A-Za-z._-]+)', content_html)
            css_v = m_css.group(1) if m_css else None
            js_v = m_js.group(1) if m_js else None
            results["cache_versions"] = {"css": css_v, "js": js_v}
            if not css_v or not js_v or css_v != js_v:
                results["cache_busting_ok"] = False
                results["ok"] = False
                results["issues"].append(f"CACHE-BUSTING INCONSISTENTE en index.html: css={css_v}, js={js_v}")
        except Exception as e:
            results["issues"].append(f"No se pudo leer index.html: {e}")

    # 5. Auditoría de bloqueos y regresiones en js/app.js
    if os.path.exists(app_js):
        try:
            with open(app_js, "r", encoding="utf-8", errors="ignore") as f:
                content_js = f.read()

            if "wodRoundsCompleted.readOnly = true" in content_js:
                results["readonly_trap_free"] = False
                results["ok"] = False
                results["issues"].append("BLOQUEO DETECTADO: 'wodRoundsCompleted.readOnly = true' en app.js")

            for bad_lock in ["wodVariant.disabled = true", "wodCategory.disabled = true", "wodExercise.disabled = true"]:
                if bad_lock in content_js:
                    results["select_locks_free"] = False
                    results["ok"] = False
                    results["issues"].append(f"BLOQUEO SELECT DETECTADO en app.js: '{bad_lock}'")

            # Verificar anti-regresión: updateVariantOptions no debe invocarse dentro del bloque Gimnásticos de updateExerciseRmState
            m_gym_block = re.search(r"else if \(category === 'Gimnásticos'\)\s*\{([\s\S]*?)else if \(category === 'Metcon", content_js)
            if m_gym_block and "updateVariantOptions(" in m_gym_block.group(1):
                results["select_locks_free"] = False
                results["ok"] = False
                results["issues"].append("REGRESIÓN DETECTADA: updateVariantOptions() llamado dentro de updateExerciseRmState() para Gimnásticos")

            if "Clean Squat" in content_js or "Squat Clean" in content_js:
                results["clean_squat_in_local_code"] = True
        except Exception as e:
            results["issues"].append(f"No se pudo leer app.js: {e}")

    return results

def audit_and_heal_google_sheets():
    """Audita Google Sheets (Registro_Diario, Skills_Gimnasia, Wellness, Control_Ciclo, RMs)."""
    creds_path = os.path.join(BASE_DIR, "credentials.json")
    if not os.path.exists(creds_path):
        return {"ok": False, "error": "credentials.json no encontrado"}

    try:
        creds = Credentials.from_service_account_file(creds_path, scopes=['https://www.googleapis.com/auth/spreadsheets'])
        client = gspread.authorize(creds)
        sh = client.open_by_key(SPREADSHEET_ID)
    except Exception as e:
        return {"ok": False, "error": f"Error autenticando con Google Sheets API: {e}"}

    issues = []
    repaired_rows = []
    healed_isolations = []
    total_filas = 0
    well_rows = 0
    gim_rows = 0
    ciclo_activo = "DESCONOCIDO"
    semana_actual = "DESCONOCIDA"

    # =========================================================================
    # 1. AUDITORÍA DE 'Registro_Diario' (A hasta Z)
    # =========================================================================
    try:
        ws_reg = sh.worksheet("Registro_Diario")
        headers = ws_reg.row_values(1)
        col_count = len(headers)

        if col_count >= 26:
            col_z = headers[25].strip() if len(headers) > 25 else ""
            if col_z != "" and col_z.lower() != "ciclo":
                issues.append(f"COLUMNA Z INESPERADA ('{col_z}'). Se esperaba 'Ciclo'.")
        if col_count > 26:
            col_aa = headers[26].strip() if len(headers) > 26 else ""
            if col_aa != "":
                issues.append(f"COLUMNA AA DETECTADA ('{col_aa}'). La arquitectura exige máximo 26 columnas (A-Z).")

        col_a_vals = ws_reg.col_values(1)
        total_filas = len(col_a_vals)
        if total_filas >= ws_reg.row_count:
            ws_reg.add_rows(2)
            issues.append("LOOKER STUDIO: Registro_Diario no tenía fila vacía final; se añadió automáticamente.")

        start_row = max(2, total_filas - 40)
        batch_rows = ws_reg.get(f"A{start_row}:Z{total_filas}")

        for idx, row_vals in enumerate(batch_rows):
            r = start_row + idx
            if not row_vals or len(row_vals) < 5:
                continue

            atleta = row_vals[0]
            ejercicio = row_vals[4] if len(row_vals) > 4 else ""
            categoria = row_vals[5] if len(row_vals) > 5 else ""
            zona = row_vals[13] if len(row_vals) > 13 else ""
            ciclo = row_vals[25] if len(row_vals) > 25 else ""

            # Alerta inmediata si una corrida cayó como Metcon
            if ("cardio" in categoria.lower() or "carrera" in ejercicio.lower()) and "metcon" in zona.lower():
                issues.append(f"CRÍTICO Fila {r} [{atleta}]: Carrera desviada a Zona '{zona}'")

            # Alerta inmediata si un registro reciente quedó sin Ciclo
            if not str(ciclo).strip():
                issues.append(f"Fila {r} [{atleta} - {ejercicio}]: Registro sin Ciclo en Columna Z")

            # Verificar errores de fórmula
            for col_idx in [2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21]:
                val = str(row_vals[col_idx]) if len(row_vals) > col_idx else ""
                if any(err in val for err in ["#ERROR!", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?", "#N/A"]):
                    issues.append(f"Fila {r} [{atleta} - {ejercicio}]: Error de fórmula '{val}' en col {col_idx+1}")

            # Verificar aislamiento metabólico (Metcon y Cardio)
            if categoria in ["Metcon / WOD", "Cardio"]:
                series = str(row_vals[6]) if len(row_vals) > 6 else "0"
                carga = str(row_vals[8]) if len(row_vals) > 8 else "0"
                unrm = str(row_vals[9]) if len(row_vals) > 9 else "0"
                tonelaje = str(row_vals[12]) if len(row_vals) > 12 else "0"

                need_isolation_heal = False
                if categoria == "Metcon / WOD" and series not in ["0", ""]:
                    need_isolation_heal = True
                if carga not in ["0", "", "0.0", "0,0"]:
                    need_isolation_heal = True
                if unrm not in ["0", "", "0.0", "0,0"]:
                    need_isolation_heal = True
                if tonelaje not in ["0", "", "0.0", "0,0", "0 kg"]:
                    need_isolation_heal = True

                if need_isolation_heal:
                    issues.append(f"Fila {r} [{categoria}]: Aislamiento metabólico vulnerado (Carga={carga}, 1RM={unrm}, Ton={tonelaje})")
                    try:
                        ws_reg.update(range_name=f"I{r}:J{r}", values=[[0, 0]], value_input_option='USER_ENTERED')
                        healed_isolations.append(r)
                    except Exception as iso_err:
                        issues.append(f"Fallo auto-curación aislamiento fila {r}: {iso_err}")

    except Exception as e:
        issues.append(f"Error procesando Registro_Diario: {e}")

    # =========================================================================
    # 2. AUDITORÍA DE 'Wellness' (A hasta M)
    # =========================================================================
    try:
        ws_well = sh.worksheet("Wellness")
        well_col_a = ws_well.col_values(1)
        well_rows = len(well_col_a)
        well_start = max(2, well_rows - 30)
        batch_well = ws_well.get(f"A{well_start}:M{well_rows}")

        for idx, w_vals in enumerate(batch_well):
            r = well_start + idx
            if len(w_vals) >= 10:
                try:
                    b = float(str(w_vals[1]).replace(',', '.'))
                    c = float(str(w_vals[2]).replace(',', '.'))
                    d = float(str(w_vals[3]).replace(',', '.'))
                    e = float(str(w_vals[4]).replace(',', '.'))
                    f = float(str(w_vals[5]).replace(',', '.'))
                    j = float(str(w_vals[9]).replace(',', '.'))
                    esperado = b + c + d + e + f
                    if abs(j - esperado) > 0.05:
                        issues.append(f"Fila {r} Wellness: Score inconsistente {j} (Esperado {esperado})")
                        try:
                            ws_well.update_acell(f"J{r}", esperado)
                        except Exception:
                            pass
                except (ValueError, IndexError):
                    pass
                w_ciclo = str(w_vals[12]).strip() if len(w_vals) > 12 else ""
                if not w_ciclo:
                    issues.append(f"Fila {r} Wellness: Registro sin Ciclo en Columna M")
    except Exception as e:
        issues.append(f"Error procesando Wellness: {e}")

    # =========================================================================
    # 3. AUDITORÍA DE 'Skills_Gimnasia' (A hasta J)
    # =========================================================================
    try:
        ws_gim = sh.worksheet("Skills_Gimnasia")
        gim_all = ws_gim.get_all_values()
        gim_rows = max(0, len(gim_all) - 1)
        if len(gim_all) >= ws_gim.row_count:
            ws_gim.add_rows(2)
        for idx, g_vals in enumerate(gim_all[max(1, len(gim_all) - 30):], start=max(2, len(gim_all) - 29)):
            if len(g_vals) < 9:
                issues.append(f"Fila {idx} Skills_Gimnasia: Columnas incompletas ({len(g_vals)}/10)")
                continue
            if not str(g_vals[2]).strip() or not str(g_vals[3]).strip():
                issues.append(f"Fila {idx} Skills_Gimnasia: Falta Skill_Movimiento o Nivel_Progresion")
            if not str(g_vals[7]).strip() or not str(g_vals[8]).strip():
                issues.append(f"Fila {idx} Skills_Gimnasia: Falta Ciclo o Semana")
            try:
                float(str(g_vals[4]).replace(',', '.'))
                float(str(g_vals[5]).replace(',', '.'))
            except ValueError:
                issues.append(f"Fila {idx} Skills_Gimnasia: Max_Reps o Volumen_Total no numéricos")
    except Exception as e:
        issues.append(f"Error procesando Skills_Gimnasia: {e}")

    # =========================================================================
    # 4. AUDITORÍA DE RMs Y CONTROL_CICLO
    # =========================================================================
    rm_counts = {}
    for rm_tab in ["RM_Atletas", "RM_Zeus", "RM_Atenea"]:
        try:
            ws_tab = sh.worksheet(rm_tab)
            rm_counts[rm_tab] = max(0, len(ws_tab.get_all_values()) - 1)
        except Exception:
            issues.append(f"PESTAÑA FALTANTE: No se encontró '{rm_tab}'.")
            rm_counts[rm_tab] = 0

    try:
        ws_ctrl = sh.worksheet("Control_Ciclo")
        ctrl_vals = ws_ctrl.get_all_values()
        for row in ctrl_vals[1:]:
            if len(row) >= 2:
                if row[0].strip() == "Ciclo_Activo":
                    ciclo_activo = str(row[1]).strip()
                elif row[0].strip() == "Semana_Actual":
                    semana_actual = str(row[1]).strip()
        if len(ctrl_vals) < 3:
            issues.append("CONTROL_CICLO INCOMPLETO.")
    except Exception:
        issues.append("PESTAÑA FALTANTE: No se encontró 'Control_Ciclo'.")

    return {
        "ok": len(issues) == 0,
        "ciclo_activo": ciclo_activo,
        "semana_actual": semana_actual,
        "total_registros_diario": total_filas,
        "total_wellness": well_rows,
        "total_skills_gimnasia": gim_rows,
        "total_rm_records": rm_counts.get("RM_Atletas", 0),
        "rm_counts": rm_counts,
        "repaired_formulas_rows": repaired_rows,
        "repaired_isolations_rows": healed_isolations,
        "issues": issues
    }

def ejecutar_ciclo_completo():
    """Ejecuta un ciclo completo de vigilancia E2E y retorna el resumen."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_event("🛡️ [AGENTE VIGILANTE E2E v3.0] Iniciando auditoría integral...")

    web_status = audit_web_and_frontend()
    sheets_status = audit_and_heal_google_sheets()

    is_healthy = web_status["ok"] and sheets_status["ok"]

    reporte = {
        "timestamp": timestamp,
        "estado_general": "SALUDABLE" if is_healthy else "ATENCION_REQUERIDA",
        "web_watchdog": web_status,
        "sheets_watchdog": sheets_status
    }

    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(reporte, f, indent=2, ensure_ascii=False)
    except Exception as e:
        log_event(f"Error escribiendo {STATUS_FILE}: {e}")

    log_event(f"  • Web Endpoint: {web_status['endpoint_health']} ({web_status['latency_sec']}s)")
    log_event(f"  • Sintaxis JS (node -c): {'✅ OK' if web_status['js_syntax_ok'] else '❌ ERROR'}")
    log_event(f"  • DOM IDs Críticos & Selects Libres: {'✅ OK' if (web_status['critical_dom_ids_ok'] and web_status['select_locks_free']) else '❌ FALLO'}")
    log_event(f"  • Cache-Busting: {'✅ OK' if web_status['cache_busting_ok'] else '❌ INCONSISTENTE'} ({web_status['cache_versions']})")
    log_event(f"  • Dashboard E2E (Global + Nuevos Atletas): {'✅ OK (0 NaN)' if web_status['dashboard_e2e_ok'] else '❌ FALLO'}")
    log_event(f"  • Google Sheets ({sheets_status.get('ciclo_activo')} · Sem {sheets_status.get('semana_actual')}): {'✅ 100% ÍNTEGRO' if sheets_status['ok'] else '⚠️ DISCREPANCIAS'}")
    log_event(f"    - Registro_Diario: {sheets_status['total_registros_diario']} | Wellness: {sheets_status['total_wellness']} | Skills_Gimnasia: {sheets_status['total_skills_gimnasia']}")

    if not is_healthy:
        for iss in web_status.get("issues", []) + sheets_status.get("issues", []):
            log_event(f"    ⚠️ {iss}")
    else:
        log_event("  • Ecosistema Kleos 100% saludable (Frontend + Backend + Sheets).")

    return is_healthy

def print_current_status():
    if not os.path.exists(STATUS_FILE):
        print("No existe reporte previo de estado.")
        return
    with open(STATUS_FILE, "r", encoding="utf-8") as f:
        print(json.dumps(json.load(f), indent=2, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "--status":
            print_current_status()
            sys.exit(0)
        elif sys.argv[1] == "--loop":
            intervalo = int(sys.argv[2]) if len(sys.argv) > 2 else 180
            log_event(f"🚀 INICIANDO VIGILANTE KLEOS E2E v3.0 EN SEGUNDO PLANO (Intervalo: {intervalo}s)...")
            while True:
                try:
                    ejecutar_ciclo_completo()
                except Exception as err:
                    log_event(f"❌ [EXCEPCIÓN EN CICLO VIGILANTE]: {err}")
                time.sleep(intervalo)
    else:
        healthy = ejecutar_ciclo_completo()
        sys.exit(0 if healthy else 1)
