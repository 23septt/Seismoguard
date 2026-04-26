# IPST / สสวท. Formatting Rules

**Source**: `แบบฟอร์มวิจัย.pdf` (สถาบันส่งเสริมการสอนวิทยาศาสตร์และเทคโนโลยี — สสวท.)
**Extracted**: 2026-04-15
**Applied to**: `รูปเล่มโครงงานเสด_new.docx` (via `apply_format.js`)

---

## 1. กระดาษ (Page Setup)

| รายการ | ค่า |
|--------|-----|
| ขนาดกระดาษ | A4 (21 × 29.7 ซม.) |
| ขอบซ้าย (Left) | 3.81 ซม. = 1.5 นิ้ว = **2160 twips** |
| ขอบบน (Top) | 3.81 ซม. = 1.5 นิ้ว = **2160 twips** |
| ขอบขวา (Right) | 2.54 ซม. = 1.0 นิ้ว = **1440 twips** |
| ขอบล่าง (Bottom) | 2.54 ซม. = 1.0 นิ้ว = **1440 twips** |

---

## 2. ฟอนต์ (Font)

| ระดับ | ฟอนต์ | ขนาด | รูปแบบ |
|-------|-------|------|--------|
| เนื้อหาทั่วไป (Normal) | TH Sarabun New | 16 pt (w:sz=32) | ปกติ |
| หัวข้อบท (บทที่ X ชื่อบท) | TH Sarabun New | 20–22 pt | **ตัวหนา**, กึ่งกลาง |
| หัวข้อระดับ 1 (X.X) | TH Sarabun New | 18 pt | **ตัวหนา** |
| หัวข้อระดับ 2 (X.X.X) | TH Sarabun New | 16 pt | **ตัวหนา** |

---

## 3. การจัดวางย่อหน้า (Paragraph Layout)

| รายการ | ค่า |
|--------|-----|
| ระยะบรรทัด (Line Spacing) | 1 เท่า (Single) — `w:line="240" w:lineRule="auto"` |
| ระยะหลังย่อหน้า (Space After) | 0 pt — `w:after="0"` |
| ย่อหน้าแรก (First-Line Indent) | ประมาณ 8 ตัวอักษร ≈ 0.5 นิ้ว = **720 twips** (`w:firstLine="720"`) |
| การจัดข้อความ (Alignment) | ชิดขอบทั้งสองด้าน (Justify) |

---

## 4. เลขหน้า (Page Numbering)

| ส่วน | รูปแบบ | ตำแหน่ง |
|------|--------|---------|
| ส่วนนำ (ก ข ค …) | ตัวเลขไทยอักษร (`w:fmt="thaiLetters"`) | กึ่งกลาง ด้านล่าง ห่างขอบ 1 นิ้ว |
| เนื้อหา (1 2 3 …) | อารบิก (ค่าเริ่มต้น) | กึ่งกลาง ด้านล่าง ห่างขอบ 1 นิ้ว |
| หน้าแรกของแต่ละบท | **ไม่แสดงเลขหน้า** (`w:titlePg/` + first page header/footer ว่าง) | — |

---

## 5. ตาราง & รูปภาพ (Tables & Figures)

| รายการ | กฎ |
|--------|-----|
| ชื่อตาราง (Table Caption) | **อยู่เหนือตาราง**, จัดชิดซ้าย, เช่น "ตารางที่ 1.1 …" |
| ชื่อรูปภาพ (Figure Caption) | **อยู่ใต้รูป**, จัดกึ่งกลาง, เช่น "ภาพที่ 1.1 …" |

---

## 6. การขึ้นบทใหม่ (Chapter Page Breaks)

- ทุกบท, บรรณานุกรม, ภาคผนวก → ขึ้นหน้าใหม่ (`w:pageBreakBefore` หรือ `<w:br w:type="page"/>`)
- หน้าแรกของบท = หน้า title page ของ section (ไม่แสดงเลขหน้า)

---

## 7. OOXML Values Reference

```xml
<!-- Page Margins (ใช้กับทุก sectPr) -->
<w:pgMar w:top="2160" w:right="1440" w:bottom="1440" w:left="2160"
         w:header="709" w:footer="709" w:gutter="0"/>

<!-- Default Paragraph Spacing (docDefaults ใน styles.xml) -->
<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>

<!-- Normal Style -->
<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/>
<w:sz w:val="32"/>   <!-- 16 pt -->
<w:szCs w:val="32"/>

<!-- First-line indent (ใน pPr ของแต่ละย่อหน้าเนื้อหา) -->
<w:ind w:firstLine="720"/>
```

---

## 8. Conversion Table

| หน่วย | ค่า |
|-------|-----|
| 1 นิ้ว (inch) | 1440 twips |
| 1 ซม. (cm) | 567 twips |
| 1.5 นิ้ว | 2160 twips |
| 1 pt | 20 twips |
| 16 pt | `w:sz="32"` (half-points) |
| 18 pt | `w:sz="36"` |
| 20 pt | `w:sz="40"` |
