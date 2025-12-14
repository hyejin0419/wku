// Global State
const state = {
    users: [], // Array of user objects
    userMap: {}, // ID -> Name mapping
    tasks: [], // Array of task objects
    comments: [], // Array of comments
    charts: {
        dashboard: null,
        workload: null
    },
    calendar: null // FullCalendar instance
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadTasks();
    await loadComments();
    
    // Initial Render
    showPage('dashboard');
    setupEventListeners();
});

// --- Data Loading ---

async function loadUsers() {
    try {
        const response = await api.users.list();
        let users = response.data;
        
        // Sorting Logic: 강연석 -> 이진중 -> 이혜진 -> 소정호 -> Alphabetical
        users.sort((a, b) => {
            const priority = ['강연석', '이진중', '이혜진', '소정호'];
            const aIndex = priority.indexOf(a.name);
            const bIndex = priority.indexOf(b.name);
            
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            
            return a.name.localeCompare(b.name);
        });
        
        state.users = users;
        state.userMap = state.users.reduce((acc, user) => {
            acc[user.id] = user.name;
            return acc;
        }, {});
        
        // Populate Assignee Selects
        const select = document.getElementById('task-assignee');
        const filterSelect = document.getElementById('filter-assignee');
        
        // Clear existing options first (except default)
        while (select.options.length > 1) select.remove(1);
        while (filterSelect.options.length > 1) filterSelect.remove(1);

        state.users.forEach(user => {
            // Task Form Select
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} ${user.position ? `(${user.position})` : ''}`;
            select.appendChild(option);

            // Filter Select
            const filterOption = document.createElement('option');
            filterOption.value = user.id;
            filterOption.textContent = user.name;
            filterSelect.appendChild(filterOption);
        });

        // Update staff count
        const countEl = document.getElementById('staff-count');
        if(countEl) countEl.textContent = state.users.length;

    } catch (error) {
        console.error("Failed to load users:", error);
    }
}

async function loadTasks() {
    try {
        const response = await api.tasks.list();
        state.tasks = response.data;
        
        // Refresh current view if needed
        const activeNav = document.querySelector('.sidebar-active');
        const activePage = activeNav ? activeNav.id.replace('nav-', '') : 'dashboard';
        
        if (['dashboard', 'tasks', 'calendar', 'kanban', 'stats'].includes(activePage)) {
            showPage(activePage);
        }
    } catch (error) {
        console.error("Failed to load tasks:", error);
    }
}

async function loadComments() {
    try {
        const response = await api.comments.list();
        state.comments = response.data;
        if (document.getElementById('nav-community').classList.contains('sidebar-active')) {
            renderComments();
        }
    } catch (error) {
        console.error("Failed to load comments:", error);
    }
}

// --- Navigation ---

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));
    const targetPage = document.getElementById(`page-${pageId}`);
    if(targetPage) targetPage.classList.remove('hidden');
    
    // Update Sidebar
    document.querySelectorAll('aside nav a').forEach(el => el.classList.remove('sidebar-active'));
    const navItem = document.getElementById(`nav-${pageId}`);
    if(navItem) navItem.classList.add('sidebar-active');

    // Update Header
    const titles = {
        'dashboard': '대시보드',
        'tasks': '전체 업무 리스트',
        'calendar': '업무 달력',
        'naver-calendar': '국제처 일정 (네이버달력)',
        'kanban': '칸반 보드',
        'staff': '국제교류처 업무분장',
        'stats': '업무량 분석',
        'files': '부서 자료실',
        'community': '자유 의견 나눔'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'WKU Global';

    // Trigger Render
    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'tasks') renderTaskList();
    if (pageId === 'calendar') renderCalendar();
    if (pageId === 'kanban') renderKanban();
    if (pageId === 'staff') renderStaff();
    if (pageId === 'stats') renderStats();
    if (pageId === 'community') renderComments();
}

// --- Rendering Logic ---

function renderDashboard() {
    const tasks = state.tasks;
    
    // 1. Stats Cards
    const stats = {
        pending: tasks.filter(t => t.status === 'pending').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        urgent: 0
    };

    // Urgent: Due within 7 days and not completed
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    
    stats.urgent = tasks.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        return due >= now && due <= nextWeek;
    }).length;

    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-in-progress').textContent = stats.in_progress;
    document.getElementById('stat-completed').textContent = stats.completed;
    document.getElementById('stat-urgent').textContent = stats.urgent;

    // 2. Urgent Tasks List (Top 5)
    const urgentTasks = tasks
        .filter(t => t.status !== 'completed' && t.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 5);
        
    const urgentListEl = document.getElementById('urgent-tasks-list');
    urgentListEl.innerHTML = '';
    
    if (urgentTasks.length === 0) {
        urgentListEl.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                <i class="fa-regular fa-circle-check text-4xl mb-3 text-slate-300"></i>
                <p class="text-sm">마감 임박한 업무가 없습니다.</p>
            </div>`;
    } else {
        urgentTasks.forEach(task => {
            const due = new Date(task.due_date).toLocaleDateString();
            const assigneeName = state.userMap[task.assignee_id] || '미지정';
            const priorityColors = {
                high: 'text-rose-600 bg-rose-50 ring-rose-100',
                medium: 'text-amber-600 bg-amber-50 ring-amber-100',
                low: 'text-slate-600 bg-slate-50 ring-slate-100'
            };
            const pColor = priorityColors[task.priority] || priorityColors.low;
            
            const html = `
                <div class="p-5 hover:bg-slate-50 transition-all cursor-pointer group" onclick="openTaskModal('${task.id}')">
                    <div class="flex justify-between items-start mb-1">
                        <span class="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${pColor}">
                            ${getPriorityLabel(task.priority)}
                        </span>
                        <span class="text-xs font-medium text-slate-400 flex items-center gap-1 group-hover:text-indigo-500 transition-colors">
                            <i class="fa-regular fa-clock"></i> ${due}
                        </span>
                    </div>
                    <h4 class="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1">${task.title}</h4>
                    <p class="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <i class="fa-solid fa-user-tag text-slate-300"></i> ${assigneeName}
                    </p>
                </div>
            `;
            urgentListEl.innerHTML += html;
        });
    }

    // 3. Mini Chart (Task Distribution)
    renderDashboardChart(stats);
}

function renderTaskList() {
    const tbody = document.getElementById('tasks-table-body');
    tbody.innerHTML = '';
    
    const filterAssignee = document.getElementById('filter-assignee').value;
    const filterStatus = document.getElementById('filter-status').value;
    const searchText = document.getElementById('search-task').value.toLowerCase();

    const filtered = state.tasks.filter(task => {
        if (filterAssignee && task.assignee_id !== filterAssignee) return false;
        if (filterStatus && task.status !== filterStatus) return false;
        if (searchText && !task.title.toLowerCase().includes(searchText)) return false;
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400"><i class="fa-solid fa-inbox text-3xl mb-2 block text-slate-300"></i>검색 결과가 없습니다.</td></tr>';
        return;
    }

    filtered.forEach(task => {
        const due = task.due_date ? new Date(task.due_date).toLocaleDateString() : '-';
        const assigneeName = state.userMap[task.assignee_id] || '-';
        
        const tr = document.createElement('tr');
        tr.className = 'bg-white hover:bg-slate-50 transition-colors group';
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-semibold text-slate-800 cursor-pointer group-hover:text-indigo-600 transition-colors" onclick="openTaskModal('${task.id}')">${task.title}</div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold border border-slate-200">
                        ${assigneeName.charAt(0)}
                    </div>
                    <span class="text-slate-600">${assigneeName}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                 <span class="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span class="w-2 h-2 rounded-full ${getPriorityColor(task.priority)}"></span>
                    ${getPriorityLabel(task.priority)}
                 </span>
            </td>
            <td class="px-6 py-4 font-mono text-slate-600 text-xs">${due}</td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-md text-xs font-bold ${getStatusBadgeClass(task.status)} border border-opacity-10">
                    ${getStatusLabel(task.status)}
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="openTaskModal('${task.id}')" class="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50 mr-1" title="수정">
                    <i class="fa-regular fa-pen-to-square"></i>
                </button>
                <button onclick="deleteTask('${task.id}')" class="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded hover:bg-rose-50" title="삭제">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (state.calendar) state.calendar.destroy();

    const events = state.tasks.map(task => {
        let color = '#6366f1'; 
        if (task.status === 'completed') color = '#10b981';
        else if (task.priority === 'high') color = '#f43f5e';
        else if (task.status === 'pending') color = '#f59e0b';
        
        return {
            id: task.id,
            title: `${state.userMap[task.assignee_id] || ''} - ${task.title}`,
            start: task.due_date,
            allDay: true,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { priority: task.priority, status: task.status }
        };
    });

    state.calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        locale: 'ko',
        selectable: true,
        dateClick: function(info) {
            openTaskModal(null, info.dateStr);
        },
        dayMaxEvents: true,
        events: events,
        eventClick: function(info) {
            openTaskModal(info.event.id);
        },
        eventContent: function(arg) {
            return {
                html: `<div class="fc-event-main-frame flex items-center gap-1 overflow-hidden">
                        <div class="w-1.5 h-1.5 rounded-full bg-white/50 shrink-0"></div>
                        <div class="fc-event-title truncate text-xs font-medium">${arg.event.title}</div>
                       </div>`
            };
        },
        height: 'auto',
        contentHeight: 650
    });

    state.calendar.render();
    setTimeout(() => state.calendar.updateSize(), 100);
}

function renderKanban() {
    ['pending', 'in_progress', 'completed'].forEach(status => {
        const el = document.getElementById(`kanban-${status}`);
        if(el) el.innerHTML = '';
        const countEl = document.getElementById(`count-${status}`);
        if(countEl) countEl.textContent = '0';
    });

    const counts = { pending: 0, in_progress: 0, completed: 0 };

    state.tasks.forEach(task => {
        let status = task.status === 'hold' ? 'pending' : task.status;
        if (!counts.hasOwnProperty(status)) status = 'pending';
        counts[status]++;
        
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all group';
        card.onclick = () => openTaskModal(task.id);
        
        const assigneeName = state.userMap[task.assignee_id] || '미지정';
        const due = task.due_date ? new Date(task.due_date).toLocaleDateString() : '';
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${task.priority === 'high' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-slate-100 text-slate-500'}">
                    ${getPriorityLabel(task.priority)}
                </span>
                ${due ? `<span class="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors"><i class="fa-regular fa-clock mr-1"></i>${due}</span>` : ''}
            </div>
            <h4 class="text-sm font-bold text-slate-800 mb-3 leading-snug">${task.title}</h4>
            <div class="flex items-center justify-between pt-3 border-t border-slate-50">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <div class="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-600">
                        ${assigneeName.charAt(0)}
                    </div>
                    <span>${assigneeName}</span>
                </div>
            </div>
        `;
        document.getElementById(`kanban-${status}`).appendChild(card);
    });

    Object.keys(counts).forEach(key => {
        document.getElementById(`count-${key}`).textContent = counts[key];
    });
}

function renderStaff() {
    const grid = document.getElementById('staff-grid');
    grid.innerHTML = '';
    
    state.users.forEach(user => {
        const roles = user.role_description
            .split(/,|\n/)
            .map(r => r.trim())
            .filter(r => r.length > 0);
            
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col h-full';
        
        const roleListHtml = roles.map(r => `
            <li class="text-sm text-slate-600 mb-2 flex items-start group-hover:text-slate-800 transition-colors">
                <i class="fa-solid fa-check text-indigo-400 text-xs mt-1 mr-2.5"></i>
                <span class="flex-1 leading-relaxed">${r}</span>
            </li>`).join('');
        
        // Custom styling for Managers (Only '처장', '과장' get the dark style)
        const isManager = ['처장', '과장'].includes(user.position);
        const headerBg = isManager ? 'bg-gradient-to-r from-slate-800 to-slate-700' : 'bg-white border-b border-slate-100';
        const textColor = isManager ? 'text-white' : 'text-slate-800';
        const subTextColor = isManager ? 'text-slate-300' : 'text-slate-500';
        const iconBg = isManager ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600';

        card.innerHTML = `
            <div class="${headerBg} px-6 py-5 flex justify-between items-center shrink-0 relative group/header">
                <div>
                    <h4 class="font-bold ${textColor} text-lg tracking-tight flex items-center gap-2">
                        ${user.name}
                        ${isManager ? '<i class="fa-solid fa-star text-amber-400 text-xs"></i>' : ''}
                    </h4>
                    <span class="text-xs ${subTextColor} font-medium mt-0.5 block">${user.position}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center font-bold text-lg shadow-sm">
                        ${user.name.charAt(0)}
                    </div>
                    <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity bg-white/10 backdrop-blur-sm rounded-lg p-1">
                        <button onclick="openStaffEditModal('${user.id}')" class="w-7 h-7 flex items-center justify-center rounded-md ${isManager ? 'text-white hover:bg-white/20' : 'text-slate-500 hover:bg-slate-100'} transition-colors" title="수정">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                        <button onclick="deleteStaff('${user.id}')" class="w-7 h-7 flex items-center justify-center rounded-md ${isManager ? 'text-white hover:bg-rose-500/20 hover:text-rose-200' : 'text-slate-500 hover:bg-rose-50 hover:text-rose-500'} transition-colors" title="삭제">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="p-6 flex-1 bg-slate-50/30">
                <h5 class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Responsibilities</h5>
                <ul class="">
                    ${roleListHtml}
                </ul>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderStats() {
    const ctx = document.getElementById('workload-chart').getContext('2d');
    const userTaskCounts = {};
    state.users.forEach(u => userTaskCounts[u.id] = 0);
    
    state.tasks.forEach(t => {
        if(userTaskCounts.hasOwnProperty(t.assignee_id)) {
            userTaskCounts[t.assignee_id]++;
        }
    });

    const labels = state.users.map(u => u.name);
    const data = state.users.map(u => userTaskCounts[u.id]);

    if (state.charts.workload) state.charts.workload.destroy();

    state.charts.workload = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '배정된 업무 수',
                data: data,
                backgroundColor: '#6366f1',
                borderRadius: 6,
                barThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9', borderDash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderDashboardChart(stats) {
    const ctx = document.getElementById('dashboard-chart').getContext('2d');
    if (state.charts.dashboard) state.charts.dashboard.destroy();

    state.charts.dashboard = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['대기 중', '진행 중', '완료'],
            datasets: [{
                data: [stats.pending, stats.in_progress, stats.completed],
                backgroundColor: ['#fbbf24', '#6366f1', '#10b981'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 20 } 
                }
            }
        }
    });
}

function renderComments() {
    const listEl = document.getElementById('comments-list');
    listEl.innerHTML = '';

    if (state.comments.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-10 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <i class="fa-regular fa-comments text-4xl text-slate-200 mb-3"></i>
                <p class="text-slate-400 text-sm">아직 등록된 의견이 없습니다.</p>
                <p class="text-slate-400 text-xs mt-1">첫 번째 의견을 남겨보세요!</p>
            </div>`;
        return;
    }

    state.comments.forEach(comment => {
        const date = new Date(comment.created_at).toLocaleString();
        const div = document.createElement('div');
        div.className = 'bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-700 text-sm bg-slate-100 px-3 py-1 rounded-full">${comment.author || '익명'}</span>
                    <span class="text-xs text-slate-400">${date}</span>
                </div>
                <button onclick="deleteComment('${comment.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100" title="삭제">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
            <p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${comment.content}</p>
        `;
        listEl.appendChild(div);
    });
}

async function deleteComment(id) {
    if(!confirm('이 의견을 삭제하시겠습니까?')) return;
    try {
        await api.comments.delete(id);
        await loadComments();
    } catch (error) {
        alert('삭제 실패');
    }
}


// --- Modal & Form Handlers ---

// Task Modal
function openTaskModal(taskId = null, defaultDate = null) {
    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const title = document.getElementById('modal-title');
    
    form.reset();
    document.getElementById('task-id').value = '';
    
    if (defaultDate) {
        const dateStr = defaultDate.includes('T') ? defaultDate : `${defaultDate}T09:00`;
        document.getElementById('task-due-date').value = dateStr;
    }

    if (taskId) {
        title.textContent = '업무 수정';
        document.getElementById('btn-delete-task').classList.remove('hidden');
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            document.getElementById('task-id').value = task.id;
            document.getElementById('task-title').value = task.title;
            document.getElementById('task-assignee').value = task.assignee_id;
            document.getElementById('task-due-date').value = task.due_date ? task.due_date.slice(0, 16) : ''; 
            document.getElementById('task-priority').value = task.priority;
            document.getElementById('task-requester').value = task.requester_name || '';
            document.getElementById('task-status').value = task.status;
            document.getElementById('task-desc').value = task.description || '';
        }
    } else {
        title.textContent = '새 업무 등록';
        document.getElementById('btn-delete-task').classList.add('hidden');
        document.getElementById('task-status').value = 'pending'; 
        if (!defaultDate) {
             const now = new Date();
             now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
             document.getElementById('task-due-date').value = now.toISOString().slice(0, 16);
        }
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeTaskModal() {
    document.getElementById('task-modal').classList.remove('flex');
    document.getElementById('task-modal').classList.add('hidden');
}

// Staff Modal
function openStaffModal() {
    document.getElementById('staff-form').reset();
    document.getElementById('staff-id').value = ''; // Reset ID
    document.querySelector('#staff-modal h3').textContent = '새 직원 등록'; // Reset Title
    document.getElementById('staff-modal').classList.remove('hidden');
    document.getElementById('staff-modal').classList.add('flex');
}

function openStaffEditModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('staff-id').value = user.id;
    document.getElementById('staff-name').value = user.name;
    document.getElementById('staff-position').value = user.position;
    document.getElementById('staff-role').value = user.role_description;
    
    document.querySelector('#staff-modal h3').textContent = '직원 정보 수정';
    
    document.getElementById('staff-modal').classList.remove('hidden');
    document.getElementById('staff-modal').classList.add('flex');
}

function closeStaffModal() {
    document.getElementById('staff-modal').classList.remove('flex');
    document.getElementById('staff-modal').classList.add('hidden');
}

// Handlers
async function handleTaskSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '처리 중...';
    submitBtn.disabled = true;

    const id = document.getElementById('task-id').value;
    const data = {
        title: document.getElementById('task-title').value,
        assignee_id: document.getElementById('task-assignee').value,
        due_date: document.getElementById('task-due-date').value || null,
        priority: document.getElementById('task-priority').value,
        requester_name: document.getElementById('task-requester').value,
        status: document.getElementById('task-status').value,
        description: document.getElementById('task-desc').value
    };
    
    try {
        if (id) await api.tasks.update(id, data);
        else await api.tasks.create(data);
        await loadTasks();
        closeTaskModal();
    } catch (error) {
        console.error('Task save error:', error);
        alert('저장에 실패했습니다. (Error: ' + error.message + ')');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

async function handleStaffSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '저장 중...';
    submitBtn.disabled = true;

    const id = document.getElementById('staff-id').value;
    const data = {
        name: document.getElementById('staff-name').value,
        position: document.getElementById('staff-position').value,
        role_description: document.getElementById('staff-role').value
    };
    
    try {
        if (id) {
            await api.users.update(id, data);
        } else {
            await api.users.create(data);
        }
        await loadUsers(); // Reload first to ensure data is there
        closeStaffModal();
        showPage('staff'); // Ensure we are on the staff page
    } catch (error) {
        console.error('Staff save error:', error);
        alert('직원 저장 실패: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

async function deleteStaff(id) {
    if(!confirm('정말 이 직원을 삭제하시겠습니까? 관련 업무 데이터는 유지되지만 담당자 정보가 사라질 수 있습니다.')) return;
    try {
        await api.users.delete(id);
        await loadUsers();
    } catch (error) {
        console.error('Staff delete error:', error);
        alert('직원 삭제 실패 (Error: ' + error.message + ')');
    }
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '등록 중...';
    submitBtn.disabled = true;

    const content = document.getElementById('comment-content').value;
    const author = document.getElementById('comment-author').value;
    
    if(!content.trim()) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
    }

    try {
        await api.comments.create({ content, author });
        document.getElementById('comment-content').value = '';
        await loadComments();
    } catch (error) {
        console.error('Comment save error:', error);
        alert('의견 등록 실패 (Error: ' + error.message + ')');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

async function deleteTask(id) {
    if(!confirm('정말 이 업무를 삭제하시겠습니까?')) return;
    try {
        await api.tasks.delete(id);
        await loadTasks();
    } catch (error) {
        console.error('Delete task error:', error);
        alert('삭제 실패: ' + error.message);
    }
}

async function handleTaskDeleteFromModal() {
    const id = document.getElementById('task-id').value;
    if(id) {
        await deleteTask(id);
        closeTaskModal();
    }
}

function setupEventListeners() {
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
    document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
    
    document.getElementById('filter-assignee').addEventListener('change', renderTaskList);
    document.getElementById('filter-status').addEventListener('change', renderTaskList);
    document.getElementById('search-task').addEventListener('input', renderTaskList);
}


// --- Helpers ---

function getPriorityColor(p) {
    if (p === 'high') return 'bg-rose-500';
    if (p === 'medium') return 'bg-amber-500';
    return 'bg-slate-400';
}

function getPriorityLabel(p) {
    if (p === 'high') return 'High';
    if (p === 'medium') return 'Medium';
    return 'Low';
}

function getStatusBadgeClass(s) {
    if (s === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'in_progress') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (s === 'hold') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
}

function getStatusLabel(s) {
    if (s === 'completed') return '완료';
    if (s === 'in_progress') return '진행 중';
    if (s === 'hold') return '보류';
    return '대기';
}