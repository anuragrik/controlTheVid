(() => {
  // Store controller and speed state per video
  const videoControllers = new WeakMap();
  const videoSpeeds = new WeakMap();
  
  const state = {
    settings: {
      step: 0.1,
      rewind: 10,
      opacity: 0.8
    }
  };

  // Precise video container positioning
  const positionController = (video, controller) => {
    const videoRect = video.getBoundingClientRect();
    controller.style.top = `${videoRect.top + 10}px`;
    controller.style.left = `${videoRect.left + 10}px`;
  };

  // Update controller display
  const updateControllerDisplay = (video, controller) => {
    const speed = video.playbackRate;
    videoSpeeds.set(video, speed);
    controller.textContent = `${speed.toFixed(1)}×`;
  };

  // Create controller for each video
  const createController = (video) => {
    if (videoControllers.has(video)) return;

    // Skip if video is not properly loaded
    if (!video.readyState) {
      video.addEventListener('loadedmetadata', () => createController(video), { once: true });
      return;
    }

    // Initialize video's speed state
    videoSpeeds.set(video, video.playbackRate);

    const controller = document.createElement('div');
    controller.className = 'vsc-controller';
    controller.textContent = `${video.playbackRate.toFixed(1)}×`;
    
    // Style controller
    Object.assign(controller.style, {
      position: 'fixed',
      zIndex: 2147483647,
      opacity: state.settings.opacity,
      cursor: 'pointer',
      background: '#1a1a1a',
      color: '#fff',
      padding: '4px 8px',
      borderRadius: '4px',
      fontFamily: 'system-ui',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      pointerEvents: 'auto'  // Make sure controller is clickable
    });

    document.documentElement.appendChild(controller);
    videoControllers.set(video, controller);

    // Update position on changes
    const updatePosition = () => {
      if (document.contains(video)) {
        positionController(video, controller);
        // Ensure controller is visible
        controller.style.display = '';
      }
    };
    
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(video);
    
    // Handle scroll and resize events for position updates
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    
    // Monitor video playback rate changes
    const playbackObserver = new MutationObserver(() => {
      updateControllerDisplay(video, controller);
    });
    
    // Observe both the video element and its properties
    playbackObserver.observe(video, {
      attributes: true,
      attributeFilter: ['playbackRate', 'src'],
      characterData: true,
      subtree: true
    });

    // Sync with video playback rate changes
    video.addEventListener('ratechange', () => {
      updateControllerDisplay(video, controller);
    });

    // Add click handlers for speed control
    controller.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const currentSpeed = video.playbackRate;
      const newSpeed = currentSpeed + state.settings.step;
      if (newSpeed <= 16) {
        video.playbackRate = newSpeed;
      }
    });

    controller.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentSpeed = video.playbackRate;
      const newSpeed = Math.max(0.1, currentSpeed - state.settings.step);
      video.playbackRate = newSpeed;
    });

    // Cleanup when video is removed
    const cleanupObserver = new MutationObserver(() => {
      if (!document.contains(video)) {
        controller.remove();
        videoControllers.delete(video);
        videoSpeeds.delete(video);
        resizeObserver.disconnect();
        playbackObserver.disconnect();
        cleanupObserver.disconnect();
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      }
    });
    cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Initial position update
    updatePosition();

    // Force controller to be visible
    setTimeout(updatePosition, 500);
  };

  // Find all current and future videos with debouncing
  let findVideosTimeout = null;
  const findVideos = () => {
    clearTimeout(findVideosTimeout);
    findVideosTimeout = setTimeout(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        // Skip small thumbnail videos (likely previews)
        if (video.offsetWidth > 50 && video.offsetHeight > 50) {
          if (!videoControllers.has(video)) {
            createController(video);
          } else {
            // Update existing controller display
            const controller = videoControllers.get(video);
            if (controller) {
              updateControllerDisplay(video, controller);
              // Ensure controller is visible and positioned correctly
              positionController(video, controller);
            }
          }
        }
      });
    }, 100);
  };

  // Global keyboard handler
  const handleKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    // Find the currently visible/focused video
    const videos = Array.from(document.querySelectorAll('video'));
    const activeVideo = videos.find(video => {
      const rect = video.getBoundingClientRect();
      return rect.width > 50 && 
             rect.height > 50 && 
             rect.top >= 0 && 
             rect.left >= 0 && 
             rect.bottom <= window.innerHeight && 
             rect.right <= window.innerWidth;
    });

    if (!activeVideo) return;

    const actions = {
      's': () => adjustVideoSpeed(activeVideo, -state.settings.step),
      'd': () => adjustVideoSpeed(activeVideo, state.settings.step),
      'r': () => resetVideoSpeed(activeVideo),
      'z': () => rewindVideo(activeVideo),
      'x': () => advanceVideo(activeVideo),
      'v': () => toggleControllers()
    };

    if (actions[e.key.toLowerCase()]) {
      e.preventDefault();
      actions[e.key.toLowerCase()]();
    }
  };

  // Video control functions (now per-video)
  const adjustVideoSpeed = (video, delta) => {
    const currentSpeed = video.playbackRate;
    const newSpeed = Math.max(0.1, Math.min(16, currentSpeed + delta));
    video.playbackRate = newSpeed;
  };

  const resetVideoSpeed = (video) => {
    video.playbackRate = 1.0;
  };

  const rewindVideo = (video) => {
    video.currentTime -= state.settings.rewind;
  };

  const advanceVideo = (video) => {
    video.currentTime += state.settings.rewind;
  };

  const toggleControllers = () => {
    document.querySelectorAll('.vsc-controller').forEach(controller => {
      controller.style.display = controller.style.display === 'none' ? '' : 'none';
    });
  };

  // Initialization with retry mechanism
  const initialize = (retryCount = 0) => {
    chrome.storage.sync.get(null, settings => {
      Object.assign(state.settings, settings);
      
      // Initial scan
      findVideos();
      
      // Enhanced continuous monitoring with debouncing
      const observer = new MutationObserver(() => {
        findVideos();
      });
      
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });

      // Additional monitoring for dynamic content
      window.addEventListener('load', findVideos);
      document.addEventListener('DOMContentLoaded', findVideos);
      document.addEventListener('keydown', handleKey);

      // Monitor for iframe load events
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          iframe.addEventListener('load', findVideos);
        } catch (e) {
          // Ignore cross-origin iframe errors
        }
      });

      // Periodic check for videos (some sites load them dynamically)
      setInterval(findVideos, 2000);
    });
  };

  // Start initialization
  initialize();

  // Update settings in real-time
  chrome.storage.onChanged.addListener(changes => {
    Object.entries(changes).forEach(([key, { newValue }]) => {
      state.settings[key] = newValue;
      if (key === 'opacity') {
        document.querySelectorAll('.vsc-controller').forEach(controller => {
          controller.style.opacity = newValue;
        });
      }
    });
  });
})();