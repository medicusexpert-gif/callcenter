/*
  HARMONOGRAM TV – Google Sheets
  Arkusz Google:
  https://docs.google.com/spreadsheets/d/1mOXbnkWc80LKI7D2D3YB--xDGsf7ZLmgSONmf0P_ECk/edit

  Założenie układu każdego arkusza:
  wiersz 1: MIESIĄC | [puste] | IMIĘ 1 | IMIĘ 2 | ... | IMIĘ 7
  wiersz 2:          | [puste] | opis 1 | opis 2 | ... | opis 7
  kolejne: dzień     | data     | zadanie | zadanie | ... | zadanie

  WAŻNE:
  - arkusz Google musi być dostępny publicznie do odczytu dla TV
  - nazwy zakładek poniżej muszą odpowiadać nazwom zakładek w Google Sheets
*/

const SPREADSHEET_ID = "1mOXbnkWc80LKI7D2D3YB--xDGsf7ZLmgSONmf0P_ECk";

const monthNames = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

/*
  Jeżeli zakładki w Google Sheets nazywają się inaczej,
  zmieniamy TYLKO tę tablicę.
*/
const sheetNames = [...monthNames];

const logoUrl = "logo.png";
const REFRESH_MS = 3 * 60 * 1000; // 3 minuty

let currentViewMonth = String(new Date().getMonth() + 1).padStart(2, "0");
let refreshTimer = null;

// Kolory kolejnych techników – jest ich 7, ale liczba może być większa.
const personColors = [
    "#38bdf8",
    "#818cf8",
    "#fbbf24",
    "#f472b6",
    "#34d399",
    "#fb7185",
    "#a78bfa",
    "#22d3ee",
    "#f59e0b",
    "#4ade80"
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
            // Obsługa podwójnego cudzysłowu wewnątrz komórki CSV
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

    // Google Visualization zwraca CSV dla konkretnej zakładki.
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function normalizeDate(value) {
    if (!value) return "";

    const text = String(value).trim();

    // RRRR-MM-DD
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }

    // DD.MM.RRRR
    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }

    // DD.MM.RR – awaryjnie
    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);
    if (match) {
        return `20${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }

    return "";
}

function formatFullDate(value) {
    const normalized = normalizeDate(value);
    if (!normalized) return value || "";

    const [year, month, day] = normalized.split("-");
    return `${day}.${month}.${year}`;
}

function getDateFromRow(row) {
    if (!row || !row[1]) return null;

    const normalized = normalizeDate(row[1]);
    if (!normalized) return null;

    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function getDayNameFromDate(date) {
    if (!date || Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("pl-PL", {
        weekday: "long"
    }).format(date);
}

function getMonthFromRow(row) {
    const date = getDateFromRow(row);
    return date ? String(date.getMonth() + 1).padStart(2, "0") : null;
}

function isToday(row) {
    const date = getDateFromRow(row);
    if (!date) return false;

    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

function makeTextContent(value) {
    /*
      Zachowujemy tekst z arkusza.
      Entery w komórce zamieniamy na " • ", aby TV wyświetlał
      zadanie w jednej czytelnej linii.
    */
    return String(value ?? "")
        .replace(/\r?\n/g, " • ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function highlightSpecialText(text) {
    let safe = escapeHtml(makeTextContent(text));

    // Podświetlenie 8-16, niezależnie od wielkości liter.
    safe = safe.replace(/8-16/gi, '<span class="neon-blue-text">8-16</span>');

    return safe;
}

function renderTable(rows) {
    if (!rows.length) {
        return `<div class="error-box">Brak danych w zakładce ${escapeHtml(sheetNames[parseInt(currentViewMonth, 10) - 1])}.</div>`;
    }

    /*
      Liczba kolumn jest pobierana z arkusza.
      Dzięki temu zmiana liczby osób nie wymaga zmiany kodu.
    */
    const columnCount = Math.max(...rows.map(row => row.length));

    let html = "<table>";

    // 2 pierwsze kolumny = dzień + data.
    // Pozostałe kolumny = technicy.
    html += "<colgroup>";
    html += '<col class="col-day">';
    html += '<col class="col-date">';

    for (let i = 2; i < columnCount; i++) {
        html += '<col class="col-person">';
    }

    html += "</colgroup>";

    let weekCounter = 0;

    rows.forEach((row, rowIndex) => {
        const date = getDateFromRow(row);

        if (rowIndex >= 2 && date && date.getDay() === 1) {
            weekCounter++;
        }

        const weekClass = weekCounter % 2 === 0 ? "week-even" : "week-odd";
        const todayClass = rowIndex >= 2 && isToday(row) ? " today-row" : "";

        html += `<tr class="${weekClass}${todayClass}">`;

        /*
          WIERSZ 1 – nagłówki osób
        */
        if (rowIndex === 0) {
            html += `<th class="logo-space" rowspan="2" colspan="2" id="main-logo-container"></th>`;

            for (let j = 2; j < columnCount; j++) {
                const name = row[j] || "";
                const color = personColors[j - 2] || personColors[(j - 2) % personColors.length];

                html += `
                    <th class="person-header"
                        style="--person-color:${color}">
                        ${escapeHtml(name)}
                    </th>`;
            }

            html += "</tr>";
            return;
        }

        /*
          WIERSZ 2 – drugi wiersz nagłówka
        */
        if (rowIndex === 1) {
            html += `<th class="sub-header-empty"></th>`;
            html += `<th class="sub-header-empty"></th>`;

            for (let j = 2; j < columnCount; j++) {
                html += `
                    <th class="person-subheader">
                        ${escapeHtml(row[j] || "")}
                    </th>`;
            }

            html += "</tr>";
            return;
        }

        /*
          WIERSZE DANYCH
          Pokazujemy WSZYSTKIE dni – również soboty i niedziele.
        */
        const fullDayName = date
            ? getDayNameFromDate(date)
            : (row[0] || "");

        const displayedDate = date
            ? formatFullDate(row[1])
            : (row[1] || "");

        html += `
            <td class="day">${escapeHtml(fullDayName)}</td>
            <td class="date">${escapeHtml(displayedDate)}</td>
        `;

        for (let j = 2; j < columnCount; j++) {
            const cell = row[j] || "";
            const color = personColors[j - 2] || personColors[(j - 2) % personColors.length];
            const cellText = makeTextContent(cell);
            let specialClass = "";

            const now = new Date();
            const isAlarmTime =
                now.getHours() > 15 ||
                (now.getHours() === 15 && now.getMinutes() >= 30);

            if (isToday(row) && /8-16/i.test(cellText) && isAlarmTime) {
                specialClass = " alarm-pulse";
            }

            html += `
                <td class="tech-data${specialClass}"
                    style="--person-color:${color}">
                    <div class="marquee-box">
                        <span>${highlightSpecialText(cellText)}</span>
                    </div>
                </td>
            `;
        }

        html += "</tr>";
    });

    html += "</table>";
    return html;
}

async function loadData() {
    const url = buildSheetUrl(currentViewMonth);
    const monthName = sheetNames[parseInt(currentViewMonth, 10) - 1];

    try {
        const response = await fetch(`${url}&_=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawData = await response.text();

        // Jeżeli Google zwróci stronę logowania / komunikat zamiast CSV,
        // pokażemy jasny komunikat na TV.
        if (
            rawData.includes("<!DOCTYPE html") ||
            rawData.includes("<html") ||
            rawData.toLowerCase().includes("sign in")
        ) {
            throw new Error("Arkusz Google nie jest publicznie dostępny dla TV.");
        }

        const rows = parseCSV(rawData);

        if (!rows.length) {
            throw new Error("Arkusz nie zawiera danych.");
        }

        document.getElementById("table-container").innerHTML = renderTable(rows);

        const logoCont = document.getElementById("main-logo-container");
        if (logoCont) {
            logoCont.innerHTML = `<img src="${logoUrl}" alt="Medicus" class="table-logo">`;
        }

        const updateTime = document.getElementById("update-time");
        if (updateTime) {
            updateTime.innerText = new Date().toLocaleTimeString("pl-PL");
        }

        setTimeout(initSmartMarquee, 200);
    } catch (error) {
        console.error("Błąd pobierania Google Sheets:", error);

        document.getElementById("table-container").innerHTML = `
            <div class="error-box">
                <strong>Nie można pobrać danych z Google Sheets.</strong><br>
                Zakładka: ${escapeHtml(monthName)}<br>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
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

    let navHtml = "";

    monthNames.forEach((name, index) => {
        const monthNumber = String(index + 1).padStart(2, "0");

        navHtml += `
            <button
                class="nav-btn ${monthNumber === currentViewMonth ? "active" : ""}"
                onclick="changeMonth('${monthNumber}')">
                ${escapeHtml(name)}
            </button>
        `;
    });

    nav.innerHTML = navHtml;
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
    if (clock) {
        clock.innerText = now.toLocaleTimeString("pl-PL");
    }

    const monthHeader = document.getElementById("current-month-name");
    if (monthHeader) {
        const year = now.getFullYear();
        monthHeader.innerText =
            `${monthNames[parseInt(currentViewMonth, 10) - 1].toUpperCase()} ${year}`;
    }
}

function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {
        loadData();
    }, REFRESH_MS);
}

// Start
renderNav();
updateClock();
loadData();
startAutoRefresh();

setInterval(updateClock, 1000);
