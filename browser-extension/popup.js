const baseUrlInput = document.getElementById('baseUrl');
const applicationIdInput = document.getElementById('applicationId');
const fillButton = document.getElementById('fillButton');
const captureButton = document.getElementById('captureButton');
const statusEl = document.getElementById('status');

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function normalizeBaseUrl(value) {
  return String(value || 'http://localhost:3000').replace(/\/+$/, '');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab;
}

async function collectCurrentTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const response = await chrome.tabs.sendMessage(tabId, { type: 'CAREER_OPS_COLLECT_TAB' });
  if (!response) throw new Error('Could not read the current tab.');
  return response;
}

async function fillCurrentTab(tabId, session) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const response = await chrome.tabs.sendMessage(tabId, { type: 'CAREER_OPS_FILL_TAB', session });
  if (!response) throw new Error('Could not fill the current tab.');
  return response;
}

function waitForTabLoad(tabId, timeoutMs = 12000) {
  return new Promise(resolve => {
    const timeout = setTimeout(done, timeoutMs);

    function done() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') done();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function fetchApplySession(baseUrl, applicationId) {
  const res = await fetch(`${baseUrl}/api/applications/${encodeURIComponent(applicationId)}/apply`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Career-Ops could not load this application.');
  return data;
}

async function saveCurrentTabContext(baseUrl, applicationId, context) {
  const res = await fetch(`${baseUrl}/api/applications/${encodeURIComponent(applicationId)}/apply/current-tab`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });
  return res.json().catch(() => ({}));
}

async function saveSettings() {
  await chrome.storage.local.set({
    baseUrl: normalizeBaseUrl(baseUrlInput.value),
    applicationId: applicationIdInput.value.trim(),
  });
}

async function restoreSettings() {
  const saved = await chrome.storage.local.get(['baseUrl', 'applicationId']);
  if (saved.baseUrl) baseUrlInput.value = saved.baseUrl;
  if (saved.applicationId) applicationIdInput.value = saved.applicationId;
}

async function capture() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const applicationId = applicationIdInput.value.trim();
  if (!applicationId) {
    setStatus('Paste an application id first.', 'error');
    return;
  }

  captureButton.disabled = true;
  setStatus('Reading current tab...');

  try {
    await saveSettings();
    const tab = await getActiveTab();
    const context = await collectCurrentTab(tab.id);
    if (context.blocked) throw new Error(context.reason);

    setStatus('Sending apply link to Career-Ops...');
    const res = await fetch(`${baseUrl}/api/applications/${encodeURIComponent(applicationId)}/apply/current-tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.reason || 'Career-Ops could not capture an apply link.');

    setStatus(data.applyUrl ? 'Apply link saved. Review it in Career-Ops before submitting.' : data.reason, data.applyUrl ? 'success' : 'error');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Capture failed.', 'error');
  } finally {
    captureButton.disabled = false;
  }
}

function fillSummary(result) {
  const filled = result.filled?.length || 0;
  const review = result.review?.length || 0;
  if (result.status === 'blocked') return result.reason || 'This page cannot be filled.';
  if (filled === 0 && review === 0) return 'No fillable application fields were found on this page.';
  if (review > 0) return `Filled ${filled} field${filled === 1 ? '' : 's'}. Review ${review} field${review === 1 ? '' : 's'} before submitting.`;
  return `Filled ${filled} field${filled === 1 ? '' : 's'}. Review the page before submitting.`;
}

async function fill() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const applicationId = applicationIdInput.value.trim();
  if (!applicationId) {
    setStatus('Paste an application id first.', 'error');
    return;
  }

  fillButton.disabled = true;
  captureButton.disabled = true;
  setStatus('Loading Career-Ops application...');

  try {
    await saveSettings();
    const tab = await getActiveTab();
    let context = await collectCurrentTab(tab.id);
    if (context.blocked) throw new Error(context.reason);

    await saveCurrentTabContext(baseUrl, applicationId, context);
    const session = await fetchApplySession(baseUrl, applicationId);

    setStatus('Filling the current page...');
    let result = await fillCurrentTab(tab.id, session);

    if (result.status === 'navigate' && result.navigateTo) {
      setStatus('Opening the employer apply form...');
      await chrome.tabs.update(tab.id, { url: result.navigateTo });
      await waitForTabLoad(tab.id);
      result = await fillCurrentTab(tab.id, session);
    } else if (result.status === 'clicked_apply') {
      setStatus('Waiting for the apply form...');
      await waitForTabLoad(tab.id);
      result = await fillCurrentTab(tab.id, session);
    }

    context = await collectCurrentTab(tab.id).catch(() => context);
    await saveCurrentTabContext(baseUrl, applicationId, context);

    const hasReview = (result.review?.length || 0) > 0;
    setStatus(fillSummary(result), hasReview || result.status === 'blocked' ? 'error' : 'success');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Fill failed.', 'error');
  } finally {
    fillButton.disabled = false;
    captureButton.disabled = false;
  }
}

void restoreSettings();
fillButton.addEventListener('click', () => void fill());
captureButton.addEventListener('click', () => void capture());
