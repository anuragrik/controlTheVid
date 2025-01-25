document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM elements
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
    keyToggle: document.getElementById('keyToggle'),
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
      advance: 'x',
      toggle: 'v'
    }
  };

  // Debounce function for performance optimization
  const debounce = (func, wait) => {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  // Show status message with optimized animation handling
  const showStatus = (() => {
    let currentTimeout;
    return (message, isError = false) => {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
        elements.status.classList.remove('fade-out');
      }

      requestAnimationFrame(() => {
        elements.status.textContent = message;
        elements.status.style.display = 'block';
        elements.status.style.background = isError ? '#fee2e2' : '#dcfce7';
        elements.status.style.color = isError ? '#991b1b' : '#166534';
        
        currentTimeout = setTimeout(() => {
          elements.status.classList.add('fade-out');
          setTimeout(() => {
            if (elements.status.classList.contains('fade-out')) {
              elements.status.style.display = 'none';
              elements.status.classList.remove('fade-out');
            }
          }, 300);
        }, 2000);
      });
    };
  })();

  // Load settings with optimized error handling
  const loadSettings = async () => {
    try {
      const items = await new Promise(resolve => 
        chrome.storage.sync.get(defaultSettings, resolve)
      );
      
      const settings = { ...defaultSettings, ...items };
      
      // Batch DOM updates
      requestAnimationFrame(() => {
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
        elements.keyToggle.value = settings.keys?.toggle || 'v';
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', true);
    }
  };

  // Save settings with optimized validation and storage
  const saveSettings = debounce(async () => {
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
          advance: (elements.keyAdvance.value || 'x').toLowerCase().charAt(0),
          toggle: (elements.keyToggle.value || 'v').toLowerCase().charAt(0)
        }
      };

      // Save settings to storage
      await new Promise(resolve => chrome.storage.sync.set(settings, resolve));

      // Notify all tabs about the settings update
      const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
      await Promise.all(tabs.map(tab => 
        new Promise(resolve => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'settingsUpdated',
            settings: settings
          }).then(() => resolve())
            .catch(() => resolve()); // Ignore errors for tabs that don't have the content script
        })
      ));

      showStatus('Settings saved successfully');

      // Update form with normalized values
      requestAnimationFrame(() => {
        elements.step.value = settings.step;
        elements.rewind.value = settings.rewind;
        elements.advance.value = settings.advance;
        elements.opacity.value = settings.opacity;
        elements.defaultSpeed.value = settings.defaultSpeed;
        elements.resetSpeed.value = settings.resetSpeed;
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', true);
    }
  }, 100); // Reduced debounce time for faster response

  // Optimize event listeners
  elements.save.addEventListener('click', saveSettings, { passive: true });

  // Optimize keyboard shortcut handling
  const handleKeyboardSave = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveSettings();
    }
  };
  document.addEventListener('keydown', handleKeyboardSave);

  // Optimize key input handling with event delegation
  const handleKeyInput = (e) => {
    const target = e.target;
    if (target.classList.contains('key-input') && e.key.length === 1) {
      e.preventDefault();
      target.value = e.key.toLowerCase();
    }
  };
  document.addEventListener('keydown', handleKeyInput, { passive: false });

  // Initialize settings
  loadSettings();
});