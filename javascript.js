/**
 * ASL & ASIL EXPORT COLLECTION INTELLIGENCE — FRONTEND ENGINE
 * Pair-programmed for executive financial intelligence, zero data-loss,
 * and multi-currency safety.
 */

// Global Application State
const STATE = {
  rawData: {
    openInvoices: [],
    paidInvoices: [],
    salespersons: [],
    customers: [],
    countries: [],
    currencies: [],
    plants: ['ASL', 'ASIL'],
    syncLogs: [],
    lastRefreshed: '',
    asilStatus: '',
    aslStatus: '',
    trackerUrl: ''
  },
  filters: {
    plant: 'ALL',
    salesperson: 'ALL',
    customer: 'ALL',
    country: 'ALL',
    currency: 'ALL',
    dateFrom: '',
    dateTo: ''
  },
  filteredOpen: [],
  filteredPaid: [],
  tables: {
    open: { page: 1, pageSize: 25, sortCol: 'daysOverdue', sortAsc: false, search: '' },
    paid: { page: 1, pageSize: 25, sortCol: 'paidDate', sortAsc: false, search: '' },
    overdue: { page: 1, pageSize: 25, sortCol: 'daysOverdue', sortAsc: false, search: '', bucket: 'ALL' }
  },
  charts: {},
  currentActiveTab: 'tab-overview'
};

const IS_DEMO_MODE = !(typeof google !== 'undefined' && google.script && google.script.run);

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', () => {
  if (window.feather) feather.replace();
  loadInitialData();
});

/**
 * Loads data from Google Apps Script backend.
 */
function loadInitialData() {
  showToast('Connecting to ASL & ASIL Data Sources...', 'warning');
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(handleDataPayload)
      .withFailureHandler(handleDataError)
      .getDashboardPayload(false);
  } else {
    handleDataPayload(createDemoPayload());
  }
}

function createDemoPayload() {
  const dateOffset = days => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const makeInvoice = (plant, customerShort, customerFull, country, salesperson, invoiceNo, currency, amount, daysOverdue, key) => ({
    plant, customerShort, customerFull, country, salesperson, invoiceNo,
    invoiceDate: dateOffset(-90),
    dueDate: dateOffset(-daysOverdue),
    daysOverdue,
    blDate: dateOffset(-85),
    currency, amount,
    terms: 'Sample 60-day terms',
    remarks: 'Fictional demo record',
    factoring: 'No',
    priority: daysOverdue > 50 ? 'Critical' : daysOverdue > 0 ? 'Urgent' : 'Not Due',
    sourceSheet: 'Demo data',
    sourceRow: 0,
    key
  });
  const openInvoices = [
    makeInvoice('ASL', 'Altura Components', 'Altura Components LLC', 'United States', 'Rohan Mehta', 'DEMO-1001', 'USD', 48500, 76, 'DEMO-1001'),
    makeInvoice('ASIL', 'Meridian Trading', 'Meridian Trading GmbH', 'Germany', 'Neha Rao', 'DEMO-1002', 'EUR', 62300, 35, 'DEMO-1002'),
    makeInvoice('ASL', 'Orion Metals', 'Orion Metals FZE', 'United Arab Emirates', 'Aarav Shah', 'DEMO-1003', 'USD', 27800, 5, 'DEMO-1003'),
    makeInvoice('ASIL', 'Bluewater Engineering', 'Bluewater Engineering Pte Ltd', 'Singapore', 'Neha Rao', 'DEMO-1004', 'EUR', 12400, -12, 'DEMO-1004'),
    makeInvoice('ASL', 'Atlas Industrial', 'Atlas Industrial SA', 'Mexico', 'Rohan Mehta', 'DEMO-1005', 'USD', 39100, 112, 'DEMO-1005'),
    makeInvoice('ASIL', 'Kestrel Supply', 'Kestrel Supply Ltd', 'United Kingdom', 'Maya Iyer', 'DEMO-1006', 'GBP', 18750, 0, 'DEMO-1006'),
    makeInvoice('ASL', 'Crescent Works', 'Crescent Works Pvt Ltd', 'India', 'Aarav Shah', 'DEMO-1007', 'USD', 9600, 18, 'DEMO-1007'),
    makeInvoice('ASIL', 'Northstar Global', 'Northstar Global Inc', 'Canada', 'Maya Iyer', 'DEMO-1008', 'EUR', 55400, 53, 'DEMO-1008')
  ];
  const paidInvoices = [
    { ...makeInvoice('ASL', 'Summit Fabrication', 'Summit Fabrication Inc', 'United States', 'Rohan Mehta', 'DEMO-2001', 'USD', 22100, 0, 'DEMO-2001'), paidDate: dateOffset(-3), paymentSource: 'Demo sample', canRestore: false },
    { ...makeInvoice('ASIL', 'Evergreen Imports', 'Evergreen Imports BV', 'Netherlands', 'Neha Rao', 'DEMO-2002', 'EUR', 31800, 0, 'DEMO-2002'), paidDate: dateOffset(-8), paymentSource: 'Demo sample', canRestore: false },
    { ...makeInvoice('ASL', 'Pioneer Trade', 'Pioneer Trade Co', 'Australia', 'Aarav Shah', 'DEMO-2003', 'USD', 15400, 0, 'DEMO-2003'), paidDate: dateOffset(-14), paymentSource: 'Demo sample', canRestore: false }
  ];
  const allInvoices = [...openInvoices, ...paidInvoices];
  const unique = key => [...new Set(allInvoices.map(invoice => invoice[key]))].sort();
  return {
    success: true,
    trackerUrl: '',
    lastRefreshed: 'Public demo — sample data',
    aslStatus: 'Demo sample data',
    asilStatus: 'Demo sample data',
    syncLogs: [{ timestamp: 'Demo', status: 'Sample', plant: 'ASL + ASIL', recordsScanned: allInvoices.length, validInvoices: allInvoices.length, notes: 'Fictional demo data; no live sheets connected.' }],
    openInvoices,
    paidInvoices,
    salespersons: unique('salesperson'),
    customers: unique('customerShort'),
    countries: unique('country'),
    currencies: unique('currency'),
    plants: ['ASL', 'ASIL'],
    counts: { open: openInvoices.length, paid: paidInvoices.length, total: allInvoices.length }
  };
}

/**
 * Trigger manual data synchronization from source Google Sheets.
 */
function triggerManualRefresh() {
  const btn = document.getElementById('btn-refresh-now');
  const btnText = document.getElementById('refresh-btn-text');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Syncing Sources...';
  showToast('Syncing with ASL Delhi & ASIL Gujarat sheets...', 'warning');

  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(payload => {
        btn.disabled = false;
        btnText.innerText = 'Refresh Now';
        handleDataPayload(payload);
        showToast('Sources refreshed successfully!', 'success');
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btnText.innerText = 'Refresh Now';
        handleDataError(err);
      })
      .apiRefreshData();
  } else {
    btn.disabled = false;
    btnText.innerText = 'Refresh Now';
    showToast('Public demo uses sample data; live sync is disabled.', 'info');
  }
}

/**
 * Handles incoming data payload from server.
 */
function handleDataPayload(payload) {
  if (!payload || !payload.success) {
    handleDataError(new Error(payload ? payload.message : 'Empty response from backend.'));
    return;
  }

  STATE.rawData = payload;

  // Update Header Metadata
  document.getElementById('header-last-refresh').innerText = payload.lastRefreshed || 'Just Now';
  
  // Connection Status Pills
  updateStatusPills(payload.aslStatus, payload.asilStatus);

  // Health Tab Details
  document.getElementById('health-asl-status').innerText = payload.aslStatus || 'Connected';
  document.getElementById('health-asil-status').innerText = payload.asilStatus || 'Connected';
  document.getElementById('health-tracker-link').href = payload.trackerUrl || '#';
  if (IS_DEMO_MODE) {
    const banner = document.getElementById('partial-data-banner');
    banner.className = 'alert-banner';
    banner.style.display = 'flex';
    document.getElementById('banner-title').innerText = 'Public demo:';
    document.getElementById('banner-message').innerText = 'All records are fictional sample data. No live source sheets are connected.';
  }

  // Navigation Badges
  document.getElementById('nav-count-open').innerText = (payload.openInvoices || []).length;
  document.getElementById('nav-count-paid').innerText = (payload.paidInvoices || []).length;
  
  const overdueCount = (payload.openInvoices || []).filter(i => i.daysOverdue > 0).length;
  document.getElementById('nav-count-overdue').innerText = overdueCount;

  // Populate Dropdown Filters
  populateDropdownFilters();

  // Execute Filter & Render Dashboard
  applyGlobalFilters();

  // Render Health Logs
  renderSyncLogs(payload.syncLogs || []);
  
  if (window.feather) feather.replace();
}

/**
 * Handles error during server synchronization.
 */
function handleDataError(err) {
  const msg = err && err.message ? err.message : String(err);
  console.error('Data sync error:', msg);
  showToast('Data connection issue: ' + msg, 'error');

  const banner = document.getElementById('partial-data-banner');
  banner.className = 'alert-banner error';
  banner.style.display = 'flex';
  document.getElementById('banner-title').innerText = 'Connection Alert:';
  document.getElementById('banner-message').innerText = msg + ' (Historical or partial data shown if available)';
}

/**
 * Updates status indicator dots and labels.
 */
function updateStatusPills(aslStatus, asilStatus) {
  const aslDot = document.querySelector('#status-asl .status-dot');
  const asilDot = document.querySelector('#status-asil .status-dot');
  const aslText = document.getElementById('status-asl-text');
  const asilText = document.getElementById('status-asil-text');

  if (aslStatus && aslStatus.includes('Demo')) {
    aslDot.className = 'status-dot warning';
    aslText.innerText = 'Demo';
  } else if (aslStatus && aslStatus.includes('Connected')) {
    aslDot.className = 'status-dot';
    aslText.innerText = 'Online';
  } else {
    aslDot.className = 'status-dot error';
    aslText.innerText = 'Issue';
  }

  if (asilStatus && asilStatus.includes('Demo')) {
    asilDot.className = 'status-dot warning';
    asilText.innerText = 'Demo';
  } else if (asilStatus && asilStatus.includes('Connected')) {
    asilDot.className = 'status-dot';
    asilText.innerText = 'Online';
  } else {
    asilDot.className = 'status-dot error';
    asilText.innerText = 'Issue';
  }
}

/**
 * Populates global filter dropdowns dynamically.
 */
function populateDropdownFilters() {
  const spSelect = document.getElementById('filter-salesperson');
  const custSelect = document.getElementById('filter-customer');
  const countrySelect = document.getElementById('filter-country');
  const currSelect = document.getElementById('filter-currency');

  const currentSp = spSelect.value;
  const currentCust = custSelect.value;
  const currentCountry = countrySelect.value;
  const currentCurr = currSelect.value;

  // Salespersons
  spSelect.innerHTML = '<option value="ALL">All Salespersons</option>';
  STATE.rawData.salespersons.forEach(sp => {
    const opt = document.createElement('option');
    opt.value = sp;
    opt.innerText = sp;
    spSelect.appendChild(opt);
  });
  if (STATE.rawData.salespersons.includes(currentSp)) spSelect.value = currentSp;

  // Customers
  custSelect.innerHTML = '<option value="ALL">All Customers</option>';
  STATE.rawData.customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.innerText = c;
    custSelect.appendChild(opt);
  });
  if (STATE.rawData.customers.includes(currentCust)) custSelect.value = currentCust;

  // Countries
  countrySelect.innerHTML = '<option value="ALL">All Countries</option>';
  STATE.rawData.countries.forEach(co => {
    const opt = document.createElement('option');
    opt.value = co;
    opt.innerText = co;
    countrySelect.appendChild(opt);
  });
  if (STATE.rawData.countries.includes(currentCountry)) countrySelect.value = currentCountry;

  // Currencies
  currSelect.innerHTML = '<option value="ALL">All Currencies</option>';
  STATE.rawData.currencies.forEach(cu => {
    const opt = document.createElement('option');
    opt.value = cu;
    opt.innerText = cu;
    currSelect.appendChild(opt);
  });
  if (STATE.rawData.currencies.includes(currentCurr)) currSelect.value = currentCurr;
}

/**
 * Applies active global filters across all tabs and data views.
 */
function applyGlobalFilters() {
  STATE.filters.plant = document.getElementById('filter-plant').value;
  STATE.filters.salesperson = document.getElementById('filter-salesperson').value;
  STATE.filters.customer = document.getElementById('filter-customer').value;
  STATE.filters.country = document.getElementById('filter-country').value;
  STATE.filters.currency = document.getElementById('filter-currency').value;
  STATE.filters.dateFrom = document.getElementById('filter-date-from').value;
  STATE.filters.dateTo = document.getElementById('filter-date-to').value;

  // Render Filter Chips
  renderFilterChips();

  // Filter Open Invoices
  STATE.filteredOpen = STATE.rawData.openInvoices.filter(inv => {
    if (STATE.filters.plant !== 'ALL' && inv.plant.toUpperCase() !== STATE.filters.plant) return false;
    if (STATE.filters.salesperson !== 'ALL' && inv.salesperson !== STATE.filters.salesperson) return false;
    if (STATE.filters.customer !== 'ALL' && inv.customerShort !== STATE.filters.customer && inv.customerFull !== STATE.filters.customer) return false;
    if (STATE.filters.country !== 'ALL' && inv.country !== STATE.filters.country) return false;
    if (STATE.filters.currency !== 'ALL' && inv.currency !== STATE.filters.currency) return false;
    if (STATE.filters.dateFrom && inv.dueDate && inv.dueDate < STATE.filters.dateFrom) return false;
    if (STATE.filters.dateTo && inv.dueDate && inv.dueDate > STATE.filters.dateTo) return false;
    return true;
  });

  // Filter Paid Invoices
  STATE.filteredPaid = STATE.rawData.paidInvoices.filter(inv => {
    if (STATE.filters.plant !== 'ALL' && inv.plant.toUpperCase() !== STATE.filters.plant) return false;
    if (STATE.filters.salesperson !== 'ALL' && inv.salesperson !== STATE.filters.salesperson) return false;
    if (STATE.filters.customer !== 'ALL' && inv.customerShort !== STATE.filters.customer && inv.customerFull !== STATE.filters.customer) return false;
    if (STATE.filters.country !== 'ALL' && inv.country !== STATE.filters.country) return false;
    if (STATE.filters.currency !== 'ALL' && inv.currency !== STATE.filters.currency) return false;
    return true;
  });

  // Render all active components
  renderExecutiveKPIs();
  renderAutomatedInsights();
  renderVisualCharts();
  renderOpenTable();
  renderPaidTable();
  renderOverdueTable();
  renderCustomerAnalysis();
  renderSalespersonPerformance();
  renderPlantPerformance();
}

/**
 * Resets all global filters to default 'ALL'.
 */
function resetGlobalFilters() {
  document.getElementById('filter-plant').value = 'ALL';
  document.getElementById('filter-salesperson').value = 'ALL';
  document.getElementById('filter-customer').value = 'ALL';
  document.getElementById('filter-country').value = 'ALL';
  document.getElementById('filter-currency').value = 'ALL';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  applyGlobalFilters();
  showToast('Filters reset to default company-wide view.', 'info');
}

/**
 * Renders active filter pill chips in the filter bar.
 */
function renderFilterChips() {
  const container = document.getElementById('active-filter-chips');
  container.innerHTML = '';

  const addChip = (label, key, defaultVal) => {
    if (STATE.filters[key] && STATE.filters[key] !== defaultVal) {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = `${label}: <strong>${STATE.filters[key]}</strong> <span class="filter-chip-remove" onclick="removeFilter('${key}')">&times;</span>`;
      container.appendChild(chip);
    }
  };

  addChip('Plant', 'plant', 'ALL');
  addChip('Salesperson', 'salesperson', 'ALL');
  addChip('Customer', 'customer', 'ALL');
  addChip('Country', 'country', 'ALL');
  addChip('Currency', 'currency', 'ALL');
  if (STATE.filters.dateFrom) addChip('From', 'dateFrom', '');
  if (STATE.filters.dateTo) addChip('To', 'dateTo', '');
}

function removeFilter(key) {
  if (key === 'dateFrom' || key === 'dateTo') {
    document.getElementById(`filter-date-${key === 'dateFrom' ? 'from' : 'to'}`).value = '';
  } else {
    document.getElementById(`filter-${key}`).value = 'ALL';
  }
  applyGlobalFilters();
}

/**
 * Groups numeric amounts by currency safely.
 * CRITICAL RULE: NEVER sums different currencies together!
 */
function groupAmountsByCurrency(invoices) {
  const map = {};
  invoices.forEach(inv => {
    const c = inv.currency || 'UNKNOWN';
    map[c] = (map[c] || 0) + (Number(inv.amount) || 0);
  });
  return map;
}

/**
 * Renders currency breakdown HTML rows.
 */
function renderCurrencyRowsHTML(currencyMap) {
  const keys = Object.keys(currencyMap).sort();
  if (keys.length === 0) {
    return '<div class="currency-row"><span class="currency-tag">-</span><span class="currency-amount">0.00</span></div>';
  }
  return keys.map(k => `
    <div class="currency-row">
      <span class="currency-tag">${k}</span>
      <span class="currency-amount">${formatNumber(currencyMap[k])}</span>
    </div>
  `).join('');
}

/**
 * Formats numbers into commas with 2 decimal places.
 */
function formatNumber(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * ==========================================
 * KPI CARDS RENDERING (TAB 1)
 * ==========================================
 */
function renderExecutiveKPIs() {
  const open = STATE.filteredOpen;
  const paid = STATE.filteredPaid;

  // Card 1: Open Invoices
  document.getElementById('kpi-open-count').innerText = open.length;
  const aslOpen = open.filter(i => i.plant.toUpperCase() === 'ASL').length;
  const asilOpen = open.filter(i => i.plant.toUpperCase() === 'ASIL').length;
  document.getElementById('kpi-open-asl').innerText = `${aslOpen} Invoices`;
  document.getElementById('kpi-open-asil').innerText = `${asilOpen} Invoices`;

  // Card 2: Open Receivables by Currency
  const openCurrencies = groupAmountsByCurrency(open);
  document.getElementById('kpi-open-receivables-list').innerHTML = renderCurrencyRowsHTML(openCurrencies);

  // Card 3: Overdue Receivables
  const overdueInvoices = open.filter(i => i.daysOverdue > 0);
  document.getElementById('kpi-overdue-count').innerText = overdueInvoices.length;
  const overdueCurrencies = groupAmountsByCurrency(overdueInvoices);
  document.getElementById('kpi-overdue-receivables-list').innerHTML = renderCurrencyRowsHTML(overdueCurrencies);
  const overduePct = open.length > 0 ? Math.round((overdueInvoices.length / open.length) * 100) : 0;
  document.getElementById('kpi-overdue-pct').innerText = `${overduePct}% Overdue`;

  // Card 4: Not Yet Due
  const notDueInvoices = open.filter(i => i.daysOverdue <= 0);
  document.getElementById('kpi-notdue-count').innerText = notDueInvoices.length;
  const notDueCurrencies = groupAmountsByCurrency(notDueInvoices);
  document.getElementById('kpi-notdue-receivables-list').innerHTML = renderCurrencyRowsHTML(notDueCurrencies);

  // Card 5: Due in Next 7 Days (daysOverdue between -7 and 0)
  const due7Invoices = open.filter(i => i.daysOverdue >= -7 && i.daysOverdue <= 0);
  document.getElementById('kpi-due7-count').innerText = due7Invoices.length;
  const due7Currencies = groupAmountsByCurrency(due7Invoices);
  document.getElementById('kpi-due7-receivables-list').innerHTML = renderCurrencyRowsHTML(due7Currencies);

  // Card 6: Due in Next 30 Days (daysOverdue between -30 and 0)
  const due30Invoices = open.filter(i => i.daysOverdue >= -30 && i.daysOverdue <= 0);
  document.getElementById('kpi-due30-count').innerText = due30Invoices.length;
  const due30Currencies = groupAmountsByCurrency(due30Invoices);
  document.getElementById('kpi-due30-receivables-list').innerHTML = renderCurrencyRowsHTML(due30Currencies);

  // Card 7: Payments Received
  document.getElementById('kpi-paid-count').innerText = paid.length;
  const paidCurrencies = groupAmountsByCurrency(paid);
  document.getElementById('kpi-paid-receivables-list').innerHTML = renderCurrencyRowsHTML(paidCurrencies);

  // Card 8: Critical Overdue (>50 days)
  const criticalInvoices = open.filter(i => i.daysOverdue > 50);
  document.getElementById('kpi-critical-count').innerText = criticalInvoices.length;
  const criticalCurrencies = groupAmountsByCurrency(criticalInvoices);
  document.getElementById('kpi-critical-receivables-list').innerHTML = renderCurrencyRowsHTML(criticalCurrencies);
}

/**
 * Filter by clicking on a KPI card.
 */
function filterByCard(type) {
  if (type === 'open') {
    switchTab('tab-open', document.querySelectorAll('.nav-tab')[1]);
  } else if (type === 'overdue' || type === 'critical') {
    switchTab('tab-overdue', document.querySelectorAll('.nav-tab')[3]);
    if (type === 'critical') filterAgeingBucket('51-90');
    else filterAgeingBucket('ALL');
  } else if (type === 'paid') {
    switchTab('tab-paid', document.querySelectorAll('.nav-tab')[2]);
  } else if (type === 'notdue' || type === 'due7' || type === 'due30') {
    switchTab('tab-open', document.querySelectorAll('.nav-tab')[1]);
    if (type === 'notdue') {
      STATE.tables.open.search = 'Not Yet Due';
      document.getElementById('search-open').value = 'Not Yet Due';
      handleTableSearch('open');
    }
  }
}

/**
 * ==========================================
 * AUTOMATED CEO FINANCIAL INSIGHTS ENGINE
 * ==========================================
 */
function renderAutomatedInsights() {
  const container = document.getElementById('insights-container');
  container.innerHTML = '';
  const open = STATE.filteredOpen;
  const insights = [];

  const overdueInvoices = open.filter(i => i.daysOverdue > 0);
  const critical50 = open.filter(i => i.daysOverdue > 50);
  const critical90 = open.filter(i => i.daysOverdue > 90);

  // 1. Overdue Exposure Alert
  if (overdueInvoices.length > 0) {
    const overdueCurrs = groupAmountsByCurrency(overdueInvoices);
    const currSummary = Object.keys(overdueCurrs).map(c => `${c} ${formatNumber(overdueCurrs[c])}`).join(' + ');
    insights.push({
      type: critical50.length > 0 ? 'critical' : 'warning',
      text: `<strong>Overdue Alert:</strong> ${currSummary} is currently overdue across ${overdueInvoices.length} invoices. ${critical50.length} invoices have exceeded 50 days overdue.`,
      actionText: 'View Overdue & Ageing ↗',
      actionHandler: () => { switchTab('tab-overdue', document.querySelectorAll('.nav-tab')[3]); }
    });
  } else {
    insights.push({
      type: 'success',
      text: '<strong>Zero Overdue Balance:</strong> All invoices in the active filter criteria are within contracted credit terms.',
      actionText: 'View Open Invoices ↗',
      actionHandler: () => { switchTab('tab-open', document.querySelectorAll('.nav-tab')[1]); }
    });
  }

  // 2. Critical >90 Days Invoices
  if (critical90.length > 0) {
    insights.push({
      type: 'critical',
      text: `<strong>High-Risk Receivables:</strong> ${critical90.length} invoice(s) have remained uncollected for more than 90 days overdue. Urgent management escalation recommended.`,
      actionText: 'Filter >90d Invoices ↗',
      actionHandler: () => {
        switchTab('tab-overdue', document.querySelectorAll('.nav-tab')[3]);
        filterAgeingBucket('90+');
      }
    });
  }

  // 3. Plant Exposure Comparison
  const openCurrs = groupAmountsByCurrency(open);
  const primaryCurrency = Object.keys(openCurrs).sort((a,b) => openCurrs[b] - openCurrs[a])[0];
  if (primaryCurrency) {
    const asilTotal = open.filter(i => i.plant.toUpperCase() === 'ASIL' && i.currency === primaryCurrency).reduce((sum, i) => sum + i.amount, 0);
    const aslTotal = open.filter(i => i.plant.toUpperCase() === 'ASL' && i.currency === primaryCurrency).reduce((sum, i) => sum + i.amount, 0);
    const total = asilTotal + aslTotal;
    if (total > 0) {
      const asilPct = Math.round((asilTotal / total) * 100);
      const aslPct = 100 - asilPct;
      const leadingPlant = asilPct >= aslPct ? 'ASIL Gujarat' : 'ASL Delhi';
      const leadingPct = Math.max(asilPct, aslPct);
      insights.push({
        type: 'info',
        text: `<strong>Plant Exposure (${primaryCurrency}):</strong> ${leadingPlant} represents ${leadingPct}% of total open ${primaryCurrency} export receivables.`,
        actionText: 'Compare Plant Performance ↗',
        actionHandler: () => { switchTab('tab-plants', document.querySelectorAll('.nav-tab')[6]); }
      });
    }
  }

  // 4. Customer Concentration Risk
  const custMap = {};
  open.forEach(i => {
    const cust = i.customerShort || i.customerFull || 'Unknown';
    if (!custMap[cust]) custMap[cust] = {};
    custMap[cust][i.currency] = (custMap[cust][i.currency] || 0) + i.amount;
  });

  if (primaryCurrency && openCurrs[primaryCurrency] > 0) {
    let topCust = '';
    let topCustAmount = 0;
    Object.keys(custMap).forEach(cust => {
      const amt = custMap[cust][primaryCurrency] || 0;
      if (amt > topCustAmount) {
        topCustAmount = amt;
        topCust = cust;
      }
    });

    if (topCust && topCustAmount > 0) {
      const concentrationPct = Math.round((topCustAmount / openCurrs[primaryCurrency]) * 100);
      if (concentrationPct >= 20) {
        insights.push({
          type: concentrationPct >= 40 ? 'warning' : 'info',
          text: `<strong>Customer Concentration:</strong> Top customer <em>${topCust}</em> represents ${concentrationPct}% of total open receivables in ${primaryCurrency} (${primaryCurrency} ${formatNumber(topCustAmount)}).`,
          actionText: 'View Customer Analysis ↗',
          actionHandler: () => { switchTab('tab-customers', document.querySelectorAll('.nav-tab')[4]); }
        });
      }
    }
  }

  // 5. Salesperson Highest Overdue
  const spOverdueCount = {};
  overdueInvoices.forEach(i => {
    spOverdueCount[i.salesperson] = (spOverdueCount[i.salesperson] || 0) + 1;
  });
  let maxSp = '';
  let maxSpCount = 0;
  Object.keys(spOverdueCount).forEach(sp => {
    if (spOverdueCount[sp] > maxSpCount) {
      maxSpCount = spOverdueCount[sp];
      maxSp = sp;
    }
  });
  if (maxSp && maxSpCount >= 2) {
    insights.push({
      type: 'warning',
      text: `<strong>Salesperson Delinquency:</strong> ${maxSp} accounts for ${maxSpCount} overdue invoices in the filtered portfolio.`,
      actionText: 'Review Salesperson ↗',
      actionHandler: () => {
        document.getElementById('filter-salesperson').value = maxSp;
        applyGlobalFilters();
        switchTab('tab-salespersons', document.querySelectorAll('.nav-tab')[5]);
      }
    });
  }

  // 6. Upcoming 7-day Payment Pipeline
  const due7Invoices = open.filter(i => i.daysOverdue >= -7 && i.daysOverdue <= 0);
  if (due7Invoices.length > 0) {
    const due7Currs = groupAmountsByCurrency(due7Invoices);
    const summary7 = Object.keys(due7Currs).map(c => `${c} ${formatNumber(due7Currs[c])}`).join(' + ');
    insights.push({
      type: 'info',
      text: `<strong>7-Day Inflow Pipeline:</strong> ${summary7} across ${due7Invoices.length} invoices scheduled to become due within the next 7 days.`,
      actionText: 'Inspect Invoices ↗',
      actionHandler: () => { filterByCard('due7'); }
    });
  }

  // 7. Data Quality Alert
  const missingTermsCount = open.filter(i => !i.terms).length;
  const missingDueDatesCount = open.filter(i => !i.dueDate).length;
  if (missingTermsCount > 0 || missingDueDatesCount > 0) {
    insights.push({
      type: 'warning',
      text: `<strong>Data Quality Alert:</strong> ${missingDueDatesCount} invoice(s) lack valid contractual due dates, and ${missingTermsCount} invoice(s) have unspecified payment terms.`,
      actionText: 'View Data Health ↗',
      actionHandler: () => { switchTab('tab-health', document.querySelectorAll('.nav-tab')[7]); }
    });
  }

  // Render to DOM
  insights.forEach(item => {
    const el = document.createElement('div');
    el.className = `insight-item ${item.type}`;
    el.innerHTML = `
      <div class="insight-text">${item.text}</div>
      <span class="insight-action">${item.actionText}</span>
    `;
    el.querySelector('.insight-action').onclick = item.actionHandler;
    container.appendChild(el);
  });
}

/**
 * ==========================================
 * FINANCIAL VISUALIZATIONS (CHART.JS)
 * ==========================================
 */
function renderVisualCharts() {
  const open = STATE.filteredOpen;
  const paid = STATE.filteredPaid;

  // Chart A: Plant-wise Receivables (Open Invoices & Amounts by Currency)
  renderPlantComparisonChart(open);

  // Chart B: Invoice Ageing Analysis
  renderAgeingChart(open);

  // Chart C: Status Distribution (Donut)
  renderStatusDonutChart(open, paid);

  // Chart D: Top 10 Customers
  renderTopCustomersChart(open);

  // Chart E: Salesperson Performance
  renderSalespersonChart(open);

  // Chart F: Upcoming Horizon (7d, 15d, 30d)
  renderUpcomingHorizonChart(open);

  // Chart G: Monthly Payment Trends (Detected/Recorded)
  renderPaymentTrendsChart(paid);

  // Chart H: Risk Concentration (Top overdue customers)
  renderRiskConcentrationChart(open);
}

function destroyChart(name) {
  if (STATE.charts[name]) {
    STATE.charts[name].destroy();
    delete STATE.charts[name];
  }
}

// Chart A
function renderPlantComparisonChart(open) {
  destroyChart('plant');
  const ctx = document.getElementById('chart-plant-comparison');
  if (!ctx) return;

  const aslInvoices = open.filter(i => i.plant.toUpperCase() === 'ASL');
  const asilInvoices = open.filter(i => i.plant.toUpperCase() === 'ASIL');

  STATE.charts['plant'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['ASL Delhi Plant', 'ASIL Gujarat Plant'],
      datasets: [
        {
          label: 'Open Invoice Count',
          data: [aslInvoices.length, asilInvoices.length],
          backgroundColor: '#3b82f6',
          borderRadius: 4
        },
        {
          label: 'Overdue Count',
          data: [aslInvoices.filter(i => i.daysOverdue > 0).length, asilInvoices.filter(i => i.daysOverdue > 0).length],
          backgroundColor: '#ef4444',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const plant = items[0].dataIndex === 0 ? 'ASL' : 'ASIL';
              const invs = plant === 'ASL' ? aslInvoices : asilInvoices;
              const currs = groupAmountsByCurrency(invs);
              return '\nReceivables by Currency:\n' + Object.keys(currs).map(c => `• ${c}: ${formatNumber(currs[c])}`).join('\n');
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' } }
      }
    }
  });
}

// Chart B
function renderAgeingChart(open) {
  destroyChart('ageing');
  const ctx = document.getElementById('chart-ageing');
  if (!ctx) return;

  const bNotDue = open.filter(i => i.daysOverdue < 0).length;
  const bToday = open.filter(i => i.daysOverdue === 0).length;
  const b1_30 = open.filter(i => i.daysOverdue >= 1 && i.daysOverdue <= 30).length;
  const b31_50 = open.filter(i => i.daysOverdue >= 31 && i.daysOverdue <= 50).length;
  const b51_90 = open.filter(i => i.daysOverdue >= 51 && i.daysOverdue <= 90).length;
  const b90Plus = open.filter(i => i.daysOverdue > 90).length;

  STATE.charts['ageing'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Not Yet Due', 'Due Today', '1–30d Overdue', '31–50d Overdue', '51–90d Overdue', '>90d Critical'],
      datasets: [{
        label: 'Number of Invoices',
        data: [bNotDue, bToday, b1_30, b31_50, b51_90, b90Plus],
        backgroundColor: ['#2563eb', '#0284c7', '#d97706', '#f97316', '#dc2626', '#991b1b'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' } }
      }
    }
  });
}

// Chart C
function renderStatusDonutChart(open, paid) {
  destroyChart('donut');
  const ctx = document.getElementById('chart-status-donut');
  if (!ctx) return;

  const notDue = open.filter(i => i.daysOverdue <= 0).length;
  const overdue = open.filter(i => i.daysOverdue > 0).length;
  const paidCount = paid.length;

  STATE.charts['donut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Not Yet Due', 'Overdue Receivables', 'Payments Received'],
      datasets: [{
        data: [notDue, overdue, paidCount],
        backgroundColor: ['#2563eb', '#dc2626', '#16a34a'],
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      },
      cutout: '65%'
    }
  });
}

// Chart D
function renderTopCustomersChart(open) {
  destroyChart('topCust');
  const ctx = document.getElementById('chart-top-customers');
  if (!ctx) return;

  // Determine top currency
  const currs = groupAmountsByCurrency(open);
  const activeCurr = STATE.filters.currency !== 'ALL'
    ? STATE.filters.currency
    : (Object.keys(currs).sort((a,b) => currs[b] - currs[a])[0] || 'EUR');

  document.getElementById('top-customers-currency-label').innerText = `Currency: ${activeCurr}`;

  const custTotals = {};
  open.filter(i => i.currency === activeCurr).forEach(i => {
    const name = i.customerShort || i.customerFull || 'Unknown';
    custTotals[name] = (custTotals[name] || 0) + i.amount;
  });

  const sortedCusts = Object.keys(custTotals)
    .sort((a,b) => custTotals[b] - custTotals[a])
    .slice(0, 10);

  STATE.charts['topCust'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedCusts,
      datasets: [{
        label: `Outstanding Exposure (${activeCurr})`,
        data: sortedCusts.map(c => custTotals[c]),
        backgroundColor: '#1e3a8a',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${activeCurr} ${formatNumber(item.raw)}`
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#f1f5f9' } }
      }
    }
  });
}

// Chart E
function renderSalespersonChart(open) {
  destroyChart('sp');
  const ctx = document.getElementById('chart-salesperson');
  if (!ctx) return;

  const spMap = {};
  open.forEach(i => {
    if (!spMap[i.salesperson]) spMap[i.salesperson] = { open: 0, overdue: 0 };
    spMap[i.salesperson].open++;
    if (i.daysOverdue > 0) spMap[i.salesperson].overdue++;
  });

  const spNames = Object.keys(spMap).sort((a,b) => spMap[b].open - spMap[a].open);

  STATE.charts['sp'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: spNames,
      datasets: [
        {
          label: 'Total Open Invoices',
          data: spNames.map(s => spMap[s].open),
          backgroundColor: '#3b82f6',
          borderRadius: 4
        },
        {
          label: 'Overdue Invoices',
          data: spNames.map(s => spMap[s].overdue),
          backgroundColor: '#ef4444',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } } }
    }
  });
}

// Chart F: Upcoming Maturity Horizon
function renderUpcomingHorizonChart(open) {
  destroyChart('upcoming');
  const ctx = document.getElementById('chart-upcoming');
  if (!ctx) return;

  const due7 = open.filter(i => i.daysOverdue >= -7 && i.daysOverdue <= 0).length;
  const due15 = open.filter(i => i.daysOverdue >= -15 && i.daysOverdue < -7).length;
  const due30 = open.filter(i => i.daysOverdue >= -30 && i.daysOverdue < -15).length;

  STATE.charts['upcoming'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Due in 1–7 Days', 'Due in 8–15 Days', 'Due in 16–30 Days'],
      datasets: [{
        label: 'Invoices Maturing',
        data: [due7, due15, due30],
        backgroundColor: ['#d97706', '#f59e0b', '#3b82f6'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } } }
    }
  });
}

// Chart G: Payment Trends (Detected/Recorded Date)
function renderPaymentTrendsChart(paid) {
  destroyChart('trends');
  const ctx = document.getElementById('chart-payments-trend');
  if (!ctx) return;

  const monthMap = {};
  paid.forEach(p => {
    const dStr = p.paidDate || '';
    const m = dStr.slice(0, 7); // YYYY-MM
    if (m && m.length === 7) {
      monthMap[m] = (monthMap[m] || 0) + 1;
    }
  });

  const sortedMonths = Object.keys(monthMap).sort();

  STATE.charts['trends'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedMonths.length ? sortedMonths : ['Current Month'],
      datasets: [{
        label: 'Payments Detected/Recorded',
        data: sortedMonths.length ? sortedMonths.map(m => monthMap[m]) : [paid.length],
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        subtitle: { display: true, text: 'Note: Refers to detection/record timestamp' }
      },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } } }
    }
  });
}

// Chart H: Risk Concentration (Overdue share)
function renderRiskConcentrationChart(open) {
  destroyChart('risk');
  const ctx = document.getElementById('chart-risk-concentration');
  if (!ctx) return;

  const overdueInvs = open.filter(i => i.daysOverdue > 0);
  const currs = groupAmountsByCurrency(overdueInvs);
  const activeCurr = STATE.filters.currency !== 'ALL'
    ? STATE.filters.currency
    : (Object.keys(currs).sort((a,b) => currs[b] - currs[a])[0] || 'EUR');

  const custOverdue = {};
  overdueInvs.filter(i => i.currency === activeCurr).forEach(i => {
    const name = i.customerShort || i.customerFull || 'Unknown';
    custOverdue[name] = (custOverdue[name] || 0) + i.amount;
  });

  const sortedCusts = Object.keys(custOverdue).sort((a,b) => custOverdue[b] - custOverdue[a]);
  const top4 = sortedCusts.slice(0, 4);
  const othersTotal = sortedCusts.slice(4).reduce((sum, c) => sum + custOverdue[c], 0);

  const labels = [...top4];
  const data = top4.map(c => custOverdue[c]);
  if (othersTotal > 0) {
    labels.push('All Other Customers');
    data.push(othersTotal);
  }

  STATE.charts['risk'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['No Overdue'],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: ['#dc2626', '#ea580c', '#f59e0b', '#0284c7', '#94a3b8']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      },
      cutout: '60%'
    }
  });
}

/**
 * ==========================================
 * TAB 2: OPEN INVOICES TABLE
 * ==========================================
 */
function renderOpenTable() {
  const tbody = document.getElementById('tbody-open');
  if (!tbody) return;

  let list = [...STATE.filteredOpen];

  // Search filter
  const query = STATE.tables.open.search.toLowerCase().trim();
  if (query) {
    list = list.filter(i =>
      i.invoiceNo.toLowerCase().includes(query) ||
      i.customerShort.toLowerCase().includes(query) ||
      i.customerFull.toLowerCase().includes(query) ||
      i.country.toLowerCase().includes(query) ||
      i.salesperson.toLowerCase().includes(query) ||
      i.priority.toLowerCase().includes(query)
    );
  }

  // Sort
  const { sortCol, sortAsc } = STATE.tables.open;
  list.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  // Pagination
  const { page, pageSize } = STATE.tables.open;
  const total = list.length;
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  document.getElementById('page-info-open').innerText = `Showing ${total === 0 ? 0 : start + 1} to ${Math.min(start + pageSize, total)} of ${total} entries`;
  document.getElementById('btn-prev-open').disabled = (page <= 1);
  document.getElementById('btn-next-open').disabled = (start + pageSize >= total);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 24px;">No open invoices match criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(inv => {
    const pillClass = inv.daysOverdue > 50 ? 'pill-critical' : (inv.daysOverdue > 0 ? 'pill-urgent' : 'pill-notdue');
    return `
      <tr>
        <td><span class="pill pill-plant">${inv.plant}</span></td>
        <td><strong>${escapeHtml(inv.customerShort || inv.customerFull)}</strong></td>
        <td>${escapeHtml(inv.country)}</td>
        <td>${escapeHtml(inv.salesperson)}</td>
        <td><a href="#" onclick="openInvoiceDetail('${inv.key}'); return false;" style="font-weight: 700; color: #2563eb;">${escapeHtml(inv.invoiceNo)}</a></td>
        <td>${inv.invoiceDate || '-'}</td>
        <td>${inv.dueDate || '-'}</td>
        <td><strong style="color: ${inv.daysOverdue > 0 ? 'var(--status-red)' : 'var(--text-secondary)'};">${inv.daysOverdue}</strong></td>
        <td><strong>${inv.currency}</strong></td>
        <td><strong>${formatNumber(inv.amount)}</strong></td>
        <td style="font-size: 11px; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(inv.terms || '-')}</td>
        <td><span class="pill ${pillClass}">${escapeHtml(inv.priority)}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openInvoiceDetail('${inv.key}')">View</button>
          <button class="btn btn-success btn-sm" onclick="openMarkPaidModal('${inv.key}', '${inv.currency}', ${inv.amount})">Paid</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * ==========================================
 * TAB 3: PAYMENTS RECEIVED TABLE
 * ==========================================
 */
function renderPaidTable() {
  const tbody = document.getElementById('tbody-paid');
  if (!tbody) return;

  let list = [...STATE.filteredPaid];

  // Search filter
  const query = STATE.tables.paid.search.toLowerCase().trim();
  if (query) {
    list = list.filter(i =>
      i.invoiceNo.toLowerCase().includes(query) ||
      i.customerShort.toLowerCase().includes(query) ||
      i.salesperson.toLowerCase().includes(query)
    );
  }

  // Sort
  const { sortCol, sortAsc } = STATE.tables.paid;
  list.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  // Pagination
  const { page, pageSize } = STATE.tables.paid;
  const total = list.length;
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  document.getElementById('page-info-paid').innerText = `Showing ${total === 0 ? 0 : start + 1} to ${Math.min(start + pageSize, total)} of ${total} entries`;
  document.getElementById('btn-prev-paid').disabled = (page <= 1);
  document.getElementById('btn-next-paid').disabled = (start + pageSize >= total);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">No payment records match criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(inv => {
    const isManual = inv.paymentSource === 'Manually checked';
    const sourcePill = isManual ? 'pill-source-manual' : 'pill-source-yellow';
    return `
      <tr>
        <td><span class="pill pill-plant">${inv.plant}</span></td>
        <td><strong>${escapeHtml(inv.customerShort || inv.customerFull)}</strong></td>
        <td>${escapeHtml(inv.invoiceNo)}</td>
        <td>${escapeHtml(inv.salesperson)}</td>
        <td><strong>${inv.currency}</strong></td>
        <td><strong>${formatNumber(inv.amount)}</strong></td>
        <td>${inv.paidDate || '-'}</td>
        <td><span class="pill ${sourcePill}">${escapeHtml(inv.paymentSource)}</span></td>
        <td>
          ${isManual ? `<button class="btn btn-outline btn-sm" onclick="submitRestorePaid('${inv.key}')" title="Undo manual paid mark">Restore</button>` : `<span style="font-size: 11px; color: var(--text-muted);">Source Row</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * ==========================================
 * TAB 4: OVERDUE & AGEING TABLE
 * ==========================================
 */
function renderOverdueTable() {
  const tbody = document.getElementById('tbody-overdue');
  if (!tbody) return;

  let list = STATE.filteredOpen.filter(i => i.daysOverdue > 0);

  // Bucket filter
  const bucket = STATE.tables.overdue.bucket;
  if (bucket === '1-30') list = list.filter(i => i.daysOverdue >= 1 && i.daysOverdue <= 30);
  else if (bucket === '31-50') list = list.filter(i => i.daysOverdue >= 31 && i.daysOverdue <= 50);
  else if (bucket === '51-90') list = list.filter(i => i.daysOverdue >= 51 && i.daysOverdue <= 90);
  else if (bucket === '90+') list = list.filter(i => i.daysOverdue > 90);

  // Search
  const query = STATE.tables.overdue.search.toLowerCase().trim();
  if (query) {
    list = list.filter(i =>
      i.invoiceNo.toLowerCase().includes(query) ||
      i.customerShort.toLowerCase().includes(query) ||
      i.salesperson.toLowerCase().includes(query)
    );
  }

  // Sort
  const { sortCol, sortAsc } = STATE.tables.overdue;
  list.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  // Pagination
  const { page, pageSize } = STATE.tables.overdue;
  const total = list.length;
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  document.getElementById('page-info-overdue').innerText = `Showing ${total === 0 ? 0 : start + 1} to ${Math.min(start + pageSize, total)} of ${total} entries`;
  document.getElementById('btn-prev-overdue').disabled = (page <= 1);
  document.getElementById('btn-next-overdue').disabled = (start + pageSize >= total);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">No overdue invoices in this bucket.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(inv => {
    const isCritical = inv.daysOverdue > 50;
    return `
      <tr style="${isCritical ? 'background-color: #fffaf0;' : ''}">
        <td><span class="pill pill-plant">${inv.plant}</span></td>
        <td><strong>${escapeHtml(inv.customerShort || inv.customerFull)}</strong></td>
        <td><a href="#" onclick="openInvoiceDetail('${inv.key}'); return false;" style="font-weight: 700; color: #dc2626;">${escapeHtml(inv.invoiceNo)}</a></td>
        <td>${escapeHtml(inv.salesperson)}</td>
        <td>${inv.dueDate || '-'}</td>
        <td><strong style="color: var(--status-red);">${inv.daysOverdue} days</strong></td>
        <td><strong>${inv.currency}</strong></td>
        <td><strong>${formatNumber(inv.amount)}</strong></td>
        <td><span class="pill ${isCritical ? 'pill-critical' : 'pill-urgent'}">${inv.priority}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openInvoiceDetail('${inv.key}')">View</button>
          <button class="btn btn-success btn-sm" onclick="openMarkPaidModal('${inv.key}', '${inv.currency}', ${inv.amount})">Paid</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAgeingBucket(bucket) {
  STATE.tables.overdue.bucket = bucket;
  STATE.tables.overdue.page = 1;

  ['all', '1-30', '31-50', '51-90', '90plus'].forEach(id => {
    const btn = document.getElementById(`bucket-btn-${id}`);
    if (btn) btn.className = 'btn btn-outline btn-sm';
  });

  const activeBtnId = bucket === 'ALL' ? 'all' : (bucket === '90+' ? '90plus' : bucket);
  const activeBtn = document.getElementById(`bucket-btn-${activeBtnId}`);
  if (activeBtn) activeBtn.className = 'btn btn-primary btn-sm';

  renderOverdueTable();
}

/**
 * ==========================================
 * TAB 5: CUSTOMER ANALYSIS
 * ==========================================
 */
function renderCustomerAnalysis() {
  const tbody = document.getElementById('tbody-customers');
  if (!tbody) return;

  const query = (document.getElementById('search-customer-table').value || '').toLowerCase().trim();
  const open = STATE.filteredOpen;
  const paid = STATE.filteredPaid;

  const map = {};

  open.forEach(inv => {
    const cust = inv.customerShort || inv.customerFull || 'Unknown';
    if (!map[cust]) {
      map[cust] = {
        name: cust,
        country: inv.country,
        plants: new Set(),
        salespersons: new Set(),
        openCount: 0,
        openAmounts: {},
        overdueCount: 0,
        overdueAmounts: {},
        paidCount: 0,
        maxDaysOverdue: 0
      };
    }
    map[cust].plants.add(inv.plant);
    map[cust].salespersons.add(inv.salesperson);
    map[cust].openCount++;
    map[cust].openAmounts[inv.currency] = (map[cust].openAmounts[inv.currency] || 0) + inv.amount;
    if (inv.daysOverdue > 0) {
      map[cust].overdueCount++;
      map[cust].overdueAmounts[inv.currency] = (map[cust].overdueAmounts[inv.currency] || 0) + inv.amount;
    }
    if (inv.daysOverdue > map[cust].maxDaysOverdue) map[cust].maxDaysOverdue = inv.daysOverdue;
  });

  paid.forEach(inv => {
    const cust = inv.customerShort || inv.customerFull || 'Unknown';
    if (map[cust]) {
      map[cust].paidCount++;
    }
  });

  let custs = Object.values(map);
  if (query) {
    custs = custs.filter(c => c.name.toLowerCase().includes(query) || c.country.toLowerCase().includes(query));
  }

  custs.sort((a,b) => b.maxDaysOverdue - a.maxDaysOverdue || b.openCount - a.openCount);

  if (custs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">No customer records match filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = custs.map(c => `
    <tr>
      <td><strong><a href="#" onclick="openCustomerDrilldown('${escapeAttr(c.name)}'); return false;" style="color: #1e3a8a;">${escapeHtml(c.name)}</a></strong></td>
      <td>${escapeHtml(c.country)}</td>
      <td>${Array.from(c.plants).map(p => `<span class="pill pill-plant">${p}</span>`).join(' ')}</td>
      <td>${Array.from(c.salespersons).join(', ')}</td>
      <td><strong>${c.openCount}</strong></td>
      <td>${Object.keys(c.openAmounts).map(cu => `<div><small>${cu}</small> ${formatNumber(c.openAmounts[cu])}</div>`).join('')}</td>
      <td><strong style="color: ${c.overdueCount > 0 ? 'var(--status-red)' : 'var(--text-secondary)'};">${c.overdueCount}</strong></td>
      <td>${Object.keys(c.overdueAmounts).map(cu => `<div style="color: var(--status-red);"><small>${cu}</small> ${formatNumber(c.overdueAmounts[cu])}</div>`).join('') || '-'}</td>
      <td><strong style="color: ${c.maxDaysOverdue > 50 ? 'var(--status-red)' : 'var(--text-primary)'};">${c.maxDaysOverdue}d</strong></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCustomerDrilldown('${escapeAttr(c.name)}')">Invoices</button>
      </td>
    </tr>
  `).join('');
}

/**
 * ==========================================
 * TAB 6: SALESPERSON PERFORMANCE
 * ==========================================
 */
function renderSalespersonPerformance() {
  const cardsContainer = document.getElementById('salesperson-cards-container');
  const tbody = document.getElementById('tbody-salespersons');
  if (!tbody || !cardsContainer) return;

  const query = (document.getElementById('search-salesperson-table').value || '').toLowerCase().trim();
  const open = STATE.filteredOpen;
  const paid = STATE.filteredPaid;

  const map = {};

  open.forEach(inv => {
    const sp = inv.salesperson || 'Unassigned';
    if (!map[sp]) {
      map[sp] = {
        name: sp,
        plants: new Set(),
        openCount: 0,
        openAmounts: {},
        overdueCount: 0,
        overdueAmounts: {},
        notDueCount: 0,
        paidCount: 0,
        maxDaysOverdue: 0,
        highestOverdueCustomer: '',
        criticalInvoices: 0
      };
    }
    map[sp].plants.add(inv.plant);
    map[sp].openCount++;
    map[sp].openAmounts[inv.currency] = (map[sp].openAmounts[inv.currency] || 0) + inv.amount;

    if (inv.daysOverdue > 0) {
      map[sp].overdueCount++;
      map[sp].overdueAmounts[inv.currency] = (map[sp].overdueAmounts[inv.currency] || 0) + inv.amount;
      if (inv.daysOverdue > map[sp].maxDaysOverdue) {
        map[sp].maxDaysOverdue = inv.daysOverdue;
        map[sp].highestOverdueCustomer = inv.customerShort || inv.customerFull;
      }
    } else {
      map[sp].notDueCount++;
    }

    if (inv.daysOverdue > 50) map[sp].criticalInvoices++;
  });

  paid.forEach(inv => {
    const sp = inv.salesperson || 'Unassigned';
    if (map[sp]) map[sp].paidCount++;
  });

  let spList = Object.values(map);
  if (query) {
    spList = spList.filter(s => s.name.toLowerCase().includes(query));
  }

  spList.sort((a,b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount);

  // Highlights cards for top 3 salespersons
  cardsContainer.innerHTML = spList.slice(0, 3).map(s => `
    <div class="kpi-card" style="border-top: 4px solid #2563eb; cursor: pointer;" onclick="openSalespersonDrilldown('${escapeAttr(s.name)}')">
      <div class="kpi-header">
        <span class="kpi-title">${escapeHtml(s.name)}</span>
        <span class="pill pill-plant">${Array.from(s.plants).join(', ')}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0;">
        <div>
          <div style="font-size: 11px; color: var(--text-muted);">Open Invoices:</div>
          <strong style="font-size: 20px;">${s.openCount}</strong>
        </div>
        <div>
          <div style="font-size: 11px; color: var(--status-red);">Overdue:</div>
          <strong style="font-size: 20px; color: var(--status-red);">${s.overdueCount}</strong>
        </div>
      </div>
      <div class="kpi-currency-group">
        <strong style="font-size: 10px; color: var(--text-muted);">Open Exposure:</strong>
        ${Object.keys(s.openAmounts).map(cu => `<div class="currency-row"><span class="currency-tag">${cu}</span><span class="currency-amount">${formatNumber(s.openAmounts[cu])}</span></div>`).join('')}
      </div>
      <div class="kpi-subtext">Click to view all invoices for ${escapeHtml(s.name)}</div>
    </div>
  `).join('');

  // Table
  tbody.innerHTML = spList.map(s => `
    <tr>
      <td><strong><a href="#" onclick="openSalespersonDrilldown('${escapeAttr(s.name)}'); return false;" style="color: #1e3a8a;">${escapeHtml(s.name)}</a></strong></td>
      <td>${Array.from(s.plants).map(p => `<span class="pill pill-plant">${p}</span>`).join(' ')}</td>
      <td><strong>${s.openCount}</strong></td>
      <td>${Object.keys(s.openAmounts).map(cu => `<div><small>${cu}</small> ${formatNumber(s.openAmounts[cu])}</div>`).join('')}</td>
      <td><strong style="color: ${s.overdueCount > 0 ? 'var(--status-red)' : 'var(--text-secondary)'};">${s.overdueCount}</strong></td>
      <td>${Object.keys(s.overdueAmounts).map(cu => `<div style="color: var(--status-red);"><small>${cu}</small> ${formatNumber(s.overdueAmounts[cu])}</div>`).join('') || '-'}</td>
      <td>${s.notDueCount}</td>
      <td>${s.paidCount}</td>
      <td>${escapeHtml(s.highestOverdueCustomer || '-')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openSalespersonDrilldown('${escapeAttr(s.name)}')">Details</button>
      </td>
    </tr>
  `).join('');
}

/**
 * ==========================================
 * TAB 7: PLANT PERFORMANCE
 * ==========================================
 */
function renderPlantPerformance() {
  const open = STATE.filteredOpen;
  const aslInvs = open.filter(i => i.plant.toUpperCase() === 'ASL');
  const asilInvs = open.filter(i => i.plant.toUpperCase() === 'ASIL');

  // ASL Card
  document.getElementById('plant-asl-open-count').innerText = aslInvs.length;
  const aslOpenCurrs = groupAmountsByCurrency(aslInvs);
  document.getElementById('plant-asl-receivables-list').innerHTML = renderCurrencyRowsHTML(aslOpenCurrs);
  const aslOverdueCurrs = groupAmountsByCurrency(aslInvs.filter(i => i.daysOverdue > 0));
  document.getElementById('plant-asl-overdue-list').innerHTML = renderCurrencyRowsHTML(aslOverdueCurrs);

  // ASIL Card
  document.getElementById('plant-asil-open-count').innerText = asilInvs.length;
  const asilOpenCurrs = groupAmountsByCurrency(asilInvs);
  document.getElementById('plant-asil-receivables-list').innerHTML = renderCurrencyRowsHTML(asilOpenCurrs);
  const asilOverdueCurrs = groupAmountsByCurrency(asilInvs.filter(i => i.daysOverdue > 0));
  document.getElementById('plant-asil-overdue-list').innerHTML = renderCurrencyRowsHTML(asilOverdueCurrs);

  // Matrix Comparison
  const matrixBody = document.getElementById('tbody-plant-matrix');
  if (matrixBody) {
    const overdueASL = aslInvs.filter(i => i.daysOverdue > 0).length;
    const overdueASIL = asilInvs.filter(i => i.daysOverdue > 0).length;
    const critASL = aslInvs.filter(i => i.daysOverdue > 50).length;
    const critASIL = asilInvs.filter(i => i.daysOverdue > 50).length;

    matrixBody.innerHTML = `
      <tr>
        <td><strong>Open Invoices Count</strong></td>
        <td>${aslInvs.length}</td>
        <td>${asilInvs.length}</td>
        <td><strong>${aslInvs.length + asilInvs.length}</strong></td>
      </tr>
      <tr>
        <td><strong>Overdue Invoices Count</strong></td>
        <td style="color: var(--status-red);">${overdueASL}</td>
        <td style="color: var(--status-red);">${overdueASIL}</td>
        <td><strong style="color: var(--status-red);">${overdueASL + overdueASIL}</strong></td>
      </tr>
      <tr>
        <td><strong>Critical Overdue (>50 Days)</strong></td>
        <td>${critASL}</td>
        <td>${critASIL}</td>
        <td><strong>${critASL + critASIL}</strong></td>
      </tr>
      <tr>
        <td><strong>Overdue Ratio</strong></td>
        <td>${aslInvs.length ? Math.round((overdueASL / aslInvs.length) * 100) : 0}%</td>
        <td>${asilInvs.length ? Math.round((overdueASIL / asilInvs.length) * 100) : 0}%</td>
        <td>${open.length ? Math.round(((overdueASL + overdueASIL) / open.length) * 100) : 0}%</td>
      </tr>
    `;
  }
}

/**
 * ==========================================
 * TAB 8: SYNC LOGS & HEALTH
 * ==========================================
 */
function renderSyncLogs(logs) {
  const tbody = document.getElementById('tbody-sync-logs');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">No synchronization records available.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${l.timestamp}</td>
      <td><span class="pill ${l.status === 'SUCCESS' ? 'pill-paid' : 'pill-critical'}">${l.status}</span></td>
      <td><span class="pill pill-plant">${l.plant}</span></td>
      <td>${l.recordsScanned}</td>
      <td>${l.validInvoices}</td>
      <td>${escapeHtml(l.notes)}</td>
    </tr>
  `).join('');
}

/**
 * ==========================================
 * MODALS AND INTERACTION HANDLERS
 * ==========================================
 */

// Open Invoice Details
function openInvoiceDetail(key) {
  const inv = STATE.rawData.openInvoices.find(i => i.key === key) ||
              STATE.rawData.paidInvoices.find(i => i.key === key);
  if (!inv) return;

  document.getElementById('modal-inv-title').innerText = `Invoice: ${inv.invoiceNo} (${inv.plant})`;
  const container = document.getElementById('modal-inv-content');

  const fields = [
    { label: 'Source Plant', value: inv.plant },
    { label: 'Customer Short Name', value: inv.customerShort },
    { label: 'Customer Full Name', value: inv.customerFull },
    { label: 'Country', value: inv.country },
    { label: 'Salesperson Name', value: inv.salesperson },
    { label: 'Export Invoice No', value: inv.invoiceNo },
    { label: 'Invoice Date', value: inv.invoiceDate },
    { label: 'Due Date', value: inv.dueDate },
    { label: 'Days Overdue', value: `${inv.daysOverdue} days` },
    { label: 'B/L Date', value: inv.blDate || '-' },
    { label: 'Currency', value: inv.currency },
    { label: 'Invoice Amount', value: `${inv.currency} ${formatNumber(inv.amount)}` },
    { label: 'Payment Terms', value: inv.terms || '-' },
    { label: 'Remarks', value: inv.remarks || '-' },
    { label: 'Factoring', value: inv.factoring || '-' },
    { label: 'Priority Classification', value: inv.priority || '-' },
    { label: 'Source Sheet Name', value: inv.sourceSheet || '-' },
    { label: 'Source Row Number', value: inv.sourceRow || '-' },
    { label: 'Unique Invoice Key', value: inv.key }
  ];

  container.innerHTML = fields.map(f => `
    <div class="detail-field">
      <span class="detail-label">${f.label}</span>
      <span class="detail-value">${escapeHtml(f.value)}</span>
    </div>
  `).join('');

  const markPaidBtn = document.getElementById('modal-btn-mark-paid');
  if (STATE.rawData.openInvoices.some(i => i.key === key)) {
    markPaidBtn.style.display = 'inline-block';
    markPaidBtn.onclick = () => {
      closeModal('modal-invoice-detail');
      openMarkPaidModal(inv.key, inv.currency, inv.amount);
    };
  } else {
    markPaidBtn.style.display = 'none';
  }

  openModal('modal-invoice-detail');
}

// Mark as Paid
let activePaidKey = null;
function openMarkPaidModal(key, currency, amount) {
  activePaidKey = key;
  document.getElementById('mark-paid-key').innerText = key;
  document.getElementById('mark-paid-amount').innerText = `${currency} ${formatNumber(amount)}`;
  document.getElementById('mark-paid-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('mark-paid-remarks').value = '';
  openModal('modal-mark-paid');
}

function submitMarkPaid() {
  if (!activePaidKey) return;
  const dateStr = document.getElementById('mark-paid-date').value;
  const remarks = document.getElementById('mark-paid-remarks').value;

  const btn = document.getElementById('btn-confirm-mark-paid');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving...';

  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.innerText = 'Confirm Payment';
        closeModal('modal-mark-paid');
        if (res.success) {
          showToast('Payment recorded in management tracker.', 'success');
          triggerManualRefresh();
        } else {
          showToast('Error: ' + res.error, 'error');
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerText = 'Confirm Payment';
        showToast('Error: ' + (err.message || err), 'error');
      })
      .apiMarkInvoicePaid(activePaidKey, dateStr, remarks);
  } else {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerText = 'Confirm Payment';
      closeModal('modal-mark-paid');
      showToast('Demo only: sample data was not changed.', 'info');
    }, 800);
  }
}

// Restore Paid
function submitRestorePaid(key) {
  if (!confirm(`Restore invoice ${key} back to Open Receivables?`)) return;
  showToast('Restoring payment record...', 'warning');

  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(res => {
        if (res.success) {
          showToast(res.message, 'success');
          triggerManualRefresh();
        } else {
          showToast('Error: ' + res.error, 'error');
        }
      })
      .withFailureHandler(err => {
        showToast('Error: ' + (err.message || err), 'error');
      })
      .apiRestorePaidInvoice(key);
  } else {
    showToast('Demo only: sample data was not changed.', 'info');
  }
}

// Customer Drilldown Modal
function openCustomerDrilldown(customerName) {
  document.getElementById('modal-drilldown-title').innerText = `Invoices for: ${customerName}`;
  const tbody = document.getElementById('modal-drilldown-tbody');

  const openInvs = STATE.rawData.openInvoices.filter(i => (i.customerShort === customerName || i.customerFull === customerName));
  const paidInvs = STATE.rawData.paidInvoices.filter(i => (i.customerShort === customerName || i.customerFull === customerName));
  const allInvs = [...openInvs, ...paidInvs];

  if (allInvs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 16px;">No invoices found for this customer.</td></tr>`;
  } else {
    tbody.innerHTML = allInvs.map(inv => `
      <tr>
        <td><span class="pill pill-plant">${inv.plant}</span></td>
        <td><strong>${escapeHtml(inv.invoiceNo)}</strong></td>
        <td>${escapeHtml(inv.customerShort)}</td>
        <td>${inv.dueDate || '-'}</td>
        <td>${inv.daysOverdue !== undefined ? inv.daysOverdue : '-'}</td>
        <td><strong>${inv.currency}</strong></td>
        <td><strong>${formatNumber(inv.amount)}</strong></td>
        <td><span class="pill ${inv.paidDate ? 'pill-paid' : (inv.daysOverdue > 0 ? 'pill-urgent' : 'pill-notdue')}">${inv.paidDate ? 'Paid' : 'Open'}</span></td>
      </tr>
    `).join('');
  }

  openModal('modal-drilldown');
}

// Salesperson Drilldown Modal
function openSalespersonDrilldown(salesperson) {
  document.getElementById('modal-drilldown-title').innerText = `Portfolio for: ${salesperson}`;
  const tbody = document.getElementById('modal-drilldown-tbody');

  const openInvs = STATE.rawData.openInvoices.filter(i => i.salesperson === salesperson);
  const paidInvs = STATE.rawData.paidInvoices.filter(i => i.salesperson === salesperson);
  const allInvs = [...openInvs, ...paidInvs];

  if (allInvs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 16px;">No invoices found for this salesperson.</td></tr>`;
  } else {
    tbody.innerHTML = allInvs.map(inv => `
      <tr>
        <td><span class="pill pill-plant">${inv.plant}</span></td>
        <td><strong>${escapeHtml(inv.invoiceNo)}</strong></td>
        <td>${escapeHtml(inv.customerShort)}</td>
        <td>${inv.dueDate || '-'}</td>
        <td>${inv.daysOverdue !== undefined ? inv.daysOverdue : '-'}</td>
        <td><strong>${inv.currency}</strong></td>
        <td><strong>${formatNumber(inv.amount)}</strong></td>
        <td><span class="pill ${inv.paidDate ? 'pill-paid' : (inv.daysOverdue > 0 ? 'pill-urgent' : 'pill-notdue')}">${inv.paidDate ? 'Paid' : 'Open'}</span></td>
      </tr>
    `).join('');
  }

  openModal('modal-drilldown');
}

// Modal open/close helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

/**
 * ==========================================
 * TAB SWITCHING & PAGINATION
 * ==========================================
 */
function switchTab(tabId, tabElement) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');
  if (tabElement) tabElement.classList.add('active');

  STATE.currentActiveTab = tabId;
  if (window.feather) feather.replace();

  // Resize charts when navigating back to Overview
  if (tabId === 'tab-overview') {
    Object.values(STATE.charts).forEach(c => c && c.resize());
  }
}

function handleTableSearch(tableName) {
  STATE.tables[tableName].search = document.getElementById(`search-${tableName}`).value;
  STATE.tables[tableName].page = 1;
  if (tableName === 'open') renderOpenTable();
  else if (tableName === 'paid') renderPaidTable();
  else if (tableName === 'overdue') renderOverdueTable();
}

function sortTable(tableName, col) {
  const t = STATE.tables[tableName];
  if (t.sortCol === col) {
    t.sortAsc = !t.sortAsc;
  } else {
    t.sortCol = col;
    t.sortAsc = true;
  }
  if (tableName === 'open') renderOpenTable();
  else if (tableName === 'paid') renderPaidTable();
  else if (tableName === 'overdue') renderOverdueTable();
}

function changePage(tableName, delta) {
  STATE.tables[tableName].page += delta;
  if (tableName === 'open') renderOpenTable();
  else if (tableName === 'paid') renderPaidTable();
  else if (tableName === 'overdue') renderOverdueTable();
}

function changePageSize(tableName) {
  const size = parseInt(document.getElementById(`page-size-${tableName}`).value, 10);
  STATE.tables[tableName].pageSize = size;
  STATE.tables[tableName].page = 1;
  if (tableName === 'open') renderOpenTable();
  else if (tableName === 'paid') renderPaidTable();
  else if (tableName === 'overdue') renderOverdueTable();
}

/**
 * CSV Export functionality for filtered table datasets.
 */
function exportTableToCSV(type) {
  let list = [];
  let filename = '';

  if (type === 'open') {
    list = STATE.filteredOpen;
    filename = `ASL_ASIL_Open_Invoices_${new Date().toISOString().slice(0, 10)}.csv`;
  } else if (type === 'paid') {
    list = STATE.filteredPaid;
    filename = `ASL_ASIL_Paid_Invoices_${new Date().toISOString().slice(0, 10)}.csv`;
  } else if (type === 'overdue') {
    list = STATE.filteredOpen.filter(i => i.daysOverdue > 0);
    filename = `ASL_ASIL_Overdue_Invoices_${new Date().toISOString().slice(0, 10)}.csv`;
  }

  if (list.length === 0) {
    showToast('No records to export.', 'warning');
    return;
  }

  const keys = Object.keys(list[0]);
  const rows = [keys.join(',')];

  list.forEach(item => {
    const line = keys.map(k => {
      let val = item[k] === null || item[k] === undefined ? '' : String(item[k]);
      val = val.replace(/"/g, '""');
      return `"${val}"`;
    }).join(',');
    rows.push(line);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`Exported ${list.length} rows to ${filename}`, 'success');
}

/**
 * Toast notifications.
 */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Toggle Fullscreen.
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

/**
 * Escapes HTML characters to prevent XSS.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "\\'");
}