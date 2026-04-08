import pdfplumber
import re

# Pré-compilando regex para otimizar velocidade em laços de repetição
RE_TIME_FORMAT = re.compile(r'^-?\d+:\d+$')
RE_NAME_FORMAT = re.compile(r'^\d+\s*')

def parse_time(tm_str):
    if not tm_str or not isinstance(tm_str, str):
        return 0
    
    clean_str = tm_str.strip()
    # Verificação rápida sem regex (otimização)
    if not clean_str or ':' not in clean_str:
        return 0
        
    try:
        parts = clean_str.split(':')
        sign = -1 if parts[0].startswith('-') else 1
        hours = int(parts[0].replace('-', ''))
        mins = int(parts[1])
        return sign * (hours * 60 + mins)
    except:
        return 0

def format_minutes(total_mins):
    is_negative = total_mins < 0
    total_mins = abs(total_mins)
    hours = total_mins // 60
    mins = total_mins % 60
    sign = "-" if is_negative else ""
    return f"{sign}{hours:02d}:{mins:02d}"

def process_pdf_file(pdf_path):
    results = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            
            # Bulletproof name extraction
            employee_name = f"Funcionário Desconhecido (Página {i+1})"
            
            # Tentar achar no texto bruto
            for line in text.split('\n'):
                line_lower = line.lower()
                if 'empregado:' in line_lower:
                    parts = line.split(':', 1)
                    if len(parts) > 1:
                        raw = parts[1].strip()
                        name_str = RE_NAME_FORMAT.sub('', raw).strip()
                        if name_str: 
                            employee_name = name_str
                            break
                        
            tables = page.extract_tables()
            page_sums = {}
            
            if tables:
                table = tables[0]
                
                # Se não achou na extração de texto, investigar célula a célula na tabela
                if "Desconhecido" in employee_name:
                    found = False
                    for row in table:
                        for cell in row:
                            if cell and isinstance(cell, str):
                                cell_l = cell.lower()
                                if 'empregado:' in cell_l:
                                    parts = cell.split(':', 1)
                                    if len(parts) > 1:
                                        raw = parts[1].strip()
                                        name_str = RE_NAME_FORMAT.sub('', raw).strip()
                                        if name_str:
                                            employee_name = name_str
                                            found = True
                                            break
                                elif 'empregado ' in cell_l:
                                    # Fallback without colon
                                    cl = cell_l.replace("empregado", "").strip()
                                    name_str = RE_NAME_FORMAT.sub('', cl).strip().upper()
                                    if name_str:
                                        employee_name = name_str
                                        found = True
                                        break
                        if found: break
                
                # Encontrar a linha VERDADEIRA de cabeçalhos das horas (ignorar as primeiras linhas inúteis da tabela)
                header_row_index = -1
                for r_idx, row in enumerate(table):
                    row_str = " ".join([str(c).lower() for c in row if c])
                    # Verifica se contém Data e Faltas (marcadores inconfundíveis do cabeçalho de ponto desse PDF)
                    if 'data' in row_str and 'faltas' in row_str:
                        header_row_index = r_idx
                        break
                
                if header_row_index != -1:
                    headers = table[header_row_index]
                    
                    # O PDF mistura todos os cabeçalhos numa só célula por conta do layout.
                    # Extraímos todo o texto do array de cabeçalhos, e separamos por espaços.
                    full_header_str = " ".join([str(h) for h in headers if h]).replace('\n', ' ')
                    clean_headers = full_header_str.split()
                    
                    rows = table[header_row_index + 1:]
                    
                    # Ignorar linha de total final do funcionário
                    if rows:
                        last_row = rows[-1]
                        if last_row and last_row[0] and ('total' in str(last_row[0]).lower() or 'saldo' in str(last_row[0]).lower()):
                            rows = rows[:-1]
                            
                    col_minutes_sum = {j: 0 for j in range(len(clean_headers))}
                    col_minutes_sum_01_25 = {j: 0 for j in range(len(clean_headers))}
                    col_minutes_sum_26_31 = {j: 0 for j in range(len(clean_headers))}
                    col_has_time = {j: False for j in range(len(clean_headers))}
                    
                    current_day = None
                    for row in rows:
                        # Extrair o dia da primeira coluna se houver
                        if row and row[0] and isinstance(row[0], str):
                            match_date = re.search(r'(\d{2})/\d{2}', row[0])
                            if match_date:
                                current_day = int(match_date.group(1))
                        for j, cell in enumerate(row):
                            if j >= len(clean_headers):
                                continue
                            if 'falta' in clean_headers[j].lower():
                                continue # Pula coluna de faltas completamente
                                
                            if cell and isinstance(cell, str):
                                cell_clean = cell.strip()
                                # Testa formato de hora na célula
                                if RE_TIME_FORMAT.match(cell_clean):
                                    col_has_time[j] = True
                                    parsed_val = parse_time(cell_clean)
                                    col_minutes_sum[j] += parsed_val
                                    
                                    if current_day:
                                        if current_day >= 26:
                                            col_minutes_sum_26_31[j] += parsed_val
                                        elif current_day <= 25:
                                            col_minutes_sum_01_25[j] += parsed_val
                    
                    page_sums_01_25 = {}
                    page_sums_26_31 = {}
                    
                    for j in range(len(clean_headers)):
                        if col_has_time[j] and 'falta' not in clean_headers[j].lower():
                            page_sums_01_25[clean_headers[j]] = format_minutes(col_minutes_sum_01_25[j])
                            page_sums_26_31[clean_headers[j]] = format_minutes(col_minutes_sum_26_31[j])
                            
            results.append({
                "page": i + 1,
                "name": employee_name,
                "sums_period_01_25": page_sums_01_25,
                "sums_period_26_31": page_sums_26_31
            })
            
            # Limpeza obrigatória de memória para servidores pequenos (Free Tier)
            if hasattr(page, 'flush_cache'):
                page.flush_cache()
            
    return results
