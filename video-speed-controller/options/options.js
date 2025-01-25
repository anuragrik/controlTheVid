document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    step: document.getElementById('step'),
    rewind: document.getElementById('rewind'),
    opacity: document.getElementById('opacity'),
    keySlow: document.getElementById('keySlow'),
    keyFast: document.getElementById('keyFast'),
    keyReset: document.getElementById('keyReset'),
    save: document.getElementById('save'),
    status: document.getElementById('status')
  };

  const defaultSettings = {
    step: 0.1,
    rewind: 10,
    opacity: 0.8,
    keys: { slow: 's', fast: 'd', reset: 'r' }
  };

  // Load settings
  browser.storage.sync.get(defaultSettings).then(settings => {
    elements.step.value = settings.step;
    elements.rewind.value = settings.rewind;
    elements.opacity.value = settings.opacity;
    elements.keySlow.value = settings.keys.slow;
    elements.keyFast.value = settings.keys.fast;
    elements.keyReset.value = settings.keys.reset;
  });

  // Save settings
  elements.save.addEventListener('click', () => {
    const settings = {
      step: Math.max(0.1, Math.min(2, parseFloat(elements.step.value) || 0.1)),
      rewind: Math.max(1, Math.min(60, parseInt(elements.rewind.value) || 10)),
      opacity: Math.max(0.1, Math.min(1, parseFloat(elements.opacity.value) || 0.8)),
      keys: {
        slow: (elements.keySlow.value || 's').toLowerCase().substring(0,1),
        fast: (elements.keyFast.value || 'd').toLowerCase().substring(0,1),
        reset: (elements.keyReset.value || 'r').toLowerCase().substring(0,1)
      }
    };
    
    browser.storage.sync.set(settings).then(() => {
      showStatus('Settings saved!');
      browser.runtime.sendMessage({ type: 'settingsUpdated' });
    });
  });

  // Key handling
  document.querySelectorAll('.key-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key.length === 1) {
        input.value = e.key.toLowerCase();
      }
      e.preventDefault();
    });
  });

  function showStatus(text) {
    elements.status.textContent = text;
    elements.status.style.display = 'block';
    setTimeout(() => elements.status.style.display = 'none', 2000);
  }
});