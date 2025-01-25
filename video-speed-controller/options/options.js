document.addEventListener('DOMContentLoaded', () => {
  // Initialize state object
  const state = {
    settings: null,
    websiteSettingsCollapsed: true,
    speedProfilesCollapsed: true
  };

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
    websiteSettings: document.getElementById('websiteSettings'),
    speedProfiles: document.getElementById('speedProfiles'),
    websiteSettingsHeader: document.getElementById('websiteSettingsHeader'),
    speedProfilesHeader: document.getElementById('speedProfilesHeader'),
    addWebsite: document.getElementById('addWebsite'),
    addProfile: document.getElementById('addProfile'),
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
    websiteSettings: {},
    profiles: [],
    activeProfile: null,
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

  // Create website settings item
  const createWebsiteItem = (hostname = '', settings = {}) => {
    const item = document.createElement('div');
    item.className = 'website-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = hostname;
    input.placeholder = 'example.com';
    input.className = 'website-input';
    input.required = true;

    const speedInput = document.createElement('input');
    speedInput.type = 'number';
    speedInput.value = settings.defaultSpeed || 1.0;
    speedInput.step = 0.1;
    speedInput.min = 0.1;
    speedInput.max = 16;
    speedInput.className = 'speed-input';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => item.remove();

    // Add validation on input change
    input.addEventListener('input', () => {
      if (!input.value.trim()) {
        input.classList.add('invalid');
      } else {
        input.classList.remove('invalid');
      }
    });

    item.append(input, speedInput, removeBtn);
    elements.websiteSettings.appendChild(item);
  };

  // Create profile item
  const createProfileItem = (profile = { name: '', settings: {} }) => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    if (profile.name === state.settings?.activeProfile) {
      item.classList.add('active');
    }

    const header = document.createElement('div');
    header.className = 'profile-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = profile.name;
    nameInput.placeholder = 'Profile Name';
    nameInput.className = 'profile-name';
    nameInput.required = true;

    // Add validation on input change
    nameInput.addEventListener('input', () => {
      if (!nameInput.value.trim()) {
        nameInput.classList.add('invalid');
      } else {
        nameInput.classList.remove('invalid');
      }
    });

    const actions = document.createElement('div');
    actions.className = 'profile-actions';

    const activateBtn = document.createElement('button');
    activateBtn.className = 'btn btn-primary';
    activateBtn.textContent = profile.name === state.settings?.activeProfile ? 'Deactivate' : 'Activate';
    activateBtn.onclick = async () => {
      try {
        const isActivating = !item.classList.contains('active');
        
        document.querySelectorAll('.profile-item').forEach(p => {
          p.classList.remove('active');
          p.querySelector('.btn-primary').textContent = 'Activate';
        });

        if (isActivating) {
          item.classList.add('active');
          activateBtn.textContent = 'Deactivate';
          state.settings.activeProfile = nameInput.value.trim();
        } else {
          state.settings.activeProfile = null;
        }

        // Save settings first
        await saveSettings();

        // Then notify all tabs with proper error handling
        try {
          const tabs = await chrome.tabs.query({});
          if (tabs) {
            await Promise.all(tabs.map(tab => 
              chrome.tabs.sendMessage(tab.id, { type: 'settingsUpdated' }).catch(() => {})
            ));
          }
        } catch (error) {
          console.warn('Error notifying tabs:', error);
          // Continue execution even if tab notification fails
        }
      } catch (error) {
        console.error('Error activating profile:', error);
        showStatus('Error activating profile', true);
      }
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '×';
    removeBtn.onclick = async () => {
      try {
        if (item.classList.contains('active')) {
          state.settings.activeProfile = null;
        }
        item.remove();
        
        // Save settings first
        await saveSettings();

        // Then notify all tabs with proper error handling
        try {
          const tabs = await chrome.tabs.query({});
          if (tabs) {
            await Promise.all(tabs.map(tab => 
              chrome.tabs.sendMessage(tab.id, { type: 'settingsUpdated' }).catch(() => {})
            ));
          }
        } catch (error) {
          console.warn('Error notifying tabs:', error);
          // Continue execution even if tab notification fails
        }
      } catch (error) {
        console.error('Error removing profile:', error);
        showStatus('Error removing profile', true);
      }
    };

    actions.append(activateBtn, removeBtn);
    header.append(nameInput, actions);

    const settings = document.createElement('div');
    settings.className = 'profile-settings';

    // Add settings inputs
    const settingsInputs = {
      defaultSpeed: { label: 'Default Speed', type: 'number', step: 0.1, min: 0.1, max: 16 },
      step: { label: 'Speed Step', type: 'number', step: 0.1, min: 0.1, max: 2 },
      rewind: { label: 'Rewind Time', type: 'number', min: 1, max: 60 },
      advance: { label: 'Advance Time', type: 'number', min: 1, max: 60 }
    };

    Object.entries(settingsInputs).forEach(([key, config]) => {
      const group = document.createElement('div');
      group.className = 'input-group';

      const label = document.createElement('label');
      label.textContent = config.label;

      const input = document.createElement('input');
      input.type = config.type;
      input.value = profile.settings?.[key] || defaultSettings[key];
      input.step = config.step;
      input.min = config.min;
      input.max = config.max;
      input.dataset.setting = key;
      input.addEventListener('change', async () => {
        if (item.classList.contains('active')) {
          // Save settings first
          await saveSettings();

          // Then notify all tabs
          const tabs = await chrome.tabs.query({});
          await Promise.all(tabs.map(tab => 
            chrome.tabs.sendMessage(tab.id, { type: 'settingsUpdated' }).catch(() => {})
          ));
        }
      });

      group.append(label, input);
      settings.appendChild(group);
    });

    item.append(header, settings);
    elements.speedProfiles.appendChild(item);
  };

  // Load settings with optimized error handling
  const loadSettings = async () => {
    try {
      const items = await new Promise(resolve => 
        chrome.storage.sync.get(defaultSettings, resolve)
      );
      
      state.settings = { ...defaultSettings, ...items };
      
      // Batch DOM updates
      requestAnimationFrame(() => {
        elements.step.value = state.settings.step;
        elements.rewind.value = state.settings.rewind;
        elements.advance.value = state.settings.advance;
        elements.opacity.value = state.settings.opacity;
        elements.defaultSpeed.value = state.settings.defaultSpeed;
        elements.resetSpeed.value = state.settings.resetSpeed;
        elements.hideController.checked = state.settings.hideController;
        elements.rememberSpeed.checked = state.settings.rememberSpeed;
        elements.disabledSites.value = (state.settings.disabledSites || []).join('\n');
        elements.keySlow.value = state.settings.keys?.slow || 's';
        elements.keyFast.value = state.settings.keys?.fast || 'd';
        elements.keyReset.value = state.settings.keys?.reset || 'r';
        elements.keyRewind.value = state.settings.keys?.rewind || 'z';
        elements.keyAdvance.value = state.settings.keys?.advance || 'x';
        elements.keyToggle.value = state.settings.keys?.toggle || 'v';

        // Load website settings
        elements.websiteSettings.innerHTML = '';
        Object.entries(state.settings.websiteSettings || {}).forEach(([hostname, siteSettings]) => {
          createWebsiteItem(hostname, siteSettings);
        });

        // Load profiles
        elements.speedProfiles.innerHTML = '';
        (state.settings.profiles || []).forEach(profile => {
          createProfileItem(profile);
        });
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', true);
    }
  };

  // Save settings with optimized validation and storage
  const saveSettings = debounce(async () => {
    try {
      // Collect website settings with validation
      const websiteSettings = {};
      let hasEmptyWebsites = false;
      elements.websiteSettings.querySelectorAll('.website-item').forEach(item => {
        const hostname = item.querySelector('.website-input').value.trim().toLowerCase();
        const speed = parseFloat(item.querySelector('.speed-input').value);
        if (!hostname) {
          item.querySelector('.website-input').classList.add('invalid');
          hasEmptyWebsites = true;
        } else if (!isNaN(speed)) {
          websiteSettings[hostname] = { defaultSpeed: speed };
        }
      });

      // Collect profiles with validation
      const profiles = [];
      let hasEmptyProfiles = false;
      let activeProfile = null;
      elements.speedProfiles.querySelectorAll('.profile-item').forEach(item => {
        const name = item.querySelector('.profile-name').value.trim();
        if (!name) {
          item.querySelector('.profile-name').classList.add('invalid');
          hasEmptyProfiles = true;
        } else {
          const settings = {};
          item.querySelectorAll('.profile-settings input').forEach(input => {
            const key = input.dataset.setting;
            settings[key] = parseFloat(input.value);
          });
          
          const profile = { name, settings };
          if (item.classList.contains('active')) {
            activeProfile = name;
          }
          profiles.push(profile);
        }
      });

      // Show error if validation fails
      if (hasEmptyWebsites || hasEmptyProfiles) {
        showStatus('Please fill in all required fields', true);
        return;
      }

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
        websiteSettings,
        profiles,
        activeProfile,
        keys: {
          slow: (elements.keySlow.value || 's').toLowerCase().charAt(0),
          fast: (elements.keyFast.value || 'd').toLowerCase().charAt(0),
          reset: (elements.keyReset.value || 'r').toLowerCase().charAt(0),
          rewind: (elements.keyRewind.value || 'z').toLowerCase().charAt(0),
          advance: (elements.keyAdvance.value || 'x').toLowerCase().charAt(0),
          toggle: (elements.keyToggle.value || 'v').toLowerCase().charAt(0)
        }
      };

      // Update state
      state.settings = settings;

      // Save settings to storage
      await new Promise(resolve => chrome.storage.sync.set(settings, resolve));
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
  }, 50);

  // Add event listeners
  elements.addWebsite.addEventListener('click', () => createWebsiteItem());
  elements.addProfile.addEventListener('click', () => createProfileItem());
  elements.save.addEventListener('click', saveSettings);

  // Add collapsible functionality
  const toggleSection = (section, header, isCollapsed) => {
    const content = section;
    const button = header.querySelector('.collapse-btn');
    
    if (isCollapsed) {
      content.classList.add('collapsed');
      button.classList.add('collapsed');
    } else {
      content.classList.remove('collapsed');
      button.classList.remove('collapsed');
    }
  };

  elements.websiteSettingsHeader.addEventListener('click', () => {
    state.websiteSettingsCollapsed = !state.websiteSettingsCollapsed;
    toggleSection(elements.websiteSettings, elements.websiteSettingsHeader, state.websiteSettingsCollapsed);
  });

  elements.speedProfilesHeader.addEventListener('click', () => {
    state.speedProfilesCollapsed = !state.speedProfilesCollapsed;
    toggleSection(elements.speedProfiles, elements.speedProfilesHeader, state.speedProfilesCollapsed);
  });

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

  // Initialize collapsed state
  toggleSection(elements.websiteSettings, elements.websiteSettingsHeader, true);
  toggleSection(elements.speedProfiles, elements.speedProfilesHeader, true);
});