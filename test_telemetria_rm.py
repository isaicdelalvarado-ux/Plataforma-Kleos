#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueba de Telemetría para Plataforma Kleos:
1. Simulación de serie 1 (90kg normal), serie 2 (110kg normal) y serie 3 (120kg nuevo RM).
2. Verificación de lectura en cascada (Ciclo 2 con fallback a Ciclo 1).
3. Verificación de congelamiento estático en Registro_Diario.
"""

import urllib.request
import json
import time
import sys
import gspread
from google.oauth2.service_account import Credentials

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzBrbeleVQHEDqLG3iiF7bsR7jxY8wGCYjWfJUmRU-YFv3H73ro2tnvW57HJw6n_qwEmw/exec"
SHEET_KEY = "1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o"

def main():
    print("=" * 70)
    print("INICIANDO PRUEBA DE TELEMETRÍA - ARQUITECTURA DE RMs Y CONGELAMIENTO")
    print("=" * 70)

    # 1. Conexión nativa con Google Sheets
    creds = Credentials.from_service_account_file("credentials.json", scopes=["https://www.googleapis.com/auth/spreadsheets"])
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_KEY)

    ws_base = sh.worksheet("RM_Atletas")
    ws_c2 = sh.worksheet("RM_Ciclo_02")
    ws_reg = sh.worksheet("Registro_Diario")
    ws_hist = sh.worksheet("Historial_RMs")

    test_athlete = "Atleta Test Telemetria"

    # Preparar datos base para el test en RM_Atletas
    print(f"\n[1] Configurando marcas base del Ciclo 1 en 'RM_Atletas' para '{test_athlete}'...")
    base_rows = [
        [test_athlete, "Back Squat", 100],
        [test_athlete, "Clean Squat", 80],
        [test_athlete, "Jerk", 75]
    ]
    cur_len = len(ws_base.get_all_values())
    ws_base.update(range_name=f"A{cur_len + 1}:C{cur_len + len(base_rows)}", values=base_rows)
    print("    -> Creado: Back Squat=100kg, Clean Squat=80kg, Jerk=75kg en RM_Atletas.")

    time.sleep(1)

    # 2. Consultar GET a la API para verificar lectura en cascada inicial
    print("\n[2] Consultando API GET ?action=getAthletes para probar cascada inicial...")
    req = urllib.request.Request(f"{SCRIPT_URL}?action=getAthletes")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        rm_data = data.get("rmData", {})
        ath_rm = rm_data.get(test_athlete, {})
        print(f"    -> RMs detectados para '{test_athlete}': {ath_rm}")
        assert ath_rm.get("Back Squat") == 100, "Error: Back Squat debe ser 100kg"
        assert ath_rm.get("Clean Squat") == 80, "Error: Clean Squat debe ser 80kg"
        assert ath_rm.get("Jerk") == 75, "Error: Jerk debe ser 75kg"
        print("    ✅ Cascada inicial OK: Lee 100% de la pestaña base (Ciclo 1).")

    # 3. Serie 1: 90kg Normal (Aproximación - SIN marcar Nuevo RM)
    print("\n[3] Enviando Serie 1: 90kg Normal (Aproximación - es_nuevo_rm: false)...")
    payload1 = {
        "type": "registro_diario",
        "athlete": test_athlete,
        "date": "2026-10-28",
        "categoria": "Fuerza",
        "ejercicio": "Back Squat",
        "series": 1,
        "reps": 1,
        "carga": 90,
        "es_nuevo_rm": False,
        "rpe": "7"
    }
    req1 = urllib.request.Request(SCRIPT_URL, data=json.dumps(payload1).encode('utf-8'), headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req1) as resp:
        res1 = json.loads(resp.read().decode('utf-8'))
        print(f"    -> Respuesta API: {res1.get('status')} | {res1.get('message')}")

    time.sleep(2)

    # 4. Serie 2: 110kg Normal (Aproximación - SIN marcar Nuevo RM)
    print("\n[4] Enviando Serie 2: 110kg Normal (Aproximación - es_nuevo_rm: false)...")
    payload2 = {
        "type": "registro_diario",
        "athlete": test_athlete,
        "date": "2026-10-28",
        "categoria": "Fuerza",
        "ejercicio": "Back Squat",
        "series": 1,
        "reps": 1,
        "carga": 110,
        "es_nuevo_rm": False,
        "rpe": "8.5"
    }
    req2 = urllib.request.Request(SCRIPT_URL, data=json.dumps(payload2).encode('utf-8'), headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req2) as resp:
        res2 = json.loads(resp.read().decode('utf-8'))
        print(f"    -> Respuesta API: {res2.get('status')} | {res2.get('message')}")

    time.sleep(2)

    # Verificar que RM_Ciclo_02 aún NO tiene nada de este atleta
    c2_vals_before = ws_c2.get_all_values()
    c2_ath_rows_before = [r for r in c2_vals_before if r[0] == test_athlete]
    print(f"\n[Verificación Intermedia] Filas en 'RM_Ciclo_02' para '{test_athlete}': {len(c2_ath_rows_before)}")
    assert len(c2_ath_rows_before) == 0, "Error: Las series normales NO deben escribir en RM_Ciclo_02"
    print("    ✅ 'RM_Ciclo_02' permanece 100% libre de series de aproximación.")

    # 5. Serie 3: 120kg Marcando Botón Nuevo RM Final
    print("\n[5] Enviando Serie 3: 120kg marcando '⚡ ¿Establecer como Nuevo 1RM Final del Ciclo?' (es_nuevo_rm: true)...")
    payload3 = {
        "type": "registro_diario",
        "athlete": test_athlete,
        "date": "2026-10-28",
        "categoria": "Fuerza",
        "ejercicio": "Back Squat",
        "series": 1,
        "reps": 1,
        "carga": 120,
        "es_nuevo_rm": True,
        "rpe": "10"
    }
    req3 = urllib.request.Request(SCRIPT_URL, data=json.dumps(payload3).encode('utf-8'), headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req3) as resp:
        res3 = json.loads(resp.read().decode('utf-8'))
        print(f"    -> Respuesta API: {res3.get('status')} | {res3.get('message')}")

    time.sleep(3)

    # 6. Auditoría de Resultados en Hojas
    print("\n" + "=" * 70)
    print("AUDITORÍA DE INTEGRIDAD Y REGLAS DE NEGOCIO")
    print("=" * 70)

    # A) Verificar Registro_Diario
    all_reg = ws_reg.get_all_values()
    test_reg_rows = [r for r in all_reg if r[0] == test_athlete]
    print(f"\n[Regla 1 & 3] Filas guardadas en 'Registro_Diario': {len(test_reg_rows)}")
    for idx, r in enumerate(test_reg_rows, 1):
        print(f"    Fila {idx}: Carga(Col I)={r[8]}kg | 1RM Ref(Col J)={r[9]}kg | %(Col K)={r[10]} | Tonelaje(Col M)={r[12]}kg | Zona(Col N)={r[13]}")
    
    # Serie 1 (90kg): Col J debe ser 100kg (basal), Col K ~ 90%
    assert test_reg_rows[0][8] == "90", "Carga serie 1 incorrecta"
    assert "100" in test_reg_rows[0][9], "1RM serie 1 debe ser 100kg basal"
    
    # Serie 2 (110kg): Col J debe ser 100kg (basal), Col K ~ 110%
    assert test_reg_rows[1][8] == "110", "Carga serie 2 incorrecta"
    assert "100" in test_reg_rows[1][9], "1RM serie 2 debe ser 100kg basal (no recalculado!)"

    # Serie 3 (120kg): Col J debe ser 120kg
    assert test_reg_rows[2][8] == "120", "Carga serie 3 incorrecta"
    assert "120" in test_reg_rows[2][9], "1RM serie 3 debe ser 120kg nuevo RM"

    # Verificar que NO tienen fórmulas dinámicas
    formulas_check = ws_reg.get(f"A{len(all_reg)-2}:Z{len(all_reg)}", value_render_option="FORMULA")
    has_formula = False
    for r in formulas_check:
        for c in r:
            if isinstance(c, str) and c.startswith("="):
                has_formula = True
                print(f"    AVISO: Formula detectada: {c}")
    assert not has_formula, "Error: Las nuevas filas NO deben tener formulas dinamicas, deben ser estaticas!"
    print("    ✅ Congelamiento Estático 100% verificado: 0 fórmulas dinámicas en las filas insertadas.")

    # B) Verificar RM_Ciclo_02
    c2_vals_after = ws_c2.get_all_values()
    c2_ath_rows_after = [r for r in c2_vals_after if r[0] == test_athlete]
    print(f"\n[Regla 2] Filas en 'RM_Ciclo_02' para '{test_athlete}': {len(c2_ath_rows_after)}")
    for r in c2_ath_rows_after:
        print(f"    -> Atleta: {r[0]} | Ejercicio: {r[1]} | 1RM: {r[2]}kg")
    assert len(c2_ath_rows_after) == 1, "Debe existir exactamente 1 sola fila en RM_Ciclo_02"
    assert c2_ath_rows_after[0][1] == "Back Squat", "Ejercicio debe ser Back Squat"
    assert "120" in c2_ath_rows_after[0][2], "1RM debe ser 120kg"
    print("    ✅ Solo los 120kg se guardaron en 'RM_Ciclo_02'.")

    # C) Verificar RM_Atletas (Pestaña Base Intacta)
    base_vals_after = ws_base.get_all_values()
    base_ath_rows = [r for r in base_vals_after if r[0] == test_athlete]
    print(f"\n[Regla 1] Filas en 'RM_Atletas' para '{test_athlete}': {len(base_ath_rows)}")
    for r in base_ath_rows:
        print(f"    -> Atleta: {r[0]} | Ejercicio: {r[1]} | 1RM: {r[2]}kg")
    assert any(r[1] == "Back Squat" and "100" in r[2] for r in base_ath_rows), "RM_Atletas debe conservar 100kg intacto"
    print("    ✅ 'RM_Atletas' (Ciclo 1) se mantuvo 100% intacta con sus 100kg originales.")

    # D) Verificar Lectura en Cascada (Fallback Automático)
    print("\n[Regla 1.3] Verificando consulta en cascada vía API GET...")
    req_cascade = urllib.request.Request(f"{SCRIPT_URL}?action=getAthletes")
    with urllib.request.urlopen(req_cascade) as resp:
        data_c = json.loads(resp.read().decode('utf-8'))
        ath_rm_c = data_c.get("rmData", {}).get(test_athlete, {})
        print(f"    -> Lectura Cascada para '{test_athlete}':")
        print(f"       - Back Squat (testeado hoy): {ath_rm_c.get('Back Squat')}kg (debe ser 120 de RM_Ciclo_02)")
        print(f"       - Clean Squat (no testeado hoy): {ath_rm_c.get('Clean Squat')}kg (debe ser 80 de RM_Atletas)")
        print(f"       - Jerk (no testeado hoy): {ath_rm_c.get('Jerk')}kg (debe ser 75 de RM_Atletas)")

        assert ath_rm_c.get("Back Squat") == 120, "Back Squat debe leer 120 de Ciclo 2"
        assert ath_rm_c.get("Clean Squat") == 80, "Clean Squat debe leer 80 de Ciclo 1"
        assert ath_rm_c.get("Jerk") == 75, "Jerk debe leer 75 de Ciclo 1"
        print("    ✅ Cascada 100% verificada: Lee 120kg de Ciclo 2 y automáticamente 80kg/75kg de Ciclo 1.")

    # 7. Limpieza de filas de prueba para mantener la hoja impecable
    print("\n[7] Limpiando datos de prueba del ecosistema...")
    # Limpiar RM_Ciclo_02
    all_c2 = ws_c2.get_all_values()
    c2_keep = [r for r in all_c2 if r[0] != test_athlete]
    ws_c2.clear()
    ws_c2.update(range_name="A1", values=c2_keep)

    # Limpiar RM_Atletas
    all_base = ws_base.get_all_values()
    base_keep = [r for r in all_base if r[0] != test_athlete]
    ws_base.clear()
    ws_base.update(range_name="A1", values=base_keep)

    # Limpiar Registro_Diario
    all_reg_cur = ws_reg.get_all_values()
    reg_keep = [r for r in all_reg_cur if r[0] != test_athlete]
    ws_reg.clear()
    ws_reg.update(range_name="A1", values=reg_keep)

    # Limpiar Historial_RMs
    all_hist_cur = ws_hist.get_all_values()
    hist_keep = [r for r in all_hist_cur if r[0] != test_athlete]
    ws_hist.clear()
    ws_hist.update(range_name="A1", values=hist_keep)

    print("    ✅ Limpieza completada. Hojas intactas.")
    print("\n" + "=" * 70)
    print("¡TODAS LAS PRUEBAS DE TELEMETRÍA Y ARQUITECTURA PASARON EXITOSAMENTE!")
    print("=" * 70)

if __name__ == "__main__":
    main()
