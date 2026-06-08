
let cycleCountLogs = [];
let userMasterData = [];
let db;
let countCurrentPage = 1;
const countRowsPerPage = 5;
let currentCountTab = 'Counting';
let tempStartData = null;
let summaryCurrentPage = 1;
const summaryRowsPerPage = 5;
let currentSummaryType = '';
let currentSort = { field: 'id', direction: 'desc' };

// Lock Screen Logic
let idleTimer;
const IDLE_TIME = 15 * 60 * 1000; // 15 Minutes
const LOCK_CODE = "SV123";

function resetIdleTimer() {
    clearTimeout(idleTimer);
    const lockModal = document.getElementById('lockScreenModal');
    if (!lockModal || lockModal.style.display === 'none' || lockModal.style.display === '') {
        idleTimer = setTimeout(lockScreen, IDLE_TIME);
    }
}

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
        showToast("System unlocked", "success");
        sessionStorage.setItem('authenticated', 'true');
        localStorage.removeItem('isLocked');
        resetIdleTimer();
    } else {
        showToast("Incorrect security code", "danger");
        document.getElementById('lockCodeInput').value = '';
        const lockContent = document.querySelector('.lock-content');
        if (lockContent) {
            lockContent.classList.add('shake');
            setTimeout(() => lockContent.classList.remove('shake'), 400);
        }
    }
}

const dbRequest = indexedDB.open("SunnyvilleTrackerDB", 3);
dbRequest.onsuccess = (e) => {
    db = e.target.result;
    loadData();
};

setInterval(() => {
    if (currentCountTab === 'Counting') renderCycleCountTable();
    if (document.getElementById('summaryModal').style.display === 'block') renderSummaryModalContent();
}, 30000);

// Global events to track activity for auto-lock
window.onload = () => {
    resetIdleTimer();
    showTableSkeletons('countBody', 5, 10);
};

if (sessionStorage.getItem('authenticated') !== 'true' || localStorage.getItem('isLocked') === 'true') {
    lockScreen();
}
window.onmousemove = resetIdleTimer;

function showTableSkeletons(tbodyId, rows, cols) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    let html = '';
    for (let i = 0; i < rows; i++) {
        html += `<tr>${'<td><div class="skeleton"></div></td>'.repeat(cols)}</tr>`;
    }
    tbody.innerHTML = html;
}

window.onmousedown = resetIdleTimer;
window.ontouchstart = resetIdleTimer;
window.onkeypress = resetIdleTimer;

dbRequest.onupgradeneeded = function(event) {
    const database = event.target.result;
    if (!database.objectStoreNames.contains("attendanceLogs")) {
        database.createObjectStore("attendanceLogs", { keyPath: ["userId", "date"] });
    }
    if (!database.objectStoreNames.contains("userMasterData")) {
        database.createObjectStore("userMasterData", { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains("pickingLogs")) {
        database.createObjectStore("pickingLogs", { keyPath: "id", autoIncrement: true });
    }
    if (!database.objectStoreNames.contains("cycleCountLogs")) {
        database.createObjectStore("cycleCountLogs", { keyPath: "id", autoIncrement: true });
    }
};

function loadData() {
    const tx = db.transaction(["cycleCountLogs", "userMasterData"], "readonly");
    tx.objectStore("cycleCountLogs").getAll().onsuccess = (e) => {
        cycleCountLogs = e.target.result;
        renderCycleCountTable();
    };
    tx.objectStore("userMasterData").getAll().onsuccess = (e) => {
        userMasterData = e.target.result;
    };
}

document.getElementById('countUserId').addEventListener('input', (e) => {
    const input = e.target.value.trim();
    if (input.includes(',')) {
        const ids = input.split(',').map(id => id.trim()).filter(id => id !== '');
        const names = ids.map(id => {
            const user = userMasterData.find(u => u.id === id);
            return user ? user.name : null;
        }).filter(name => name !== null);
        document.getElementById('countUserName').value = names.length > 0 ? names.join('\n') : '';
    } else {
        const user = userMasterData.find(u => u.id === input);
        document.getElementById('countUserName').value = user ? user.name : '';
    }
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle' : (type === 'danger' ? 'exclamation-circle' : 'info-circle');
    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function processCycleCount(action) {
    const userIdInput = document.getElementById('countUserId').value.trim();
    const countRefId = document.getElementById('countRefId').value.trim();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];

    if (action === 'START') {
        const userIds = userIdInput.split(',').map(id => id.trim()).filter(id => id !== '');
        if (userIds.length === 0) return showToast("Enter at least one User ID", "warning");
        if (!countRefId) return showToast("Count ID is required to start!", "warning");
        const unregistered = userIds.filter(id => !userMasterData.some(u => u.id === id));
        if (unregistered.length > 0) return showToast(`Unregistered IDs: ${unregistered.join(', ')}`, "danger");
        const busy = userIds.filter(id => cycleCountLogs.some(l => l.userId === id && l.endTime === '-'));
        if (busy.length > 0) return showToast(`Users already counting: ${busy.join(', ')}`, "warning");

        tempStartData = { ids: userIds, countRefId, date: dateStr, startTime: timeStr, endTime: '-', duration: '-' };
        document.getElementById('zoneModal').style.display = 'block';
    } else {
        const log = cycleCountLogs.slice().reverse().find(l => l.userId === userIdInput && l.endTime === '-');
        if (!log) return showToast("No active count found for this user", "warning");
        log.endTime = timeStr;
        log.duration = calculateDuration(log.startTime, log.endTime);
        db.transaction("cycleCountLogs", "readwrite").objectStore("cycleCountLogs").put(log).onsuccess = () => {
            completeAction("END", userIdInput);
        };
    }
}

function closeZoneModal() {
    document.getElementById('zoneModal').style.display = 'none';
    tempStartData = null;
}

function confirmStartCycleCount(zone) {
    if (!tempStartData) return;
    const tx = db.transaction("cycleCountLogs", "readwrite");
    const store = tx.objectStore("cycleCountLogs");
    tempStartData.ids.forEach(id => {
        const user = userMasterData.find(u => u.id === id);
        const newLog = { userId: id, name: user.name, company: user.company || '-', countRefId: tempStartData.countRefId, date: tempStartData.date, startTime: tempStartData.startTime, endTime: tempStartData.endTime, duration: tempStartData.duration, zone };
        store.add(newLog).onsuccess = (e) => {
            newLog.id = e.target.result;
            cycleCountLogs.push(newLog);
        };
    });
    tx.oncomplete = () => {
        completeAction("START", tempStartData.ids.join(', '));
        document.getElementById('zoneModal').style.display = 'none';
        tempStartData = null;
    };
}

function calculateDuration(start, end) {
    const parse = (s) => {
        let [t, m] = s.split(' ');
        let [h, min] = t.split(':').map(Number);
        if (m === 'PM' && h !== 12) h += 12;
        if (m === 'AM' && h === 12) h = 0;
        return h * 60 + min;
    };
    let diff = parse(end) - parse(start);
    if (diff < 0) diff += 1440; 
    return diff > 0 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
}

function getDurationMinutes(start, end) {
    const parse = (s) => {
        let [t, m] = s.split(' ');
        let [h, min] = t.split(':').map(Number);
        if (m === 'PM' && h !== 12) h += 12;
        if (m === 'AM' && h === 12) h = 0;
        return h * 60 + min;
    };
    let diff = parse(end) - parse(start);
    return diff < 0 ? diff + 1440 : diff;
}

function completeAction(type, id) {
    showToast(`Count ${type} recorded for ${id}`, "success");
    document.getElementById('countUserId').value = '';
    document.getElementById('countRefId').value = '';
    document.getElementById('countUserName').value = '';
    countCurrentPage = 1;
    renderCycleCountTable();
    const status = document.getElementById('scanStatus');
    status.innerText = `LAST ACTION: ${type} (${id})`;
    setTimeout(() => status.innerText = 'READY TO SCAN', 3000);
}

function sortData(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    renderCycleCountTable();
}

function renderCycleCountTable() {
    const tbody = document.getElementById('countBody');
    const search = document.getElementById('countSearch').value.toLowerCase();
    const zoneSearch = document.getElementById('zoneSearch').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    tbody.innerHTML = '';
    let filtered = cycleCountLogs.filter(l => 
        (l.userId.toLowerCase().includes(search) || l.countRefId.toLowerCase().includes(search) || (l.name && l.name.toLowerCase().includes(search))) &&
        (zoneSearch === "" || l.zone === zoneSearch) &&
        (!dateFrom || l.date >= dateFrom) &&
        (!dateTo || l.date <= dateTo) &&
        (currentCountTab === 'Counting' ? l.endTime === '-' : l.endTime !== '-')
    );

    // Apply Sorting
    filtered.sort((a, b) => {
        let valA = a[currentSort.field] || '';
        let valB = b[currentSort.field] || '';
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        
        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(filtered.length / countRowsPerPage) || 1;
    if (countCurrentPage > totalPages) countCurrentPage = totalPages;
    const start = (countCurrentPage - 1) * countRowsPerPage;
    const paginatedData = filtered.slice(start, start + countRowsPerPage);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let html = '';
    paginatedData.forEach(log => {
        let displayDuration = log.duration;
        if (log.endTime === '-') displayDuration = `<span style="color: var(--accent); font-weight: bold;"><i class="fas fa-sync fa-spin"></i> ${calculateDuration(log.startTime, nowTime)}</span>`;
        html += `<tr><td><strong>${log.userId}</strong></td><td>${log.name || 'Unknown'}</td><td>${log.company || '-'}</td><td>${log.countRefId}</td><td>${log.zone || '-'}</td><td>${log.date}</td><td>${log.startTime}</td><td>${log.endTime}</td><td>${displayDuration}</td><td>${log.endTime === '-' ? `<button class="edit-btn" onclick="quickEndCount(${log.id})"><i class="fas fa-stop"></i></button>` : ''}<button class="delete-btn" onclick="deleteCount(${log.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tbody.innerHTML = html;
    renderCountPagination(filtered.length);
    updateCountStats();
}

function updateCountStats() {
    const active = cycleCountLogs.filter(l => l.endTime === '-');
    const today = new Date().toISOString().split('T')[0];
    const finishedToday = cycleCountLogs.filter(l => l.endTime !== '-' && l.date === today);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('stat-uniqueCounters').innerText = [...new Set(active.map(l => l.userId))].length;
    document.getElementById('stat-uniqueCountsCounting').innerText = [...new Set(active.map(l => l.countRefId))].length;
    document.getElementById('stat-uniqueCountsCounted').innerText = [...new Set(finishedToday.map(l => l.countRefId))].length;
    const longCount = active.filter(l => getDurationMinutes(l.startTime, nowTime) > 60).length;
    document.getElementById('stat-longCounts').innerText = longCount;
    const card = document.getElementById('longCountCard');
    longCount > 0 ? card.classList.add('blink-danger') : card.classList.remove('blink-danger');
}

function openSummaryModal(type) {
    currentSummaryType = type;
    summaryCurrentPage = 1;
    renderSummaryModalContent();
    document.getElementById('summaryModal').style.display = 'block';
}

function renderSummaryModalContent() {
    const tbody = document.getElementById('summaryModalBody');
    const title = document.getElementById('summaryModalTitle');
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let list = [];
    if (currentSummaryType === 'active') {
        title.innerText = "Active Counters";
        list = cycleCountLogs.filter(l => l.endTime === '-');
    } else if (currentSummaryType === 'longCount') {
        title.innerText = "Long Counting Sessions (>1hr)";
        list = cycleCountLogs.filter(l => l.endTime === '-' && getDurationMinutes(l.startTime, nowTime) > 60);
    } else if (currentSummaryType === 'countsCounting') {
        title.innerText = "Active Counts";
        list = cycleCountLogs.filter(l => l.endTime === '-');
    } else if (currentSummaryType === 'countsCounted') {
        title.innerText = "Counts Completed Today";
        list = cycleCountLogs.filter(l => l.endTime !== '-' && l.date === today);
    }

    const totalPages = Math.ceil(list.length / summaryRowsPerPage) || 1;
    if (summaryCurrentPage > totalPages) summaryCurrentPage = totalPages;
    const start = (summaryCurrentPage - 1) * summaryRowsPerPage;
    const paginated = list.slice(start, start + summaryRowsPerPage);

    let html = '';
    paginated.forEach(log => {
        html += `
            <tr>
                <td><strong>${log.userId}</strong><br><small>${log.name}</small></td>
                <td>${log.countRefId}</td>
                <td>
                    ${log.endTime === '-' ? `<button class="edit-btn" onclick="quickEndCount(${log.id})">End Count</button>` : '<span class="status-badge" style="background:#ebfaeb; color:#27ae60">Done</span>'}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    renderSummaryPagination(list.length);
}

function renderSummaryPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / summaryRowsPerPage) || 1;
    const container = document.getElementById('summaryPaginationNumbers');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        container.innerHTML += `<button class="page-num ${i === summaryCurrentPage ? 'active' : ''}" onclick="goToSummaryPage(${i})">${i}</button>`;
    }
}

function goToSummaryPage(page) {
    summaryCurrentPage = page;
    renderSummaryModalContent();
}

function changeSummaryPage(dir) {
    summaryCurrentPage += dir;
    const totalPages = Math.ceil(cycleCountLogs.length / summaryRowsPerPage) || 1;
    if (summaryCurrentPage < 1) summaryCurrentPage = 1;
    if (summaryCurrentPage > totalPages) summaryCurrentPage = totalPages;
    renderSummaryModalContent();
}

function quickEndCount(id) {
    const log = cycleCountLogs.find(l => l.id === id);
    if (!log) return;
    const now = new Date();
    log.endTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    log.duration = calculateDuration(log.startTime, log.endTime);
    db.transaction("cycleCountLogs", "readwrite").objectStore("cycleCountLogs").put(log).onsuccess = () => {
        showToast(`Count ended for ${log.userId}`, "success");
        renderCycleCountTable();
        if (document.getElementById('summaryModal').style.display === 'block') {
            renderSummaryModalContent();
        }
    };
}

function filterCountTab(tab) {
    currentCountTab = tab;
    countCurrentPage = 1;
    document.querySelectorAll('.tab-link').forEach(btn => btn.innerText === tab ? btn.classList.add('active') : btn.classList.remove('active'));
    renderCycleCountTable();
}

function renderCountPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / countRowsPerPage) || 1;
    const container = document.getElementById('countPaginationNumbers');
    if (!container) return;
    container.innerHTML = '';
    const maxVisible = 3;
    let startPage = Math.max(1, countCurrentPage - 1);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
    if (startPage > 1) {
        container.innerHTML += `<button class="page-num" onclick="goToCountPage(1)">1</button>`;
        if (startPage > 2) container.innerHTML += `<span class="dots">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        container.innerHTML += `<button class="page-num ${i === countCurrentPage ? 'active' : ''}" onclick="goToCountPage(${i})">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) container.innerHTML += `<span class="dots">...</span>`;
        container.innerHTML += `<button class="page-num" onclick="goToCountPage(${totalPages})">${totalPages}</button>`;
    }
}

function goToCountPage(page) { countCurrentPage = page; renderCycleCountTable(); }
function changeCountPage(dir) { countCurrentPage += dir; if (countCurrentPage < 1) countCurrentPage = 1; renderCycleCountTable(); }

function deleteCount(id) {
    const modal = document.getElementById('confirmModal');
    const confirmBtn = document.getElementById('confirmBtn');
    document.getElementById('confirmMessage').innerText = "Delete this count log?";
    modal.style.display = 'block';
    confirmBtn.onclick = () => {
        db.transaction("cycleCountLogs", "readwrite").objectStore("cycleCountLogs").delete(id).onsuccess = () => {
            cycleCountLogs = cycleCountLogs.filter(l => l.id !== id);
            renderCycleCountTable();
            showToast("Log deleted", "danger");
            modal.style.display = 'none';
        };
    };
}

function exportCycleCount() {
    const search = document.getElementById('countSearch').value.toLowerCase();
    const zoneSearch = document.getElementById('zoneSearch').value;
    const data = cycleCountLogs.filter(l => (l.userId.toLowerCase().includes(search) || l.countRefId.toLowerCase().includes(search) || (l.name && l.name.toLowerCase().includes(search))) && (zoneSearch === "" || l.zone === zoneSearch) && (currentCountTab === 'Counting' ? l.endTime === '-' : l.endTime !== '-'));
    if (data.length === 0) return showToast("No logs to export", "warning");
    let csv = "data:text/csv;charset=utf-8,User ID,Name,Company,Count ID,Zone,Date,Start Time,End Time,Duration\n";
    data.forEach(l => csv += `${l.userId},${l.name},${l.company || '-'},${l.countRefId},${l.zone || '-'},${l.date},${l.startTime},${l.endTime},${l.duration}\n`);
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `sunnyville_cyclecount_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}