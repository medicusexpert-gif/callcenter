/*
  HARMONOGRAM TV – Google Sheets
  Arkusz: 1mOXbnkWc80LKI7D2D3YB--xDGsf7ZLmgSONmf0P_ECk

  Układ arkusza:
  wiersz 1: nagłówek z imionami osób
  wiersz 2: pomocniczy/opisowy – NIE jest wyświetlany na TV
  od wiersza 3: dzień | data | osoba 1 | osoba 2 | ...

  Ważne:
  - wszystkie dni są wyświetlane, także soboty i niedziele
  - liczba osób jest pobierana automatycznie z arkusza
  - imiona są pobierane z Google Sheets przy każdym odświeżeniu
*/

const SPREADSHEET_ID = "1mOXbnkWc80LKI7D2D3YB--xDGsf7ZLmgSONmf0P_ECk";

const monthNames = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

// Jeżeli nazwy zakładek są inne, zmień tylko tę tablicę.
const sheetNames = [...monthNames];

const REFRESH_MS = 3 * 60 * 1000;
const DATA_START_ROW = 2; // indeks 2 = trzeci wiersz arkusza

let currentViewMonth = String(new Date().getMonth() + 1).padStart(2, "0");
let refreshTimer = null;

const personColors = [
    "#38bdf8", "#818cf8", "#fbbf24", "#f472b6", "#34d399",
    "#fb7185", "#a78bfa", "#22d3ee", "#f59e0b", "#4ade80"
];

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function parseCSVLine(line) {
    const result = [];
    let cur = "";
    let inQuote = false;
    const sep = line.includes(";") ? ";" : ",";

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuote && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === sep && !inQuote) {
            result.push(cur.trim());
            cur = "";
        } else {
            cur += char;
        }
    }

    result.push(cur.trim());
    return result;
}

function parseCSV(rawData) {
    return rawData
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(line => line.trim() !== "")
        .map(parseCSVLine);
}

function buildSheetUrl(monthNumber) {
    const sheetName = sheetNames[parseInt(monthNumber, 10) - 1];
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function normalizeDate(value) {
    if (!value) return "";
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;

    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;

    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);
    if (match) return `20${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;

    return "";
}

function getDateFromRow(row) {
    if (!row || !row[1]) return null;
    const normalized = normalizeDate(row[1]);
    if (!normalized) return null;

    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatFullDate(value) {
    const normalized = normalizeDate(value);
    if (!normalized) return value || "";
    const [year, month, day] = normalized.split("-");
    return `${day}.${month}.${year}`;
}

function getDayNameFromDate(date) {
    if (!date) return "";
    return new Intl.DateTimeFormat("pl-PL", { weekday: "long" }).format(date);
}

function isToday(row) {
    const date = getDateFromRow(row);
    if (!date) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth() === now.getMonth() &&
           date.getDate() === now.getDate();
}

function makeTextContent(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " • ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/*
  Zwraca godziny GDR z tekstu, np.:
  "8-16 GDR 15-16" -> { start: 15, end: 16 }
  Działa również dla "(GDR 15-16)".
*/
function getGdrRange(text) {
    const match = String(text).match(/(?:\(|\s|^)GDR\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/i);
    if (!match) return null;

    const startHour = Number(match[1]);
    const startMinute = match[2] ? Number(match[2]) : 0;
    const endHour = Number(match[3]);
    const endMinute = match[4] ? Number(match[4]) : 0;

    if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;

    return {
        start: startHour * 60 + startMinute,
        end: endHour * 60 + endMinute
    };
}

function currentMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

/*
  Alarm GDR:
  - tylko dla dzisiejszego dnia
  - start dokładnie 30 minut przed początkiem GDR
  - kończy się w momencie rozpoczęcia GDR
  - nie ma już starego alarmu dla 8-16 o 15:30
*/
function shouldGdrAlarm(row, cellText) {
    if (!isToday(row)) return false;

    const gdr = getGdrRange(cellText);
    if (!gdr) return false;

    const now = currentMinutes();
    return now >= gdr.start - 30 && now < gdr.start;
}

function highlightSpecialText(text) {
    let safe = escapeHtml(makeTextContent(text));

    // 8-16 – niebieski
    safe = safe.replace(/8-16/gi, '<span class="neon-blue-text">8-16</span>');

    // 10-18 – różowy
    safe = safe.replace(/10-18/gi, '<span class="neon-pink-text">10-18</span>');

    // 12-20 – zielony
    safe = safe.replace(/12-20/gi, '<span class="neon-green-text">12-20</span>');

    return safe;
}

function renderTable(rows) {
    if (!rows.length) {
        return `<div class="error-box">Brak danych w zakładce ${escapeHtml(sheetNames[parseInt(currentViewMonth, 10) - 1])}.</div>`;
    }

    // Pierwszy wiersz = imiona. Drugi wiersz = opis pomocniczy, pomijamy go.
    const headerRow = rows[0];
    const dataRows = rows.slice(DATA_START_ROW);
    const columnCount = Math.max(headerRow.length, ...dataRows.map(row => row.length), 2);

    let html = "<table>";
    html += "<colgroup>";
    html += '<col class="col-day">';
    html += '<col class="col-date">';
    for (let i = 2; i < columnCount; i++) html += '<col class="col-person">';
    html += "</colgroup>";

    // JEDEN nagłówek – bez dodatkowego wiersza pod imionami.
    html += '<thead><tr class="header-row">';
    html += '<th class="day-header">DZIEŃ</th>';
    html += '<th class="date-header">DATA</th>';

    for (let j = 2; j < columnCount; j++) {
        const name = headerRow[j] || "";
        const color = personColors[j - 2] || personColors[(j - 2) % personColors.length];
        html += `<th class="person-header" style="--person-color:${color}">${escapeHtml(name)}</th>`;
    }
    html += "</tr></thead>";

    html += "<tbody>";
    let weekCounter = 0;

    dataRows.forEach((row) => {
        const date = getDateFromRow(row);

        if (date && date.getDay() === 1) weekCounter++;

        const weekClass = weekCounter % 2 === 0 ? "week-even" : "week-odd";
        const todayClass = isToday(row) ? " today-row" : "";

        html += `<tr class="${weekClass}${todayClass}">`;

        const fullDayName = date ? getDayNameFromDate(date) : (row[0] || "");
        const displayedDate = date ? formatFullDate(row[1]) : (row[1] || "");

        html += `<td class="day">${escapeHtml(fullDayName)}</td>`;
        html += `<td class="date">${escapeHtml(displayedDate)}</td>`;

        for (let j = 2; j < columnCount; j++) {
            const cell = row[j] || "";
            const color = personColors[j - 2] || personColors[(j - 2) % personColors.length];
            const cellText = makeTextContent(cell);
            const gdrAlarm = shouldGdrAlarm(row, cellText);

            const specialClass = gdrAlarm ? " alarm-pulse" : "";

            html += `
                <td class="tech-data${specialClass}" style="--person-color:${color}">
                    <div class="marquee-box">
                        <span>${highlightSpecialText(cellText)}</span>
                    </div>
                </td>`;
        }

        html += "</tr>";
    });

    html += "</tbody></table>";
    return html;
}

async function loadData() {
    const url = buildSheetUrl(currentViewMonth);
    const monthName = sheetNames[parseInt(currentViewMonth, 10) - 1];

    try {
        const response = await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const rawData = await response.text();

        if (rawData.includes("<!DOCTYPE html") || rawData.includes("<html") || rawData.toLowerCase().includes("sign in")) {
            throw new Error("Arkusz Google nie jest publicznie dostępny dla TV.");
        }

        const rows = parseCSV(rawData);
        if (!rows.length) throw new Error("Arkusz nie zawiera danych.");

        document.getElementById("table-container").innerHTML = renderTable(rows);

        const updateTime = document.getElementById("update-time");
        if (updateTime) updateTime.innerText = new Date().toLocaleTimeString("pl-PL");

        setTimeout(initSmartMarquee, 150);
    } catch (error) {
        console.error("Błąd pobierania Google Sheets:", error);
        document.getElementById("table-container").innerHTML = `
            <div class="error-box">
                <strong>Nie można pobrać danych z Google Sheets.</strong><br>
                Zakładka: ${escapeHtml(monthName)}<br>
                <small>${escapeHtml(error.message)}</small>
            </div>`;
    }
}

function initSmartMarquee() {
    const spans = document.querySelectorAll(".tech-data span");

    spans.forEach(span => {
        const box = span.parentElement;
        span.classList.remove("animate-scroll");
        span.style.removeProperty("--scroll-dist");

        if (span.scrollWidth > box.clientWidth) {
            box.style.justifyContent = "flex-start";
            const distance = span.scrollWidth - box.clientWidth + 30;
            span.style.setProperty("--scroll-dist", `-${distance}px`);
            span.classList.add("animate-scroll");
        } else {
            box.style.justifyContent = "center";
        }
    });
}

function renderNav() {
    const nav = document.getElementById("month-nav");
    if (!nav) return;

    nav.innerHTML = monthNames.map((name, index) => {
        const monthNumber = String(index + 1).padStart(2, "0");
        return `
            <button class="nav-btn ${monthNumber === currentViewMonth ? "active" : ""}"
                    onclick="changeMonth('${monthNumber}')">
                ${escapeHtml(name)}
            </button>`;
    }).join("");
}

function changeMonth(monthNumber) {
    currentViewMonth = String(monthNumber).padStart(2, "0");
    renderNav();
    updateClock();
    loadData();
}

function updateClock() {
    const now = new Date();
    const clock = document.getElementById("clock");
    if (clock) clock.innerText = now.toLocaleTimeString("pl-PL");

    const monthHeader = document.getElementById("current-month-name");
    if (monthHeader) {
        monthHeader.innerText = `${monthNames[parseInt(currentViewMonth, 10) - 1].toUpperCase()} ${now.getFullYear()}`;
    }
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadData, REFRESH_MS);
}

renderNav();
updateClock();
loadData();
startAutoRefresh();
setInterval(updateClock, 1000);
