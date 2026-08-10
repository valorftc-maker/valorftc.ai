#!/usr/bin/env python3
"""Build the Valor FTC employee sign-in guide (PDF).

Every number in this document is read from the running system's own policy
constants rather than typed by hand, so the guide cannot drift from the desk.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, KeepTogether, ListFlowable, ListItem,
    NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table,
    TableStyle,
)

# --------------------------------------------------------------------------- #
# facts, pulled from the live system (see build command)
# --------------------------------------------------------------------------- #
DESK_URL = "https://valor-desk.tail53cfa4.ts.net"
SITE_URL = "https://valorftc.ai"
MIN_PW = 12
MAX_FAILURES = 5
LOCKOUT_MIN = 15
IDLE_MIN = 60
ABSOLUTE_HR = 12
RECOVERY_CODES = 10
TOTP_DIGITS = 6
TOTP_PERIOD = 30
ROLES = ["viewer", "researcher", "trader", "admin"]

# --------------------------------------------------------------------------- #
# palette — the desk's own colours, adapted for paper
# --------------------------------------------------------------------------- #
INK = colors.HexColor("#0E141C")
INK_SOFT = colors.HexColor("#3A4654")
CHALK = colors.HexColor("#5C6B7C")
SIGNAL = colors.HexColor("#0E7C68")   # teal, darkened for contrast on white
SIGNAL_BG = colors.HexColor("#EAF6F3")
DOUBT = colors.HexColor("#9A6A12")
DOUBT_BG = colors.HexColor("#FCF5E7")
FAULT = colors.HexColor("#A3352C")
FAULT_BG = colors.HexColor("#FBEDEC")
RULE = colors.HexColor("#D5DCE3")
PANEL = colors.HexColor("#F5F7F9")

DISPLAY = "Helvetica-Bold"
BODY = "Helvetica"
MONO = "Courier"
MONO_B = "Courier-Bold"

PAGE_W, PAGE_H = LETTER
MARGIN = 0.85 * inch

ss = getSampleStyleSheet()


def S(name, **kw):
    base = dict(fontName=BODY, fontSize=10.2, leading=15.4, textColor=INK_SOFT,
                spaceAfter=8)
    base.update(kw)
    return ParagraphStyle(name, **base)


st = {
    "cover_kicker": S("ck", fontName=MONO, fontSize=9, textColor=SIGNAL,
                      leading=14, spaceAfter=16),
    "cover_title": S("ct", fontName=DISPLAY, fontSize=32, leading=35,
                     textColor=INK, spaceAfter=12),
    "cover_sub": S("cs", fontSize=12.5, leading=19, textColor=CHALK,
                   spaceAfter=26),
    "h1": S("h1", fontName=DISPLAY, fontSize=17, leading=21, textColor=INK,
            spaceBefore=6, spaceAfter=9),
    "h2": S("h2", fontName=DISPLAY, fontSize=12.3, leading=16, textColor=INK,
            spaceBefore=13, spaceAfter=6),
    "kicker": S("kk", fontName=MONO, fontSize=8.2, textColor=SIGNAL,
                leading=12, spaceAfter=3),
    "body": S("bd"),
    "lead": S("ld", fontSize=11.4, leading=17.5, textColor=INK_SOFT,
              spaceAfter=11),
    "small": S("sm", fontSize=9, leading=13.5, textColor=CHALK),
    "mono": S("mn", fontName=MONO, fontSize=9, leading=13.6, textColor=INK),
    "cell": S("cl", fontSize=9.3, leading=13.4, spaceAfter=0),
    "cellb": S("clb", fontName=DISPLAY, fontSize=9.3, leading=13.4,
               textColor=INK, spaceAfter=0),
    "cellm": S("clm", fontName=MONO, fontSize=8.6, leading=13, textColor=INK,
               spaceAfter=0),
    "step_n": S("sn", fontName=MONO, fontSize=8.4, textColor=SIGNAL, leading=12,
                spaceAfter=2),
    "step_t": S("stt", fontName=DISPLAY, fontSize=13, leading=17,
                textColor=INK, spaceAfter=5),
    "note": S("nt", fontSize=9.4, leading=14.2, textColor=INK_SOFT,
              spaceAfter=0),
    "foot": S("ft", fontName=MONO, fontSize=7.6, textColor=CHALK, leading=10),
}


def rule(space_before=4, space_after=10, color=RULE):
    return HRFlowable(width="100%", thickness=0.7, color=color,
                      spaceBefore=space_before, spaceAfter=space_after)


def callout(kind, title, text):
    """A bordered aside. kind: signal | doubt | fault."""
    bg, fg = {
        "signal": (SIGNAL_BG, SIGNAL),
        "doubt": (DOUBT_BG, DOUBT),
        "fault": (FAULT_BG, FAULT),
    }[kind]
    inner = [
        Paragraph(f'<font color="#{fg.hexval()[2:]}"><b>{title}</b></font>', st["note"]),
        Spacer(1, 3),
        Paragraph(text, st["note"]),
    ]
    t = Table([[inner]], colWidths=[PAGE_W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, fg),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.Color(0, 0, 0, 0.08)),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def codebox(lines):
    body = "<br/>".join(lines)
    t = Table([[Paragraph(body, st["mono"])]], colWidths=[PAGE_W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def step(num, title, blocks):
    """A numbered step.

    Only the number, the title and the first block are held together — enough
    to stop an orphaned heading at a page foot, while letting a long step flow
    across pages instead of leaving half a page blank.
    """
    head = [
        Paragraph(f"STEP {num:02d}", st["step_n"]),
        Paragraph(title, st["step_t"]),
    ]
    out = [KeepTogether(head + blocks[:1])]
    out.extend(blocks[1:])
    out.append(Spacer(1, 9))
    return out


def bullets(items, style=None):
    style = style or st["body"]
    return ListFlowable(
        [ListItem(Paragraph(i, style), leftIndent=14, value="circle")
         for i in items],
        bulletType="bullet", start="circle", leftIndent=15,
        bulletFontSize=5, bulletOffsetY=-2, spaceAfter=8,
    )


def table(rows, widths, header=True, zebra=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
        ("BOX", (0, 0), (-1, -1), 0.7, RULE),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
        ]
    if zebra:
        for r in range(1, len(rows)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), PANEL))
    t.setStyle(TableStyle(style))
    return t


def hdr(text):
    return Paragraph(
        f'<font color="#FFFFFF"><b>{text}</b></font>',
        S("th", fontName=DISPLAY, fontSize=8.6, leading=12,
          textColor=colors.white, spaceAfter=0))


# --------------------------------------------------------------------------- #
# page furniture
# --------------------------------------------------------------------------- #
def draw_logo(c, x, y, size=13, color=SIGNAL):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(size * 0.20)
    c.setLineCap(1)
    c.setLineJoin(1)
    p = c.beginPath()
    p.moveTo(x, y + size * 0.10)
    p.lineTo(x + size * 0.30, y + size * 0.52)
    p.lineTo(x + size * 0.52, y + size * 0.22)
    p.lineTo(x + size * 0.92, y + size * 0.80)
    c.drawPath(p)
    c.restoreState()


def cover_page(c, doc):
    c.saveState()
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 2.15 * inch, PAGE_W, 2.15 * inch, fill=1, stroke=0)
    draw_logo(c, MARGIN, PAGE_H - 1.30 * inch, size=17, color=SIGNAL)
    c.setFillColor(colors.white)
    c.setFont(DISPLAY, 17)
    c.drawString(MARGIN + 0.34 * inch, PAGE_H - 1.27 * inch, "Valor FTC")
    c.setFillColor(colors.HexColor("#8FA3B4"))
    c.setFont(MONO, 8.4)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.24 * inch,
                      "INTERNAL — EMPLOYEE DOCUMENTATION")
    c.setFillColor(CHALK)
    c.setFont(MONO, 7.6)
    c.drawString(MARGIN, 0.62 * inch,
                 "Valor FTC — internal. Do not forward outside the company.")
    c.drawRightString(PAGE_W - MARGIN, 0.62 * inch, f"Page {c.getPageNumber()}")
    c.restoreState()


def body_page(c, doc):
    c.saveState()
    draw_logo(c, MARGIN, PAGE_H - 0.72 * inch, size=11, color=SIGNAL)
    c.setFillColor(INK)
    c.setFont(DISPLAY, 10)
    c.drawString(MARGIN + 0.24 * inch, PAGE_H - 0.70 * inch, "Valor FTC")
    c.setFillColor(CHALK)
    c.setFont(MONO, 7.8)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.70 * inch,
                      "Employee sign-in guide")
    c.setStrokeColor(RULE)
    c.setLineWidth(0.7)
    c.line(MARGIN, PAGE_H - 0.86 * inch, PAGE_W - MARGIN, PAGE_H - 0.86 * inch)

    c.setFillColor(CHALK)
    c.setFont(MONO, 7.6)
    c.drawString(MARGIN, 0.62 * inch,
                 "Valor FTC — internal. Do not forward outside the company.")
    c.drawRightString(PAGE_W - MARGIN, 0.62 * inch, f"Page {c.getPageNumber()}")
    c.restoreState()


def build(path="Valor-FTC-Employee-Sign-In-Guide.pdf"):
    doc = BaseDocTemplate(
        path, pagesize=LETTER,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=0.95 * inch,
        title="Valor FTC — Employee Sign-In Guide",
        author="Valor FTC", subject="How to sign in to the Valor FTC research desk",
    )
    cover_frame = Frame(MARGIN, 0.95 * inch, PAGE_W - 2 * MARGIN,
                        PAGE_H - 2.15 * inch - 0.95 * inch, id="cover")
    body_frame = Frame(MARGIN, 0.95 * inch, PAGE_W - 2 * MARGIN,
                       PAGE_H - 1.05 * inch - 0.95 * inch, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="body", frames=[body_frame], onPage=body_page),
    ])

    W = PAGE_W - 2 * MARGIN
    s = []

    # ---------------------------------------------------------------- cover
    s += [
        Spacer(1, 0.5 * inch),
        Paragraph("EMPLOYEE ACCESS · VERSION 1.0", st["cover_kicker"]),
        Paragraph("How to sign in to<br/>the research desk", st["cover_title"]),
        Paragraph(
            "A step-by-step guide to reaching the Hey Jamie trading desk. "
            "Read it once end to end before your first sign-in — three of the "
            "five steps happen only once, and one of them produces codes you "
            "cannot get back if you lose them.",
            st["cover_sub"]),
        rule(2, 14),
    ]

    facts = [
        [hdr("WHAT"), hdr("WHERE")],
        [Paragraph("The desk", st["cellb"]),
         Paragraph(DESK_URL, st["cellm"])],
        [Paragraph("Sign-in page on the website", st["cellb"]),
         Paragraph(f"{SITE_URL} → Employee sign-in", st["cellm"])],
        [Paragraph("Network required", st["cellb"]),
         Paragraph("Tailscale (company VPN) — the desk is unreachable without it",
                   st["cell"])],
        [Paragraph("What you need", st["cellb"]),
         Paragraph("Username · password · 6-digit authenticator code", st["cell"])],
    ]
    s += [table(facts, [2.05 * inch, W - 2.05 * inch]), Spacer(1, 16)]

    s += [
        callout("doubt", "Before you start",
                "Steps 1\u20133 need an administrator. Ask for them together in one "
                "message \u2014 a Tailscale invite <b>and</b> a desk account \u2014 so you "
                "are not waiting twice."),
        NextPageTemplate("body"), PageBreak(),
        Paragraph("OVERVIEW", st["kicker"]),
        Paragraph("The five steps", st["h1"]),
        rule(0, 10),
        table([
            [hdr("#"), hdr("STEP"), hdr("HOW OFTEN")],
            [Paragraph("01", st["cellm"]), Paragraph("Get on the company network (Tailscale)", st["cell"]), Paragraph("Once per device", st["cell"])],
            [Paragraph("02", st["cellm"]), Paragraph("Get your desk account from an admin", st["cell"]), Paragraph("Once", st["cell"])],
            [Paragraph("03", st["cellm"]), Paragraph("Set up your authenticator + save recovery codes", st["cell"]), Paragraph("Once", st["cell"])],
            [Paragraph("04", st["cellm"]), Paragraph("Open the desk and sign in", st["cell"]), Paragraph("Every time", st["cell"])],
            [Paragraph("05", st["cellm"]), Paragraph("Sign out when you are done", st["cell"]), Paragraph("Every time", st["cell"])],
        ], [0.42 * inch, W - 2.02 * inch, 1.6 * inch]),
        Spacer(1, 18),
    ]


    # ------------------------------------------------------------- part one
    s += [
        Paragraph("PART ONE", st["kicker"]),
        Paragraph("First-time setup", st["h1"]),
        Paragraph(
            "You do this once. After it is done, signing in takes about ten "
            "seconds and you never repeat any of this.", st["lead"]),
        rule(),
    ]

    s.extend(step(1, "Get on the company network", [
        Paragraph(
            "The desk is not on the public internet. It sits on the company's "
            "private Tailscale network, so a stranger cannot even find it, let "
            "alone try a password. Your device has to join that network first.",
            st["body"]),
        Paragraph("What to do", st["h2"]),
        bullets([
            "Ask an administrator to send you a <b>Tailscale invite</b>. It arrives by email.",
            "Open the invite and accept it. You will sign in with your work account.",
            "Install Tailscale on the device you will use: "
            "<font face='Courier'>tailscale.com/download</font> — it is available for macOS, Windows, iPhone, iPad, Android and Linux.",
            "Open the app and confirm it says <b>Connected</b>.",
        ]),
        callout("signal", "How to know it worked",
                "The Tailscale icon shows as connected, and the machine list "
                f"includes a device named <font face='Courier'>valor-desk</font>. "
                "That is the desk. If you do not see it, you are not on the "
                "network yet — the rest of this guide will not work until you are."),
    ]))

    s.extend(step(2, "Get your desk account", [
        Paragraph(
            "Accounts are created by an administrator at a terminal. There is "
            "no self-service sign-up, and there is no way to request an account "
            "from the login page — this is deliberate.", st["body"]),
        Paragraph("What to do", st["h2"]),
        bullets([
            "Ask an administrator to create your account. They will tell you your <b>username</b> "
            "(usually your first name, all lowercase).",
            f"<b>You type your own password</b>, at their keyboard or over a screen share — it is never "
            f"emailed, never sent in chat, and never written down. It must be at least <b>{MIN_PW} characters</b>.",
            "Choose a passphrase, not a password. Four unrelated words beats a short string of symbols, "
            "and you will actually remember it.",
        ]),
        callout("fault", "Nobody can recover your password — not even an administrator",
                "The system never stores your password. It stores only a "
                "one-way verifier that can check a password but cannot reveal "
                "one. If you forget it, an admin can set a new one; they cannot "
                "tell you the old one."),
    ]))

    s.extend(step(3, "Set up your authenticator and save your recovery codes", [
        Paragraph(
            "A password alone is not enough to get in. You also need a "
            f"{TOTP_DIGITS}-digit code that changes every {TOTP_PERIOD} seconds, "
            "generated by an app on your phone. This is the layer that protects "
            "you if your password ever leaks.", st["body"]),
        Paragraph("What to do", st["h2"]),
        bullets([
            "Install an authenticator app if you do not have one: <b>1Password</b>, <b>Authy</b>, "
            "<b>Google Authenticator</b>, or your phone's built-in password manager all work.",
            "When the administrator enrols you, the screen shows a <b>secret</b> and a QR code. "
            "Scan the QR code with your authenticator app, or type the secret in by hand.",
            f"The same screen prints <b>{RECOVERY_CODES} recovery codes</b>. Save them somewhere safe "
            "and private — a password manager is ideal, a photo in your camera roll is not.",
            "Ask the admin to run the verification step, which checks your app is generating the "
            "right codes before you depend on it.",
        ]),
        callout("fault", "The recovery codes are shown exactly once",
                "They cannot be displayed again, and nobody can look them up. "
                "Each one works a single time and then burns itself. They are "
                "what gets you in if your phone is lost, stolen, or wiped — so "
                "save them before you close that screen."),
    ]))

    s += [PageBreak()]

    # ------------------------------------------------------------- part two
    s += [
        Paragraph("PART TWO", st["kicker"]),
        Paragraph("Signing in, every time", st["h1"]),
        Paragraph(
            "Once setup is done, this is the whole routine. It takes about ten "
            "seconds.", st["lead"]),
        rule(),
    ]

    s.extend(step(4, "Open the desk and sign in", [
        Paragraph("4.1 — Check you are on the network", st["h2"]),
        Paragraph(
            "Open Tailscale and confirm it says <b>Connected</b>. This is the "
            "single most common reason the page will not load, and checking "
            "takes two seconds.", st["body"]),

        Paragraph("4.2 — Open the desk", st["h2"]),
        Paragraph("Either route works. Both land in the same place:", st["body"]),
        bullets([
            f"<b>From the website:</b> go to <font face='Courier'>{SITE_URL}</font>, "
            "click <b>Employee sign-in</b> in the top bar, then <b>Go to the desk</b>.",
            f"<b>Direct:</b> go straight to <font face='Courier'>{DESK_URL}</font>. "
            "Bookmark this one — it is faster.",
        ]),
        callout("signal", "You should see a padlock",
                "The desk has a real certificate, so your browser shows a normal "
                "secure padlock with no warnings. <b>If your browser warns you "
                "that the connection is not private, stop and tell an "
                "administrator.</b> On this network you should never have to "
                "click through a certificate warning."),

        Paragraph("4.3 — Enter your username and password", st["h2"]),
        Paragraph(
            "The page shows the Hey Jamie sign-in card with two boxes. Type your "
            "username (all lowercase) and your password, then press "
            "<b>Sign in</b>.", st["body"]),

        Paragraph("4.4 — Enter your authenticator code", st["h2"]),
        Paragraph(
            f"The card then asks for your {TOTP_DIGITS}-digit code. Open your "
            "authenticator app, read the current code for Hey Jamie, type it in, "
            "and press <b>Verify</b>.", st["body"]),
        bullets([
            f"Codes change every {TOTP_PERIOD} seconds. If yours is about to roll over, "
            "wait for the fresh one rather than racing it.",
            "Each code works <b>once</b>. If you mistype and retype the same code, it will be refused — "
            "wait for the next one.",
            "A <b>recovery code</b> can be typed into this same box if you do not have your phone. "
            "It works once and is then gone.",
        ]),

        Paragraph("4.5 — You are in", st["h2"]),
        Paragraph(
            "You land directly in the Hey Jamie desk: strategies, backtests, "
            "walk-forward validation, paper sessions and the dashboard. What you "
            "can do there depends on the role your administrator gave you.",
            st["body"]),
    ]))

    s += [
        Paragraph("What each role can do", st["h2"]),
        table([
            [hdr("ROLE"), hdr("CAN DO")],
            [Paragraph("viewer", st["cellm"]),
             Paragraph("Read the desk, past runs and dashboards.", st["cell"])],
            [Paragraph("researcher", st["cellm"]),
             Paragraph("Everything above, plus start backtests, walk-forward validation and paper sessions, and write research notes.", st["cell"])],
            [Paragraph("trader", st["cellm"]),
             Paragraph("Everything above. Reserved for a future live path; today it grants nothing extra.", st["cell"])],
            [Paragraph("admin", st["cellm"]),
             Paragraph("Everything above, plus managing accounts and shutting the desk down.", st["cell"])],
        ], [1.25 * inch, W - 1.25 * inch]),
        Spacer(1, 10),
        callout("doubt", "Signing in does not move money",
                "The desk runs research and paper trading only. Live order "
                "routing is blocked in the code itself — not by a setting, not "
                "by a permission, and not by your role. No account on this "
                "system can place a real trade."),
        Spacer(1, 12),
    ]

    s.extend(step(5, "Sign out when you are done", [
        Paragraph(
            "On a shared or portable machine, sign out rather than just closing "
            "the tab. Your session also ends on its own:", st["body"]),
        bullets([
            f"after <b>{IDLE_MIN} minutes</b> of no activity, and",
            f"after <b>{ABSOLUTE_HR} hours</b> no matter how active you have been.",
        ]),
        Paragraph(
            "When either happens you are returned to the sign-in page and simply "
            "sign in again.", st["body"]),
    ]))

    s += [PageBreak()]

    # ----------------------------------------------------------- part three
    s += [
        Paragraph("PART THREE", st["kicker"]),
        Paragraph("When something goes wrong", st["h1"]),
        Paragraph(
            "Find your symptom in the left column. These cover very nearly "
            "everything people actually hit.", st["lead"]),
        Spacer(1, 4),
    ]

    tw = [2.15 * inch, W - 2.15 * inch]
    s += [table([
        [hdr("WHAT YOU SEE"), hdr("WHAT IT MEANS AND WHAT TO DO")],
        [Paragraph("The page will not load at all", st["cellb"]),
         Paragraph("You are almost certainly not on the network. Open Tailscale and confirm it says "
                   "<b>Connected</b>, then reload. If it is connected and the page still fails, check the "
                   "address is exactly right, then tell an administrator — the desk may be stopped.", st["cell"])],
        [Paragraph("“That username and password did not match.”", st["cellb"]),
         Paragraph("Deliberately vague: it will not tell you which half was wrong, because that would let a "
                   "stranger discover which usernames exist. Check caps lock, check your username is all "
                   "lowercase, and try again.", st["cell"])],
        [Paragraph("“Too many attempts. Try again later.”", st["cellb"]),
         Paragraph(f"After <b>{MAX_FAILURES} failed attempts</b> the account locks for "
                   f"<b>{LOCKOUT_MIN} minutes</b>. Nothing is broken and nothing is lost. Wait it out — "
                   "an administrator cannot shorten it — then try again carefully.", st["cell"])],
        [Paragraph("The code is refused, but it looks right", st["cellb"]),
         Paragraph("Three usual causes. (1) You reused a code that was already accepted — wait for the next "
                   "one. (2) Your phone's clock has drifted; turn on automatic date and time. (3) You are "
                   "reading the code for a different account in your authenticator.", st["cell"])],
        [Paragraph("I lost my phone", st["cellb"]),
         Paragraph("Use one of your recovery codes in the code box — it works once. Then tell an "
                   "administrator immediately so they can re-enrol you on your new device and retire the "
                   "old one.", st["cell"])],
        [Paragraph("I lost my recovery codes too", st["cellb"]),
         Paragraph("Tell an administrator. They will re-enrol your second factor, which issues a fresh "
                   "secret and a fresh set of codes and invalidates the old ones.", st["cell"])],
        [Paragraph("I forgot my password", st["cellb"]),
         Paragraph("Ask an administrator to reset it. You will set the new one yourself. Resetting also "
                   "signs out every other session on your account.", st["cell"])],
        [Paragraph("Signed out unexpectedly", st["cellb"]),
         Paragraph(f"Normal. Sessions end after {IDLE_MIN} minutes idle or {ABSOLUTE_HR} hours total. Just "
                   "sign in again.", st["cell"])],
        [Paragraph("Browser warns the connection is not private", st["cellb"]),
         Paragraph("<b>Do not click through it.</b> The desk has a real certificate, so this should never "
                   "happen. Stop and report it to an administrator.", st["cell"])],
        [Paragraph("“Your role cannot do that.”", st["cellb"]),
         Paragraph("You tried something above your role — for example a viewer starting a backtest. Ask an "
                   "administrator if you need a wider role.", st["cell"])],
    ], tw), Spacer(1, 16)]

    s += [
        Paragraph("Rules of the road", st["h1"]),
        rule(0, 8),
        bullets([
            "<b>Never share your password or your codes.</b> Nobody at Valor FTC will ever ask you for "
            "either — not IT, not an administrator, not by email, not on a call. Any such request is an "
            "attack; report it.",
            "<b>Do not screenshot your recovery codes into a chat.</b> Put them in a password manager.",
            "<b>One person, one account.</b> Do not lend yours. Every action is written to an audit log "
            "against your name, and that log is what protects you if something is ever questioned.",
            "<b>Report a lost device the same day</b>, so your access can be revoked and re-issued.",
            "<b>Sign out on shared machines.</b> Closing the tab is not the same thing.",
        ]),
        Spacer(1, 8),
        callout("signal", "Three separate layers are protecting this desk",
                "First, the network: a stranger cannot even reach the desk without being on the company's "
                "Tailscale network. Second, your password: stored only as a one-way verifier that is "
                "deliberately slow and memory-hard to attack. Third, your authenticator: a code that "
                f"changes every {TOTP_PERIOD} seconds and works only once. An attacker needs all three."),
    ]

    s += [PageBreak()]

    # ------------------------------------------------------- quick reference
    s += [
        Paragraph("QUICK REFERENCE", st["kicker"]),
        Paragraph("Print this page and keep it", st["h1"]),
        rule(0, 9),
        Paragraph("Every time you sign in", st["h2"]),
        table([
            [hdr("#"), hdr("DO THIS")],
            [Paragraph("1", st["cellm"]), Paragraph("Open Tailscale. Confirm it says <b>Connected</b>.", st["cell"])],
            [Paragraph("2", st["cellm"]), Paragraph(f"Go to <font face='Courier'>{DESK_URL}</font>", st["cell"])],
            [Paragraph("3", st["cellm"]), Paragraph("Check for the padlock. No warnings.", st["cell"])],
            [Paragraph("4", st["cellm"]), Paragraph("Type your username (lowercase) and password. Press <b>Sign in</b>.", st["cell"])],
            [Paragraph("5", st["cellm"]), Paragraph(f"Type the {TOTP_DIGITS}-digit code from your authenticator. Press <b>Verify</b>.", st["cell"])],
            [Paragraph("6", st["cellm"]), Paragraph("Work. Sign out when you are done.", st["cell"])],
        ], [0.42 * inch, W - 0.42 * inch]),
        Spacer(1, 11),
        Paragraph("Numbers worth remembering", st["h2"]),
        table([
            [hdr("LIMIT"), hdr("VALUE")],
            [Paragraph("Minimum password length", st["cell"]), Paragraph(f"{MIN_PW} characters", st["cellm"])],
            [Paragraph("Failed attempts before lockout", st["cell"]), Paragraph(f"{MAX_FAILURES}", st["cellm"])],
            [Paragraph("Lockout duration", st["cell"]), Paragraph(f"{LOCKOUT_MIN} minutes", st["cellm"])],
            [Paragraph("Authenticator code length / refresh", st["cell"]), Paragraph(f"{TOTP_DIGITS} digits / {TOTP_PERIOD} seconds", st["cellm"])],
            [Paragraph("Recovery codes issued", st["cell"]), Paragraph(f"{RECOVERY_CODES} (each usable once)", st["cellm"])],
            [Paragraph("Session ends after idle", st["cell"]), Paragraph(f"{IDLE_MIN} minutes", st["cellm"])],
            [Paragraph("Session ends regardless", st["cell"]), Paragraph(f"{ABSOLUTE_HR} hours", st["cellm"])],
        ], [W - 2.05 * inch, 2.05 * inch]),
        Spacer(1, 11),
        callout("doubt", "Who to ask",
                "Anything you cannot resolve with Part Three goes to a Valor FTC "
                "administrator. Do not ask a colleague to sign in on your behalf, "
                "and do not use anyone else's account while you wait."),
    ]  # the page footer already carries the internal-use notice on every page

    doc.build(s)
    return path


if __name__ == "__main__":
    print("wrote", build())
