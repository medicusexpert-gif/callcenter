/*
    HARMONOGRAM TV - Google Sheets
    Układ arkusza potwierdzony:
      A = Data (np. "poniedziałek, 29 12")
      B... = osoby
    Nie ma osobnej kolumny DATA.
    Liczba osób jest pobierana dynamicznie z pierwszego wiersza.
*/

const SPREADSHEET_ID = "1mOXbnkWc80LKI7D2D3YB--xDGsf7ZLmgSONmf0P_ECk";

const monthNames = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

let currentViewMonth = String(new Date().getMonth() + 1).padStart(2, "0");

function sheetUrl(sheetName) {
    return "https://docs.google.com/spreadsheets/d/" +
        SPREADSHEET_ID +
        "/gviz/tq?tqx=out:csv&sheet=" +
        encodeURIComponent(sheetName);
}

function parseCSVLine(line) {
    const result = [];
    let cur = "";
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (ch === "," && !inQuote) {
            result.push(cur.trim());
            cur = "";
        } else {
            cur += ch;
        }
    }

    result.push(cur.trim());
    return result;
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '"') {
            if (inQuote && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (ch === "," && !inQuote) {
            row.push(cell.trim());
            cell = "";
        } else if ((ch === "\n" || ch === "\r") && !inQuote) {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(cell.trim());
            cell = "";

            if (row.some(v => v !== "")) rows.push(row);
            row = [];
        } else {
            cell += ch;
        }
    }

    row.push(cell.trim());
    if (row.some(v => v !== "")) rows.push(row);

    return rows;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/*
    Arkusz ma:
    A = "poniedziałek, 29 12"
    B = pierwsza osoba
    C = druga osoba
    ...
    I = ósma osoba (w pokazanym arkuszu).

    Dlatego NIE ma już żadnego row[1] jako DATA.
*/
function splitDayAndDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(.+?),\s*(\d{1,2})\s+(\d{1,2})$/);

    if (!match) {
        return { day: text, date: "" };
    }

    return {
        day: match[1].trim(),
        date: `${match[2].padStart(2, "0")}.${match[3].padStart(2, "0")}`
    };
}

function getDateFromSheetCell(value) {
    const text = String(value || "").trim();
    const match = text.match(/(\d{1,2})\s+(\d{1,2})$/);

    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);

    const now = new Date();
    let year = now.getFullYear();

    // Zakładka styczniowa może zawierać 29-31 grudnia poprzedniego roku.
    if (month === 12 && now.getMonth() === 0) {
        year--;
    }

    // Analogicznie dla zakładek miesięcznych zawierających dni z sąsiedniego miesiąca.
    const selectedMonth = Number(currentViewMonth);
    if (month > selectedMonth && selectedMonth <= 2) {
        year--;
    }

    return new Date(year, month - 1, day);
}

function isToday(sheetDateText) {
    const d = getDateFromSheetCell(sheetDateText);
    if (!d) return false;

    const now = new Date();

    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
}

function formatCellContent(text, rowDateText) {
    let content = escapeHTML(text);
    const lower = String(text || "").toLowerCase();

    // Kolorowanie godzin pracy.
    // Najpierw rozpoznajemy pełny zakres, żeby nie kolidować z GDR.
    content = content.replace(
        /\b8\s*-\s*16\b/gi,
        '<span class="neon-blue-text">8-16</span>'
    );

    content = content.replace(
        /\b10\s*-\s*18\b/gi,
        '<span class="neon-pink-text">10-18</span>'
    );

    content = content.replace(
        /\b12\s*-\s*20\b/gi,
        '<span class="neon-green-text">12-20</span>'
    );

    return content;
}

/*
    GDR:
    "GDR 15-16"
    "(GDR 15-16)"
    "8-16 (GDR 15-16)"
    itd.

    Alarm:
    30 minut przed początkiem GDR.
    Np. GDR 15-16 => alarm 14:30-15:00.
*/
function getGdrAlarmInfo(text, rowDateText) {
    const match = String(text || "").match(/\(?\s*GDR\s+(\d{1,2})\s*-\s*(\d{1,2})\s*\)?/i);
    if (!match) return { active: false };

    const startHour = Number(match[1]);
    const startMinute = 0;

    const rowDate = getDateFromSheetCell(rowDateText);
    if (!rowDate) return { active: false };

    const now = new Date();

    if (
        rowDate.getFullYear() !== now.getFullYear() ||
        rowDate.getMonth() !== now.getMonth() ||
        rowDate.getDate() !== now.getDate()
    ) {
        return { active: false };
    }

    const start = new Date(rowDate);
    start.setHours(startHour, startMinute, 0, 0);

    const alarmStart = new Date(start.getTime() - 30 * 60 * 1000);

    return {
        active: now >= alarmStart && now < start
    };
}

async function loadData() {
    const sheetName = monthNames[Number(currentViewMonth) - 1];
    const url = sheetUrl(sheetName);

    try {
        const response = await fetch(url + "&_=" + Date.now(), {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const raw = await response.text();
        const rows = parseCSV(raw);

        if (!rows.length) {
            throw new Error("Google Sheets zwrócił pusty arkusz.");
        }

        // Pierwszy wiersz = nagłówki:
        // A1 = Data
        // B1... = osoby.
        const header = rows[0];

        // B-I w pokazanym arkuszu = 8 osób.
        // Skrypt działa również, gdy osób będzie więcej/mniej.
        const people = header.slice(1);

        let html = "<table>";

        // Pierwsza kolumna to DZIEŃ + DATA.
        // Pozostałe kolumny to osoby.
        html += "<colgroup>";
        html += '<col style="width:13%;">';

        const personWidth = Math.max(8, 87 / Math.max(people.length, 1));
        for (let i = 0; i < people.length; i++) {
            html += `<col style="width:${personWidth}%;">`;
        }
        html += "</colgroup>";

        html += "<thead><tr>";

        html += '<th class="day-cell">DZIEŃ</th>';

        people.forEach(name => {
            html += `<th class="person-name">${escapeHTML(name || "—")}</th>`;
        });

        html += "</tr></thead><tbody>";

        let weekCounter = 0;

        // Dane zaczynają się od drugiego wiersza arkusza.
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const dayCell = row[0] || "";

            if (!dayCell.trim()) continue;

            const parts = splitDayAndDate(dayCell);
            const today = isToday(dayCell);

            if (parts.day.toLowerCase() === "poniedziałek") {
                weekCounter++;
            }

            const weekClass = weekCounter % 2 === 0 ? "week-even" : "week-odd";
            const todayClass = today ? " today-row" : "";

            html += `<tr class="${weekClass}${todayClass}">`;

            html += `
                <td class="day-cell">
                    <span class="day-name">${escapeHTML(parts.day)}</span>
                    <span class="day-date">${escapeHTML(parts.date)}</span>
                </td>
            `;

            // KLUCZOWE:
            // row[1] = pierwsza osoba
            // row[2] = druga osoba
            // ...
            // Nigdy nie traktujemy row[1] jako daty.
            for (let c = 1; c < people.length + 1; c++) {
                const cell = row[c] || "";
                const gdr = getGdrAlarmInfo(cell, dayCell);
                const content = formatCellContent(cell, dayCell);

                const alarmClass = gdr.active ? " alarm-pulse" : "";

                html += `
                    <td class="tech-data${alarmClass}">
                        <div class="marquee-box">
                            <span>${content}</span>
                        </div>
                    </td>
                `;
            }

            html += "</tr>";
        }

        html += "</tbody></table>";

        document.getElementById("table-container").innerHTML = html;
        document.getElementById("update-time").innerText =
            new Date().toLocaleTimeString("pl-PL");

        setTimeout(initSmartMarquee, 100);
    } catch (err) {
        console.error("Błąd Google Sheets:", err);
        document.getElementById("table-container").innerHTML = `
            <div style="padding:30px;text-align:center;color:#f87171;font-size:2vh;">
                Nie udało się pobrać danych z Google Sheets.<br>
                <small>${escapeHTML(err.message)}</small>
            </div>
        `;
        setTimeout(loadData, 10000);
    }
}

function initSmartMarquee() {
    document.querySelectorAll(".tech-data span").forEach(span => {
        const box = span.parentElement;

        span.classList.remove("animate-scroll");
        span.style.removeProperty("--scroll-dist");

        if (span.scrollWidth > box.clientWidth) {
            box.style.justifyContent = "flex-start";

            const distance = span.scrollWidth - box.clientWidth + 25;
            span.style.setProperty("--scroll-dist", `-${distance}px`);
            span.classList.add("animate-scroll");
        } else {
            box.style.justifyContent = "center";
        }
    });
}

function renderNav() {
    let html = "";

    for (let i = 1; i <= 12; i++) {
        const m = String(i).padStart(2, "0");

        html += `
            <button class="nav-btn ${m === currentViewMonth ? "active" : ""}"
                    onclick="changeMonth('${m}')">
                ${monthNames[i - 1]}
            </button>
        `;
    }

    document.getElementById("month-nav").innerHTML = html;
}

function changeMonth(month) {
    currentViewMonth = month;
    renderNav();
    updateClock();
    loadData();
}

function updateClock() {
    const now = new Date();

    const clock = document.getElementById("clock");
    if (clock) {
        clock.innerText = now.toLocaleTimeString("pl-PL");
    }

    const monthHeader = document.getElementById("current-month-name");
    if (monthHeader) {
        monthHeader.innerText =
            monthNames[Number(currentViewMonth) - 1].toUpperCase() +
            " " + now.getFullYear();
    }
}

renderNav();
updateClock();
loadData();

setInterval(updateClock, 1000);

// Odświeżanie danych co 3 minuty.
setInterval(loadData, 180000);

// GDR może rozpocząć/ zakończyć alarm w trakcie minuty,
// dlatego sprawdzamy stan również co 20 sekund.
setInterval(loadData, 20000);
