(() => {
  const videoControllers = new WeakMap();
  const state = {
    settings: {
      step: 0.1,
      rewind: 10,
      opacity: 0.8
    },
    activeVideo: null
  };

  const createController = (video) => {
    if (videoControllers.has(video)) return;

    const controller = document.createElement('div');
    controller.className = 'vsc-controller';
    
    controller.innerHTML = `
      <div class="vsc-display">1.0×</div>
      <div class="vsc-controls">
        <button class="vsc-btn vsc-slower">−</button>
        <button class="vsc-btn vsc-reset">⭮</button>
        <button class="vsc-btn vsc-faster">+</button>
      </div>
    `;

    const updatePosition = () => {
      const rect = video.getBoundingClientRect();
      controller.style.top = `${rect.top + 10}px`;
      controller.style.left = `${rect.left + 10}px`;
    };

    const updateDisplay = () => {
      if (video && !video.paused) {
        // Force read the actual current playback rate
        const currentRate = video.playbackRate;
        controller.querySelector('.vsc-display').textContent = 
          `${currentRate.toFixed(2)}×`;
      }
    };

    const handleSpeedChange = (delta) => {
      video.playbackRate = Math.max(0.1, 
        Math.min(16, video.playbackRate + delta));
      updateDisplay();
    };

    // Button event handlers
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

    // Video focus and state detection
    video.addEventListener('click', () => {
      state.activeVideo = video;
    });

    video.addEventListener('play', () => {
      state.activeVideo = video;
      updateDisplay(); // Update display when video starts playing
    });

    video.addEventListener('loadeddata', () => {
      updateDisplay(); // Update display when video data is loaded
    });

    video.addEventListener('seeking', () => {
      updateDisplay(); // Update display when video is seeked
    });

    // Initial setup
    document.body.appendChild(controller);
    videoControllers.set(video, controller);
    updateDisplay();

    // Observers
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(video);
    
    const mutationObserver = new MutationObserver(() => {
      if (!document.contains(video)) {
        controller.remove();
        videoControllers.delete(video);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      }
    });

    // Monitor playback rate changes
    video.addEventListener('ratechange', () => {
      requestAnimationFrame(updateDisplay); // Use rAF for smoother updates
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
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
      const currentRate = state.activeVideo.playbackRate;
      controller.querySelector('.vsc-display').textContent = 
        `${currentRate.toFixed(2)}×`;
    }
  };

  const trackVideos = () => {
    document.querySelectorAll('video').forEach(video => {
      if (!videoControllers.has(video) && video.offsetWidth > 50) {
        createController(video);
        if (!state.activeVideo) state.activeVideo = video;
      } else if (videoControllers.has(video)) {
        // Update existing controller display
        const controller = videoControllers.get(video);
        const display = controller.querySelector('.vsc-display');
        if (display) {
          display.textContent = `${video.playbackRate.toFixed(2)}×`;
        }
      }
    });
  };

  // Initialization
  chrome.storage.sync.get(null, settings => {
    Object.assign(state.settings, settings);
    trackVideos();
    
    const observer = new MutationObserver(() => {
      requestAnimationFrame(trackVideos); // Use rAF for smoother updates
    });

    observer.observe(document, {
      childList: true,
      subtree: true
    });

    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', trackVideos);

    // Additional events for dynamic content
    document.addEventListener('play', () => trackVideos(), true);
    document.addEventListener('loadeddata', () => trackVideos(), true);
  });

  chrome.storage.onChanged.addListener(changes => {
    Object.assign(state.settings, changes);
  });
})();