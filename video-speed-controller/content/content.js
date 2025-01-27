(() => {
  const videoControllers = new WeakMap();
  const controllerPositions = new WeakMap();
  const videoStates = new WeakMap();
  const rafCallbacks = new WeakMap();
  const state = {
    settings: {
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
      },
      websiteSettings: {},  // Per-website settings
      profiles: [],         // Custom speed profiles
      activeProfile: null   // Currently active profile
    },
    activeVideo: null,
    lastSpeed: 1.0,
    dragState: {
      isDragging: false,
      offsetX: 0,
      offsetY: 0
    }
  };

  // Check if site is disabled
  const isDisabledSite = () => {
    const hostname = window.location.hostname.replace('www.', '');
    return state.settings.disabledSites.some(site => 
      hostname === site || hostname.endsWith('.' + site)
    );
  };

  // Cache frequently used values
  const CONTROL_HEIGHT = 40;
  const MIN_MARGIN = 10;
  const EDGE_MARGIN = 50;
  const isYouTube = window.location.hostname.includes('youtube.com');
  const isVimeo = window.location.hostname.includes('vimeo.com');

  // Throttle function for performance optimization
  const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  // Debounce function for performance optimization
  const debounce = (func, wait) => {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  const isInControlArea = (video, x, y) => {
    const rect = video.getBoundingClientRect();
    if (y > rect.bottom - CONTROL_HEIGHT) return true;
    if (isYouTube) {
      if (y < rect.top + CONTROL_HEIGHT || y > rect.bottom - 100) return true;
    }
    if (isVimeo && y > rect.bottom - 60) return true;
    return false;
  };

  // Get active settings based on website and profile
  const getActiveSettings = () => {
    const hostname = window.location.hostname.replace('www.', '');
    let settings = { ...state.settings };
    
    // Check website-specific settings first
    if (state.settings.websiteSettings[hostname]) {
      settings = {
        ...settings,
        ...state.settings.websiteSettings[hostname]
      };
    }
    
    // Then check active profile
    if (state.settings.activeProfile) {
      const activeProfile = state.settings.profiles.find(p => p.name === state.settings.activeProfile);
      if (activeProfile?.settings) {
        // Profile settings override website settings
        settings = {
          ...settings,
          ...activeProfile.settings,
          // Keep the keys from the original settings
          keys: settings.keys
        };
      }
    }
    
    return settings;
  };

  const createController = (video) => {
    if (videoControllers.has(video) || isDisabledSite()) return;

    // Get active settings for this website
    const activeSettings = getActiveSettings();

    // Create elements once and cache them
    const controller = document.createElement('div');
    const hoverContainer = document.createElement('div');
    const display = document.createElement('div');
    const controls = document.createElement('div');
    const slowerBtn = document.createElement('button');
    const resetBtn = document.createElement('button');
    const fasterBtn = document.createElement('button');

    // Set up classes and attributes
    controller.className = 'vsc-controller';
    hoverContainer.className = 'vsc-hover-container';
    display.className = 'vsc-display';
    controls.className = 'vsc-controls';
    slowerBtn.className = 'vsc-btn vsc-slower';
    resetBtn.className = 'vsc-btn vsc-reset';
    fasterBtn.className = 'vsc-btn vsc-faster';

    // Set text content
    slowerBtn.textContent = '−';
    resetBtn.textContent = '⭮';
    fasterBtn.textContent = '+';
    display.textContent = `${video.playbackRate.toFixed(2)}×`;

    // Build DOM structure
    controls.append(slowerBtn, resetBtn, fasterBtn);
    hoverContainer.append(display, controls);
    controller.appendChild(hoverContainer);

    // Apply settings
    controller.style.opacity = state.settings.opacity;
    if (state.settings.hideController) {
      controller.style.display = 'none';
    }

    // Set initial video speed based on active settings
    const setInitialSpeed = () => {
      if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
        video.playbackRate = state.lastSpeed;
      } else {
        video.playbackRate = activeSettings.defaultSpeed;
      }
    };

    // Try setting speed multiple times to overcome site-specific scripts
    setInitialSpeed();
    setTimeout(setInitialSpeed, 0);
    setTimeout(setInitialSpeed, 100);

    // Add event listeners for video loading states
    const loadEvents = ['loadeddata', 'loadedmetadata', 'canplay', 'playing'];
    loadEvents.forEach(event => {
      video.addEventListener(event, setInitialSpeed, { passive: true });
    });

    // Optimize rate change handling
    const handleRateChange = throttle(() => {
      if (state.settings.rememberSpeed) {
        state.lastSpeed = video.playbackRate;
        chrome.storage.sync.set({ lastSpeed: video.playbackRate });
      }
      updateDisplay();
    }, 100);

    video.addEventListener('ratechange', handleRateChange);

    // Prevent event bubbling
    controller.addEventListener('dblclick', e => {
      e.stopPropagation();
      e.preventDefault();
    }, { passive: true });

    let isDragging = false;
    let rafId = null;

    const getSafePosition = (pos) => {
      const rect = video.getBoundingClientRect();
      return {
        left: Math.max(MIN_MARGIN, Math.min(pos.left, rect.width - controller.offsetWidth - MIN_MARGIN)),
        top: Math.max(MIN_MARGIN, Math.min(pos.top, rect.height - CONTROL_HEIGHT - controller.offsetHeight))
      };
    };

    const updateControlsPosition = () => {
      const videoRect = video.getBoundingClientRect();
      const controllerRect = controller.getBoundingClientRect();

      controller.removeAttribute('data-position');

      if (controllerRect.right + EDGE_MARGIN >= videoRect.right) {
        controller.setAttribute('data-position', 'right');
      } else if (controllerRect.left <= videoRect.left + EDGE_MARGIN) {
        controller.setAttribute('data-position', 'left');
      } else if (controllerRect.bottom + EDGE_MARGIN >= videoRect.bottom) {
        controller.setAttribute('data-position', 'bottom');
      } else if (controllerRect.top <= videoRect.top + EDGE_MARGIN) {
        controller.setAttribute('data-position', 'top');
      }
    };

    const positionController = () => {
      const savedPosition = controllerPositions.get(video);
      let position = savedPosition ? getSafePosition(savedPosition) : { left: 10, top: 10 };
      
      controller.style.left = `${position.left}px`;
      controller.style.top = `${position.top}px`;
      updateControlsPosition();
    };

    // Drag handling
    const startDrag = (e) => {
      if (e.target.classList.contains('vsc-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      state.dragState.isDragging = true;
      const rect = controller.getBoundingClientRect();
      state.dragState.offsetX = e.clientX - rect.left;
      state.dragState.offsetY = e.clientY - rect.top;
      controller.classList.add('grabbing');
    };

    // Optimize drag handling
    const handleDrag = (e) => {
      if (!state.dragState.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      
      const rafCallback = () => {
        const rect = video.getBoundingClientRect();
        let newX = e.clientX - state.dragState.offsetX - rect.left;
        let newY = e.clientY - state.dragState.offsetY - rect.top;

        const maxY = rect.height - CONTROL_HEIGHT - controller.offsetHeight;
        const maxX = rect.width - controller.offsetWidth - MIN_MARGIN;

        newX = Math.max(MIN_MARGIN, Math.min(newX, maxX));
        newY = Math.max(MIN_MARGIN, Math.min(newY, maxY));

        // If we're in the control area, keep the controller just above it
        if (isInControlArea(video, e.clientX, e.clientY)) {
          const controlAreaHeight = isYouTube ? 80 : (isVimeo ? 60 : CONTROL_HEIGHT);
          newY = Math.min(newY, rect.height - controlAreaHeight - controller.offsetHeight - 10);
        }

        controller.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
        updateControlsPosition();
      };

      if (rafCallbacks.has(video)) {
        cancelAnimationFrame(rafCallbacks.get(video));
      }
      rafCallbacks.set(video, requestAnimationFrame(rafCallback));
    };

    const stopDrag = (e) => {
      if (!state.dragState.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      state.dragState.isDragging = false;
      controller.classList.remove('grabbing');
      
      const position = {
        left: parseFloat(controller.style.left),
        top: parseFloat(controller.style.top)
      };
      
      const safePosition = getSafePosition(position);
      controllerPositions.set(video, safePosition);
      
      if (safePosition.top !== position.top || safePosition.left !== position.left) {
        controller.style.left = `${safePosition.left}px`;
        controller.style.top = `${safePosition.top}px`;
      }

      setTimeout(() => isDragging = false, 0);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    // Event listeners
    controller.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      startDrag(e);
    });

    document.addEventListener('mousemove', e => {
      if (state.dragState.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        handleDrag(e);
      }
    });

    document.addEventListener('mouseup', e => {
      if (state.dragState.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation();
        stopDrag(e);
      }
    });

    // Update speed control handlers to use active settings
    const handleSpeedChange = throttle((delta) => {
      video.playbackRate = Math.max(0.1, Math.min(16, video.playbackRate + delta));
      if (state.settings.rememberSpeed) {
        state.lastSpeed = video.playbackRate;
        chrome.storage.sync.set({ lastSpeed: video.playbackRate });
      }
      updateDisplay();
    }, 50);

    // Use active settings for speed step
    slowerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        handleSpeedChange(-activeSettings.step);
      }
    }, { passive: true });

    fasterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        handleSpeedChange(activeSettings.step);
      }
    }, { passive: true });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        video.playbackRate = activeSettings.resetSpeed;
        if (state.settings.rememberSpeed) {
          state.lastSpeed = video.playbackRate;
          chrome.storage.sync.set({ lastSpeed: video.playbackRate });
        }
        updateDisplay();
      }
    }, { passive: true });

    // Optimize display updates with debouncing
    let updateTimeout = null;
    const updateDisplay = debounce(() => {
      if (video && document.contains(video)) {
        display.textContent = `${video.playbackRate.toFixed(2)}×`;
      }
    }, 16);

    // Optimize video event listeners
    const videoEvents = ['play', 'loadeddata', 'ratechange', 'seeking'];
    const handleVideoEvent = throttle(() => updateDisplay(), 50);
    videoEvents.forEach(event => {
      video.addEventListener(event, handleVideoEvent, { passive: true });
    });

    // Initialize
    video.parentElement.appendChild(controller);
    videoControllers.set(video, controller);
    positionController();
    updateDisplay();

    // Observers
    const resizeObserver = new ResizeObserver(() => {
      if (!state.dragState.isDragging) {
        const currentPosition = {
          left: parseFloat(controller.style.left),
          top: parseFloat(controller.style.top)
        };
        const safePosition = getSafePosition(currentPosition);
        controller.style.left = `${safePosition.left}px`;
        controller.style.top = `${safePosition.top}px`;
        updateControlsPosition();
      }
    });
    resizeObserver.observe(video);

    const mutationObserver = new MutationObserver(() => {
      if (!document.contains(video)) {
        cleanup();
      }
    });

    mutationObserver.observe(video.parentElement, {
      childList: true,
      subtree: true
    });

    // Click prevention
    controller.addEventListener('click', (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    });

    // Cleanup
    const cleanup = () => {
      if (rafCallbacks.has(video)) {
        cancelAnimationFrame(rafCallbacks.get(video));
        rafCallbacks.delete(video);
      }
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Remove all event listeners
      controller.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', stopDrag);
      videoEvents.forEach(event => {
        video.removeEventListener(event, handleVideoEvent);
      });
      video.removeEventListener('ratechange', handleRateChange);
      
      // Clean up observers
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      
      // Remove elements and clear maps
      controller.remove();
      videoControllers.delete(video);
      controllerPositions.delete(video);
      videoStates.delete(video);
    };

    return cleanup;
  };

  // Optimize video tracking with throttling
  const trackVideos = throttle(() => {
    if (isDisabledSite()) return;

    requestAnimationFrame(() => {
      document.querySelectorAll('video').forEach(video => {
        if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
          video.playbackRate = state.lastSpeed;
        }

        if (!videoControllers.has(video) && video.offsetWidth > 50) {
          const cleanup = createController(video);
          if (!state.activeVideo) {
            state.activeVideo = video;
          }

          // Optimize video load handling
          const handleLoad = throttle(() => {
            if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
              video.playbackRate = state.lastSpeed;
            }
          }, 100);

          video.addEventListener('loadeddata', handleLoad, { passive: true });
          video.addEventListener('loadedmetadata', handleLoad, { passive: true });
          video.addEventListener('canplay', handleLoad, { passive: true });
          
          const observer = new MutationObserver(() => {
            if (!document.contains(video)) {
              video.removeEventListener('loadeddata', handleLoad);
              video.removeEventListener('loadedmetadata', handleLoad);
              video.removeEventListener('canplay', handleLoad);
              cleanup();
            }
          });
          observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: false,
            characterData: false
          });
        }
      });
    });
  }, 100);

  // Also add a global video event listener
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLVideoElement && state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
      // Small delay to ensure it overrides any default speed settings
      setTimeout(() => {
        e.target.playbackRate = state.lastSpeed;
      }, 0);
    }
  }, true);

  // Update keyboard handler to use active settings
  const handleKey = throttle((e) => {
    if (isDisabledSite()) return;

    const activeElement = document.activeElement;
    const isTyping = (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.isContentEditable ||
      activeElement.getAttribute('role') === 'textbox' ||
      activeElement.getAttribute('role') === 'combobox' ||
      activeElement.getAttribute('role') === 'searchbox' ||
      activeElement.closest('[contenteditable="true"]') ||
      activeElement.closest('.CodeMirror') ||
      activeElement.closest('[role="textbox"]') ||
      activeElement.closest('[role="combobox"]') ||
      activeElement.closest('[role="searchbox"]')
    );

    if (isTyping) return;

    const activeSettings = getActiveSettings();
    const key = e.key.toLowerCase();
    const actions = {
      [state.settings.keys.slow]: () => adjustSpeed(-activeSettings.step),
      [state.settings.keys.fast]: () => adjustSpeed(activeSettings.step),
      [state.settings.keys.reset]: () => resetSpeed(),
      [state.settings.keys.rewind]: () => rewind(),
      [state.settings.keys.advance]: () => advance(),
      [state.settings.keys.toggle]: () => toggleController()
    };

    if (actions[key]) {
      e.preventDefault();
      actions[key]();
    }
  }, 50);

  // Update speed adjustment functions to use active settings
  const adjustSpeed = (delta) => {
    if (!state.activeVideo) return;
    const activeSettings = getActiveSettings();
    state.activeVideo.playbackRate = Math.max(0.1, Math.min(16, state.activeVideo.playbackRate + delta));
    if (state.settings.rememberSpeed) {
      state.lastSpeed = state.activeVideo.playbackRate;
      chrome.storage.sync.set({ lastSpeed: state.activeVideo.playbackRate });
    }
  };

  const resetSpeed = () => {
    if (state.activeVideo) {
      const activeSettings = getActiveSettings();
      state.activeVideo.playbackRate = activeSettings.resetSpeed;
      if (state.settings.rememberSpeed) {
        state.lastSpeed = state.activeVideo.playbackRate;
        chrome.storage.sync.set({ lastSpeed: state.activeVideo.playbackRate });
      }
    }
  };

  const rewind = () => {
    if (state.activeVideo) {
      const activeSettings = getActiveSettings();
      state.activeVideo.currentTime -= activeSettings.rewind;
    }
  };

  const advance = () => {
    if (state.activeVideo) {
      const activeSettings = getActiveSettings();
      state.activeVideo.currentTime += activeSettings.advance;
    }
  };

  const toggleController = () => {
    document.querySelectorAll('video').forEach(video => {
      const controller = videoControllers.get(video);
      if (controller) {
        const isHidden = controller.style.display === 'none';
        controller.style.display = isHidden ? 'flex' : 'none';
      }
    });
  };

  // Initialize
  chrome.storage.sync.get({ ...state.settings, lastSpeed: 1.0 }, items => {
    // Extract lastSpeed from items and store the rest in settings
    const { lastSpeed, ...settings } = items;
    Object.assign(state.settings, settings);
    state.lastSpeed = lastSpeed;

    // Listen for settings updates from options page
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'settingsUpdated') {
        // Force immediate recreation of controllers
        const oldControllers = new Map(videoControllers);
        
        // Remove all existing controllers first
        oldControllers.forEach((controller, video) => {
          controller.remove();
          videoControllers.delete(video);
          controllerPositions.delete(video);
          videoStates.delete(video);
          if (rafCallbacks.has(video)) {
            cancelAnimationFrame(rafCallbacks.get(video));
            rafCallbacks.delete(video);
          }
        });

        // Reload settings and recreate controllers
        chrome.storage.sync.get(null, items => {
          // Update state with new settings
          const { lastSpeed, ...newSettings } = items;
          Object.assign(state.settings, newSettings);
          state.lastSpeed = lastSpeed;

          // Get fresh settings
          const activeSettings = getActiveSettings();

          // Recreate controllers for all videos
          oldControllers.forEach((_, video) => {
            if (video.offsetWidth > 50) {
              // Apply speed settings immediately
              if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
                video.playbackRate = state.lastSpeed;
              } else {
                video.playbackRate = activeSettings.defaultSpeed;
              }

              // Force speed update
              video.dispatchEvent(new Event('ratechange'));

              // Create new controller
              createController(video);
            }
          });
        });
        return true;
      }
    });

    // Single source of truth for settings updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        const needsRecreation = changes.websiteSettings || changes.profiles || changes.activeProfile;
        
        // Update settings first
        Object.keys(changes).forEach(key => {
          if (key === 'lastSpeed') {
            state.lastSpeed = changes[key].newValue;
          } else if (key === 'keys') {
            state.settings.keys = changes[key].newValue;
          } else if (key === 'disabledSites') {
            state.settings.disabledSites = Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
          } else if (key === 'websiteSettings') {
            state.settings.websiteSettings = changes[key].newValue || {};
          } else if (key === 'profiles') {
            state.settings.profiles = changes[key].newValue || [];
          } else if (key === 'activeProfile') {
            state.settings.activeProfile = changes[key].newValue;
          } else {
            state.settings[key] = changes[key].newValue;
          }
        });

        if (needsRecreation) {
          // Store current controllers
          const oldControllers = new Map(videoControllers);
          
          // Remove all existing controllers
          oldControllers.forEach((controller, video) => {
            controller.remove();
            videoControllers.delete(video);
            controllerPositions.delete(video);
            videoStates.delete(video);
            if (rafCallbacks.has(video)) {
              cancelAnimationFrame(rafCallbacks.get(video));
              rafCallbacks.delete(video);
            }
          });

          // Get fresh settings
          const activeSettings = getActiveSettings();

          // Recreate controllers with new settings
          oldControllers.forEach((_, video) => {
            if (video.offsetWidth > 50) {
              // Apply speed settings immediately
              if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
                video.playbackRate = state.lastSpeed;
              } else {
                video.playbackRate = activeSettings.defaultSpeed;
              }

              // Force speed update
              video.dispatchEvent(new Event('ratechange'));

              // Create new controller
              createController(video);
            }
          });
        } else {
          // Handle normal settings updates
          const activeSettings = getActiveSettings();

          document.querySelectorAll('video').forEach(video => {
            if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
              video.playbackRate = state.lastSpeed;
            } else {
              video.playbackRate = activeSettings.defaultSpeed;
            }

            const controller = videoControllers.get(video);
            if (controller) {
              controller.style.opacity = state.settings.opacity;
              if (state.settings.hideController) {
                controller.style.display = 'none';
              }

              const display = controller.querySelector('.vsc-display');
              if (display) {
                display.textContent = `${video.playbackRate.toFixed(2)}×`;
              }
            }
          });
        }

        // Handle disabled sites status
        const hostname = window.location.hostname.replace('www.', '');
        const isNowDisabled = state.settings.disabledSites.some(site => 
          hostname === site || hostname.endsWith('.' + site)
        );
        
        if (isNowDisabled) {
          document.querySelectorAll('video').forEach(video => {
            const controller = videoControllers.get(video);
            if (controller) {
              video.playbackRate = 1.0;
              controller.remove();
              videoControllers.delete(video);
              controllerPositions.delete(video);
              videoStates.delete(video);
              if (rafCallbacks.has(video)) {
                cancelAnimationFrame(rafCallbacks.get(video));
                rafCallbacks.delete(video);
              }
            }
          });
          document.removeEventListener('keydown', handleKey);
          window.removeEventListener('resize', () => requestAnimationFrame(trackVideos));
        } else if (changes.disabledSites?.oldValue?.includes(hostname)) {
          trackVideos();
          document.addEventListener('keydown', handleKey);
          window.addEventListener('resize', () => requestAnimationFrame(trackVideos));
        }
      }
    });

    if (!isDisabledSite()) {
      // Set speed for any existing videos immediately
      document.querySelectorAll('video').forEach(video => {
        if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
          video.playbackRate = state.lastSpeed;
        }
      });

      // Set up a global rate change listener
      document.addEventListener('ratechange', (e) => {
        if (state.settings.rememberSpeed && e.target instanceof HTMLVideoElement) {
          state.lastSpeed = e.target.playbackRate;
          chrome.storage.sync.set({ lastSpeed: e.target.playbackRate });

          // Also update any other videos on the page
          document.querySelectorAll('video').forEach(video => {
            if (video !== e.target && state.settings.rememberSpeed) {
              video.playbackRate = state.lastSpeed;
            }
          });
        }
      }, true);

      trackVideos();
      
      const observer = new MutationObserver(trackVideos);
      observer.observe(document, { childList: true, subtree: true });

      document.addEventListener('keydown', handleKey);
      window.addEventListener('resize', () => requestAnimationFrame(trackVideos));
    }
  });
})();