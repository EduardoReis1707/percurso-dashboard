import openpyxl, json, re, unicodedata
from datetime import date

SRC = '/root/.claude/uploads/8cd1b70a-a724-5839-8a69-aadc345fb9af/21874523-Hor_rio__TURMAS_2026.xlsx'
wb = openpyxl.load_workbook(SRC, data_only=True)

PROFESSORES = ["Agostinho","Fabiano","Gabriel","Gleison","Jéssica","Leila","Luiz Fernando",
               "Matheus","Michele","Rhuan","Rogério","Wanderson","Wesley","William"]

ALIASES = {
    'miichele': 'Michele',
    'willian': 'William',
    'weslley': 'Wesley',
}

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

def norm(s):
    return strip_accents(s).strip().lower()

PROF_NORM = {norm(p): p for p in PROFESSORES}

def match_professor(raw):
    if not raw:
        return None, raw
    s = raw.strip()
    n = norm(s)
    if n in ALIASES:
        return ALIASES[n], None
    if n in PROF_NORM:
        return PROF_NORM[n], None
    # fuzzy: startswith / substring match
    for pn, orig in PROF_NORM.items():
        if n == pn:
            return orig, None
    return None, s  # unmatched -> return raw as "unmatched"

DIA_MAP = {
    'segunda': 'Segunda', 'terca': 'Terça', 'terça': 'Terça',
    'quarta': 'Quarta', 'quinta': 'Quinta', 'sexta': 'Sexta',
}

def parse_day_header(text):
    # e.g. "Segunda (09/02) " -> ('Segunda', '09/02')
    s = str(text).strip()
    m = re.match(r'^([A-Za-zçÇãÃéÉ]+)\s*\((\d{2}/\d{2})\)', s)
    if not m:
        return None, None
    dia_raw, datestr = m.groups()
    dia = DIA_MAP.get(norm(dia_raw))
    return dia, datestr

def to_iso_date(datestr, year=2026):
    dd, mm = datestr.split('/')
    return date(year, int(mm), int(dd)).isoformat()

def split_materia_prof(cell):
    if cell is None:
        return (None, None, None)
    s = str(cell).strip()
    if s == '' or s == '-------------':
        return (None, None, None)
    m = re.match(r'^(.*?)\s*\(([^)]+)\)\s*$', s)
    if m:
        materia = m.group(1).strip()
        prof_raw = m.group(2).strip()
        matched, unmatched = match_professor(prof_raw)
        if matched:
            return (materia, matched, None)
        else:
            # couldn't match -> keep as texto_livre so nothing is silently lost
            return (None, None, s)
    else:
        # bare text: could be a bare professor name, or free text like CARNAVAL/Coordenação
        matched, unmatched = match_professor(s)
        if matched:
            return (None, matched, None)
        return (None, None, s)

# ---- CEFET & ENEM: standard weekly block with day-header row then N periodo rows,
# with an "Intervalo" row inserted after the 2nd periodo row.
def parse_standard_sheet(ws, blocks):
    """blocks: list of (turma_nome, header_col_start, day_cols) where day_cols are the
    column indices for Segunda..Sexta (or subset) relative to a label col.
    We scan row by row looking for a day-header row (cell in day_cols[0] matches parse_day_header)."""
    out = []
    unmatched_profs = set()
    for turma, label_col, periodo_col, day_cols in blocks:
        r = 1
        max_r = ws.max_row
        while r <= max_r:
            # a header row is one where ANY day column parses as a day-header
            # (a split week may start mid-week, e.g. Wed-Fri only, so col day_cols[0]
            # can be empty while later day columns hold valid headers)
            dia0 = date0 = None
            for dc in day_cols:
                v = ws.cell(r, dc).value
                if v:
                    d, ds = parse_day_header(v)
                    if d and ds:
                        dia0, date0 = d, ds
                        break
            if dia0 and date0:
                # NOTE: we deliberately do NOT trust the sheet's own "SEMANA NN" text label
                # for numbering. Investigation showed the CEFET sheet's SEMANA labels are
                # unreliable: a single calendar week is sometimes split across two label
                # blocks (e.g. Seg/Ter under "SEMANA 08", Qua-Sex of the SAME week under
                # "SEMANA 09"), and the same label can even be duplicated across two
                # different calendar weeks (two separate blocks both say "SEMANA 12").
                # Instead, semana_num is assigned later from each row's actual date via
                # ISO calendar-week grouping, which is robust to both of these quirks and
                # generalizes to future spreadsheets with the same kind of label mistakes.
                # build day -> iso date map from header row
                day_dates = {}
                for dc in day_cols:
                    v = ws.cell(r, dc).value
                    if v:
                        dia, datestr = parse_day_header(v)
                        if dia and datestr:
                            day_dates[dc] = (dia, to_iso_date(datestr))
                # now walk periodo rows starting r+1
                pr = r + 1
                ordem = 0
                periodo_rows_found = 0
                while pr <= max_r:
                    plabel = ws.cell(pr, periodo_col).value
                    if plabel is None:
                        break
                    plabel_s = str(plabel).strip()
                    if plabel_s == 'Intervalo':
                        pr += 1
                        continue
                    if plabel_s.startswith('SEMANA') or (norm(plabel_s) in ('segunda','terca','terça','quarta','quinta','sexta')):
                        break
                    # check this looks like a periodo row (has "Tempo" or time range) - else stop
                    for dc, (dia, iso) in day_dates.items():
                        raw = ws.cell(pr, dc).value
                        materia, prof, texto = split_materia_prof(raw)
                        if texto and not match_professor(texto)[0]:
                            pass
                        out.append({
                            'turma_nome': turma, 'semana_num': None, 'data': iso,
                            'dia_semana': dia, 'periodo_ordem': ordem,
                            'periodo_label': plabel_s, 'materia': materia,
                            'professor_nome': prof, 'texto_livre': texto,
                        })
                        if raw and materia is None and prof is None and texto:
                            mm2, _ = match_professor(texto)
                            if not mm2 and texto not in ('CARNAVAL','Coordenação','Não teve aula - Enchente'):
                                unmatched_profs.add(texto)
                    ordem += 1
                    periodo_rows_found += 1
                    pr += 1
                    if periodo_rows_found >= 8:
                        break
                r = pr
            else:
                r += 1
    return out, unmatched_profs

# CEFET: turma1 label_col=2 periodo_col=3 day_cols=[4..8]; turma2 label_col=9(no semana there) periodo_col=10 day_cols=[11..15]
ws_cefet = wb['CEFET']
cefet_blocks = [
    ('Cefet 1', 2, 3, [4,5,6,7,8]),
    ('Cefet 2', 2, 10, [11,12,13,14,15]),  # semana label still only appears in col2 (turma1 side); we'll fallback
]

# ENEM: label_col=2 periodo_col=3 day_cols=[4..8]
ws_enem = wb['ENEM']
enem_blocks = [
    ('Enem', 2, 3, [4,5,6,7,8]),
]

all_rows = []
all_unmatched = set()

rows, unmatched = parse_standard_sheet(ws_cefet, [cefet_blocks[0]])
all_rows += rows; all_unmatched |= unmatched
rows, unmatched = parse_standard_sheet(ws_cefet, [cefet_blocks[1]])
all_rows += rows; all_unmatched |= unmatched
rows, unmatched = parse_standard_sheet(ws_enem, enem_blocks)
all_rows += rows; all_unmatched |= unmatched

# 8º ANO: different layout - label_col=2, day_cols=[4,5] (Terça, Quinta), periodo_col=3
ws_8 = wb['8º ANO']
rows8, unmatched8 = parse_standard_sheet(ws_8, [('8º ano', 2, 3, [4,5])])
all_rows += rows8
all_unmatched |= unmatched8

# Assign semana_num per turma from each row's actual date via ISO calendar-week grouping
# (year, iso_week), NOT from the sheet's own "SEMANA NN" text labels — those are unreliable
# (see note above). This naturally:
#  - merges a calendar week that the sheet author split across two differently-labeled
#    blocks (e.g. Seg/Ter under one label, Qua-Sex of the same week under the next) into
#    a single semana_num, since both fragments share the same ISO week;
#  - keeps two genuinely different calendar weeks apart even if the sheet duplicated the
#    same "SEMANA NN" text for both of them, since their ISO weeks differ;
#  - generalizes to any future spreadsheet with the same kind of labeling mistakes, since
#    it never parses the label text for numbering at all.
# Cefet 1 and Cefet 2 (which has no SEMANA label column of its own) both get correct,
# independently-derived semana_num this way, so no cross-turma date lookup is needed.
for turma in set(r['turma_nome'] for r in all_rows):
    trows = [r for r in all_rows if r['turma_nome'] == turma]
    iso_weeks = sorted(set(date.fromisoformat(r['data']).isocalendar()[:2] for r in trows))
    week_index = {wk: i + 1 for i, wk in enumerate(iso_weeks)}
    for r in trows:
        iso = date.fromisoformat(r['data']).isocalendar()[:2]
        r['semana_num'] = week_index[iso]

print('Total rows parsed:', len(all_rows))
from collections import Counter
c = Counter(r['turma_nome'] for r in all_rows)
print('Rows per turma:', dict(c))

for turma in c:
    sems = sorted(set(r['semana_num'] for r in all_rows if r['turma_nome']==turma and r['semana_num'] is not None))
    dates = sorted(set(r['data'] for r in all_rows if r['turma_nome']==turma))
    print(turma, 'semanas:', min(sems) if sems else None, '-', max(sems) if sems else None, 'count semanas:', len(sems),
          'date range:', dates[0] if dates else None, '-', dates[-1] if dates else None)

missing_semana = [r for r in all_rows if r['semana_num'] is None]
print('rows missing semana_num:', len(missing_semana))
if missing_semana[:5]:
    print(missing_semana[:5])

print('Unmatched professor-like tokens:', sorted(all_unmatched))

json.dump(all_rows, open('/tmp/percurso_dashboard/horas_import/horario_semanal.json','w'), ensure_ascii=False, indent=1)
print('Wrote', len(all_rows), 'rows to horario_semanal.json')
