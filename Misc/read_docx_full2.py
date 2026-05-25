import sys, docx
sys.stdout.reconfigure(encoding='utf-8')
doc = docx.Document(r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final_tmp.docx')
for i in [431, 432, 433, 434, 451, 452]:
    print(f'=== {i} ===')
    print(doc.paragraphs[i].text)
    print()
