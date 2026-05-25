import sys, docx
sys.stdout.reconfigure(encoding='utf-8')
doc = docx.Document(r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final_tmp.docx')
for ti, tbl in enumerate(doc.tables):
    rows = [[c.text for c in row.cells] for row in tbl.rows]
    print(f'=== Table {ti} ({len(tbl.rows)}r x {len(tbl.columns)}c) ===')
    for r in rows:
        print('  |', ' | '.join(str(c)[:35] for c in r))
    print()
