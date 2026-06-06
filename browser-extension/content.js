(function installCareerOpsCollector() {
  if (window.__careerOpsCollectorInstalled) return;
  window.__careerOpsCollectorInstalled = true;

  const restrictedHosts = ['linkedin.com', 'indeed.com', 'glassdoor.com'];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function isRestrictedHost(hostname) {
    return restrictedHosts.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  }

  function ctaScore(label, href) {
    const text = `${label} ${href}`.toLowerCase();
    if (/submit|send application|complete application|final|finish|withdraw|delete|save|share|refer|sign in|log in|login|create account/.test(text)) return 0;
    if (/^apply now$|^apply$|^start application$/.test(label.toLowerCase())) return 100;
    if (/\bapply now\b|\bapply for this job\b|\bapply to this job\b/.test(text)) return 90;
    if (/\bstart application\b|\bbegin application\b|\bcontinue to application\b/.test(text)) return 85;
    if (/\bapply\b/.test(text)) return 70;
    return 0;
  }

  function directLabelForField(el) {
    const id = el.id || '';
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const parentLabel = el.closest('label');
    const fieldset = el.closest('fieldset');
    const direct = clean([
      fieldset?.querySelector('legend')?.textContent || '',
      label?.textContent || '',
      parentLabel?.textContent || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('name') || '',
      id,
    ].join(' '));
    if (direct) return direct;

    const nearby = clean((el.closest('[class*="field"], [class*="question"], .application-question') || {}).textContent || '');
    return nearby.length <= 140 ? nearby : '';
  }

  function collect() {
    const url = location.href;
    const hostname = location.hostname.toLowerCase();

    if (isRestrictedHost(hostname)) {
      return {
        blocked: true,
        reason: 'Restricted job-board page. Open the employer or ATS apply page before filling.',
        url,
        title: document.title,
        applyLinks: [],
        fields: [],
      };
    }

    const applyLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const href = el.getAttribute('href') || '';
        const label = clean([
          el.textContent || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('title') || '',
          href,
        ].join(' '));
        return {
          index,
          tag: el.tagName.toLowerCase(),
          label,
          href,
          score: ctaScore(label, href),
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter(link => link.visible && link.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const fields = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const type = (el.getAttribute('type') || (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : el.tagName.toLowerCase())).toLowerCase();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          type,
          id: el.id || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          label: directLabelForField(el),
          visible: rect.width > 0 && rect.height > 0,
          disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        };
      })
      .filter(field => field.visible && !field.disabled && !['hidden', 'submit', 'button', 'reset'].includes(field.type))
      .slice(0, 100);

    return {
      blocked: false,
      url,
      title: document.title,
      applyLinks,
      fields,
    };
  }

  function standardMap(session) {
    const map = new Map();
    for (const field of session?.standardFields || []) {
      if (field?.key) map.set(field.key, clean(field.value));
    }
    const legalName = map.get('legal_name') || '';
    const parts = legalName.split(/\s+/).filter(Boolean);
    if (!map.has('first_name')) map.set('first_name', parts[0] || '');
    if (!map.has('last_name')) map.set('last_name', parts.slice(1).join(' ') || '');
    return map;
  }

  function signalCount(text) {
    return [
      /\bfirst\b.*\bname\b|given name/,
      /\blast\b.*\bname\b|family name|surname/,
      /legal name|full name|your name|\bname\b/,
      /email/,
      /phone|mobile|telephone/,
      /linkedin/,
      /portfolio|website|personal site/,
      /github/,
      /street address|address line 1|address 1|home address|mailing address|residential address|\baddress\b/,
      /postal|postcode|zip/,
      /country|which country|country.*stay|country.*live|residence country/,
      /\bcity\b|where are you located|current location|where do you live|where do you stay|where are you based/,
      /province|state/,
    ].filter(pattern => pattern.test(text)).length;
  }

  function valueFromStandard(label, session) {
    const text = lower(label);
    const map = standardMap(session);
    const pick = key => {
      const value = map.get(key) || '';
      return value ? { key, value, confidence: 'high' } : null;
    };

    if (signalCount(text) >= 3 && text.length > 80) return null;
    if (/\bfirst\b.*\bname\b|given name/.test(text)) return pick('first_name');
    if (/\blast\b.*\bname\b|family name|surname/.test(text)) return pick('last_name');
    if (/email/.test(text)) return pick('email');
    if (/phone|mobile|telephone/.test(text)) return pick('phone');
    if (/linkedin/.test(text)) return pick('linkedin');
    if (/portfolio|website|personal site/.test(text)) return pick('portfolio');
    if (/github/.test(text)) return pick('github');
    if (/address line 2|address 2|unit|apartment|apt|suite/.test(text)) return pick('address_line2');
    if (/street address|address line 1|address 1|home address|mailing address|residential address|\baddress\b/.test(text)) return pick('address_line1');
    if (/postal|postcode|zip/.test(text)) return pick('postal_code');
    if (/country|which country|country.*stay|country.*live|residence country/.test(text)) return pick('country');
    if (/\bcity\b|where are you located|current location|where do you live|where do you stay|where are you based/.test(text)) return pick('city');
    if (/province|state/.test(text)) return pick('province');
    if (/legal name|full name|your name|\bname\b/.test(text)) return pick('legal_name');
    if (/authorized|eligible|legally.*work|work.*canada/.test(text)) return pick('work_authorization');
    if (/sponsor|sponsorship|visa/.test(text)) return pick('sponsorship');
    if (/availability|available|start date/.test(text)) return pick('availability');
    return null;
  }

  function answerFor(label, session) {
    const text = lower(label);
    const answers = (session?.answers || [])
      .filter(answer => clean(answer.answer) && answer.fieldType !== 'file')
      .map(answer => {
        const source = lower(`${answer.question || ''} ${answer.label || ''}`);
        const overlap = source && text ? source.split(/\W+/).filter(token => token.length > 2 && text.includes(token)).length : 0;
        return { answer, score: overlap };
      })
      .sort((a, b) => b.score - a.score);
    if (answers[0]?.score >= 2) return clean(answers[0].answer.answer);
    if (/why|interest|experience|about|tell|describe|additional|cover/i.test(label)) {
      const written = (session?.answers || []).find(answer => answer.fieldType === 'written' && clean(answer.answer));
      return written ? clean(written.answer) : '';
    }
    return '';
  }

  function resolveValue(field, session) {
    const label = clean(`${field.label} ${field.name} ${field.id} ${field.placeholder}`);
    const text = lower(label);
    if (/search|keyword|filter|job alert|newsletter|subscribe|notification|sort by|radius/.test(text)) {
      return { action: 'review', label, reason: 'Ignored search/filter field.' };
    }
    if (field.type === 'file') {
      return { action: 'review', label, reason: 'File uploads need the local app or manual upload.' };
    }
    const standard = valueFromStandard(label, session);
    if (standard?.value) {
      if (['checkbox', 'radio'].includes(field.type)) {
        const yes = /yes|eligible|authorized|can work|legally work/i.test(standard.value);
        const no = /no|not require|do not require|without sponsorship/i.test(standard.value);
        const option = text;
        if (yes && /yes|true|authorized|eligible/.test(option)) return { action: 'check', label, ...standard };
        if (no && /\bno\b|false|not require|do not require|without sponsorship/.test(option)) return { action: 'check', label, ...standard };
        return { action: 'review', label, reason: 'Checkbox/radio option is ambiguous.' };
      }
      return { action: 'fill', label, ...standard };
    }
    const answer = answerFor(label, session);
    if (answer) return { action: 'fill', label, key: 'written_response', value: answer, confidence: 'medium' };
    return { action: 'review', label, reason: 'No high-confidence value matched.' };
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectOption(el, value) {
    const options = Array.from(el.options || []);
    const match = options.find(option =>
      lower(option.textContent) === lower(value) ||
      lower(option.value) === lower(value) ||
      lower(option.textContent).includes(lower(value)));
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillCurrentPage(session) {
    const context = collect();
    if (context.blocked) return { status: 'blocked', ...context, filled: [], review: [{ reason: context.reason }] };

    if (context.fields.length === 0 && context.applyLinks[0]) {
      const link = context.applyLinks[0];
      if (link.href) {
        return {
          status: 'navigate',
          navigateTo: new URL(link.href, location.href).href,
          label: link.label,
          ...context,
        };
      }

      const clickables = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const target = clickables[link.index];
      if (target) {
        target.click();
        return {
          status: 'clicked_apply',
          label: link.label,
          ...context,
        };
      }
    }

    const controls = Array.from(document.querySelectorAll('input, textarea, select'));
    const filled = [];
    const review = [];

    for (const field of context.fields) {
      const el = controls[field.index];
      if (!el) continue;
      const resolution = resolveValue(field, session);
      try {
        if (resolution.action === 'fill') {
          if (field.tag === 'select') {
            if (!selectOption(el, resolution.value)) throw new Error('No matching select option.');
          } else {
            setNativeValue(el, resolution.value);
          }
          filled.push({ label: resolution.label, key: resolution.key });
        } else if (resolution.action === 'check') {
          if (!el.checked) el.click();
          filled.push({ label: resolution.label, key: resolution.key });
        } else {
          review.push({ label: resolution.label, reason: resolution.reason });
        }
      } catch (err) {
        review.push({ label: resolution.label, reason: err instanceof Error ? err.message : 'Could not fill field.' });
      }
    }

    return {
      status: 'filled_review',
      ...context,
      filled,
      review,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CAREER_OPS_COLLECT_TAB') {
      sendResponse(collect());
      return false;
    }
    if (message?.type === 'CAREER_OPS_FILL_TAB') {
      sendResponse(fillCurrentPage(message.session || {}));
      return false;
    }
    return false;
  });
})();
