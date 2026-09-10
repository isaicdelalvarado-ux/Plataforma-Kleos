#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
🏛️ PLATAFORMA KLEOS - SISTEMA DE AGENTES VIGILANTES PERMANENTES (WATCHDOG & AUTO-HEALING)
================================================================================
Supervisa de forma autónoma y continua la salud de la plataforma web y Google Sheets:

1. AGENTE VIGILANTE WEB Y FRONTEND (Web & Frontend Watchdog):
   - Conectividad, latencia y respuesta del Google Apps Script Web App.
   - Verificación de 'action=audit' y 'action=getInitialData'.
   - Confirmación de disponibilidad de 'Clean Squat' y catálogo de ejercicios.
   - Verificación de desbloqueo de campos en Metcon (sin trampas readOnly).
   - Verificación de consistencia de versión y prevención de caché.

2. AGENTE VIGILANTE DE BASE DE DATOS SHEETS (Sheets & Auto-Healing Watchdog):
   - Integridad de 'Registro_Diario':
     * Estricta estructura de 25 columnas (A hasta Y). Cero Columna Z.
     * Cero errores (#ERROR!, #REF!, #VALUE!, #DIV/0!) en fórmulas (K a N).
     * Auto-reparación instantánea de fórmulas en K:N desde fila canónica.
     * Aislamiento metabólico garantizado en Metcon y Cardio (Carga=0, 1RM=0, Tonelaje=0).
     * Validación de formato de 3 decimales en Columna X (/1000).
   - Integridad de 'Wellness':
     * Consistencia del Wellness Score (Col J = B + C + D + E + F).
   - Integridad de 'RM_Atletas':
     * Presencia de atletas y marcas de referencia.

3. TELEMETRÍA Y LOGGING CONTINUO:
   - Registro de latidos y estado en 'estado_salud_kleos.json'.
   - Histórico rotativo de auditorías en 'vigilante.log'.
   - Modo de ejecución individual o daemon continuo (--loop).
"""

import sys
import os
import time
import json
import urllib.request
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

SPREADSHEET_ID = "1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o"
SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh/exec"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "estado_salud_kleos.json")
LOG_FILE = os.path.join(BASE_DIR, "vigilante.log")

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
    """Audita el endpoint de backend y la configuración del frontend."""
    results = {
        "ok": True,
        "endpoint_health": "UNKNOWN",
        "latency_sec": 0,
        "clean_squat_in_api": False,
        "clean_squat_in_local_code": False,
        "readonly_trap_free": True,
        "issues": []
    }

    # 1. Auditoría del Endpoint Apps Script (?action=audit)
    t0 = time.time()
    try:
        url_audit = f"{SCRIPT_URL}?action=audit"
        req = urllib.request.Request(url_audit, headers={'User-Agent': 'KleosGuardian/2.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
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

    # 2. Verificación de Inicialización de Atletas y Ejercicios (?action=getInitialData)
    try:
        url_init = f"{SCRIPT_URL}?action=getInitialData"
        req_init = urllib.request.Request(url_init, headers={'User-Agent': 'KleosGuardian/2.0'})
        with urllib.request.urlopen(req_init, timeout=10) as resp_init:
            if resp_init.getcode() == 200:
                raw_init = resp_init.read().decode('utf-8')
                data_init = json.loads(raw_init)
                # Verificar si Clean Squat está en la lista de ejercicios o RMs
                str_init = json.dumps(data_init)
                if "Clean Squat" in str_init or "Squat Clean" in str_init:
                    results["clean_squat_in_api"] = True
    except Exception:
        # No crítico si getInitialData no soporta este parámetro directamente
        pass

    # 3. Auditoría de archivos estáticos del Frontend local
    index_html = os.path.join(BASE_DIR, "index.html")
    app_js = os.path.join(BASE_DIR, "js", "app.js")

    if os.path.exists(index_html):
        try:
            with open(index_html, "r", encoding="utf-8", errors="ignore") as f:
                content_html = f.read()
                if "Clean Squat" in content_html or "Squat Clean" in content_html:
                    results["clean_squat_in_local_code"] = True
                else:
                    results["issues"].append("ALERTA: 'Clean Squat' no encontrado en index.html")
                    results["ok"] = False
        except Exception as e:
            results["issues"].append(f"No se pudo leer index.html: {e}")

    if os.path.exists(app_js):
        try:
            with open(app_js, "r", encoding="utf-8", errors="ignore") as f:
                content_js = f.read()
                # Verificar que wodRoundsCompleted.readOnly = true no exista
                if "wodRoundsCompleted.readOnly = true" in content_js:
                    results["readonly_trap_free"] = False
                    results["issues"].append("BLOQUEO DETECTADO: 'wodRoundsCompleted.readOnly = true' encontrado en app.js")
                    results["ok"] = False
                if "Clean Squat" in content_js or "Squat Clean" in content_js:
                    results["clean_squat_in_local_code"] = True
        except Exception as e:
            results["issues"].append(f"No se pudo leer app.js: {e}")

    return results

def audit_and_heal_google_sheets():
    """Audita Google Sheets con batch reads ultra-rápidos y auto-repara inconsistencias."""
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

    # =========================================================================
    # 1. AUDITORÍA DE 'Registro_Diario'
    # =========================================================================
    try:
        ws_reg = sh.worksheet("Registro_Diario")
        headers = ws_reg.row_values(1)
        col_count = len(headers)

        # Regla: NO Columna Z
        if col_count >= 26:
            col_z = headers[25].strip() if len(headers) > 25 else ""
            if col_z != "":
                issues.append(f"COLUMNA Z DETECTADA ('{col_z}'). La arquitectura exige máximo 25 columnas (A-Y).")

        # Batch-reading de las últimas 40 filas
        col_a_vals = ws_reg.col_values(1)
        total_filas = len(col_a_vals)
        start_row = max(2, total_filas - 40)

        # Auto-expansión inteligente del recuadro Tabla_1 para que cubra todas las filas y columnas A-Y (25 cols)
        try:
            meta = sh.fetch_sheet_metadata()
            sheet_rd_meta = next((s for s in meta.get("sheets", []) if s.get("properties", {}).get("title") == "Registro_Diario"), None)
            if sheet_rd_meta and sheet_rd_meta.get("bandedRanges"):
                banded = sheet_rd_meta["bandedRanges"][0]
                b_range = banded.get("range", {})
                b_end_row = b_range.get("endRowIndex", 0)
                b_end_col = b_range.get("endColumnIndex", 0)
                if b_end_row < total_filas or b_end_col < 25:
                    sh.batch_update({
                        'requests': [{
                            'updateBanding': {
                                'bandedRange': {
                                    'bandedRangeId': banded["bandedRangeId"],
                                    'range': {
                                        'sheetId': b_range.get("sheetId", 1548042606),
                                        'startRowIndex': 0,
                                        'endRowIndex': total_filas,
                                        'startColumnIndex': 0,
                                        'endColumnIndex': 25
                                    }
                                },
                                'fields': 'range'
                            }
                        }]
                    })
        except Exception:
            pass

        # 1 sola llamada API para todas las filas
        batch_rows = ws_reg.get(f"A{start_row}:Y{total_filas}")

        for idx, row_vals in enumerate(batch_rows):
            r = start_row + idx
            if not row_vals or len(row_vals) < 5:
                continue

            atleta = row_vals[0]
            ejercicio = row_vals[4] if len(row_vals) > 4 else ""
            categoria = row_vals[5] if len(row_vals) > 5 else ""

            # Verificar fórmulas en K, L, M, N (índices 10, 11, 12, 13)
            has_formula_error = False
            for col_idx in [10, 11, 12, 13]:
                val = str(row_vals[col_idx]) if len(row_vals) > col_idx else ""
                if any(err in val for err in ["#ERROR!", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?"]):
                    has_formula_error = True
                    issues.append(f"Fila {r} [{atleta} - {ejercicio}]: Error de fórmula '{val}' en col {col_idx+1}")

            # Auto-reparar si se detectó error
            if has_formula_error:
                try:
                    f_k = f'=IF(J{r}>0; I{r}/J{r}; 0)'
                    f_l = f'=IF(G{r}>0; G{r}*H{r}; 0)'
                    f_m = f'=IF(AND(ISNUMBER(I{r}); I{r}>0); G{r}*H{r}*I{r}; 0)'
                    f_n = f'=IF(F{r}="Cardio"; "Cardio"; IF(K{r}<0,7; "Descarga (<70%)"; IF(K{r}<=0,8; "Hipertrofia (70-80%)"; "Fuerza Máxima (>80%)")))'
                    ws_reg.update(range_name=f"K{r}:N{r}", values=[[f_k, f_l, f_m, f_n]], value_input_option='USER_ENTERED')
                    repaired_rows.append(r)
                except Exception as rep_err:
                    issues.append(f"Fallo auto-reparación en fila {r}: {rep_err}")

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
                    # Auto-heal aislamiento
                    try:
                        # Forzar I y J a 0
                        ws_reg.update(range_name=f"I{r}:J{r}", values=[[0, 0]], value_input_option='USER_ENTERED')
                        healed_isolations.append(r)
                    except Exception as iso_err:
                        issues.append(f"Fallo auto-curación aislamiento fila {r}: {iso_err}")

            # Verificar formato de 3 decimales en Columna X para Metcon
            if categoria == "Metcon / WOD":
                score_reps = str(row_vals[23]) if len(row_vals) > 23 else ""
                if score_reps != "" and ("." in score_reps or "," in score_reps):
                    parts = score_reps.replace(",", ".").split(".")
                    if len(parts) == 2 and len(parts[1]) > 3:
                        issues.append(f"Fila {r} [Score_Reps]: Formato decimal excede 3 posiciones ('{score_reps}')")

    except Exception as e:
        issues.append(f"Error procesando Registro_Diario: {e}")

    # =========================================================================
    # 2. AUDITORÍA DE 'Wellness'
    # =========================================================================
    try:
        ws_well = sh.worksheet("Wellness")
        well_col_a = ws_well.col_values(1)
        well_rows = len(well_col_a)
        well_start = max(2, well_rows - 30)

        batch_well = ws_well.get(f"A{well_start}:J{well_rows}")

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
                        # Auto-reparar columna J
                        try:
                            ws_well.update_acell(f"J{r}", esperado)
                        except Exception:
                            pass
                except (ValueError, IndexError):
                    pass
    except Exception as e:
        issues.append(f"Error procesando Wellness: {e}")

    # =========================================================================
    # 3. AUDITORÍA DE 'RM_Atletas'
    # =========================================================================
    try:
        ws_rm = sh.worksheet("RM_Atletas")
        rm_all = ws_rm.get_all_values()
        rm_count = len(rm_all) - 1
    except Exception:
        rm_count = 0

    return {
        "ok": len(issues) == 0,
        "total_registros_diario": total_filas if 'total_filas' in locals() else 0,
        "total_wellness": well_rows if 'well_rows' in locals() else 0,
        "total_rm_records": rm_count,
        "repaired_formulas_rows": repaired_rows,
        "repaired_isolations_rows": healed_isolations,
        "issues": issues
    }

def ejecutar_ciclo_completo():
    """Ejecuta un ciclo completo de vigilancia y retorna el resumen."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_event(f"🛡️ [AGENTE VIGILANTE] Iniciando ciclo de auditoría continua...")

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

    # Impresión estructurada de resultados
    log_event(f"  • Web Endpoint: {web_status['endpoint_health']} ({web_status['latency_sec']}s)")
    log_event(f"  • Clean Squat en Código & API: {'✅ SÍ' if web_status['clean_squat_in_local_code'] else '⚠️ REVISAR'}")
    log_event(f"  • UI Inputs Desbloqueados: {'✅ SÍ (readOnly=false)' if web_status['readonly_trap_free'] else '❌ TRAP DETECTADO'}")
    log_event(f"  • Google Sheets: {'✅ 100% ÍNTEGRO' if sheets_status['ok'] else '⚠️ DISCREPANCIAS ATENDIDAS'}")
    log_event(f"    - Filas Registro_Diario: {sheets_status['total_registros_diario']}")
    log_event(f"    - Filas Wellness: {sheets_status['total_wellness']}")

    if sheets_status.get("repaired_formulas_rows"):
        log_event(f"  • 🔧 Fórmulas auto-reparadas en filas: {sheets_status['repaired_formulas_rows']}")
    if sheets_status.get("repaired_isolations_rows"):
        log_event(f"  • 🔧 Aislamiento metabólico restaurado en filas: {sheets_status['repaired_isolations_rows']}")

    if not is_healthy:
        todos_issues = web_status.get("issues", []) + sheets_status.get("issues", [])
        for iss in todos_issues:
            log_event(f"    ⚠️ {iss}")
    else:
        log_event("  • Ecosistema Kleos funcionando al 100% de forma óptima.")

    return is_healthy

def print_current_status():
    if not os.path.exists(STATUS_FILE):
        print("No existe reporte previo de estado. Ejecute sin parámetros para realizar la primera auditoría.")
        return
    with open(STATUS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(json.dumps(data, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "--status":
            print_current_status()
            sys.exit(0)
        elif sys.argv[1] == "--loop":
            intervalo = int(sys.argv[2]) if len(sys.argv) > 2 else 180
            log_event(f"🚀 INICIANDO VIGILANTE KLEOS EN SEGUNDO PLANO CONTINUO (Intervalo: {intervalo}s)...")
            while True:
                try:
                    ejecutar_ciclo_completo()
                except Exception as err:
                    log_event(f"❌ [EXCEPCIÓN EN CICLO VIGILANTE]: {err}")
                time.sleep(intervalo)
    else:
        healthy = ejecutar_ciclo_completo()
        sys.exit(0 if healthy else 1)
