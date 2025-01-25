(() => {
  const videoControllers = new WeakMap();
  const controllerPositions = new WeakMap();
  const state = {
    settings: {
      step: 0.1,
      rewind: 10,
      opacity: 0.8
    },
    activeVideo: null,
    dragState: {
      isDragging: false,
      offsetX: 0,
      offsetY: 0
    }
  };

  // Helper to detect if a point is in a control area
  const isInControlArea = (video, x, y) => {
    // Common video player control heights
    const controlHeight = 40;
    const videoRect = video.getBoundingClientRect();
    
    // Check if we're in the bottom control area
    if (y > videoRect.bottom - controlHeight) {
      return true;
    }

    // YouTube-specific check (has controls at top and bottom)
    if (window.location.hostname.includes('youtube.com')) {
      // Top controls area
      if (y < videoRect.top + controlHeight) {
        return true;
      }
      // Bottom controls area (YouTube has taller controls)
      if (y > videoRect.bottom - 100) {
        return true;
      }
    }

    // Check for common video hosting sites
    if (window.location.hostname.includes('vimeo.com')) {
      if (y > videoRect.bottom - 60) return true;
    }

    return false;
  };

  const createController = (video) => {
    if (videoControllers.has(video)) return;

    const controller = document.createElement('div');
    controller.className = 'vsc-controller';
    
    // Only prevent double click on the controller
    controller.addEventListener('dblclick', e => {
      e.stopPropagation();
      e.preventDefault();
    });

    const hoverContainer = document.createElement('div');
    hoverContainer.className = 'vsc-hover-container';

    controller.innerHTML = `
      <div class="vsc-display">1.00×</div>
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

    // Initialize position with safe area check
    const getSafePosition = (pos) => {
      const videoRect = video.getBoundingClientRect();
      const controlHeight = 40;
      const maxY = videoRect.height - controlHeight - controller.offsetHeight;
      
      return {
        left: Math.max(10, Math.min(pos.left, videoRect.width - controller.offsetWidth - 10)),
        top: Math.max(10, Math.min(pos.top, maxY))
      };
    };

    const updateControlsPosition = (controller, video) => {
      const videoRect = video.getBoundingClientRect();
      const controllerRect = controller.getBoundingClientRect();
      const margin = 50; // minimum distance from edge to trigger repositioning

      // Clear existing position
      controller.removeAttribute('data-position');

      // Check edges and set appropriate position
      if (controllerRect.right + margin >= videoRect.right) {
        controller.setAttribute('data-position', 'right');
      } else if (controllerRect.left <= videoRect.left + margin) {
        controller.setAttribute('data-position', 'left');
      } else if (controllerRect.bottom + margin >= videoRect.bottom) {
        controller.setAttribute('data-position', 'bottom');
      } else if (controllerRect.top <= videoRect.top + margin) {
        controller.setAttribute('data-position', 'top');
      }
    };

    const positionController = () => {
      const videoRect = video.getBoundingClientRect();
      let position;

      // Get saved position from the WeakMap
      const savedPosition = controllerPositions.get(video);

      if (savedPosition) {
        position = getSafePosition(savedPosition);
      } else {
        position = { left: 10, top: 10 };
      }

      controller.style.left = `${position.left}px`;
      controller.style.top = `${position.top}px`;

      // Update controls position
      updateControlsPosition(controller, video);
    };

    // Add this variable at the start of createController
    let isDragging = false;

    // Modify the startDrag function
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
      
      const videoRect = video.getBoundingClientRect();
      const controlHeight = 40;
      
      // Calculate new position
      let newX = e.clientX - state.dragState.offsetX - videoRect.left;
      let newY = e.clientY - state.dragState.offsetY - videoRect.top;

      // Get safe boundaries
      const maxY = videoRect.height - controlHeight - controller.offsetHeight;
      const maxX = videoRect.width - controller.offsetWidth - 10;

      // Constrain to safe area
      newX = Math.max(10, Math.min(newX, maxX));
      newY = Math.max(10, Math.min(newY, maxY));

      // Additional check for control areas
      if (isInControlArea(video, e.clientX, e.clientY)) {
        newY = parseFloat(controller.style.top) || 10;
      }

      controller.style.left = `${newX}px`;
      controller.style.top = `${newY}px`;

      // Update controls position
      updateControlsPosition(controller, video);
    };

    // Modify the stopDrag function
    const stopDrag = (e) => {
      if (!state.dragState.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      state.dragState.isDragging = false;
      controller.classList.remove('grabbing');
      
      // Save position relative to video
      const videoRect = video.getBoundingClientRect();
      const position = {
        left: parseFloat(controller.style.left),
        top: parseFloat(controller.style.top)
      };
      
      // Ensure saved position is safe
      const safePosition = getSafePosition(position);
      controllerPositions.set(video, safePosition);
      
      // Update to safe position if needed
      if (safePosition.top !== position.top || safePosition.left !== position.left) {
        controller.style.left = `${safePosition.left}px`;
        controller.style.top = `${safePosition.top}px`;
      }

      // Prevent the click event from firing after drag
      setTimeout(() => {
        isDragging = false;
      }, 0);
    };

    // Event listeners
    const handleMouseDown = e => {
      e.stopPropagation();
      e.preventDefault();
      startDrag(e);
    };

    const handleMouseMove = e => {
      if (state.dragState.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        handleDrag(e);
      }
    };

    const handleMouseUp = e => {
      if (state.dragState.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation();
        stopDrag(e);
      }
    };

    controller.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Speed control handlers with event prevention
    const handleSpeedChange = (delta) => {
      video.playbackRate = Math.max(0.1, 
        Math.min(16, video.playbackRate + delta));
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
        video.playbackRate = 1;
        updateDisplay();
      }
    });

    // Update display
    const updateDisplay = () => {
      if (video && document.contains(video)) {
        const speed = video.playbackRate;
        controller.querySelector('.vsc-display').textContent = 
          `${speed.toFixed(2)}×`;
      }
    };

    // Video event listeners for speed sync
    video.addEventListener('play', updateDisplay);
    video.addEventListener('loadeddata', updateDisplay);
    video.addEventListener('ratechange', updateDisplay);
    video.addEventListener('seeking', updateDisplay);

    // Initialize
    video.parentElement.appendChild(controller);
    videoControllers.set(video, controller);
    positionController();
    updateDisplay(); // Initial display update

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
      }
    });
    resizeObserver.observe(video);

    const mutationObserver = new MutationObserver(() => {
      if (!document.contains(video)) {
        controller.remove();
        videoControllers.delete(video);
        controllerPositions.delete(video);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      }
    });

    mutationObserver.observe(video.parentElement, {
      childList: true,
      subtree: true
    });

    // Add click prevention to the controller
    controller.addEventListener('click', (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    });

    // Cleanup
    const cleanup = () => {
      controller.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      video.removeEventListener('play', updateDisplay);
      video.removeEventListener('loadeddata', updateDisplay);
      video.removeEventListener('ratechange', updateDisplay);
      video.removeEventListener('seeking', updateDisplay);
    };

    return cleanup;
  };

  // Track videos and ensure displays are updated
  const trackVideos = () => {
    document.querySelectorAll('video').forEach(video => {
      if (!videoControllers.has(video) && video.offsetWidth > 50) {
        const cleanup = createController(video);
        if (!state.activeVideo) state.activeVideo = video;
        
        // Cleanup when video is removed
        new MutationObserver(() => {
          if (!document.contains(video)) {
            cleanup();
          }
        }).observe(document.body, { childList: true, subtree: true });
      }
    });
  };

  // Keyboard handler
  const handleKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const actions = {
      's': () => adjustSpeed(-state.settings.step),
      'd': () => adjustSpeed(state.settings.step),
      'r': () => resetSpeed(),
      'z': () => rewind(),
      'x': () => advance()
    };

    if (actions[e.key.toLowerCase()]) {
      e.preventDefault();
      actions[e.key.toLowerCase()]();
    }
  };

  const adjustSpeed = (delta) => {
    if (!state.activeVideo) return;
    state.activeVideo.playbackRate = Math.max(0.1, 
      Math.min(16, state.activeVideo.playbackRate + delta));
  };

  const resetSpeed = () => {
    if (state.activeVideo) {
      state.activeVideo.playbackRate = 1;
    }
  };

  const rewind = () => {
    if (state.activeVideo) {
      state.activeVideo.currentTime -= state.settings.rewind;
    }
  };

  const advance = () => {
    if (state.activeVideo) {
      state.activeVideo.currentTime += state.settings.rewind;
    }
  };

  // Initialization
  chrome.storage.sync.get(null, settings => {
    Object.assign(state.settings, settings);
    trackVideos();
    
    new MutationObserver(trackVideos).observe(document, {
      childList: true,
      subtree: true
    });

    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', trackVideos);
  });

  chrome.storage.onChanged.addListener(changes => {
    Object.assign(state.settings, changes);
  });
})();