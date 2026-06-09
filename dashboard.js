let db;
const LOCK_CODE = "SV123";

// --- Date & Time Helpers for 6 AM to 6 AM Shift Day ---
// Converts 12-hour time string to 24-hour format for internal calculations
function convertTo24HourForCalc(timeStr) {
    if (!timeStr || timeStr === '-') return null;
    try {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        hours = parseInt(hours, 10);
        if (modifier === 'PM' && hours !== 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return { hours, minutes: parseInt(minutes, 10) };
    } catch (e) { return null; }
}

// Determines the YYYY-MM-DD string for the "shift day" (6 AM to 6 AM)
function getShiftBoundaryDateString(logDateStr, logTimeStr) {
    const [year, month, day] = logDateStr.split('-').map(Number);
    const timeParts = convertTo24HourForCalc(logTimeStr);
    if (!timeParts) return logDateStr; // Fallback if time format is unexpected or missing

    const logDateTime = new Date(year, month - 1, day, timeParts.hours, timeParts.minutes);
    const shiftBoundaryHour = parseInt(localStorage.getItem('shiftStartHour')) || 6;

    // If the time is before 6 AM, the shift belongs to the previous calendar day
    if (logDateTime.getHours() < shiftBoundaryHour) {
        logDateTime.setDate(logDateTime.getDate() - 1);
    }
    return logDateTime.toISOString().split('T')[0];
}

// Gets the current "shift day" (YYYY-MM-DD)
function getCurrentShiftDay() {
    const now = new Date();
    const boundary = parseInt(localStorage.getItem('shiftStartHour')) || 6;
    if (now.getHours() < boundary) now.setDate(now.getDate() - 1); // If before boundary, shift day started yesterday
    return now.toISOString().split('T')[0];
}

// Shift Config Handlers
function openShiftConfigModal() {
    const current = localStorage.getItem('shiftStartHour') || "6";
    document.getElementById('shiftStartHourSelect').value = current;
    document.getElementById('shiftConfigModal').style.display = 'block';
}

function saveShiftConfig() {
    const hour = document.getElementById('shiftStartHourSelect').value;
    localStorage.setItem('shiftStartHour', hour);
    alert("Shift configuration updated. Reloading...");
    location.reload();
}

// Real-time Clock
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('realtime-clock');
    const dateEl = document.getElementById('realtime-date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString();
    if (dateEl) dateEl.innerText = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// Lock Screen Logic (Shared logic)
function lockScreen() {
    const lockModal = document.getElementById('lockScreenModal');
    if (lockModal) {
        lockModal.style.display = 'flex';
        document.getElementById('lockCodeInput').value = '';
        document.getElementById('lockCodeInput').focus();
        localStorage.setItem('isLocked', 'true');
    }
}

function unlockScreen() {
    const code = document.getElementById('lockCodeInput').value;
    if (code === LOCK_CODE) {
        document.getElementById('lockScreenModal').style.display = 'none';
        sessionStorage.setItem('authenticated', 'true');
        localStorage.removeItem('isLocked');
    } else {
        const lockContent = document.querySelector('.lock-content');
        if (lockContent) {
            lockContent.classList.add('shake');
            setTimeout(() => lockContent.classList.remove('shake'), 400);
        }
        document.getElementById('lockCodeInput').value = '';
    }
}

if (sessionStorage.getItem('authenticated') !== 'true' || localStorage.getItem('isLocked') === 'true') lockScreen();

// Data Loading
const dbRequest = indexedDB.open("SunnyvilleTrackerDB", 3);
dbRequest.onsuccess = (e) => {
    db = e.target.result;
    refreshDashboard();
};

setInterval(refreshDashboard, 30000); // Refresh every 30s

function refreshDashboard() {
    if (!db) return;
    const currentShiftDay = getCurrentShiftDay(); // Use 6 AM to 6 AM day
    const tx = db.transaction(["attendanceLogs", "pickingLogs", "cycleCountLogs"], "readonly");

    let attData = [], pickData = [], countData = [];
    let completed = 0;

    const process = () => {
        completed++;
        if (completed < 3) return;

        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();

        // 1. Attendance Stats
        const todayAtt = attData.filter(l => {
            if (l.timeIn === '-') return false;
            return getShiftBoundaryDateString(l.date, l.timeIn) === currentShiftDay;
        });
        document.getElementById('dash-totalIn').innerText = todayAtt.filter(l => l.timeIn !== '-' && l.timeOut === '-').length;
        document.getElementById('dash-onBreak').innerText = todayAtt.filter(l => l.breakOut !== '-' && l.breakIn === '-').length;
        document.getElementById('dash-finishedAtt').innerText = todayAtt.filter(l => l.timeOut !== '-').length;

        // 2. Picking Stats
        const activePick = pickData.filter(l => l.endTime === '-');
        const finishedPickToday = pickData.filter(l => 
            l.endTime !== '-' && getShiftBoundaryDateString(l.date, l.startTime) === currentShiftDay
        );
        document.getElementById('dash-activePicks').innerText = activePick.length;
        document.getElementById('dash-doneBatches').innerText = [...new Set(finishedPickToday.map(l => l.batchId))].length;
        document.getElementById('dash-longPicks').innerText = activePick.filter(l => (currentMins - parseTimeToMinutes(l.startTime)) > 60).length;

        // 3. Cycle Count Stats
        const activeCount = countData.filter(l => l.endTime === '-');
        const finishedCountToday = countData.filter(l => 
            l.endTime !== '-' && getShiftBoundaryDateString(l.date, l.startTime) === currentShiftDay
        );
        document.getElementById('dash-activeCounts').innerText = activeCount.length;
        document.getElementById('dash-doneCounts').innerText = finishedCountToday.length;
        document.getElementById('dash-zones').innerText = [...new Set(finishedCountToday.map(l => l.zone))].filter(z => z).length;

        // 4. Idle Personnel Logic
        // Filter users who are currently timed in but not timed out
        const currentlyTimedIn = todayAtt.filter(l => l.timeIn !== '-' && l.timeOut === '-');
        const pickingUserIds = new Set(activePick.map(p => p.userId));
        const countingUserIds = new Set(activeCount.map(c => c.userId));

        const idle = currentlyTimedIn.filter(u => !pickingUserIds.has(u.userId) && !countingUserIds.has(u.userId));
        
        const idleCountBadge = document.getElementById('dash-idleCount');
        if (idleCountBadge) {
            idleCountBadge.innerText = idle.length;
            // Highlight in red if count exceeds 5 people
            idleCountBadge.style.backgroundColor = idle.length > 5 
                ? 'var(--danger)' 
                : 'var(--accent)';
        }

        const idleBody = document.getElementById('dash-idleBody');
        if (idleBody) {
            idleBody.innerHTML = idle.length > 0
                ? idle.map(u => `<tr><td><strong>${u.userId}</strong></td><td>${u.name}<br><small>${u.company || '-'}</small></td></tr>`).join('')
                : '<tr><td colspan="2" style="text-align:center; padding: 10px; opacity: 0.5;">No idle personnel</td></tr>';
        }
    };

    tx.objectStore("attendanceLogs").getAll().onsuccess = (e) => { attData = e.target.result; process(); };
    tx.objectStore("pickingLogs").getAll().onsuccess = (e) => { pickData = e.target.result; process(); };
    tx.objectStore("cycleCountLogs").getAll().onsuccess = (e) => { countData = e.target.result; process(); };
}

function parseTimeToMinutes(s) {
    try {
        let [t, m] = s.split(' ');
        let [h, min] = t.split(':').map(Number);
        if (m === 'PM' && h !== 12) h += 12;
        if (m === 'AM' && h === 12) h = 0;
        return h * 60 + min;
    } catch(e) { return 0; }
}

function clearAllData() {
    if (confirm("WARNING: This will permanently delete ALL logs, user data, and activity history. Are you sure?")) {
        const req = indexedDB.deleteDatabase("SunnyvilleTrackerDB");
        req.onsuccess = () => {
            localStorage.clear();
            alert("System data cleared. The application will now reload.");
            location.reload();
        };
        req.onerror = () => alert("Error: Could not clear database.");
        req.onblocked = () => alert("Database is blocked. Please close other open tabs and try again.");
    }
}

function clearDataByPeriod() {
    const from = document.getElementById('clearFrom').value;
    const to = document.getElementById('clearTo').value;

    if (!from || !to) {
        alert("Please select both From and To dates");
        return;
    }

    if (confirm(`Are you sure you want to delete all activity logs between ${from} and ${to}? This cannot be undone.`)) {
        const tx = db.transaction(["attendanceLogs", "pickingLogs", "cycleCountLogs"], "readwrite");
        
        const clearStore = (storeName) => {
            const store = tx.objectStore(storeName);
            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const log = cursor.value;
                    if (log.date >= from && log.date <= to) store.delete(cursor.key);
                    cursor.continue();
                }
            };
        };

        ["attendanceLogs", "pickingLogs", "cycleCountLogs"].forEach(clearStore);
        tx.oncomplete = () => {
            alert("Data cleared for selected period.");
            location.reload();
        };
    }
}