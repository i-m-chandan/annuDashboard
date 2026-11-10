/**
 * ASL & ASIL EXPORT COLLECTION INTELLIGENCE — CEO DASHBOARD BACKEND
 * Ambica Steels Limited (ASL Delhi) & Ambica Steels Industries Limited (ASIL Gujarat)
 *
 * Fully automated, multi-plant export receivables and collection engine.
 * Read-only with respect to the two original source spreadsheets.
 * Centralized tracking in a dedicated management spreadsheet.
 */

const CONFIG = {
  ASIL_SOURCE_URL: 'https://docs.google.com/spreadsheets/d/1tt5RmBrTv_RTNxrC3fwc6CSFFJhM-5RGnaVPMI5F9OE/edit?gid=118031249#gid=118031249',
  ASL_SOURCE_URL: 'https://docs.google.com/spreadsheets/d/1NT4TWRuVsvYLal5WEnvvtNUTqfQrfXE8SGpGO2eSgh0/edit?gid=0#gid=0',
  ASIL_PREFERRED_SHEET: 'Total outstanding ASIL',
  ASL_PREFERRED_SHEET: 'Total outstanding',
  OPEN_SHEET: 'Open Invoices',
  PAID_SHEET: 'Payments Received',
  DASHBOARD_SHEET: 'Dashboard',
  SETTINGS_SHEET: '_Settings',
  LOGS_SHEET: '_SyncLogs',
  REFRESH_MINUTES: 30,
  TIMEZONE: 'Asia/Kolkata',
  TRACKER_PROP_KEY: 'ASL_ASIL_TRACKER_ID'
};

const TRACKER_HEADERS = [
  'Source Plant', 'Customer Short Name', 'Customer Full Name', 'Country Name',
  'Sales Person Name', 'Export Inv. No.', 'Invoice Date',
  'Due Date as per Contract', 'No. of Days Overdue from Today', 'B/L Date',
  'Currency Code', 'Invoice Amount', 'Payment Terms as per Contract',
  'Sales Persons - Remarks', 'Factoring', 'Payment Received?', 'Payment Received Date',
  'Priority', 'Source Sheet', 'Source Row', 'Invoice Key'
];

const PAID_HEADERS = [
  'Source Plant', 'Customer Short Name', 'Customer Full Name', 'Country Name',
  'Sales Person Name', 'Export Inv. No.', 'Invoice Date',
  'Due Date as per Contract', 'B/L Date', 'Currency Code', 'Invoice Amount',
  'Payment Terms as per Contract', 'Sales Persons - Remarks', 'Factoring',
  'Payment Received Date', 'Source Sheet', 'Source Row', 'Payment Source',
  'Undo / Restore?', 'Invoice Key'
];

const LOG_HEADERS = [
  'Timestamp', 'Status', 'Plant', 'Records Scanned', 'Valid Invoices', 'Errors / Notes'
];

/**
 * Web App entry point. Serves the responsive executive dashboard.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('ASL | ASIL Export Collection Intelligence — CEO Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Utility to include partial HTML files (styles, javascript).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Idempotent initialization of the Payment Tracker and Central Database.
 * If an existing tracker is configured in ScriptProperties and accessible, it is reused.
 */
function createPaymentTracker() {
  validateSourceUrls_();
  const props = PropertiesService.getScriptProperties();
  let trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY) || props.getProperty('TRACKER_ID');
  let ss = null;

  if (trackerId) {
    try {
      ss = SpreadsheetApp.openById(trackerId);
      Logger.log('Reusing existing tracker: ' + ss.getUrl());
    } catch (e) {
      Logger.log('Previous tracker ID unreachable or deleted. Creating new one...');
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('ASL & ASIL Export Collection Tracker — Central Database');
    trackerId = ss.getId();
    props.setProperty(CONFIG.TRACKER_PROP_KEY, trackerId);
    props.setProperty('TRACKER_ID', trackerId);
    Logger.log('Created new tracker spreadsheet: ' + ss.getUrl());
  }

  // Ensure all required sheets exist
  let openSheet = ss.getSheetByName(CONFIG.OPEN_SHEET);
  if (!openSheet) {
    openSheet = ss.getSheets()[0];
    openSheet.setName(CONFIG.OPEN_SHEET);
  }
  let paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);
  if (!paidSheet) paidSheet = ss.insertSheet(CONFIG.PAID_SHEET);

  let dashSheet = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!dashSheet) dashSheet = ss.insertSheet(CONFIG.DASHBOARD_SHEET);

  let settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settingsSheet) settingsSheet = ss.insertSheet(CONFIG.SETTINGS_SHEET);

  let logsSheet = ss.getSheetByName(CONFIG.LOGS_SHEET);
  if (!logsSheet) logsSheet = ss.insertSheet(CONFIG.LOGS_SHEET);

  // Initialize headers if empty
  if (openSheet.getLastRow() === 0) setupTable_(openSheet, TRACKER_HEADERS);
  if (paidSheet.getLastRow() === 0) setupTable_(paidSheet, PAID_HEADERS);
  if (logsSheet.getLastRow() === 0) setupTable_(logsSheet, LOG_HEADERS);

  // Initialize Settings
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.getRange('A1:B8').setValues([
      ['Setting', 'Value'],
      ['ASIL Source URL', CONFIG.ASIL_SOURCE_URL],
      ['ASL Source URL', CONFIG.ASL_SOURCE_URL],
      ['Refresh Frequency (Minutes)', CONFIG.REFRESH_MINUTES],
      ['Last Refreshed', ''],
      ['ASIL Status', 'Pending First Sync'],
      ['ASL Status', 'Pending First Sync'],
      ['Total Records', 0]
    ]);
    settingsSheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e2e8f0');
    settingsSheet.autoResizeColumns(1, 2);
  }

  buildSpreadsheetDashboard_(dashSheet);
  installTriggers_(ss);

  // Perform initial synchronization
  syncPaymentTracker(false);
  ss.setActiveSheet(dashSheet);

  Logger.log('TRACKER INITIALIZATION COMPLETE: ' + ss.getUrl());
  return { success: true, trackerUrl: ss.getUrl(), trackerId: trackerId };
}

/**
 * Primary synchronization engine.
 * Connects read-only to ASL and ASIL Google Sheets, extracts all salespersons,
 * detects yellow rows for payment status, calculates days overdue and priority,
 * and maintains the persistent Open and Paid sheets.
 */
function syncPaymentTracker(isManual) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(45000); // 45-second lock wait
  if (!hasLock) {
    Logger.log('Sync already in progress. Skipping concurrent run.');
    return { success: false, message: 'Sync already in progress. Please wait.' };
  }

  const props = PropertiesService.getScriptProperties();
  let trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY) || props.getProperty('TRACKER_ID');
  if (!trackerId) {
    lock.releaseLock();
    throw new Error('Tracker not configured. Run createPaymentTracker() first.');
  }

  const ss = SpreadsheetApp.openById(trackerId);
  const openSheet = ss.getSheetByName(CONFIG.OPEN_SHEET);
  const paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);
  const settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  const logsSheet = ss.getSheetByName(CONFIG.LOGS_SHEET);

  const syncTimestamp = new Date();
  const syncTimeStr = Utilities.formatDate(syncTimestamp, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  // Read existing paid records (preserves manually marked paid and past detected paid)
  const paidRecords = readExistingPaid_(paidSheet);
  const paidKeys = new Set(paidRecords.map(r => String(r[PAID_HEADERS.indexOf('Invoice Key')] || '')));

  const sources = [
    { plant: 'ASIL', url: CONFIG.ASIL_SOURCE_URL, preferred: CONFIG.ASIL_PREFERRED_SHEET },
    { plant: 'ASL', url: CONFIG.ASL_SOURCE_URL, preferred: CONFIG.ASL_PREFERRED_SHEET }
  ];

  const sourceRows = [];
  const healthLogs = [];
  let asilStatus = 'Not Attempted';
  let aslStatus = 'Not Attempted';
  let totalScanned = 0;
  let totalDuplicates = 0;
  let missingDueDates = 0;
  let missingTerms = 0;
  let unknownCurrencies = 0;
  const seenOpenKeys = new Set();

  sources.forEach(src => {
    let plantScanned = 0;
    let plantValid = 0;
    let plantErrors = [];

    try {
      if (!src.url || src.url.indexOf('https://') !== 0) {
        throw new Error('Invalid URL configured for ' + src.plant);
      }
      const sourceSS = SpreadsheetApp.openByUrl(src.url);
      const sourceSheet = findOutstandingSheet_(sourceSS, src.plant, src.preferred);
      if (!sourceSheet) {
        throw new Error('Could not find outstanding sheet for ' + src.plant + ' (preferred: ' + src.preferred + ')');
      }

      const values = sourceSheet.getDataRange().getValues();
      if (values.length < 2) {
        throw new Error('Sheet ' + sourceSheet.getName() + ' has insufficient data rows.');
      }

      const backgrounds = sourceSheet.getDataRange().getBackgrounds();
      const headerRowIndex = findHeaderRow_(values);
      const rawHeaders = values[headerRowIndex];
      const headers = rawHeaders.map(v => normalize_(v));
      const idx = headerIndexes_(headers);

      // Validate critical header discovery
      if (idx.invoice === -1) {
        throw new Error('Critical header "Export Inv. No." missing in ' + src.plant + ' sheet: ' + sourceSheet.getName());
      }

      for (let r = headerRowIndex + 1; r < values.length; r++) {
        const row = values[r];
        if (row.every(v => v === '' || v === null)) continue;
        plantScanned++;
        totalScanned++;

        const invoiceRaw = getCell_(row, idx.invoice);
        const invoice = String(cleanCell_(invoiceRaw)).trim();
        if (!invoice || invoice.toLowerCase() === 'total' || invoice.toLowerCase() === 'grand total') {
          continue;
        }

        const salesperson = String(getCell_(row, idx.salesPerson) || 'Unassigned').trim();
        const key = makeKey_(src.plant, invoice);

        // Detect yellow row (payment indication in source sheet)
        const isYellow = rowLooksYellow_(backgrounds[r]);
        const oldPaid = paidRecords.find(p => String(p[PAID_HEADERS.indexOf('Invoice Key')] || '') === key);

        if (isYellow && !oldPaid) {
          // Newly detected yellow payment row
          const rec = makePaidRecord_(src.plant, row, idx, sourceSheet.getName(), r + 1, key, syncTimestamp);
          paidRecords.push(rec);
          paidKeys.add(key);
        } else if (isYellow && oldPaid) {
          paidKeys.add(key);
        }

        // If invoice is already paid, do not add to open invoices
        if (paidKeys.has(key)) continue;

        // Duplicate check within open set
        if (seenOpenKeys.has(key)) {
          totalDuplicates++;
          continue;
        }
        seenOpenKeys.add(key);

        const dueDateRaw = getCell_(row, idx.dueDate);
        const overdueRaw = getCell_(row, idx.overdue);
        const invoiceDateRaw = getCell_(row, idx.invoiceDate);
        const blDateRaw = getCell_(row, idx.blDate);

        const days = calculateDaysOverdue_(overdueRaw, dueDateRaw);
        const priority = formatPriorityBucket_(days);

        const terms = String(getCell_(row, idx.terms) || '').trim();
        if (!terms) missingTerms++;

        if (!dueDateRaw) missingDueDates++;

        let curr = String(getCell_(row, idx.currency) || '').trim().toUpperCase();
        if (!curr || curr === '-' || curr === '0') {
          curr = 'UNKNOWN';
          unknownCurrencies++;
        }

        const amount = parseAmount_(getCell_(row, idx.amount));

        sourceRows.push([
          src.plant,
          getCell_(row, idx.shortName),
          getCell_(row, idx.fullName),
          getCell_(row, idx.country),
          salesperson,
          invoice,
          formatDateDisplay_(invoiceDateRaw),
          formatDateDisplay_(dueDateRaw),
          days,
          formatDateDisplay_(blDateRaw),
          curr,
          amount,
          terms,
          getCell_(row, idx.remarks),
          getCell_(row, idx.factoring),
          false,
          '',
          priority,
          sourceSheet.getName(),
          r + 1,
          key
        ]);
        plantValid++;
      }

      if (src.plant === 'ASIL') asilStatus = 'Connected (' + plantValid + ' open invoices)';
      else aslStatus = 'Connected (' + plantValid + ' open invoices)';

      healthLogs.push([syncTimestamp, 'SUCCESS', src.plant, plantScanned, plantValid, 'Synchronized cleanly']);
    } catch (err) {
      const errMsg = err.message || String(err);
      plantErrors.push(errMsg);
      Logger.log('Error syncing ' + src.plant + ': ' + errMsg);
      if (src.plant === 'ASIL') asilStatus = 'ERROR: ' + errMsg;
      else aslStatus = 'ERROR: ' + errMsg;
      healthLogs.push([syncTimestamp, 'FAILED', src.plant, plantScanned, plantValid, errMsg]);
    }
  });

  // De-duplicate paid records by key
  const uniquePaid = [];
  const seenPaidKeys = new Set();
  paidRecords.forEach(r => {
    const k = String(r[PAID_HEADERS.indexOf('Invoice Key')] || '');
    if (k && !seenPaidKeys.has(k)) {
      seenPaidKeys.add(k);
      uniquePaid.push(r);
    }
  });

  // Write to sheets
  writeRows_(paidSheet, PAID_HEADERS, uniquePaid);
  writeRows_(openSheet, TRACKER_HEADERS, sourceRows);
  applyOpenFormatting_(openSheet);
  applyPaidFormatting_(paidSheet);
  updateSpreadsheetDashboard_(ss);

  // Update Settings
  if (settingsSheet) {
    settingsSheet.getRange('B5:B8').setValues([
      [syncTimeStr],
      [asilStatus],
      [aslStatus],
      [sourceRows.length + uniquePaid.length]
    ]);
  }

  // Append Logs
  if (logsSheet && healthLogs.length > 0) {
    logsSheet.getRange(logsSheet.getLastRow() + 1, 1, healthLogs.length, LOG_HEADERS.length).setValues(healthLogs);
  }

  lock.releaseLock();
  Logger.log('Sync completed. Open: ' + sourceRows.length + ', Paid: ' + uniquePaid.length);

  return {
    success: true,
    lastRefreshed: syncTimeStr,
    openCount: sourceRows.length,
    paidCount: uniquePaid.length,
    asilStatus: asilStatus,
    aslStatus: aslStatus,
    totalScanned: totalScanned,
    totalDuplicates: totalDuplicates,
    missingTerms: missingTerms,
    missingDueDates: missingDueDates,
    unknownCurrencies: unknownCurrencies
  };
}

/**
 * Returns complete structured dashboard payload to the web app.
 * Can serve directly from tracker sheets with sub-second response, or sync if required.
 */
function getDashboardPayload(forceRefresh) {
  const props = PropertiesService.getScriptProperties();
  let trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY) || props.getProperty('TRACKER_ID');

  if (!trackerId) {
    createPaymentTracker();
    trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY);
  }

  if (forceRefresh) {
    syncPaymentTracker(true);
  }

  const ss = SpreadsheetApp.openById(trackerId);
  const openSheet = ss.getSheetByName(CONFIG.OPEN_SHEET);
  const paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);
  const settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  const logsSheet = ss.getSheetByName(CONFIG.LOGS_SHEET);

  const openData = openSheet && openSheet.getLastRow() > 1
    ? openSheet.getRange(2, 1, openSheet.getLastRow() - 1, TRACKER_HEADERS.length).getValues()
    : [];

  const paidData = paidSheet && paidSheet.getLastRow() > 1
    ? paidSheet.getRange(2, 1, paidSheet.getLastRow() - 1, PAID_HEADERS.length).getValues()
    : [];

  const settingsData = settingsSheet && settingsSheet.getLastRow() >= 7
    ? settingsSheet.getRange('A1:B8').getValues()
    : [];

  const settingsMap = {};
  settingsData.forEach(r => { settingsMap[String(r[0]).trim()] = r[1]; });

  const logsData = logsSheet && logsSheet.getLastRow() > 1
    ? logsSheet.getRange(Math.max(2, logsSheet.getLastRow() - 25), 1, Math.min(25, logsSheet.getLastRow() - 1), LOG_HEADERS.length).getValues()
    : [];

  const formattedLogs = logsData.map(r => ({
    timestamp: r[0] instanceof Date ? Utilities.formatDate(r[0], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[0] || ''),
    status: String(r[1] || ''),
    plant: String(r[2] || ''),
    recordsScanned: Number(r[3] || 0),
    validInvoices: Number(r[4] || 0),
    notes: String(r[5] || '')
  })).reverse();

  // Convert open rows into structured objects
  const openInvoices = openData.map(r => ({
    plant: String(r[0] || ''),
    customerShort: String(r[1] || ''),
    customerFull: String(r[2] || ''),
    country: String(r[3] || ''),
    salesperson: String(r[4] || 'Unassigned'),
    invoiceNo: String(r[5] || ''),
    invoiceDate: formatDateDisplay_(r[6]),
    dueDate: formatDateDisplay_(r[7]),
    daysOverdue: Number(r[8] || 0),
    blDate: formatDateDisplay_(r[9]),
    currency: String(r[10] || 'UNKNOWN').toUpperCase(),
    amount: Number(r[11] || 0),
    terms: String(r[12] || ''),
    remarks: String(r[13] || ''),
    factoring: String(r[14] || ''),
    priority: String(r[17] || ''),
    sourceSheet: String(r[18] || ''),
    sourceRow: Number(r[19] || 0),
    key: String(r[20] || '')
  }));

  // Convert paid rows into structured objects
  const paidInvoices = paidData.map(r => ({
    plant: String(r[0] || ''),
    customerShort: String(r[1] || ''),
    customerFull: String(r[2] || ''),
    country: String(r[3] || ''),
    salesperson: String(r[4] || 'Unassigned'),
    invoiceNo: String(r[5] || ''),
    invoiceDate: formatDateDisplay_(r[6]),
    dueDate: formatDateDisplay_(r[7]),
    blDate: formatDateDisplay_(r[8]),
    currency: String(r[9] || 'UNKNOWN').toUpperCase(),
    amount: Number(r[10] || 0),
    terms: String(r[11] || ''),
    remarks: String(r[12] || ''),
    factoring: String(r[13] || ''),
    paidDate: formatDateDisplay_(r[14]),
    sourceSheet: String(r[15] || ''),
    sourceRow: Number(r[16] || 0),
    paymentSource: String(r[17] || 'Source yellow'),
    canRestore: String(r[17] || '') === 'Manually checked',
    key: String(r[19] || '')
  }));

  // Dynamic filter lists
  const salespersonsSet = new Set();
  const customersSet = new Set();
  const countriesSet = new Set();
  const currenciesSet = new Set();

  [...openInvoices, ...paidInvoices].forEach(item => {
    if (item.salesperson) salespersonsSet.add(item.salesperson);
    if (item.customerShort) customersSet.add(item.customerShort);
    else if (item.customerFull) customersSet.add(item.customerFull);
    if (item.country) countriesSet.add(item.country);
    if (item.currency) currenciesSet.add(item.currency);
  });

  const salespersons = Array.from(salespersonsSet).sort();
  const customers = Array.from(customersSet).sort();
  const countries = Array.from(countriesSet).sort();
  const currencies = Array.from(currenciesSet).sort();

  return {
    success: true,
    trackerId: trackerId,
    trackerUrl: ss.getUrl(),
    lastRefreshed: settingsMap['Last Refreshed'] || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    asilStatus: settingsMap['ASIL Status'] || 'Connected',
    aslStatus: settingsMap['ASL Status'] || 'Connected',
    syncLogs: formattedLogs,
    openInvoices: openInvoices,
    paidInvoices: paidInvoices,
    salespersons: salespersons,
    customers: customers,
    countries: countries,
    currencies: currencies,
    plants: ['ASL', 'ASIL'],
    counts: {
      open: openInvoices.length,
      paid: paidInvoices.length,
      total: openInvoices.length + paidInvoices.length
    }
  };
}

/**
 * Web App action: Manual Refresh from frontend.
 */
function apiRefreshData() {
  const syncResult = syncPaymentTracker(true);
  const payload = getDashboardPayload(false);
  payload.syncResult = syncResult;
  return payload;
}

/**
 * Web App action: Marks an open invoice as paid in the management tracker.
 * Read-only rule respected: never writes to original source sheets.
 */
function apiMarkInvoicePaid(invoiceKey, receivedDateStr, remarks) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const props = PropertiesService.getScriptProperties();
    const trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY) || props.getProperty('TRACKER_ID');
    if (!trackerId) throw new Error('Tracker not found.');

    const ss = SpreadsheetApp.openById(trackerId);
    const openSheet = ss.getSheetByName(CONFIG.OPEN_SHEET);
    const paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);

    const openRows = openSheet.getDataRange().getValues();
    const keyCol = TRACKER_HEADERS.indexOf('Invoice Key');
    let targetRowIndex = -1;

    for (let r = 1; r < openRows.length; r++) {
      if (String(openRows[r][keyCol] || '') === invoiceKey) {
        targetRowIndex = r + 1; // 1-indexed for Sheets
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new Error('Invoice key ' + invoiceKey + ' not found in Open Invoices.');
    }

    const row = openRows[targetRowIndex - 1];
    const recDate = receivedDateStr ? new Date(receivedDateStr) : new Date();

    const paidRow = [
      row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7],
      row[9], row[10], row[11], row[12], remarks || row[13], row[14],
      recDate, row[18], row[19], 'Manually checked', false, invoiceKey
    ];

    paidSheet.appendRow(paidRow);
    openSheet.deleteRow(targetRowIndex);

    applyPaidFormatting_(paidSheet);
    updateSpreadsheetDashboard_(ss);

    // Update settings
    const settings = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
    if (settings) {
      settings.getRange('B5').setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'));
    }

    lock.releaseLock();
    return { success: true, message: 'Invoice ' + invoiceKey + ' marked as paid.' };
  } catch (e) {
    lock.releaseLock();
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Web App action: Restores a manually marked paid invoice back to Open Invoices.
 * Yellow-detected rows cannot be restored (requires source correction).
 */
function apiRestorePaidInvoice(invoiceKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const props = PropertiesService.getScriptProperties();
    const trackerId = props.getProperty(CONFIG.TRACKER_PROP_KEY) || props.getProperty('TRACKER_ID');
    if (!trackerId) throw new Error('Tracker not found.');

    const ss = SpreadsheetApp.openById(trackerId);
    const openSheet = ss.getSheetByName(CONFIG.OPEN_SHEET);
    const paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);

    const paidRows = paidSheet.getDataRange().getValues();
    const keyCol = PAID_HEADERS.indexOf('Invoice Key');
    const sourceCol = PAID_HEADERS.indexOf('Payment Source');
    let targetRowIndex = -1;
    let paymentSource = '';

    for (let r = 1; r < paidRows.length; r++) {
      if (String(paidRows[r][keyCol] || '') === invoiceKey) {
        targetRowIndex = r + 1;
        paymentSource = String(paidRows[r][sourceCol] || '');
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new Error('Invoice key ' + invoiceKey + ' not found in Payments Received.');
    }

    if (paymentSource !== 'Manually checked') {
      throw new Error('This invoice was detected from a yellow source row in the plant sheet. It cannot be restored here; update the original source sheet.');
    }

    const row = paidRows[targetRowIndex - 1];
    paidSheet.deleteRow(targetRowIndex);

    // Re-run sync to properly reconstruct open invoice record
    syncPaymentTracker(false);

    lock.releaseLock();
    return { success: true, message: 'Invoice ' + invoiceKey + ' restored to open receivables.' };
  } catch (e) {
    lock.releaseLock();
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Handle OnEdit in spreadsheet for interactive checking/restoring.
 */
function handleOnEdit_(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const rowNum = e.range.getRow();
  if (rowNum < 2) return;

  const ss = e.source;
  const value = String(e.value || '').toUpperCase();

  if (sheet.getName() === CONFIG.PAID_SHEET) {
    const restoreCol = PAID_HEADERS.indexOf('Undo / Restore?') + 1;
    if (e.range.getColumn() !== restoreCol || value !== 'TRUE') return;

    const row = sheet.getRange(rowNum, 1, 1, PAID_HEADERS.length).getValues()[0];
    const sourceType = String(row[PAID_HEADERS.indexOf('Payment Source')] || '');
    if (sourceType !== 'Manually checked') {
      sheet.getRange(rowNum, restoreCol).setValue(false);
      ss.toast('This invoice was identified as paid from the yellow source row. Correct the source sheet first if this is wrong.', 'Restore not allowed', 8);
      return;
    }

    const key = String(row[PAID_HEADERS.indexOf('Invoice Key')] || '');
    sheet.deleteRow(rowNum);
    syncPaymentTracker(false);
    ss.toast('Invoice ' + key + ' restored to Open Invoices.', 'Payment Undone', 5);
    return;
  }

  if (sheet.getName() === CONFIG.OPEN_SHEET) {
    const checkboxCol = TRACKER_HEADERS.indexOf('Payment Received?') + 1;
    if (e.range.getColumn() !== checkboxCol || value !== 'TRUE') return;

    const row = sheet.getRange(rowNum, 1, 1, TRACKER_HEADERS.length).getValues()[0];
    const key = String(row[TRACKER_HEADERS.indexOf('Invoice Key')] || '');
    if (!key) {
      sheet.getRange(rowNum, checkboxCol).setValue(false);
      ss.toast('Invoice key missing; no changes made.', 'Cannot mark paid', 5);
      return;
    }

    const paidSheet = ss.getSheetByName(CONFIG.PAID_SHEET);
    const receivedDate = row[TRACKER_HEADERS.indexOf('Payment Received Date')] || new Date();
    const paidRow = [
      row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7],
      row[9], row[10], row[11], row[12], row[13], row[14], receivedDate,
      row[18], row[19], 'Manually checked', false, key
    ];
    paidSheet.appendRow(paidRow);
    sheet.deleteRow(rowNum);
    applyPaidFormatting_(paidSheet);
    updateSpreadsheetDashboard_(ss);
    ss.toast('Marked paid. To undo, use Undo / Restore? in Payments Received.', 'Payment Tracker', 6);
  }
}

/**
 * Installs time-based and onEdit triggers idempotently.
 */
function installTriggers_(ss) {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (['syncPaymentTracker', 'handleOnEdit_'].includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('syncPaymentTracker')
    .timeBased()
    .everyMinutes(CONFIG.REFRESH_MINUTES)
    .create();

  if (ss) {
    ScriptApp.newTrigger('handleOnEdit_')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }
  Logger.log('Configured triggers: sync every ' + CONFIG.REFRESH_MINUTES + ' min, onEdit on tracker.');
}

/**
 * Validates that source URLs are properly configured.
 */
function validateSourceUrls_() {
  [CONFIG.ASIL_SOURCE_URL, CONFIG.ASL_SOURCE_URL].forEach(url => {
    if (!url || url.indexOf('https://docs.google.com/spreadsheets') !== 0) {
      throw new Error('Configured URL is not a valid Google Spreadsheet URL: ' + url);
    }
  });
}

/**
 * Discovers the target outstanding sheet from the source spreadsheet.
 */
function findOutstandingSheet_(ss, plant, preferred) {
  const sheets = ss.getSheets();
  let exact = sheets.find(s => normalize_(s.getName()) === normalize_(preferred));
  if (exact) return exact;

  if (plant === 'ASL') {
    exact = sheets.find(s => {
      const name = normalize_(s.getName());
      return name.includes('total outstanding') && !name.includes('asil');
    });
  } else {
    exact = sheets.find(s => {
      const name = normalize_(s.getName());
      return name.includes('total outstanding') && name.includes('asil');
    });
  }
  if (exact) return exact;

  return sheets.find(s => normalize_(s.getName()).includes('total outstanding')) || null;
}

/**
 * Discovers the header row within the first 20 rows.
 */
function findHeaderRow_(values) {
  const max = Math.min(values.length, 20);
  for (let r = 0; r < max; r++) {
    const line = values[r].map(normalize_).join('|');
    if (line.includes('sales person name') && (line.includes('export inv') || line.includes('inv. no') || line.includes('invoice no'))) {
      return r;
    }
  }
  // Secondary check
  for (let r = 0; r < max; r++) {
    const line = values[r].map(normalize_).join('|');
    if (line.includes('customer') && line.includes('due date')) return r;
  }
  return 0;
}

/**
 * Maps header names to column indexes with multi-alias support.
 */
function headerIndexes_(headers) {
  const find = (...terms) => headers.findIndex(h => terms.some(t => h.includes(t)));
  return {
    shortName: find('customer short name', 'short name', 'party short'),
    fullName: find('customer full name', 'full name', 'buyer name', 'party full name', 'customer name'),
    country: find('country name', 'country', 'counrty name', 'destination'),
    salesPerson: find('sales person name', 'salesperson name', 'sales person', 'salesperson'),
    invoice: find('export inv. no', 'export inv no', 'export invoice no', 'invoice no', 'inv. no.', 'inv no'),
    invoiceDate: find('invoice date', 'inv date'),
    dueDate: find('due date as per contract', 'due date contract', 'due date', 'due_date'),
    overdue: find('no. of days overdue from today', 'no. of days overdue', 'days overdue', 'overdue days', 'overdue'),
    blDate: find('b/l date', 'bl date', 'bill of lading date'),
    currency: find('currency code', 'currency', 'curr'),
    amount: find('invoice amount', 'outstanding amount', 'amount in fcy', 'balance amount', 'amount', 'fcy amount'),
    terms: find('payment terms as per contract', 'payment terms', 'terms of payment', 'terms'),
    remarks: find('sales persons - remarks', 'sales persons remarks', 'salesperson remarks', 'remarks', 'comment'),
    factoring: find('factoring', 'factoring bank')
  };
}

/**
 * Calculates days overdue from either source overdue column or due date vs today.
 */
function calculateDaysOverdue_(overdueVal, dueDateVal) {
  if (overdueVal !== '' && overdueVal !== null && !isNaN(Number(overdueVal))) {
    return Math.round(Number(overdueVal));
  }
  if (dueDateVal) {
    const due = parseDateObject_(dueDateVal);
    if (due) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  return 0;
}

/**
 * Assigns precise overdue classification labels.
 */
function formatPriorityBucket_(days) {
  if (days < 0) return 'Not Yet Due';
  if (days === 0) return 'Due Today';
  if (days <= 30) return '1–30 Days Overdue';
  if (days <= 50) return '31–50 Days Overdue';
  if (days <= 90) return '51–90 Days Overdue';
  return 'More Than 90 Days Overdue';
}

/**
 * Robust yellow detection logic for source row payment marking.
 * Matches rows where >= 50% of columns have yellow shading.
 */
function rowLooksYellow_(colors) {
  if (!colors || !colors.length) return false;
  let yellowCount = 0;
  colors.forEach(c => {
    const hex = String(c || '').toLowerCase();
    const m = hex.match(/^#([0-9a-f]{6})$/);
    if (!m) return;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    // Standard yellow range: high red, high green, low blue
    if (r > 200 && g > 165 && b < 160 && (r - b) > 70 && (g - b) > 40) {
      yellowCount++;
    }
  });
  return yellowCount >= Math.max(1, Math.ceil(colors.length * 0.5));
}

/**
 * Cleans cell values, filtering out spreadsheet formula errors.
 */
function cleanCell_(value) {
  const s = String(value == null ? '' : value).trim();
  return /^#(N\/A|REF!|VALUE!|ERROR!|DIV\/0!|NAME\?)/i.test(s) ? '' : value;
}

/**
 * Safely accesses row index with bounds checking.
 */
function getCell_(row, index) {
  return index >= 0 && index < row.length ? cleanCell_(row[index]) : '';
}

/**
 * Parses financial amounts safely without currency string corruption.
 */
function parseAmount_(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;
  let s = String(value).trim();
  // Check negative format: (123.45)
  let isNegative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true;
    s = s.slice(1, -1);
  }
  // Remove currency symbols, commas, spaces
  s = s.replace(/[^0-9.-]/g, '');
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

/**
 * Parses dates into a Date object or null.
 */
function parseDateObject_(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number' && val > 20000 && val < 60000) {
    // Excel/Sheets serial date number
    return new Date((val - 25569) * 86400 * 1000);
  }
  const s = String(val).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    let year = parseInt(parts[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(parts[2], 10) - 1, parseInt(parts[1], 10));
  }
  return null;
}

/**
 * Formats date into standard YYYY-MM-DD display string.
 */
function formatDateDisplay_(val) {
  if (!val) return '';
  const d = parseDateObject_(val);
  if (d) return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return String(val).trim();
}

/**
 * Unique invoice key: Plant + Normalized Invoice Number.
 */
function makeKey_(plant, invoice) {
  return normalize_(plant) + '|' + normalize_(invoice);
}

/**
 * Normalizes string for comparisons.
 */
function normalize_(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Creates paid record row array.
 */
function makePaidRecord_(plant, row, idx, sheetName, rowNum, key, date) {
  return [
    plant,
    getCell_(row, idx.shortName),
    getCell_(row, idx.fullName),
    getCell_(row, idx.country),
    getCell_(row, idx.salesPerson),
    getCell_(row, idx.invoice),
    formatDateDisplay_(getCell_(row, idx.invoiceDate)),
    formatDateDisplay_(getCell_(row, idx.dueDate)),
    formatDateDisplay_(getCell_(row, idx.blDate)),
    String(getCell_(row, idx.currency) || 'UNKNOWN').toUpperCase(),
    parseAmount_(getCell_(row, idx.amount)),
    getCell_(row, idx.terms),
    getCell_(row, idx.remarks),
    getCell_(row, idx.factoring),
    date instanceof Date ? date : new Date(),
    sheetName,
    rowNum,
    'Source yellow',
    false,
    key
  ];
}

/**
 * Reads existing paid records from the tracker Paid sheet.
 */
function readExistingPaid_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = Math.max(sheet.getLastColumn(), PAID_HEADERS.length);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  return rows.map(r => {
    if (r.length < PAID_HEADERS.length || !r[PAID_HEADERS.indexOf('Invoice Key')]) {
      const oldKey = r[17] || r[r.length - 1] || '';
      if (oldKey) return r.slice(0, 17).concat(['Legacy paid record', false, oldKey]);
    }
    return r.slice(0, PAID_HEADERS.length);
  });
}

/**
 * Writes data rows cleanly to target sheet with formatting.
 */
function writeRows_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('middle')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');
  sheet.setRowHeight(1, 38);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Sets up basic table structure.
 */
function setupTable_(sheet, headers) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('middle')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');
  sheet.setRowHeight(1, 38);
}

/**
 * Applies professional formatting to Open Invoices sheet.
 */
function applyOpenFormatting_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const checkboxCol = TRACKER_HEADERS.indexOf('Payment Received?') + 1;
  sheet.getRange(2, checkboxCol, last - 1, 1).insertCheckboxes();
  sheet.getRange(2, 7, last - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 8, last - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 10, last - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 12, last - 1, 1).setNumberFormat('#,##0.00');

  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, last, TRACKER_HEADERS.length).createFilter();
  }
}

/**
 * Applies formatting to Payments Received sheet.
 */
function applyPaidFormatting_(sheet) {
  const last = sheet.getLastRow();
  if (last < 1) return;
  if (last > 1) {
    sheet.getRange(2, 7, last - 1, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, 8, last - 1, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, 9, last - 1, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, 11, last - 1, 1).setNumberFormat('#,##0.00');
    sheet.getRange(2, 15, last - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    const restoreCol = PAID_HEADERS.indexOf('Undo / Restore?') + 1;
    sheet.getRange(2, restoreCol, last - 1, 1).insertCheckboxes();
  }
}

/**
 * Builds clean summary dashboard on the spreadsheet itself for Google Sheets viewers.
 */
function buildSpreadsheetDashboard_(sheet) {
  sheet.clear();
  sheet.getRange('A1:G1').merge().setValue('ASL & ASIL EXPORT COLLECTION INTELLIGENCE')
    .setFontSize(16).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sheet.getRange('A2:G2').merge().setValue('Company-wide Export Receivables & Payment Monitoring | Central Tracker')
    .setFontSize(10).setFontStyle('italic').setBackground('#1e293b').setFontColor('#94a3b8')
    .setVerticalAlignment('middle');

  sheet.getRange('A4:B9').setValues([
    ['OPEN RECEIVABLES METRIC', 'COUNT'],
    ['Total Open Invoices', 0],
    ['ASL Delhi Open Invoices', 0],
    ['ASIL Gujarat Open Invoices', 0],
    ['Overdue Invoices (>0 Days)', 0],
    ['Critical Overdue (>50 Days)', 0]
  ]);

  sheet.getRange('D4:E7').setValues([
    ['PAYMENTS METRIC', 'COUNT'],
    ['Total Paid Invoices', 0],
    ['Source Yellow Detected', 0],
    ['Manually Checked Paid', 0]
  ]);

  sheet.getRange('A4:B4').setFontWeight('bold').setBackground('#e0f2fe').setFontColor('#0369a1');
  sheet.getRange('D4:E4').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d');
  sheet.setColumnWidths(1, 5, 230);
  sheet.setFrozenRows(2);
}

/**
 * Updates summary figures on the spreadsheet dashboard sheet.
 */
function updateSpreadsheetDashboard_(ss) {
  const open = ss.getSheetByName(CONFIG.OPEN_SHEET);
  const paid = ss.getSheetByName(CONFIG.PAID_SHEET);
  const dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!dash) return;

  const openRows = open && open.getLastRow() > 1
    ? open.getRange(2, 1, open.getLastRow() - 1, TRACKER_HEADERS.length).getValues()
    : [];

  const paidRows = paid && paid.getLastRow() > 1
    ? paid.getRange(2, 1, paid.getLastRow() - 1, PAID_HEADERS.length).getValues()
    : [];

  const daysCol = TRACKER_HEADERS.indexOf('No. of Days Overdue from Today');
  const plantCol = TRACKER_HEADERS.indexOf('Source Plant');
  const paidSourceCol = PAID_HEADERS.indexOf('Payment Source');

  const openCount = openRows.length;
  const aslCount = openRows.filter(r => String(r[plantCol]).toUpperCase() === 'ASL').length;
  const asilCount = openRows.filter(r => String(r[plantCol]).toUpperCase() === 'ASIL').length;
  const overdueCount = openRows.filter(r => Number(r[daysCol]) > 0).length;
  const criticalCount = openRows.filter(r => Number(r[daysCol]) > 50).length;

  const paidCount = paidRows.length;
  const yellowPaid = paidRows.filter(r => String(r[paidSourceCol]) === 'Source yellow').length;
  const manualPaid = paidRows.filter(r => String(r[paidSourceCol]) === 'Manually checked').length;

  dash.getRange('B5:B9').setValues([
    [openCount],
    [aslCount],
    [asilCount],
    [overdueCount],
    [criticalCount]
  ]);

  dash.getRange('E5:E7').setValues([
    [paidCount],
    [yellowPaid],
    [manualPaid]
  ]);
}
