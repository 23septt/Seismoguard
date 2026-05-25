import sys, docx
sys.stdout.reconfigure(encoding='utf-8')
doc = docx.Document(r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final.docx')
for i, p in enumerate(doc.paragraphs):
    print(f'{i:4d}: {repr(p.text[:140])}')
