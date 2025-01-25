(() => {
  const videoControllers = new WeakMap();
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

  const createController = (video) => {
    if (videoControllers.has(video)) return;

    const controller = document.createElement('div');
    controller.className = 'vsc-controller';
    
    controller.innerHTML = `
      <div class="vsc-display">1.00×</div>
      <div class="vsc-controls">
        <button class="vsc-btn vsc-slower">−</button>
        <button class="vsc-btn vsc-reset">⭮</button>
        <button class="vsc-btn vsc-faster">+</button>
      </div>
    `;

    // Smooth drag implementation
    const startDrag = (e) => {
      if (e.target.classList.contains('vsc-btn')) return;
      state.dragState.isDragging = true;
      const rect = controller.getBoundingClientRect();
      state.dragState.offsetX = e.clientX - rect.left;
      state.dragState.offsetY = e.clientY - rect.top;
      controller.style.cursor = 'grabbing';
    };

    const handleDrag = (e) => {
      if (!state.dragState.isDragging) return;
      
      const videoRect = video.getBoundingClientRect();
      const maxX = videoRect.width - controller.offsetWidth;
      const maxY = videoRect.height - controller.offsetHeight;
      
      let newX = e.clientX - state.dragState.offsetX - videoRect.left;
      let newY = e.clientY - state.dragState.offsetY - videoRect.top;

      // Constrain to video bounds
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      controller.style.left = `${newX}px`;
      controller.style.top = `${newY}px`;
    };

    const stopDrag = () => {
      state.dragState.isDragging = false;
      controller.style.cursor = 'grab';
    };

    // Event listeners
    controller.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);

    // Speed control handlers
    const handleSpeedChange = (delta) => {
      video.playbackRate = Math.max(0.1, 
        Math.min(16, video.playbackRate + delta));
      updateDisplay();
    };

    controller.querySelector('.vsc-slower').addEventListener('click', (e) => {
      e.stopPropagation();
      handleSpeedChange(-state.settings.step);
    });

    controller.querySelector('.vsc-faster').addEventListener('click', (e) => {
      e.stopPropagation();
      handleSpeedChange(state.settings.step);
    });

    controller.querySelector('.vsc-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      video.playbackRate = 1;
      updateDisplay();
    });

    // Update display
    const updateDisplay = () => {
      controller.querySelector('.vsc-display').textContent = 
        `${video.playbackRate.toFixed(2)}×`;
    };

    // Position controller relative to video
    const positionController = () => {
      const videoRect = video.getBoundingClientRect();
      controller.style.left = `${videoRect.left + 10}px`;
      controller.style.top = `${videoRect.top + 10}px`;
    };

    // Initialize
    video.parentElement.appendChild(controller);
    videoControllers.set(video, controller);
    positionController();
    updateDisplay();

    // Observers
    const resizeObserver = new ResizeObserver(() => {
      if (!state.dragState.isDragging) positionController();
    });
    resizeObserver.observe(video);

    const mutationObserver = new MutationObserver(() => {
      if (!document.contains(video)) {
        controller.remove();
        videoControllers.delete(video);
        resizeObserver.disconnect();
      }
    });

    video.addEventListener('ratechange', updateDisplay);
    mutationObserver.observe(video.parentElement, {
      childList: true,
      subtree: true
    });

    // Cleanup event listeners
    const cleanup = () => {
      controller.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    return cleanup;
  };

  // Keyboard handler
  const handleKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const actions = {
      's': () => adjustSpeed(-state.settings.step),
      'd': () => adjustSpeed(state.settings.step),
      'r': () => resetSpeed(),
      'z': () => rewind(),
      'x': () => advance(),
      'v': () => toggleControllers()
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
    updateActiveController();
  };

  const resetSpeed = () => {
    if (state.activeVideo) {
      state.activeVideo.playbackRate = 1;
      updateActiveController();
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

  const updateActiveController = () => {
    if (state.activeVideo && videoControllers.has(state.activeVideo)) {
      const controller = videoControllers.get(state.activeVideo);
      controller.querySelector('.vsc-display').textContent = 
        `${state.activeVideo.playbackRate.toFixed(2)}×`;
    }
  };

  const trackVideos = () => {
    document.querySelectorAll('video').forEach(video => {
      if (!videoControllers.has(video) && video.offsetWidth > 50) {
        createController(video);
        if (!state.activeVideo) state.activeVideo = video;
      }
    });
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