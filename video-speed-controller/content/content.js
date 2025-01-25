(() => {
  const videoControllers = new WeakMap();
  const controllerPositions = new WeakMap();
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
      }
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

  const isInControlArea = (video, x, y) => {
    const rect = video.getBoundingClientRect();
    if (y > rect.bottom - CONTROL_HEIGHT) return true;
    if (isYouTube) {
      if (y < rect.top + CONTROL_HEIGHT || y > rect.bottom - 100) return true;
    }
    if (isVimeo && y > rect.bottom - 60) return true;
    return false;
  };

  const createController = (video) => {
    if (videoControllers.has(video) || isDisabledSite()) return;

    const controller = document.createElement('div');
    controller.className = 'vsc-controller';
    
    // Apply opacity from settings
    controller.style.opacity = state.settings.opacity;

    // Hide controller if setting is enabled
    if (state.settings.hideController) {
      controller.style.display = 'none';
    }

    // Set initial video speed
    if (state.settings.rememberSpeed) {
      video.playbackRate = state.lastSpeed;
    } else {
      video.playbackRate = state.settings.defaultSpeed;
    }

    // Update lastSpeed when video rate changes
    const handleRateChange = () => {
      if (state.settings.rememberSpeed) {
        state.lastSpeed = video.playbackRate;
        chrome.storage.sync.set({ lastSpeed: video.playbackRate });
      }
    };
    video.addEventListener('ratechange', handleRateChange);

    controller.addEventListener('dblclick', e => {
      e.stopPropagation();
      e.preventDefault();
    });

    const hoverContainer = document.createElement('div');
    hoverContainer.className = 'vsc-hover-container';

    controller.innerHTML = `
      <div class="vsc-display">${video.playbackRate.toFixed(2)}×</div>
      <div class="vsc-controls">
        <button class="vsc-btn vsc-slower">−</button>
        <button class="vsc-btn vsc-reset">⭮</button>
        <button class="vsc-btn vsc-faster">+</button>
      </div>
    `;

    // Move the controls into the hover container
    const display = controller.querySelector('.vsc-display');
    const controls = controller.querySelector('.vsc-controls');
    controller.innerHTML = '';
    hoverContainer.appendChild(display);
    hoverContainer.appendChild(controls);
    controller.appendChild(hoverContainer);

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

    const handleDrag = (e) => {
      if (!state.dragState.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = video.getBoundingClientRect();
        let newX = e.clientX - state.dragState.offsetX - rect.left;
        let newY = e.clientY - state.dragState.offsetY - rect.top;

        const maxY = rect.height - CONTROL_HEIGHT - controller.offsetHeight;
        const maxX = rect.width - controller.offsetWidth - MIN_MARGIN;

        newX = Math.max(MIN_MARGIN, Math.min(newX, maxX));
        newY = Math.max(MIN_MARGIN, Math.min(newY, maxY));

        if (isInControlArea(video, e.clientX, e.clientY)) {
          newY = parseFloat(controller.style.top) || MIN_MARGIN;
        }

        controller.style.left = `${newX}px`;
        controller.style.top = `${newY}px`;
        updateControlsPosition();
      });
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

    // Speed control handlers
    const handleSpeedChange = (delta) => {
      video.playbackRate = Math.max(0.1, Math.min(16, video.playbackRate + delta));
      if (state.settings.rememberSpeed) {
        state.lastSpeed = video.playbackRate;
        chrome.storage.sync.set({ lastSpeed: video.playbackRate });
      }
      updateDisplay();
    };

    controller.querySelector('.vsc-slower').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        handleSpeedChange(-state.settings.step);
      }
    });

    controller.querySelector('.vsc-faster').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        handleSpeedChange(state.settings.step);
      }
    });

    controller.querySelector('.vsc-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!state.dragState.isDragging) {
        video.playbackRate = state.settings.resetSpeed;
        if (state.settings.rememberSpeed) {
          state.lastSpeed = video.playbackRate;
          chrome.storage.sync.set({ lastSpeed: video.playbackRate });
        }
        updateDisplay();
      }
    });

    let updateTimeout = null;
    const updateDisplay = () => {
      if (updateTimeout) return;
      updateTimeout = setTimeout(() => {
        if (video && document.contains(video)) {
          display.textContent = `${video.playbackRate.toFixed(2)}×`;
        }
        updateTimeout = null;
      }, 16);
    };

    // Video event listeners
    ['play', 'loadeddata', 'ratechange', 'seeking'].forEach(event => {
      video.addEventListener(event, updateDisplay);
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
      if (rafId) cancelAnimationFrame(rafId);
      if (updateTimeout) clearTimeout(updateTimeout);
      controller.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', stopDrag);
      ['play', 'loadeddata', 'ratechange', 'seeking'].forEach(event => {
        video.removeEventListener(event, updateDisplay);
      });
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      controller.remove();
      videoControllers.delete(video);
      controllerPositions.delete(video);
    };

    return cleanup;
  };

  // Track videos
  const trackVideos = () => {
    if (isDisabledSite()) return;

    requestAnimationFrame(() => {
      document.querySelectorAll('video').forEach(video => {
        // Set speed immediately when video is found, before controller creation
        if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
          video.playbackRate = state.lastSpeed;
        }

        if (!videoControllers.has(video) && video.offsetWidth > 50) {
          const cleanup = createController(video);
          if (!state.activeVideo) {
            state.activeVideo = video;
          }

          // Watch for video loading
          const handleLoad = () => {
            if (state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
              video.playbackRate = state.lastSpeed;
            }
          };

          // Add load event listeners
          video.addEventListener('loadeddata', handleLoad);
          video.addEventListener('loadedmetadata', handleLoad);
          video.addEventListener('canplay', handleLoad);
          
          new MutationObserver(() => {
            if (!document.contains(video)) {
              video.removeEventListener('loadeddata', handleLoad);
              video.removeEventListener('loadedmetadata', handleLoad);
              video.removeEventListener('canplay', handleLoad);
              cleanup();
            }
          }).observe(document.body, { childList: true, subtree: true });
        }
      });
    });
  };

  // Also add a global video event listener
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLVideoElement && state.settings.rememberSpeed && state.lastSpeed !== 1.0) {
      // Small delay to ensure it overrides any default speed settings
      setTimeout(() => {
        e.target.playbackRate = state.lastSpeed;
      }, 0);
    }
  }, true);

  // Keyboard handler
  const handleKey = (e) => {
    if (isDisabledSite()) return;

    // Check if user is typing in any input-like element
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
      activeElement.closest('.CodeMirror') ||  // For code editors
      activeElement.closest('[role="textbox"]') ||
      activeElement.closest('[role="combobox"]') ||
      activeElement.closest('[role="searchbox"]')
    );

    if (isTyping) return;

    const key = e.key.toLowerCase();
    const actions = {
      [state.settings.keys.slow]: () => adjustSpeed(-state.settings.step),
      [state.settings.keys.fast]: () => adjustSpeed(state.settings.step),
      [state.settings.keys.reset]: () => resetSpeed(),
      [state.settings.keys.rewind]: () => rewind(),
      [state.settings.keys.advance]: () => advance(),
      [state.settings.keys.toggle]: () => toggleController()
    };

    if (actions[key]) {
      e.preventDefault();
      actions[key]();
    }
  };

  const adjustSpeed = (delta) => {
    if (!state.activeVideo) return;
    state.activeVideo.playbackRate = Math.max(0.1, Math.min(16, state.activeVideo.playbackRate + delta));
    if (state.settings.rememberSpeed) {
      state.lastSpeed = state.activeVideo.playbackRate;
      chrome.storage.sync.set({ lastSpeed: state.activeVideo.playbackRate });
    }
  };

  const resetSpeed = () => {
    if (state.activeVideo) {
      state.activeVideo.playbackRate = state.settings.resetSpeed;
      if (state.settings.rememberSpeed) {
        state.lastSpeed = state.activeVideo.playbackRate;
        chrome.storage.sync.set({ lastSpeed: state.activeVideo.playbackRate });
      }
    }
  };

  const rewind = () => {
    if (state.activeVideo) {
      state.activeVideo.currentTime -= state.settings.rewind;
    }
  };

  const advance = () => {
    if (state.activeVideo) {
      state.activeVideo.currentTime += state.settings.advance;
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

  // Settings update handler
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settingsUpdated') {
      const wasRememberSpeed = state.settings.rememberSpeed;
      const previousDisabledSites = [...state.settings.disabledSites];
      const wasDisabled = previousDisabledSites.some(site => {
        const hostname = window.location.hostname.replace('www.', '');
        return hostname === site || hostname.endsWith('.' + site);
      });
      
      // Store current video states before updating settings
      const videoStates = new Map();
      document.querySelectorAll('video').forEach(video => {
        videoStates.set(video, {
          speed: video.playbackRate,
          controller: videoControllers.get(video)
        });
      });
      
      // Update settings
      Object.assign(state.settings, message.settings);
      const isNowDisabled = isDisabledSite();
      
      // Handle site status changes
      if (isNowDisabled && !wasDisabled) {
        // Site was just disabled - remove all controllers
        document.querySelectorAll('video').forEach(video => {
          const controller = videoControllers.get(video);
          if (controller) {
            // Reset speed to default if needed
            if (wasRememberSpeed) {
              video.playbackRate = 1.0;
            }
            // Clean up and remove controller
            controller.remove();
            videoControllers.delete(video);
            controllerPositions.delete(video);
          }
        });
      } else if (!isNowDisabled && wasDisabled) {
        // Site was just enabled - add controllers to all videos
        document.querySelectorAll('video').forEach(video => {
          if (!videoControllers.has(video) && video.offsetWidth > 50) {
            createController(video);
          }
        });
      } else if (!isNowDisabled) {
        // Site remains enabled - update existing controllers
        document.querySelectorAll('video').forEach(video => {
          const controller = videoControllers.get(video);
          const previousState = videoStates.get(video);
          
          if (controller) {
            // Only update visual properties
            controller.style.opacity = state.settings.opacity;
            controller.style.display = state.settings.hideController ? 'none' : 'block';
            
            // Keep current speed unless remember speed setting changed
            if (state.settings.rememberSpeed && !wasRememberSpeed) {
              state.lastSpeed = video.playbackRate;
              chrome.storage.sync.set({ lastSpeed: video.playbackRate });
            }
          } else if (video.offsetWidth > 50) {
            // Create controller for any videos that don't have one
            createController(video);
          }
        });
      }
    }
  });

  // Initialize
  chrome.storage.sync.get({ ...state.settings, lastSpeed: 1.0 }, items => {
    // Extract lastSpeed from items and store the rest in settings
    const { lastSpeed, ...settings } = items;
    Object.assign(state.settings, settings);
    state.lastSpeed = lastSpeed;

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