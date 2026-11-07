"""PDF documents with reportlab (prompt-v1 §6.9 S13, §6.10 M12–M13, M18): VAT invoices, the CSR
impact report (verified trees, survival, estimated cooling and CO₂, people reached, photos) and
credit retirement certificates. CO₂ for tree packages is always printed as an estimate, not an offset.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..storage import storage

ESTIMATE_LINE = "CO₂ removal for tree packages is an estimate, not an offset. It is not a carbon credit."
NAVY = colors.HexColor("#00182E")
LIME = colors.HexColor("#ACEC00")


def _doc(buf: io.BytesIO, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
        author="Atmos X",
    )


def _table(rows: list[list[str]], widths: list[float]) -> Table:
    t = Table(rows, colWidths=widths)
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D1DA")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def invoice_pdf(inv: dict, buyer: dict, lines: list[dict], *, estimate: bool) -> bytes:
    buf = io.BytesIO()
    s = getSampleStyleSheet()
    story = [
        Paragraph("Atmos X · VAT invoice", s["Title"]),
        Paragraph(f"Invoice <b>{inv['number']}</b> · {inv['created_at'][:10]}", s["Normal"]),
        Spacer(1, 6 * mm),
        Paragraph(f"<b>Bill to</b>: {buyer.get('name', '')}", s["Normal"]),
        Paragraph(
            " · ".join(
                x
                for x in [
                    buyer.get("trade_licence") and f"Trade licence {buyer['trade_licence']}",
                    buyer.get("tin_bin") and f"TIN/BIN {buyer['tin_bin']}",
                ]
                if x
            ),
            s["Normal"],
        ),
        Spacer(1, 6 * mm),
        _table(
            [["Item", "Qty", "Unit price", "Amount"]]
            + [
                [
                    ln["name"],
                    str(ln["qty"]),
                    f"{ln['unit_price']:,.2f} {inv['currency']}",
                    f"{ln['amount']:,.2f} {inv['currency']}",
                ]
                for ln in lines
            ]
            + [
                ["", "", "Subtotal", f"{inv['subtotal']:,.2f} {inv['currency']}"],
                ["", "", f"VAT {inv['vat_rate'] * 100:.0f}%", f"{inv['vat']:,.2f} {inv['currency']}"],
                ["", "", "Total", f"{inv['total']:,.2f} {inv['currency']}"],
            ],
            [80 * mm, 15 * mm, 38 * mm, 38 * mm],
        ),
        Spacer(1, 6 * mm),
    ]
    if estimate:
        story.append(Paragraph(ESTIMATE_LINE, s["Italic"]))
    story.append(
        Paragraph("Money for trees is held and released to planters only after each tree is verified.", s["Normal"])
    )
    _doc(buf, f"Invoice {inv['number']}").build(story)
    return buf.getvalue()


def impact_report_pdf(company: dict, ov: dict, trees: list[dict], *, redemptions: int) -> bytes:
    buf = io.BytesIO()
    s = getSampleStyleSheet()
    now = datetime.now(UTC).strftime("%d %b %Y")
    story = [
        Paragraph(f"CSR impact report · {company['name']}", s["Title"]),
        Paragraph(f"Atmos X · {now}", s["Normal"]),
        Spacer(1, 6 * mm),
        _table(
            [
                ["Measure", "Value"],
                ["Trees funded", str(ov["trees_funded"])],
                ["Trees verified and allocated", str(ov["trees_allocated"])],
                ["Trees alive at last check-in", str(ov["trees_alive"])],
                ["Survival rate", f"{ov['survival_rate'] * 100:.0f}%" if ov["survival_rate"] is not None else "–"],
                ["People reached (planters)", str(ov["people_reached"])],
                ["CO₂ removed so far (estimate)", f"{ov['co2e_estimated_t']:.3f} t"],
                ["Certified, retired CO₂e", f"{ov['co2e_certified_t']:.3f} t"],
                ["Store products redeemed", str(redemptions)],
            ],
            [95 * mm, 75 * mm],
        ),
        Spacer(1, 5 * mm),
        Paragraph(ESTIMATE_LINE, s["Italic"]),
        Spacer(1, 6 * mm),
    ]
    if trees:
        story.append(Paragraph("Trees (latest photos, GPS rounded to about 100 m)", s["Heading3"]))
        cells: list = []
        for t in trees[:6]:
            img = None
            if t.get("photo_path"):
                try:
                    img = Image(
                        str(storage().path(t["photo_path"])), width=50 * mm, height=38 * mm, kind="proportional"
                    )
                except Exception:  # noqa: BLE001  a missing file never breaks the report
                    img = None
            caption = Paragraph(
                f"{t['species']} · planted {t['planted'][:10]}<br/>{t['lat']:.3f}, {t['lng']:.3f}", s["BodyText"]
            )
            cells.append([img or "", caption])
        story.append(
            Table(
                [[c for pair in cells[i : i + 3] for c in [pair[0]]] for i in range(0, len(cells), 3)],
                colWidths=[57 * mm] * 3,
            )
        )
        story.append(
            Table(
                [[c for pair in cells[i : i + 3] for c in [pair[1]]] for i in range(0, len(cells), 3)],
                colWidths=[57 * mm] * 3,
            )
        )
    _doc(buf, f"Impact report {company['name']}").build(story)
    return buf.getvalue()


def retirement_pdf(company: dict, lot: dict, serial_from: str, serial_to: str) -> bytes:
    buf = io.BytesIO()
    s = getSampleStyleSheet()
    story = [
        Paragraph("Certificate of retirement", s["Title"]),
        Paragraph(f"Retired on behalf of <b>{company['name']}</b>", s["Normal"]),
        Spacer(1, 6 * mm),
        _table(
            [
                ["Field", "Value"],
                ["Tonnes CO₂e", f"{lot['tonnes']:.0f}"],
                ["Serial numbers", f"{serial_from} – {serial_to}"],
                ["Standard", lot.get("standard") or "–"],
                ["Registry project", lot.get("registry_project_id") or "–"],
                ["Auditor", lot.get("auditor") or "–"],
                ["Certified", (lot.get("certified_at") or "–")[:10]],
            ],
            [60 * mm, 110 * mm],
        ),
    ]
    _doc(buf, "Retirement certificate").build(story)
    return buf.getvalue()
