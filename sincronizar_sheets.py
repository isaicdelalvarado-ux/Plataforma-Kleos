#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PLATAFORMA KLEOS - SINCRONIZADOR & AUDITOR NATIVO DE GOOGLE SHEETS
=============================================================================
Conexión directa y nativa mediante Service Account oficial de Google Cloud
utilizando la librería 'gspread' (Google Sheets API v4).

Uso:
  python sincronizar_sheets.py --test
  python sincronizar_sheets.py --audit
  python sincronizar_sheets.py --backup
  python sincronizar_sheets.py --check-formulas
  python sincronizar_sheets.py --interactive
"""

import os
import sys
import json
import argparse
from datetime import datetime

# Asegurar codificación UTF-8 en consolas Windows para evitar errores con emojis
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    print("\n[ERROR] La libreria 'gspread' o 'google-auth' no esta instalada.")
    print("Por favor ejecuta: python -m pip install gspread google-auth\n")
    sys.exit(1)

# Scopes requeridos para leer y escribir hojas de cálculo y Drive
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file"
]

DEFAULT_CREDENTIALS_FILE = "credentials.json"
CONFIG_FILE = "config_sheets.json"

# =============================================================================
# UTILIDADES DE COLOR Y PRESENTACIÓN EN CONSOLA
# =============================================================================
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(text):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 75}")
    print(f"[KLEOS] PLATAFORMA KLEOS - {text}")
    print(f"{'=' * 75}{Colors.ENDC}\n")

def print_success(text):
    print(f"{Colors.GREEN}[OK] {text}{Colors.ENDC}")

def print_warning(text):
    print(f"{Colors.WARNING}[AVISO] {text}{Colors.ENDC}")

def print_error(text):
    print(f"{Colors.FAIL}[ERROR] {text}{Colors.ENDC}")

def print_info(text):
    print(f"{Colors.BLUE}[INFO] {text}{Colors.ENDC}")


# =============================================================================
# GESTIÓN DE CONFIGURACIÓN Y CREDENCIALES
# =============================================================================
def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_config(config_data):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print_warning(f"No se pudo guardar {CONFIG_FILE}: {e}")
        return False

def verify_credentials_file(creds_path=DEFAULT_CREDENTIALS_FILE):
    if not os.path.exists(creds_path):
        print_header("ERROR DE AUTENTICACIÓN GOOGLE CLOUD")
        print_error(f"No se encontró el archivo de cuenta de servicio: '{creds_path}'")
        print("\nPara conectar tu IDE con Google Sheets de forma nativa:")
        print("1. Ve a Google Cloud Console: https://console.cloud.google.com/")
        print("2. Crea o selecciona un proyecto y activa 'Google Sheets API' y 'Google Drive API'.")
        print("3. Crea una 'Cuenta de servicio' (Service Account) en IAM & Admin.")
        print("4. Genera y descarga una clave en formato JSON.")
        print(f"5. Renómbrala a '{creds_path}' y colócala en esta carpeta:")
        print(f"   {os.path.abspath('.')}")
        print("\n6. Abre ese JSON, copia el campo 'client_email' y COMPARTE tu Google Sheets con ese correo como 'Editor'.\n")
        return None, None

    try:
        with open(creds_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            client_email = data.get("client_email")
            project_id = data.get("project_id")
            if not client_email:
                print_error("El archivo JSON de credenciales no contiene el campo 'client_email'.")
                return None, None
            return creds_path, client_email
    except Exception as e:
        print_error(f"Error al leer '{creds_path}': {e}")
        return None, None

def get_client(creds_path=DEFAULT_CREDENTIALS_FILE):
    creds_path, client_email = verify_credentials_file(creds_path)
    if not creds_path:
        return None, None
    try:
        credentials = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
        client = gspread.authorize(credentials)
        return client, client_email
    except Exception as e:
        print_error(f"Fallo de autorización con Google Cloud: {e}")
        return None, None


# =============================================================================
# OBTENCIÓN DEL SPREADSHEET
# =============================================================================
def get_spreadsheet(client, sheet_target=None):
    config = load_config()
    target = sheet_target or config.get("spreadsheet_id_or_url")

    if not target:
        # Intentar buscar por títulos típicos en las hojas compartidas con la cuenta
        try:
            available = client.openall()
            if available:
                for sh in available:
                    if "kleos" in sh.title.lower() or "rendimiento" in sh.title.lower():
                        print_info(f"Hoja detectada automáticamente por título: '{sh.title}' (ID: {sh.id})")
                        config["spreadsheet_id_or_url"] = sh.id
                        save_config(config)
                        return sh
                # Si no tiene 'kleos', tomar la primera que tenga pestañas Wellness o Registro_Diario
                for sh in available:
                    titles = [w.title for w in sh.worksheets()]
                    if "Wellness" in titles or "Registro_Diario" in titles:
                        print_info(f"Hoja identificada por estructura: '{sh.title}' (ID: {sh.id})")
                        config["spreadsheet_id_or_url"] = sh.id
                        save_config(config)
                        return sh
                # Tomar la primera hoja accesible
                sh = available[0]
                print_info(f"Usando primera hoja accesible: '{sh.title}'")
                return sh
        except Exception as e:
            print_warning(f"No se pudieron listar hojas automáticas: {e}")

        # Solicitar al usuario
        print("\nIngresa el ID o URL completa de tu Google Spreadsheet:")
        print("Ejemplo de ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")
        target = input("ID o URL de Google Sheets: ").strip()
        if not target:
            return None
        config["spreadsheet_id_or_url"] = target
        save_config(config)

    # Abrir por ID o URL
    try:
        if target.startswith("http"):
            return client.open_by_url(target)
        else:
            return client.open_by_key(target)
    except gspread.exceptions.SpreadsheetNotFound:
        print_error(f"No se encontró la hoja con ID/URL: '{target}'.")
        print_warning("Verifica que el ID sea correcto y que hayas compartido la hoja con la cuenta de servicio.")
        return None
    except gspread.exceptions.APIError as e:
        print_error(f"Error de permisos de Google Sheets API (403/404): {e}")
        _, client_email = verify_credentials_file()
        if client_email:
            print(f"\n[SOLUCION]: Abre tu hoja en Google Sheets > Boton 'Compartir' > Invita como 'Editor' a:")
            print(f"   {Colors.BOLD}{client_email}{Colors.ENDC}\n")
        return None


# =============================================================================
# COMANDO: PROBAR CONEXIÓN
# =============================================================================
def test_connection(sheet_target=None):
    print_header("PROBANDO CONEXION DIRECTA GOOGLE SHEETS API")
    client, client_email = get_client()
    if not client:
        return False

    print_success("Autenticacion con Google Cloud exitosa.")
    print_info(f"Cuenta de Servicio: {client_email}")

    spreadsheet = get_spreadsheet(client, sheet_target)
    if not spreadsheet:
        return False

    print_success(f"Conexion establecida con la hoja: '{spreadsheet.title}'")
    print_info(f"ID del Spreadsheet: {spreadsheet.id}")
    print_info(f"URL: {spreadsheet.url}")

    worksheets = spreadsheet.worksheets()
    print(f"\n[PESTANIAS] Pestanas detectadas ({len(worksheets)}):")
    for ws in worksheets:
        print(f"  * {ws.title:<25} ({ws.row_count} filas x {ws.col_count} columnas)")

    return True


# =============================================================================
# COMANDO: AUDITORÍA PROFUNDA Y CONSISTENCIA LOOKER STUDIO
# =============================================================================
def audit_sheets(sheet_target=None):
    print_header("AUDITORIA PROFUNDA DE PESTANIAS Y FORMULAS")
    client, client_email = get_client()
    if not client:
        return False

    spreadsheet = get_spreadsheet(client, sheet_target)
    if not spreadsheet:
        return False

    worksheets = spreadsheet.worksheets()
    tab_names = [w.title for w in worksheets]

    required_tabs = ["Wellness", "Registro_Diario", "Nombre de Atletas", "RM_Atletas"]
    print("[REVISION] Verificacion de Pestanas Criticas:")
    for tab in required_tabs:
        if tab in tab_names:
            print_success(f"Pestana encontrada: '{tab}'")
        else:
            print_warning(f"Pestana faltante o no coincide nombre: '{tab}'")

    print("\n" + "-" * 75)
    print(f"{'Pestana':<22} | {'Filas Totales':<14} | {'1a Fila Vacia (A)':<18} | {'Estado':<12}")
    print("-" * 75)

    discrepancies = []

    for ws in worksheets:
        title = ws.title
        total_rows = ws.row_count

        # Leer primera columna completa para detectar primer vacío real
        try:
            col_a = ws.col_values(1)
            active_count = len(col_a)
            first_empty_a = active_count + 1

            # Revisar si hay celdas vacías intermedias en Col A (desfases)
            orphan_blanks = 0
            for i, val in enumerate(col_a):
                if i > 0 and (val is None or str(val).strip() == ""):
                    orphan_blanks += 1

            status = f"{Colors.GREEN}Optimo{Colors.ENDC}"
            if orphan_blanks > 0:
                status = f"{Colors.FAIL}{orphan_blanks} filas vacias{Colors.ENDC}"
                discrepancies.append(f"Pestana '{title}' tiene {orphan_blanks} celdas en blanco intermedias en Columna A.")

            print(f"{title:<22} | {total_rows:<14} | {first_empty_a:<18} | {status}")

        except Exception as e:
            print(f"{title:<22} | {total_rows:<14} | Error de lectura: {e}")

    print("-" * 75)

    # Auditoría de Fórmulas en 'Registro_Diario' y 'Wellness'
    check_formulas_integrity(spreadsheet)

    if not discrepancies:
        print_success("Auditoria finalizada: Cero desfases. Fila inferior libre y limpia para Looker Studio.")
    else:
        print_warning("Se detectaron alertas en la auditoria:")
        for d in discrepancies:
            print(f"  * {d}")

    return True


# =============================================================================
# COMANDO: INSPECCIÓN DETALLADA DE FÓRMULAS
# =============================================================================
def check_formulas_integrity(spreadsheet):
    print("\n[FORMULAS] Inspeccion de Formulas de Produccion:")
    
    # 1. Pestaña Registro_Diario
    try:
        ws_wod = spreadsheet.worksheet("Registro_Diario")
        # Leer fila 1 (encabezados) y fila 2 (fórmulas)
        headers = ws_wod.row_values(1)
        # Leer con FORMULA
        row2_formulas = ws_wod.get_values("A2:Z2", value_render_option="FORMULA")
        
        print_info(f"Pestana 'Registro_Diario': {len(headers)} columnas detectadas.")
        
        # Validar cabeceras extendidas W1, X1, Y1
        expected_ext = [("W", 23, "Duracion_min"), ("X", 24, "Score_Reps"), ("Y", 25, "Peso_WOD")]
        for col_l, col_idx, expected_title in expected_ext:
            actual = headers[col_idx - 1] if len(headers) >= col_idx else ""
            if actual == expected_title:
                print_success(f"Cabecera Col {col_l}1 ({expected_title}): Correcta")
            else:
                print_warning(f"Cabecera Col {col_l}1 ausente o diferente: actual='{actual}', esperada='{expected_title}'")

        if row2_formulas and len(row2_formulas) > 0:
            row2 = row2_formulas[0]
            formula_cols = []
            for idx, val in enumerate(row2):
                col_letter = chr(65 + idx) if idx < 26 else f"A{chr(65 + idx - 26)}"
                header_name = headers[idx] if idx < len(headers) else f"Col {col_letter}"
                if str(val).startswith("="):
                    formula_cols.append((col_letter, header_name, str(val)))
            
            if formula_cols:
                print(f"  * Formulas activas en Fila 2 de 'Registro_Diario' ({len(formula_cols)}):")
                for col_letter, h_name, f_val in formula_cols:
                    disp_f = f_val if len(f_val) <= 50 else f_val[:47] + "..."
                    print(f"     Col {col_letter} ({h_name}): {disp_f}")
            else:
                print("  [INFO] No hay formulas automaticas fijas en fila 2 de 'Registro_Diario'.")
    except Exception as e:
        print_warning(f"No se pudo inspeccionar formulas en 'Registro_Diario': {e}")

    # 2. Pestaña Wellness
    try:
        ws_wel = spreadsheet.worksheet("Wellness")
        headers_wel = ws_wel.row_values(1)
        row2_formulas_wel = ws_wel.get_values("A2:J2", value_render_option="FORMULA")
        if row2_formulas_wel and len(row2_formulas_wel) > 0:
            row2_w = row2_formulas_wel[0]
            print_info(f"Pestana 'Wellness': {len(headers_wel)} columnas detectadas.")
            # Columna J es la posición 9
            if len(row2_w) >= 10 and str(row2_w[9]).startswith("="):
                print_success(f"  Col J (Wellness Score) tiene formula activa: {row2_w[9]}")
            else:
                print_info("  Col J (Wellness Score) se calcula directamente en el script de Apps Script (B+C+D+E+F).")
    except Exception as e:
        print_warning(f"No se pudo inspeccionar formulas en 'Wellness': {e}")


# =============================================================================
# COMANDO: RESPALDO LOCAL DE SEGURIDAD (JSON)
# =============================================================================
def backup_sheets(sheet_target=None):
    print_header("GENERANDO RESPALDO LOCAL DE SEGURIDAD")
    client, _ = get_client()
    if not client:
        return False

    spreadsheet = get_spreadsheet(client, sheet_target)
    if not spreadsheet:
        return False

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_data = {
        "spreadsheet_title": spreadsheet.title,
        "spreadsheet_id": spreadsheet.id,
        "backup_timestamp": timestamp,
        "worksheets": {}
    }

    for ws in spreadsheet.worksheets():
        print_info(f"Extrayendo datos de '{ws.title}'...")
        try:
            values = ws.get_all_values()
            formulas = ws.get_values(value_render_option="FORMULA")
            backup_data["worksheets"][ws.title] = {
                "rowCount": len(values),
                "colCount": len(values[0]) if values else 0,
                "values": values,
                "formulas": formulas
            }
        except Exception as e:
            print_warning(f"Fallo al respaldar pestana '{ws.title}': {e}")

    filename = f"respaldo_sheets_{timestamp}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, indent=2, ensure_ascii=False)

    print_success(f"Respaldo completado exitosamente: {filename}")
    print_info(f"Tamano: {os.path.getsize(filename) / 1024:.1f} KB")
    return True


# =============================================================================
# COMANDO: AUTO-REPARACIÓN AUTOMÁTICA DE CELDAS Y FÓRMULAS
# =============================================================================
def auto_heal_sheets(sheet_target=None):
    print_header("AUTO-REPARACION INTELIGENTE Y MEDIDA DE SEGURIDAD 24/7")
    client, client_email = get_client()
    if not client:
        return False

    spreadsheet = get_spreadsheet(client, sheet_target)
    if not spreadsheet:
        return False

    repaired_items = []

    # 1. Auditar y Reparar Catálogo en RM_Atletas
    try:
        ws_names = spreadsheet.worksheet("Nombre de Atletas")
        athletes = [a for a in ws_names.col_values(1)[1:] if a and a.strip()]
        ws_rm = spreadsheet.worksheet("RM_Atletas")
        rm_rows = ws_rm.get_all_values()
        existing_athletes = set(r[0] for r in rm_rows[1:] if len(r) > 0)

        standard_exercises = [
            'Back Squat', 'Carrera', 'Clean Squat', 'Front Squat', 'Jerk',
            'Peso Muerto', 'Power Clean', 'Power Snatch', 'Snatch', 'Snatch Sobre Tacos'
        ]

        missing_athletes = [a for a in athletes if a not in existing_athletes]
        if missing_athletes:
            new_rm_rows = []
            for a in missing_athletes:
                for ej in standard_exercises:
                    new_rm_rows.append([a, ej, ""])
            ws_rm.append_rows(new_rm_rows, value_input_option="USER_ENTERED")
            repaired_items.append(f"Se agregaron {len(missing_athletes)} atletas sin catalogo en 'RM_Atletas': {', '.join(missing_athletes)}")
            print_success(f"Catalogo de RM_Atletas actualizado para {len(missing_athletes)} atletas.")
    except Exception as e:
        print_warning(f"Error al verificar RM_Atletas: {e}")

    # 2. Auditar y Reparar Cabeceras W1, X1, Y1 y Formulas en Registro_Diario
    try:
        ws_wod = spreadsheet.worksheet("Registro_Diario")

        # 2.1 Verificar y reparar cabeceras W1, X1, Y1
        current_headers = ws_wod.row_values(1)
        needed_headers = [("W", 23, "Duracion_min"), ("X", 24, "Score_Reps"), ("Y", 25, "Peso_WOD")]
        missing_header_found = False
        for col_l, col_idx, h_title in needed_headers:
            actual = current_headers[col_idx - 1] if len(current_headers) >= col_idx else ""
            if actual != h_title:
                missing_header_found = True
                break

        if missing_header_found:
            print_info("Inicializando cabeceras extendidas W1:Y1...")
            ws_wod.update(range_name="W1:Y1", values=[["Duracion_min", "Score_Reps", "Peso_WOD"]])
            ws_wod.format("W1:Y1", {
                "backgroundColor": {"red": 15/255, "green": 23/255, "blue": 42/255},
                "textFormat": {"bold": True, "foregroundColor": {"red": 248/255, "green": 250/255, "blue": 252/255}}
            })
            repaired_items.append("Se inicializaron y formatearon cabeceras W1 ('Duracion_min'), X1 ('Score_Reps') e Y1 ('Peso_WOD').")
            print_success("Cabeceras W1, X1 e Y1 reparadas y formateadas.")

        # 2.2 Auditar y Reparar Formulas de acuerdo a la Categoría
        col_a = ws_wod.col_values(1)
        total_active_rows = len(col_a)

        if total_active_rows >= 2:
            all_forms = ws_wod.get_values(f"A2:V{total_active_rows}", value_render_option="FORMULA")
            all_vals = ws_wod.get_values(f"A2:V{total_active_rows}")

            rows_to_heal_lifting = []
            rows_to_heal_non_lifting = []

            for idx, (forms, vals) in enumerate(zip(all_forms, all_vals), start=2):
                atleta = vals[0] if len(vals) > 0 else ""
                if not atleta:
                    continue

                categoria = vals[5] if len(vals) > 5 else ""
                is_non_lifting = categoria in ["Cardio", "Metcon / WOD", "Gimnásticos"]

                n_form = str(forms[13]) if len(forms) > 13 else ""
                o_val = str(vals[14]).strip() if len(vals) > 14 else ""
                p_val = str(vals[15]).strip() if len(vals) > 15 else ""
                q_val = str(vals[16]).strip() if len(vals) > 16 else ""
                r_val = str(vals[17]).strip() if len(vals) > 17 else ""

                if is_non_lifting:
                    # En no-fuerza: N debe ser la categoría, O-R deben ser 0
                    if vals[13] != categoria or o_val != "0" or p_val != "0" or q_val != "0" or r_val != "0":
                        rows_to_heal_non_lifting.append((idx, categoria))
                else:
                    needs_healing = False
                    if "=AI(" in n_form or n_form == "":
                        needs_healing = True
                    if o_val == "" or p_val == "" or q_val == "" or r_val == "":
                        needs_healing = True
                    if needs_healing:
                        rows_to_heal_lifting.append(idx)

            if rows_to_heal_non_lifting:
                for r, cat in rows_to_heal_non_lifting:
                    ws_wod.update(range_name=f"N{r}:R{r}", values=[[cat, 0, 0, 0, 0]], value_input_option="USER_ENTERED")
                repaired_items.append(f"Se corrigió aislamiento de contadores en {len(rows_to_heal_non_lifting)} filas no-fuerza de 'Registro_Diario'.")
                print_success(f"Se repararon {len(rows_to_heal_non_lifting)} filas no-fuerza.")

            if rows_to_heal_lifting:
                print_info(f"Detectadas {len(rows_to_heal_lifting)} filas de fuerza con formulas rotas o celdas vacias. Reparando...")
                for r in rows_to_heal_lifting:
                    f_n = f'=IF(F{r}="Cardio"; "Cardio"; IF(K{r}<0,7; "Descarga (<70%)"; IF(K{r}<=0,8; "Hipertrofia (70-80%)"; "Fuerza Máxima (>80%)")))'
                    f_o = f'=IF(AND(F{r}="Fuerza"; ISNUMBER(SEARCH("Descarga"; N{r}))); 1; 0)'
                    f_p = f'=IF(ISNUMBER(SEARCH("Hipertrofia"; N{r})); 1; 0)'
                    f_q = f'=IF(ISNUMBER(SEARCH("Fuerza Máxima"; N{r})); 1; 0)'
                    f_r = f'=IF(F{r}="Fuerza"; 1; 0)'
                    ws_wod.update(range_name=f"N{r}:R{r}", values=[[f_n, f_o, f_p, f_q, f_r]], value_input_option="USER_ENTERED")

                repaired_items.append(f"Se repararon formulas y contadores en {len(rows_to_heal_lifting)} filas de fuerza en 'Registro_Diario'.")
                print_success(f"Se repararon exitosamente {len(rows_to_heal_lifting)} filas.")
            elif not rows_to_heal_non_lifting:
                print_success("Todas las filas de 'Registro_Diario' tienen sus formulas y contadores al 100%.")

    except Exception as e:
        print_warning(f"Error al auto-reparar Registro_Diario: {e}")

    if repaired_items:
        print("\n[RESUMEN DE AUTO-REPARACION]:")
        for item in repaired_items:
            print(f"  * {item}")
    else:
        print_success("Ecosistema integro y saludable. Cero celdas en blanco encontradas.")

    return True


# =============================================================================
# MENÚ INTERACTIVO POR CONSOLA
# =============================================================================
def interactive_menu():
    while True:
        print_header("PANEL DE CONTROL GOOGLE SHEETS (NATIVO)")
        print("  1. Probar conexion y autenticacion con Google Cloud")
        print("  2. Auditar pestanas, consistencia y Looker Studio")
        print("  3. Auto-reparar celdas en blanco y formulas (Auto-Heal)")
        print("  4. Inspeccionar formulas activas de produccion")
        print("  5. Crear respaldo local de seguridad (JSON)")
        print("  6. Configurar o cambiar ID de Google Spreadsheet")
        print("  7. Salir")
        print("-" * 75)

        choice = input("Selecciona una opcion (1-7): ").strip()

        if choice == "1":
            test_connection()
        elif choice == "2":
            audit_sheets()
        elif choice == "3":
            auto_heal_sheets()
        elif choice == "4":
            client, _ = get_client()
            if client:
                sh = get_spreadsheet(client)
                if sh:
                    check_formulas_integrity(sh)
        elif choice == "5":
            backup_sheets()
        elif choice == "6":
            target = input("\nIngresa el nuevo ID o URL de Google Sheets: ").strip()
            if target:
                config = load_config()
                config["spreadsheet_id_or_url"] = target
                save_config(config)
                print_success("Configuracion actualizada.")
        elif choice == "7":
            print("\nSaliendo del panel. Que la gloria atletica acompane a Kleos!\n")
            break
        else:
            print_warning("Opcion no valida. Ingresa un numero del 1 al 7.")

        input(f"\n{Colors.BOLD}Presiona ENTER para continuar...{Colors.ENDC}")


# =============================================================================
# PUNTO DE ENTRADA PRINCIPAL (CLI)
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description="Sincronizador & Auditor Nativo de Google Sheets para Plataforma Kleos")
    parser.add_argument("--test", action="store_true", help="Probar autenticación y conexión con la hoja")
    parser.add_argument("--audit", action="store_true", help="Auditar integridad de filas y fórmulas para Looker Studio")
    parser.add_argument("--auto-heal", action="store_true", help="Auto-reparar celdas en blanco, catálogos y fórmulas rotas")
    parser.add_argument("--backup", action="store_true", help="Crear respaldo local en formato JSON")
    parser.add_argument("--check-formulas", action="store_true", help="Inspeccionar fórmulas en fila 2")
    parser.add_argument("--sheet-id", type=str, default=None, help="ID o URL de la hoja de Google Sheets")
    parser.add_argument("--credentials", type=str, default=DEFAULT_CREDENTIALS_FILE, help="Ruta al archivo credentials.json")
    parser.add_argument("--interactive", action="store_true", help="Abrir menú interactivo por consola")

    args = parser.parse_args()

    if args.test:
        test_connection(args.sheet_id)
    elif args.audit:
        audit_sheets(args.sheet_id)
    elif args.auto_heal:
        auto_heal_sheets(args.sheet_id)
    elif args.backup:
        backup_sheets(args.sheet_id)
    elif args.check_formulas:
        client, _ = get_client(args.credentials)
        if client:
            sh = get_spreadsheet(client, args.sheet_id)
            if sh:
                check_formulas_integrity(sh)
    elif args.interactive or len(sys.argv) == 1:
        interactive_menu()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

