// Data store for attendance logs
let attendanceLogs = [];
let selectedAction = 'Time In';
let currentPage = 1;
const rowsPerPage = 5;
let userCurrentPage = 1;
const userRowsPerPage = 5;
let summaryCurrentPage = 1;
const summaryRowsPerPage = 5;
let currentSummaryType = '';
let currentSort = { field: 'date', direction: 'desc' };

// User Database Storage
let userMasterData = [];
let confirmCallback = null;

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

// Update statistics every 30 seconds for live monitoring (especially for long breaks)
setInterval(() => {
    updateStats();
    if (document.getElementById('summaryModal').style.display === 'block' && (currentSummaryType === 'longBreak' || currentSummaryType === 'onBreak' || currentSummaryType === 'onSnack' || currentSummaryType === 'longSnack')) {
        renderSummaryModalContent();
    }
}, 30000);

// Global events to track activity for auto-lock
window.onload = () => {
    resetIdleTimer();
    showTableSkeletons('attendanceBody', 5, 14);
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

// --- Toast & UI Helpers ---
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

function showConfirmModal(title, message, callback) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    confirmCallback = callback;
    document.getElementById('confirmBtn').onclick = handleConfirm;
    toggleModal('confirmModal', true);
}

function handleConfirm() {
    if (confirmCallback) confirmCallback();
    toggleModal('confirmModal', false);
}

// IndexedDB Initialization
const dbName = "SunnyvilleTrackerDB";
let db;
const dbRequest = indexedDB.open(dbName, 3);

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

dbRequest.onsuccess = function(event) {
    db = event.target.result;
    loadDataFromDB();
};

function loadDataFromDB() {
    const tx = db.transaction(["attendanceLogs", "userMasterData"], "readonly");
    tx.objectStore("attendanceLogs").getAll().onsuccess = (e) => {
        attendanceLogs = e.target.result;
        updateView();
    };
    tx.objectStore("userMasterData").getAll().onsuccess = (e) => {
        userMasterData = e.target.result;
        if (document.getElementById('userModal').style.display === 'block') renderUserMaster();
    };
}

function addUser() {
    const idInput = document.getElementById('newUserId');
    const nameInput = document.getElementById('newUserName');
    const companyInput = document.getElementById('newCompany');
    const statusInput = document.getElementById('newUserStatus');

    const id = idInput.value.trim();
    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const status = statusInput.value;

    if (!id || !name) {
        showToast("Please fill in both User ID and Name", "warning");
        return;
    }

    if (userMasterData.some(u => u.id === id)) {
        showToast("User ID already exists", "warning");
        return;
    }

    const newUser = { id, name, company, status };
    userMasterData.push(newUser);
    db.transaction("userMasterData", "readwrite").objectStore("userMasterData").put(newUser);
    idInput.value = '';
    nameInput.value = '';
    companyInput.value = '';
    renderUserMaster();
    showToast("User added successfully", "success");
}

function deleteUser(id) {
    showConfirmModal("Delete User", `Are you sure you want to delete user ${id}?`, () => {
        userMasterData = userMasterData.filter(u => u.id !== id);
        db.transaction("userMasterData", "readwrite").objectStore("userMasterData").delete(id);
        renderUserMaster();
        showToast("User deleted", "danger");
    });
}

function editUser(id) {
    const user = userMasterData.find(u => u.id === id);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editCompany').value = user.company || '';
    document.getElementById('editUserStatus').value = user.status;
    toggleModal('editUserModal', true);
}

function saveEditUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value;
    const company = document.getElementById('editCompany').value;
    const status = document.getElementById('editUserStatus').value;

    const userIndex = userMasterData.findIndex(u => u.id === id);
    if (userIndex > -1) {
        userMasterData[userIndex] = { id, name, company, status };
        db.transaction("userMasterData", "readwrite").objectStore("userMasterData").put(userMasterData[userIndex]);
        
        // Update attendance logs if name or company changed
        attendanceLogs.forEach(log => {
            if (log.userId === id) {
                log.name = name;
                log.company = company;
            }
        });
        
        renderUserMaster();
        updateView();
        showToast("User updated successfully", "success");
        toggleModal('editUserModal', false);
    }
}

function exportUserMaster() {
    if (userMasterData.length === 0) {
        showToast("No users to export", "warning");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,User ID,Name,Company,Status\n";
    userMasterData.forEach(user => {
        csvContent += `${user.id},${user.name},${user.company || '-'},${user.status}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `sunnyville_users_export_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importUserMaster(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const tx = db.transaction("userMasterData", "readwrite");
        const store = tx.objectStore("userMasterData");
        
        let count = 0;
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [id, name, company, status] = line.split(',');
            if (id && name) {
                const user = { 
                    id: id.trim(), 
                    name: name.trim(), 
                    company: (company ? company.trim() : '-') || '-', 
                    status: (status ? status.trim() : 'Active') || 'Active' 
                };
                store.put(user);
                
                const idx = userMasterData.findIndex(u => u.id === user.id);
                if (idx > -1) userMasterData[idx] = user;
                else userMasterData.push(user);
                count++;
            }
        }
        tx.oncomplete = () => { showToast(`Imported ${count} users successfully`, "success"); renderUserMaster(); event.target.value = ''; };
    };
    reader.readAsText(file);
}

// Event listener for Barcode Scanner (Enter key trigger)
document.getElementById('userIdInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        logAttendance();
    }
});

// Immediate lookup during scanning/typing
document.getElementById('userIdInput').addEventListener('input', function (e) {
    const userId = e.target.value.trim();
    const user = userMasterData.find(u => u.id === userId);
    document.getElementById('userNameDisplay').value = user ? user.name : '';
});

function selectAction(action) {
    selectedAction = action;
    // Update UI buttons
    document.querySelectorAll('.act-btn').forEach(btn => btn.classList.remove('active'));
    const btnId = 'btn-' + action.replace(' ', '');
    document.getElementById(btnId).classList.add('active');
    document.getElementById('userIdInput').focus();
}

function getBreakMinutes(outStr, inStr) {
    if (outStr === '-' || inStr === '-') return 0;
    try {
        const parseTime = (str) => {
            const [time, modifier] = str.split(' ');
            let [hours, minutes] = time.split(':');
            if (hours === '12') hours = '00';
            if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
            return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
        };
        let diff = parseTime(inStr) - parseTime(outStr);
        if (diff < 0) diff += 1440; // Midnight crossing fix
        return diff;
    } catch (e) { return 0; }
}

function logAttendance() {
    const userIdField = document.getElementById('userIdInput');
    const nameDisplay = document.getElementById('userNameDisplay');
    const userId = userIdField.value.trim();
    
    if (!userId) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const shift = calculateShift(now.getHours());
    const user = userMasterData.find(u => u.id === userId);
    if (!user) {
        showToast(`Access Denied: User ID ${userId} not registered`, "danger");
        userIdField.value = '';
        nameDisplay.value = '';
        return;
    }
    const userName = user.name;
    const userCompany = user.company || '-';

    nameDisplay.value = userName;

    // Smart Scanning Logic
    let actionToApply = selectedAction;
    let existingEntry = attendanceLogs.find(log => log.userId === userId && log.date === dateStr);
    if (existingEntry) {
        if (existingEntry.timeIn === '-') actionToApply = 'Time In';
        else if (existingEntry.breakOut === '-') actionToApply = 'Break Out';
        else if (existingEntry.breakIn === '-') actionToApply = 'Break In';
        else if (existingEntry.snackOut === '-') actionToApply = 'Snack Out';
        else if (existingEntry.snackIn === '-') actionToApply = 'Snack In';
        else if (existingEntry.timeOut === '-') actionToApply = 'Time Out';
        else {
            showToast(`User ${userId} has already completed their shift for today`, "info");
            userIdField.value = '';
            nameDisplay.value = '';
            return;
        }
    } else {
        actionToApply = 'Time In';
    }

    // Validation: Prevent double Time In
    if (actionToApply === 'Time In' && existingEntry && existingEntry.timeIn !== '-') {
        showToast(`User ${userId} is already timed in`, "warning");
        userIdField.value = '';
        nameDisplay.value = '';
        return;
    }

    // Find existing entry for this user on this day
    let entry = attendanceLogs.find(log => log.userId === userId && log.date === dateStr);

    if (!entry) {
        entry = {
            userId: userId,
            name: userName,
            company: userCompany,
            date: dateStr,
            timeIn: '-',
            snackOut: '-',
            snackIn: '-',
            breakOut: '-',
            breakIn: '-',
            timeOut: '-',
            shift: shift
        };
        attendanceLogs.push(entry);
    }

    // Map action to specific column
    if (actionToApply === 'Time In') entry.timeIn = timeStr;
    else if (actionToApply === 'Snack Out') entry.snackOut = timeStr;
    else if (actionToApply === 'Snack In') entry.snackIn = timeStr;
    else if (actionToApply === 'Break Out') entry.breakOut = timeStr;
    else if (actionToApply === 'Break In') entry.breakIn = timeStr;
    else if (actionToApply === 'Time Out') entry.timeOut = timeStr;
    
    entry.lastAction = actionToApply;

    db.transaction("attendanceLogs", "readwrite").objectStore("attendanceLogs").put(entry);

    // Visual feedback for scan
    const status = document.getElementById('scanStatus');
    status.innerText = `LAST SCAN: ${userId} (${actionToApply})`;
    status.style.background = '#ebfaeb';
    status.style.color = '#27ae60';
    showToast(`Logged ${actionToApply} for ${userName}`, "success");
    setTimeout(() => {
        status.innerText = 'READY TO SCAN';
        status.style.background = '#dff9fb';
        status.style.color = '#3498db';
    }, 2000);

    updateView();

    // Reset input
    userIdField.value = '';
    setTimeout(() => { nameDisplay.value = ''; }, 2000);
    userIdField.focus();
}

function calculateShift(hour) {
    if (hour >= 6 && hour < 14) return "1st Shift";
    if (hour >= 14 && hour < 22) return "2nd Shift";
    return "3rd Shift";
}

function sortData(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    updateView();
}

let currentFilter = 'All';

function handleSearch() {
    currentPage = 1;
    updateView();
}

function getFilteredData() {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    const searchTerm = document.getElementById('logSearch') ? document.getElementById('logSearch').value.toLowerCase() : '';
    let filteredData = attendanceLogs;

    // Apply Shift Filter
    if (currentFilter !== 'All') {
        filteredData = filteredData.filter(log => log.shift === currentFilter);
    }

    // Apply Date Range Filter
    if (from) {
        filteredData = filteredData.filter(log => log.date >= from);
    }
    if (to) {
        filteredData = filteredData.filter(log => log.date <= to);
    }

    // Apply Search Filter
    if (searchTerm) {
        filteredData = filteredData.filter(log => 
            (log.userId && log.userId.toLowerCase().includes(searchTerm)) || 
            (log.name && log.name.toLowerCase().includes(searchTerm))
        );
    }

    // Apply Sorting
    filteredData.sort((a, b) => {
        let valA = a[currentSort.field] || '';
        let valB = b[currentSort.field] || '';
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        
        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return filteredData;
}

function clearFilters() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    if(document.getElementById('logSearch')) document.getElementById('logSearch').value = '';
    currentFilter = 'All';
    currentPage = 1;
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.tab-link[onclick*="All"]').classList.add('active');
    updateView();
}

function updateView() {
    const filteredData = getFilteredData();

    // Pagination logic
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const start = (currentPage - 1) * rowsPerPage;
    const paginatedData = filteredData.slice(start, start + rowsPerPage);

    renderTable(paginatedData);
    renderPagination(filteredData.length);
    updateStats();
}

function deleteLogEntry(userId, date) {
    showConfirmModal("Delete Attendance Log", `Delete log for ${userId} on ${date}?`, () => {
        attendanceLogs = attendanceLogs.filter(log => !(log.userId === userId && log.date === date));
        db.transaction("attendanceLogs", "readwrite").objectStore("attendanceLogs").delete([userId, date]);
        updateView();
        showToast("Entry deleted", "danger");
    });
}

// Time conversion helpers
function convertTo24Hour(timeStr) {
    if (!timeStr || timeStr === '-') return '';
    try {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        hours = parseInt(hours, 10);
        if (modifier === 'PM' && hours !== 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    } catch (e) { return ''; }
}

function convertTo12Hour(timeStr) {
    if (!timeStr) return '-';
    try {
        let [hours, minutes] = timeStr.split(':');
        hours = parseInt(hours, 10);
        const modifier = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours.toString().padStart(2, '0')}:${minutes} ${modifier}`;
    } catch (e) { return '-'; }
}

function editLogTime(userId, date) {
    const log = attendanceLogs.find(l => l.userId === userId && l.date === date);
    if (!log) return;

    document.getElementById('editLogUserId').value = userId;
    document.getElementById('editLogDate').value = date;
    document.getElementById('editTimeIn').value = convertTo24Hour(log.timeIn);
    document.getElementById('editBreakOut').value = convertTo24Hour(log.breakOut);
    document.getElementById('editBreakIn').value = convertTo24Hour(log.breakIn);
    document.getElementById('editSnackOut').value = convertTo24Hour(log.snackOut);
    document.getElementById('editSnackIn').value = convertTo24Hour(log.snackIn);
    document.getElementById('editTimeOut').value = convertTo24Hour(log.timeOut);
    
    toggleModal('editLogModal', true);
}

function saveEditLog() {
    const userId = document.getElementById('editLogUserId').value;
    const date = document.getElementById('editLogDate').value;
    
    const log = attendanceLogs.find(l => l.userId === userId && l.date === date);
    if (log) {
        log.timeIn = convertTo12Hour(document.getElementById('editTimeIn').value);
        log.breakOut = convertTo12Hour(document.getElementById('editBreakOut').value);
        log.breakIn = convertTo12Hour(document.getElementById('editBreakIn').value);
        log.snackOut = convertTo12Hour(document.getElementById('editSnackOut').value);
        log.snackIn = convertTo12Hour(document.getElementById('editSnackIn').value);
        log.timeOut = convertTo12Hour(document.getElementById('editTimeOut').value);
        
        // Recalculate last action
        if (log.timeOut !== '-') log.lastAction = 'Time Out';
        else if (log.snackIn !== '-') log.lastAction = 'Snack In';
        else if (log.snackOut !== '-') log.lastAction = 'Snack Out';
        else if (log.breakIn !== '-') log.lastAction = 'Break In';
        else if (log.breakOut !== '-') log.lastAction = 'Break Out';
        else log.lastAction = 'Time In';

        db.transaction("attendanceLogs", "readwrite").objectStore("attendanceLogs").put(log);
        updateView();
        showToast("Attendance updated", "success");
        toggleModal('editLogModal', false);
    }
}

function calculateBreakDuration(outStr, inStr) {
    if (outStr === '-' || inStr === '-') return '-';
    try {
        const parseTime = (str) => {
            const [time, modifier] = str.split(' ');
            let [hours, minutes] = time.split(':');
            if (hours === '12') hours = '00';
            if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
            return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
        };

        const start = parseTime(outStr);
        const end = parseTime(inStr);
        let diff = end - start;
        if (diff < 0) diff += 1440; // Midnight crossing fix

        if (diff <= 0) return '-';
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    } catch (e) {
        return '-';
    }
}

function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = attendanceLogs.filter(log => log.date === today);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const totalIn = todayLogs.filter(l => l.timeIn !== '-' && l.timeOut === '-').length;
    const onBreak = todayLogs.filter(l => l.breakOut !== '-' && l.breakIn === '-').length;
    const onSnack = todayLogs.filter(l => l.snackOut !== '-' && l.snackIn === '-').length;
    const finished = todayLogs.filter(l => l.timeOut !== '-').length;
    
    const longBreaks = todayLogs.filter(l => {
        if (l.breakOut === '-') return false;
        const endTime = l.breakIn !== '-' ? l.breakIn : nowTime;
        return getBreakMinutes(l.breakOut, endTime) > 40;
    }).length;

    const longSnacks = todayLogs.filter(l => {
        if (l.snackOut === '-') return false;
        const endTime = l.snackIn !== '-' ? l.snackIn : nowTime;
        return getBreakMinutes(l.snackOut, endTime) > 40;
    }).length;

    document.getElementById('stat-totalIn').innerText = totalIn;
    document.getElementById('stat-breakOut').innerText = onBreak;
    document.getElementById('stat-onSnack').innerText = onSnack;
    document.getElementById('stat-longBreak').innerText = longBreaks;
    document.getElementById('stat-longSnack').innerText = longSnacks;
    document.getElementById('stat-timeOut').innerText = finished;

    const longBreakCard = document.getElementById('longBreakCard');
    if (longBreakCard) {
        if (longBreaks > 0) longBreakCard.classList.add('blink-danger');
        else longBreakCard.classList.remove('blink-danger');
    }

    const longSnackCard = document.getElementById('longSnackCard');
    if (longSnackCard) {
        if (longSnacks > 0) longSnackCard.classList.add('blink-danger');
        else longSnackCard.classList.remove('blink-danger');
    }
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
    const container = document.getElementById('paginationNumbers');
    container.innerHTML = '';

    const maxVisible = 3;
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    // Add First and Dots
    if (startPage > 1) {
        container.innerHTML += `<button class="page-num" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) container.innerHTML += `<span class="dots">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        container.innerHTML += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    // Add Last and Dots
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) container.innerHTML += `<span class="dots">...</span>`;
        container.innerHTML += `<button class="page-num" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }
}

function goToPage(page) {
    currentPage = page;
    updateView();
}

function renderTable(data) {
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = '';

    data.forEach(log => {
        const snackDuration = calculateBreakDuration(log.snackOut, log.snackIn);
        const breakDuration = calculateBreakDuration(log.breakOut, log.breakIn);
        
        const row = `<tr>
            <td>${log.userId}</td>
            <td>${log.name}</td>
            <td>${log.company || '-'}</td>
            <td>${log.date}</td>
            <td>${log.timeIn}</td>
            <td>${log.breakOut}</td>
            <td>${log.breakIn}</td>
            <td>${log.snackOut}</td>
            <td>${log.snackIn}</td>
            <td>${log.timeOut}</td>
            <td>${breakDuration}</td>
            <td>${snackDuration}</td>
            <td>${log.shift}</td>
            <td>
                <button class="edit-btn" onclick="editLogTime('${log.userId}', '${log.date}')"><i class="fas fa-clock"></i> Edit</button>
                <button class="delete-btn" onclick="deleteLogEntry('${log.userId}', '${log.date}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function changePage(dir) {
    currentPage += dir;
    if (currentPage < 1) currentPage = 1;
    updateView();
}

function filterTable(shiftName) {
    currentFilter = shiftName;
    currentPage = 1;
    // Update active tab UI
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateView();
}

function toggleModal(id, show) {
    document.getElementById(id).style.display = show ? 'block' : 'none';
    if (show && id === 'userModal') {
        userCurrentPage = 1;
        renderUserMaster();
    }
}

function changeUserPage(dir) {
    const totalPages = Math.ceil(userMasterData.length / userRowsPerPage) || 1;
    userCurrentPage += dir;
    if (userCurrentPage < 1) userCurrentPage = 1;
    if (userCurrentPage > totalPages) userCurrentPage = totalPages;
    renderUserMaster();
}

function renderUserPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / userRowsPerPage) || 1;
    const container = document.getElementById('userPaginationNumbers');
    if(!container) return;
    container.innerHTML = '';

    const maxVisible = 3;
    let startPage = Math.max(1, userCurrentPage - 1);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        container.innerHTML += `<button class="page-num" onclick="goToUserPage(1)">1</button>`;
        if (startPage > 2) container.innerHTML += `<span class="dots">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        container.innerHTML += `<button class="page-num ${i === userCurrentPage ? 'active' : ''}" onclick="goToUserPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) container.innerHTML += `<span class="dots">...</span>`;
        container.innerHTML += `<button class="page-num" onclick="goToUserPage(${totalPages})">${totalPages}</button>`;
    }
}

function goToUserPage(page) {
    userCurrentPage = page;
    renderUserMaster();
}

function handleUserSearch() {
    userCurrentPage = 1;
    renderUserMaster();
}

function clearUserFilters() {
    document.getElementById('userSearch').value = '';
    userCurrentPage = 1;
    renderUserMaster();
}

function renderUserMaster() {
    const tbody = document.getElementById('userMasterBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = document.getElementById('userSearch') ? document.getElementById('userSearch').value.toLowerCase() : '';
    
    let filteredUsers = userMasterData;
    if (searchTerm) {
        filteredUsers = userMasterData.filter(user => 
            user.id.toLowerCase().includes(searchTerm) || 
            user.name.toLowerCase().includes(searchTerm)
        );
    }

    const totalPages = Math.ceil(filteredUsers.length / userRowsPerPage) || 1;
    if (userCurrentPage > totalPages) userCurrentPage = totalPages;

    const start = (userCurrentPage - 1) * userRowsPerPage;
    const paginatedUsers = filteredUsers.slice(start, start + userRowsPerPage);

    paginatedUsers.forEach(user => {
        const row = `<tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.company || '-'}</td>
            <td>${user.status}</td>
            <td>
                <button class="edit-btn" onclick="editUser('${user.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="delete-btn" onclick="deleteUser('${user.id}')"><i class="fas fa-trash"></i> Delete</button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
    renderUserPagination(filteredUsers.length);
}

function openSummaryModal(type) {
    currentSummaryType = type;
    summaryCurrentPage = 1;
    renderSummaryModalContent();
    toggleModal('summaryModal', true);
}

function renderSummaryModalContent() {
    const type = currentSummaryType;
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = attendanceLogs.filter(log => log.date === today);
    const tbody = document.getElementById('summaryModalBody');
    const title = document.getElementById('summaryModalTitle');
    if (!tbody) return;
    tbody.innerHTML = '';

    let list = [];
    if (type === 'active') {
        title.innerText = "Active Personnel (In Building)";
        list = todayLogs.filter(l => l.timeIn !== '-' && l.timeOut === '-');
    } else if (type === 'onBreak') {
        title.innerText = "Personnel on Break";
        list = todayLogs.filter(l => l.breakOut !== '-' && l.breakIn === '-');
    } else if (type === 'onSnack') {
        title.innerText = "Personnel on Snack";
        list = todayLogs.filter(l => l.snackOut !== '-' && l.snackIn === '-');
    } else if (type === 'longBreak') {
        title.innerText = "Long Breaks (>40 Mins)";
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        list = todayLogs.filter(l => {
            if (l.breakOut === '-') return false;
            const endTime = l.breakIn !== '-' ? l.breakIn : nowTime;
            return getBreakMinutes(l.breakOut, endTime) > 40;
        });
    } else if (type === 'longSnack') {
        title.innerText = "Long Snacks (>40 Mins)";
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        list = todayLogs.filter(l => {
            if (l.snackOut === '-') return false;
            const endTime = l.snackIn !== '-' ? l.snackIn : nowTime;
            return getBreakMinutes(l.snackOut, endTime) > 40;
        });
    } else if (type === 'finished') {
        title.innerText = "Completed Shifts Today";
        list = todayLogs.filter(l => l.timeOut !== '-');
    }

    const totalPages = Math.ceil(list.length / summaryRowsPerPage) || 1;
    if (summaryCurrentPage > totalPages) summaryCurrentPage = totalPages;

    const start = (summaryCurrentPage - 1) * summaryRowsPerPage;
    const paginatedList = list.slice(start, start + summaryRowsPerPage);

    paginatedList.forEach(person => {
        let statusDetail = person.lastAction || '-';
        if (type === 'onBreak' || (type === 'longBreak' && person.breakIn === '-')) {
            const now = new Date();
            const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            statusDetail = `On break since ${person.breakOut} (${calculateBreakDuration(person.breakOut, nowStr)})`;
        } else if (type === 'onSnack' || (type === 'longSnack' && person.snackIn === '-')) {
            const now = new Date();
            const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            statusDetail = `On snack since ${person.snackOut} (${calculateBreakDuration(person.snackOut, nowStr)})`;
        }

        const row = `<tr>
            <td><strong>${person.userId}</strong><br><small>${person.name}</small></td>
            <td>${statusDetail}</td>
            <td>
                ${type === 'active' ? `
                    <button class="edit-btn" style="background:var(--warning); color:var(--text)" onclick="quickAction('${person.userId}', 'Break Out')">Break Out</button>
                    <button class="edit-btn" onclick="quickAction('${person.userId}', 'Time Out')">Time Out</button>
                ` : ''}
                ${type === 'onBreak' ? `<button class="edit-btn" onclick="quickAction('${person.userId}', 'Break In')">End Break</button>` : ''}
                ${type === 'onSnack' ? `<button class="edit-btn" onclick="quickAction('${person.userId}', 'Snack In')">End Snack</button>` : ''}
                ${type === 'longBreak' ? `<button class="edit-btn" onclick="quickAction('${person.userId}', 'Break In')">End Break</button>` : ''}
                ${type === 'longSnack' ? `<button class="edit-btn" onclick="quickAction('${person.userId}', 'Snack In')">End Snack</button>` : ''}
                ${type === 'finished' ? `<span class="status-badge" style="background:#ebfaeb; color:#27ae60">Done</span>` : ''}
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
    renderSummaryPagination(list.length);
}

function changeSummaryPage(dir) {
    summaryCurrentPage += dir;
    if (summaryCurrentPage < 1) summaryCurrentPage = 1;
    renderSummaryModalContent();
}

function renderSummaryPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / summaryRowsPerPage) || 1;
    const container = document.getElementById('summaryPaginationNumbers');
    if(!container) return;
    container.innerHTML = '';

    const maxVisible = 3;
    let startPage = Math.max(1, summaryCurrentPage - 1);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        container.innerHTML += `<button class="page-num" onclick="goToSummaryPage(1)">1</button>`;
        if (startPage > 2) container.innerHTML += `<span class="dots">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        container.innerHTML += `<button class="page-num ${i === summaryCurrentPage ? 'active' : ''}" onclick="goToSummaryPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) container.innerHTML += `<span class="dots">...</span>`;
        container.innerHTML += `<button class="page-num" onclick="goToSummaryPage(${totalPages})">${totalPages}</button>`;
    }
}

function goToSummaryPage(page) {
    summaryCurrentPage = page;
    renderSummaryModalContent();
}

function quickAction(userId, action) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    
    let entry = attendanceLogs.find(log => log.userId === userId && log.date === dateStr);
    if (entry) {
        if (action === 'Time Out') entry.timeOut = timeStr;
        if (action === 'Break In') entry.breakIn = timeStr;
        if (action === 'Break Out') entry.breakOut = timeStr;
        if (action === 'Snack In') entry.snackIn = timeStr;
        if (action === 'Snack Out') entry.snackOut = timeStr;
        entry.lastAction = action;
        
        db.transaction("attendanceLogs", "readwrite").objectStore("attendanceLogs").put(entry);
        updateView();
        toggleModal('summaryModal', false);
        
        const status = document.getElementById('scanStatus');
        status.innerText = `MANUAL OVERRIDE: ${userId} (${action})`;
        setTimeout(() => { status.innerText = 'READY TO SCAN'; }, 2000);
    }
}

function exportAttendance() {
    const dataToExport = getFilteredData();
    
    if (dataToExport.length === 0) {
        alert("No logs to export");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,User ID,Name,Company,Date,Time In,Break Out,Break In,Snack Out,Snack In,Time Out,Break Duration,Snack Duration,Shift\n";
    dataToExport.forEach(log => {
        const snackDuration = calculateBreakDuration(log.snackOut, log.snackIn);
        const breakDuration = calculateBreakDuration(log.breakOut, log.breakIn);
        csvContent += `${log.userId},${log.name},${log.company || '-'},${log.date},${log.timeIn},${log.breakOut},${log.breakIn},${log.snackOut},${log.snackIn},${log.timeOut},${breakDuration},${snackDuration},${log.shift}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `sunnyville_export_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        showToast("Please select both From and To dates", "warning");
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