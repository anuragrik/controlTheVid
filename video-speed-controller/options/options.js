document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    step: document.getElementById('step'),
    rewind: document.getElementById('rewind'),
    advance: document.getElementById('advance'),
    opacity: document.getElementById('opacity'),
    defaultSpeed: document.getElementById('defaultSpeed'),
    resetSpeed: document.getElementById('resetSpeed'),
    hideController: document.getElementById('hideController'),
    rememberSpeed: document.getElementById('rememberSpeed'),
    disabledSites: document.getElementById('disabledSites'),
    keySlow: document.getElementById('keySlow'),
    keyFast: document.getElementById('keyFast'),
    keyReset: document.getElementById('keyReset'),
    keyRewind: document.getElementById('keyRewind'),
    keyAdvance: document.getElementById('keyAdvance'),
    save: document.getElementById('save'),
    status: document.getElementById('status')
  };

  const defaultSettings = {
    step: 0.1,
    rewind: 10,
    advance: 10,
    opacity: 0.8,
    defaultSpeed: 1.0,
    resetSpeed: 1.0,
    hideController: false,
    rememberSpeed: false,
    disabledSites: [],
    keys: {
      slow: 's',
      fast: 'd',
      reset: 'r',
      rewind: 'z',
      advance: 'x'
    }
  };

  // Show status message
  const showStatus = (message, isError = false) => {
    elements.status.textContent = message;
    elements.status.style.display = 'block';
    elements.status.style.background = isError ? '#fee2e2' : '#dcfce7';
    elements.status.style.color = isError ? '#991b1b' : '#166534';
    elements.status.classList.remove('fade-out');
    
    // Clear any existing timeout
    if (elements.status._timeout) {
      clearTimeout(elements.status._timeout);
    }

    // Set new timeout for hiding
    elements.status._timeout = setTimeout(() => {
      elements.status.classList.add('fade-out');
      setTimeout(() => {
        elements.status.style.display = 'none';
        elements.status.classList.remove('fade-out');
      }, 300); // Match animation duration
    }, 2000);
  };

  // Load settings
  chrome.storage.sync.get(defaultSettings, (items) => {
    try {
      const settings = { ...defaultSettings, ...items };
      
      // Update form with loaded settings
      elements.step.value = settings.step;
      elements.rewind.value = settings.rewind;
      elements.advance.value = settings.advance;
      elements.opacity.value = settings.opacity;
      elements.defaultSpeed.value = settings.defaultSpeed;
      elements.resetSpeed.value = settings.resetSpeed;
      elements.hideController.checked = settings.hideController;
      elements.rememberSpeed.checked = settings.rememberSpeed;
      elements.disabledSites.value = (settings.disabledSites || []).join('\n');
      elements.keySlow.value = settings.keys?.slow || 's';
      elements.keyFast.value = settings.keys?.fast || 'd';
      elements.keyReset.value = settings.keys?.reset || 'r';
      elements.keyRewind.value = settings.keys?.rewind || 'z';
      elements.keyAdvance.value = settings.keys?.advance || 'x';
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', true);
    }
  });

  // Save settings
  const saveSettings = () => {
    try {
      const settings = {
        step: Math.max(0.1, Math.min(2, parseFloat(elements.step.value) || 0.1)),
        rewind: Math.max(1, Math.min(60, parseInt(elements.rewind.value) || 10)),
        advance: Math.max(1, Math.min(60, parseInt(elements.advance.value) || 10)),
        opacity: Math.max(0.1, Math.min(1, parseFloat(elements.opacity.value) || 0.8)),
        defaultSpeed: Math.max(0.1, Math.min(16, parseFloat(elements.defaultSpeed.value) || 1.0)),
        resetSpeed: Math.max(0.1, Math.min(16, parseFloat(elements.resetSpeed.value) || 1.0)),
        hideController: elements.hideController.checked,
        rememberSpeed: elements.rememberSpeed.checked,
        disabledSites: elements.disabledSites.value
          .split('\n')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean),
        keys: {
          slow: (elements.keySlow.value || 's').toLowerCase().charAt(0),
          fast: (elements.keyFast.value || 'd').toLowerCase().charAt(0),
          reset: (elements.keyReset.value || 'r').toLowerCase().charAt(0),
          rewind: (elements.keyRewind.value || 'z').toLowerCase().charAt(0),
          advance: (elements.keyAdvance.value || 'x').toLowerCase().charAt(0)
        }
      };

      console.log('Saving settings:', settings);

      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving settings:', chrome.runtime.lastError);
          showStatus('Error saving settings', true);
          return;
        }

        showStatus('Settings saved!');

        // Notify content script of changes
        chrome.tabs.query({}, tabs => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'settingsUpdated', settings });
          });
        });
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', true);
    }
  };

  // Add save button click handler
  elements.save.addEventListener('click', saveSettings);

  // Add keyboard shortcut for saving (Ctrl/Cmd + S)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveSettings();
    }
  });

  // Key input handling
  const keyInputs = document.querySelectorAll('.key-input');
  const handleKeyDown = e => {
    if (e.key.length === 1) {
      e.target.value = e.key.toLowerCase();
      e.preventDefault();
    }
  };
  keyInputs.forEach(input => input.addEventListener('keydown', handleKeyDown));
});