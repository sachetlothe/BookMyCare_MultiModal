"""Generate SYNTHETIC sample files for development and tests.

None of these files describe a real person. Requires reportlab (dev dependency).
    python -m scripts.make_sample_data
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "sample_data"

BANNER = "SYNTHETIC SAMPLE REPORT - NOT A REAL PATIENT - FOR SOFTWARE TESTING ONLY"

METABOLIC = [
    ("Patient", "Demo Patient (synthetic)"), ("Age/Sex", "52 / Female"), ("Lab", "BookMyCare Demo Laboratory"),
    ("", ""),
    ("COMPLETE BLOOD COUNT", ""),
    ("Hemoglobin", "10.8 g/dL      (12.0 - 15.5)"),
    ("WBC Count", "7.2 x10^3/uL   (4.0 - 11.0)"),
    ("Platelet Count", "245 x10^3/uL   (150 - 450)"),
    ("", ""),
    ("DIABETES PANEL", ""),
    ("Fasting Blood Sugar", "132 mg/dL      (70 - 99)"),
    ("HbA1c", "7.1 %          (< 5.7)"),
    ("", ""),
    ("LIPID PROFILE", ""),
    ("Total Cholesterol", "228 mg/dL      (< 200)"),
    ("LDL Cholesterol", "152 mg/dL      (< 130)"),
    ("HDL Cholesterol", "38 mg/dL       (> 50)"),
    ("Triglycerides", "190 mg/dL      (< 150)"),
    ("", ""),
    ("OTHER", ""),
    ("Serum Creatinine", "0.9 mg/dL      (0.5 - 1.1)"),
    ("TSH", "2.1 mIU/L      (0.4 - 4.0)"),
    ("ALT (SGPT)", "34 U/L         (7 - 56)"),
    ("Vitamin D (25-OH)", "18 ng/mL       (30 - 100)"),
    ("Blood Pressure", "142/92 mmHg"),
]

# Earlier synthetic results for the same demo patient, so lab trends can be shown:
# HbA1c and fasting glucose rise, haemoglobin falls below range, LDL rises, vitamin D stays low.
def _followup(date_label: str, hb, fbs, a1c, tc, ldl, hdl, tg, creat, vitd, bp):
    return [
        ("Patient", "Demo Patient (synthetic)"), ("Age/Sex", "52 / Female"), ("Lab", "BookMyCare Demo Laboratory"),
        ("Report date", date_label),
        ("", ""),
        ("COMPLETE BLOOD COUNT", ""),
        ("Hemoglobin", f"{hb} g/dL      (12.0 - 15.5)"),
        ("", ""),
        ("DIABETES PANEL", ""),
        ("Fasting Blood Sugar", f"{fbs} mg/dL      (70 - 99)"),
        ("HbA1c", f"{a1c} %          (< 5.7)"),
        ("", ""),
        ("LIPID PROFILE", ""),
        ("Total Cholesterol", f"{tc} mg/dL      (< 200)"),
        ("LDL Cholesterol", f"{ldl} mg/dL      (< 130)"),
        ("HDL Cholesterol", f"{hdl} mg/dL       (> 50)"),
        ("Triglycerides", f"{tg} mg/dL      (< 150)"),
        ("", ""),
        ("OTHER", ""),
        ("Serum Creatinine", f"{creat} mg/dL      (0.5 - 1.1)"),
        ("Vitamin D (25-OH)", f"{vitd} ng/mL       (30 - 100)"),
        ("Blood Pressure", f"{bp} mmHg"),
    ]


FOLLOWUP_2025_09 = _followup("2025-09-15", 12.6, 104, 6.1, 210, 138, 42, 165, 0.8, 22, "134/86")
FOLLOWUP_2026_03 = _followup("2026-03-12", 11.9, 118, 6.6, 221, 146, 40, 178, 0.85, 20, "138/88")

FEVER = [
    ("Patient", "Demo Patient (synthetic)"), ("Age/Sex", "27 / Male"), ("Lab", "BookMyCare Demo Laboratory"),
    ("", ""),
    ("COMPLETE BLOOD COUNT", ""),
    ("Hemoglobin", "14.6 g/dL      (13.5 - 17.5)"),
    ("Total Leucocyte Count", "3.1 x10^3/uL   (4.0 - 11.0)"),
    ("Platelet Count", "85 x10^3/uL    (150 - 450)"),
    ("ESR", "12 mm/hr       (0 - 20)"),
    ("SGPT", "72 U/L         (7 - 56)"),
]


def _lines(rows):
    out = [BANNER, ""]
    for k, v in rows:
        out.append(f"{k}: {v}" if k and v else k)
    return out


def write_txt(name: str, rows):
    (OUT / name).write_text("\n".join(_lines(rows)) + "\n", encoding="utf-8")


def write_pdf(name: str, rows, title: str):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(OUT / name), pagesize=A4)
    w, h = A4
    y = h - 50
    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.8, 0, 0)
    c.drawString(40, y, BANNER)
    c.setFillColorRGB(0, 0, 0)
    y -= 28
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, title)
    y -= 24
    for k, v in rows:
        if k and not v:
            c.setFont("Helvetica-Bold", 11)
            c.drawString(40, y, k)
        elif k:
            c.setFont("Helvetica", 11)
            c.drawString(50, y, f"{k}:")
            c.drawString(230, y, v)
        y -= 18
    c.save()


def write_report_png(name: str, rows):
    img = Image.new("RGB", (1400, 60 + 44 * (len(rows) + 2)), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 30)
    except OSError:
        font = ImageFont.load_default(size=30)
    y = 30
    for line in _lines(rows):
        d.text((40, y), line, fill="black", font=font)
        y += 44
    img.save(OUT / name)


def write_synthetic_image(name: str):
    """A synthetic grayscale image (NOT a real radiograph) for upload tests."""
    img = Image.new("L", (512, 512), 20)
    d = ImageDraw.Draw(img)
    d.ellipse((90, 80, 240, 440), fill=150)
    d.ellipse((272, 80, 422, 440), fill=150)
    d.rectangle((246, 40, 266, 470), fill=200)
    d.text((10, 490), "SYNTHETIC TEST IMAGE", fill=255)
    img.filter(ImageFilter.GaussianBlur(2)).save(OUT / name)


def write_followups():
    write_txt("synthetic_followup_2025-09.txt", FOLLOWUP_2025_09)
    write_txt("synthetic_followup_2026-03.txt", FOLLOWUP_2026_03)


def main():
    OUT.mkdir(exist_ok=True)
    write_txt("synthetic_metabolic_panel.txt", METABOLIC)
    write_followups()
    write_pdf("synthetic_metabolic_panel.pdf", METABOLIC, "Laboratory Report - Metabolic Panel")
    write_pdf("synthetic_fever_cbc.pdf", FEVER, "Laboratory Report - CBC")
    write_report_png("synthetic_fever_cbc_scan.png", FEVER)
    write_synthetic_image("synthetic_grayscale_image.png")
    (OUT / "README.md").write_text(
        "# Synthetic sample data\n\nAll files here are **synthetic** and generated by `scripts/make_sample_data.py`. "
        "They do not describe real people and must not be used for any clinical purpose.\n\n"
        "- `synthetic_metabolic_panel.pdf/.txt` - out-of-range glucose, HbA1c, lipids, haemoglobin, vitamin D, BP\n"
        "- `synthetic_followup_2025-09.txt`, `synthetic_followup_2026-03.txt` - earlier results for the same demo patient "
        "(HbA1c 6.1 -> 6.6 -> 7.1 %, haemoglobin 12.6 -> 11.9 -> 10.8 g/dL) to demonstrate lab trends\n"
        "- `synthetic_fever_cbc.pdf` - low platelets and white cells (dengue-like pattern) \n"
        "- `synthetic_fever_cbc_scan.png` - the same report as an image, to test OCR\n"
        "- `synthetic_grayscale_image.png` - a synthetic image (not a radiograph) to test medical-image upload\n",
        encoding="utf-8",
    )
    print(f"Wrote sample files to {OUT}")


if __name__ == "__main__":
    main()
