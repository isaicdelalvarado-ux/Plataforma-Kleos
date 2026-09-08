#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de reparación y optimización de celdas en blanco para Plataforma Kleos.
Corrige las columnas N, O, P, Q, R en Registro_Diario y registra los RMs de Isaic Alvarado.
"""

import sys
import json
import gspread
from google.oauth2.service_account import Credentials

# Codificación UTF-8 en consola Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def main():
    print("=" * 70)
    print("REPARACION Y OPTIMIZACION DE CELDAS - PLATAFORMA KLEOS")
    print("=" * 70)

    creds = Credentials.from_service_account_file('credentials.json', scopes=['https://www.googleapis.com/auth/spreadsheets'])
    client = gspread.authorize(creds)
    sh = client.open_by_key('1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o')

    # =========================================================================
    # 1. CATALOGAR A ISAIC ALVARADO Y MAYEORLING EN RM_ATLETAS
    # =========================================================================
    print("\n[1/3] Verificando pestana 'RM_Atletas'...")
    ws_rm = sh.worksheet('RM_Atletas')
    all_rm = ws_rm.get_all_values()
    existing_athletes = set(r[0] for r in all_rm[1:] if len(r) > 0)

    standard_exercises = [
        'Back Squat',
        'Carrera',
        'Clean Squat',
        'Front Squat',
        'Jerk',
        'Peso Muerto',
        'Power Clean',
        'Power Snatch',
        'Snatch',
        'Snatch Sobre Tacos'
    ]

    new_rows = []
    if 'Isaic Alvarado' not in existing_athletes:
        print("  -> Agregando catalogo de ejercicios para 'Isaic Alvarado' (Snatch 1RM: 81.5 kg)...")
        for ej in standard_exercises:
            rm_val = '81,5' if ej == 'Snatch' else ''
            new_rows.append(['Isaic Alvarado', ej, rm_val])

    if 'Mayeorling Monzon' not in existing_athletes:
        print("  -> Agregando catalogo de ejercicios para 'Mayeorling Monzon'...")
        for ej in standard_exercises:
            new_rows.append(['Mayeorling Monzon', ej, ''])

    if new_rows:
        ws_rm.append_rows(new_rows, value_input_option='USER_ENTERED')
        print(f"  [OK] Se agregaron {len(new_rows)} registros de RM en 'RM_Atletas'.")
    else:
        print("  [OK] Atletas ya catalogados en 'RM_Atletas'.")

    # =========================================================================
    # 2. REPARAR FILAS 192 A 202 EN REGISTRO_DIARIO
    # =========================================================================
    print("\n[2/3] Reparando celdas en blanco y formulas en 'Registro_Diario'...")
    ws_wod = sh.worksheet('Registro_Diario')

    # A) Reparar Columna J en filas 192-194 (Carrera de Andrea Flores) y 195/197 (Snatch de Isaic)
    print("  -> Normalizando Columna J (1RM Atleta)...")
    ws_wod.update(range_name='J192:J194', values=[['0'], ['0'], ['0']], value_input_option='USER_ENTERED')
    ws_wod.update(range_name='J195', values=[['81,5']], value_input_option='USER_ENTERED')
    ws_wod.update(range_name='J197', values=[['81,5']], value_input_option='USER_ENTERED')

    # B) Construir formulas perfectas para N, O, P, Q, R desde fila 192 hasta 202
    print("  -> Inyectando formulas de Produccion para N (Zona de Carga) y O-R (Contadores)...")
    updates_n_r = []
    for r in range(192, 203):
        # Formula Col N: Zona de Carga
        f_n = f'=IF(F{r}="Cardio"; "Cardio"; IF(K{r}<0,7; "Descarga (<70%)"; IF(K{r}<=0,8; "Hipertrofia (70-80%)"; "Fuerza Máxima (>80%)")))'
        # Formula Col O: Contador Descarga
        f_o = f'=IF(AND(F{r}="Fuerza"; ISNUMBER(SEARCH("Descarga"; N{r}))); 1; 0)'
        # Formula Col P: Contador Hipertrofia
        f_p = f'=IF(ISNUMBER(SEARCH("Hipertrofia"; N{r})); 1; 0)'
        # Formula Col Q: Contador Fuerza Max
        f_q = f'=IF(ISNUMBER(SEARCH("Fuerza Máxima"; N{r})); 1; 0)'
        # Formula Col R: Contador Total Fuerza
        f_r = f'=IF(F{r}="Fuerza"; 1; 0)'

        updates_n_r.append([f_n, f_o, f_p, f_q, f_r])

    ws_wod.update(range_name='N192:R202', values=updates_n_r, value_input_option='USER_ENTERED')
    print("  [OK] Formulas propagadas con exito en el rango N192:R202.")

    # =========================================================================
    # 3. VERIFICACION EN VIVO DEL RESULTADO
    # =========================================================================
    print("\n[3/3] Verificando filas de Isaic Alvarado (195, 196, 197)...")
    isaic_vals = ws_wod.get_values('A195:V197')
    headers = ws_wod.row_values(1)

    for idx, row in enumerate(isaic_vals, start=195):
        atleta = row[0]
        ej = row[4]
        carga = row[8]
        rm = row[9]
        pct = row[10]
        zona = row[13]
        desc = row[14]
        hip = row[15]
        f_max = row[16]
        tot_f = row[17]
        print(f"\n  Fila {idx} [{atleta} | {ej}]:")
        print(f"    Carga: {carga} kg | 1RM: {rm} kg | %1RM: {pct} | Zona: {zona}")
        print(f"    Contadores: Descarga={desc} | Hipertrofia={hip} | F_Max={f_max} | Tot_Fuerza={tot_f}")

        # Comprobar si queda alguna celda en blanco
        blanks = [headers[i] for i, v in enumerate(row) if v == '']
        if blanks:
            print(f"    [AVISO] Celdas vacias restantes: {blanks}")
        else:
            print("    [OK] Fila 100% COMPLETA sin ninguna celda en blanco.")

    print("\n" + "=" * 70)
    print("PROCESO DE REPARACION COMPLETADO AL 100% CON EXITO")
    print("=" * 70)

if __name__ == "__main__":
    main()
