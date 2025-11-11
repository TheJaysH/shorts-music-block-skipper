const S_EL = ".ytReelSoundMetadataViewModelMarqueeContainer .ytMarqueeScrollPrimaryString";
let enabled = true;
let blocked = [];
let autoDislike = false;
let lastSkipTime = 0;
const SKIP_COOLDOWN = 2000; // 2 seconds cooldown between skips
let lastCheckedTrack = null; // Prevent duplicate checks

function getText(el) {
  return el ? (el.textContent || "").trim() : "";
}

function norm(s) {
  return s.normalize("NFKC").toLowerCase();
}

function isShortsUrl() {
  return location.pathname.startsWith("/shorts");
}

// Extract track info from YouTube's internal player data
function getTrackFromYtData() {
  try {
    // Method 1: Try to get from ytInitialPlayerResponse
    if (window.ytInitialPlayerResponse?.videoDetails?.musicVideoType) {
      const details = window.ytInitialPlayerResponse.videoDetails;
      if (details.musicVideoType === "MUSIC_VIDEO_TYPE_ATV") {
        return {
          title: details.title,
          author: details.author,
          full: `${details.title} - ${details.author}`
        };
      }
    }

    // Method 2: Try player response in page data
    const player = document.querySelector("ytd-player");
    if (player?.playerResponse?.videoDetails) {
      const vd = player.playerResponse.videoDetails;
      return {
        title: vd.title,
        author: vd.author,
        full: `${vd.title} - ${vd.author}`
      };
    }

    // Method 3: Look for structured data in the page
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'VideoObject' && data.genre === 'Music') {
          return {
            title: data.name,
            author: data.author?.name || '',
            full: data.author?.name ? `${data.name} - ${data.author.name}` : data.name
          };
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.log('[Shorts Blocker] Error extracting YT data:', e);
  }
  return null;
}

// Parse track string into components (handles "Title - Artist" format)
function parseTrackString(trackStr) {
  if (!trackStr) return null;
  
  const normalized = trackStr.trim();
  const parts = normalized.split(/\s*[-–—]\s*/); // Various dash types
  
  if (parts.length >= 2) {
    return {
      title: parts[0].trim(),
      artist: parts.slice(1).join(' - ').trim(),
      full: normalized
    };
  }
  
  return {
    title: normalized,
    artist: '',
    full: normalized
  };
}

// Enhanced matching with multiple strategies
function matchesBlocked(currentTrack) {
  if (!currentTrack) return false;
  
  const current = parseTrackString(currentTrack);
  if (!current) return false;
  
  return blocked.some(blockedTrack => {
    const blocked = parseTrackString(blockedTrack);
    if (!blocked) return false;
    
    // Strategy 1: Exact match (case-insensitive)
    if (norm(current.full) === norm(blocked.full)) {
      console.log('[Shorts Blocker] Exact match:', current.full);
      return true;
    }
    
    // Strategy 2: Title + Artist match
    if (blocked.title && blocked.artist && current.title && current.artist) {
      if (norm(current.title) === norm(blocked.title) && 
          norm(current.artist) === norm(blocked.artist)) {
        console.log('[Shorts Blocker] Title+Artist match:', current.full);
        return true;
      }
    }
    
    // Strategy 3: Title-only match if no artist in blocked track
    if (blocked.title && !blocked.artist && current.title) {
      if (norm(current.title) === norm(blocked.title)) {
        console.log('[Shorts Blocker] Title-only match:', current.full);
        return true;
      }
    }
    
    // Strategy 4: Substring match (original behavior, as fallback)
    // Only if blocked track is substantial (avoid matching short strings)
    if (blocked.full.length > 5 && norm(current.full).includes(norm(blocked.full))) {
      console.log('[Shorts Blocker] Substring match:', current.full);
      return true;
    }
    
    return false;
  });
}

function tryClickNext() {
  const now = Date.now();
  if (now - lastSkipTime < SKIP_COOLDOWN) {
    console.log('[Shorts Blocker] Skip cooldown active, ignoring...');
    return false;
  }
  
  lastSkipTime = now;
  console.log('[Shorts Blocker] Skipping to next video...');
  
  const sel = [
    'button[aria-label*="Next"]',
    '#navigation-button-down button',
    'tp-yt-paper-icon-button[aria-label*="Next"]',
    '.yt-spec-button-shape-next--icon-button[aria-label*="Next"]'
  ];
  for (const s of sel) {
    const btn = document.querySelector(s);
    if (btn) { btn.click(); return true; }
  }
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", code: "ArrowDown", bubbles: true}));
  return false;
}

function tryDislike() {
  if (!autoDislike) return false;
  
  console.log('[Shorts Blocker] Attempting to dislike video...');
  
  // Try to find the dislike button
  const selectors = [
    'button[aria-label="Dislike this video"]',
    'button[aria-label*="Dislike"]',
    'dislike-button-view-model button',
    '#actions #button-bar button[aria-label*="Dislike"]'
  ];
  
  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn && btn.getAttribute('aria-pressed') !== 'true') {
      btn.click();
      console.log('[Shorts Blocker] Disliked video');
      return true;
    }
  }
  
  console.log('[Shorts Blocker] Dislike button not found');
  return false;
}

function addTrackButton() {
  // Check if button already exists
  if (document.querySelector(".block-track-btn-wrapper")) return;
  
  // Find the button bar
  const buttonBar = document.querySelector('#actions #button-bar reel-action-bar-view-model');
  if (!buttonBar) return;

  // Get current track for the button click handler
  const getCurrentTrack = () => {
    const trackInfo = getTrackFromYtData();
    if (trackInfo?.full) return trackInfo.full;
    
    const el = document.querySelector(S_EL);
    return el ? getText(el) : null;
  };

  // Create button wrapper matching YouTube's structure
  const wrapper = document.createElement('button-view-model');
  wrapper.className = 'ytSpecButtonViewModelHost block-track-btn-wrapper';
  
  wrapper.innerHTML = `
    <label class="yt-spec-button-shape-with-label">
      <button class="yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-l yt-spec-button-shape-next--icon-button yt-spec-button-shape-next--enable-backdrop-filter-experiment block-track-btn" 
              title="Block this track" 
              aria-label="Block this track" 
              aria-disabled="false" 
              style="">
        <div aria-hidden="true" class="yt-spec-button-shape-next__icon">
          <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
            <span class="yt-icon-shape ytSpecIconShapeHost">
              <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
                </svg>
              </div>
            </span>
          </span>
        </div>
        <yt-touch-feedback-shape aria-hidden="true" class="yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response">
          <div class="yt-spec-touch-feedback-shape__stroke"></div>
          <div class="yt-spec-touch-feedback-shape__fill"></div>
        </yt-touch-feedback-shape>
      </button>
      <div class="yt-spec-button-shape-with-label__label" aria-hidden="false">
        <span class="yt-core-attributed-string yt-core-attributed-string--white-space-pre-wrap yt-core-attributed-string--text-alignment-center yt-core-attributed-string--word-wrapping" role="text">Block track</span>
      </div>
    </label>
  `;

  const button = wrapper.querySelector('button');
  const label = wrapper.querySelector('.yt-spec-button-shape-with-label__label span');
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const track = getCurrentTrack();
    if (!track) {
      console.log('[Shorts Blocker] No track found to block');
      return;
    }
    
    chrome.storage.sync.get({blockedTracks: []}, v => {
      const arr = v.blockedTracks || [];
      if (!arr.includes(track)) {
        arr.push(track);
        chrome.storage.sync.set({blockedTracks: arr}, () => {
          console.log('[Shorts Blocker] Blocked track:', track);
          label.textContent = 'Blocked';
          button.setAttribute('aria-label', 'Track blocked');
          button.disabled = true;
          button.style.opacity = '0.6';
          button.style.cursor = 'default';
        });
      } else {
        console.log('[Shorts Blocker] Track already blocked:', track);
        label.textContent = 'Blocked';
        button.disabled = true;
        button.style.opacity = '0.6';
        button.style.cursor = 'default';
      }
    });
  });

  // Insert before the "Remix" button (last button) or append to end
  buttonBar.appendChild(wrapper);
}

function checkAndSkip() {
  if (!enabled || !isShortsUrl()) return;
  
  // Try multiple methods to get track info
  let trackInfo = getTrackFromYtData();
  let trackStr = trackInfo?.full;
  
  // Fallback to DOM element text
  if (!trackStr) {
    const el = document.querySelector(S_EL);
    if (!el) return;
    trackStr = getText(el);
    if (!trackStr) return;
  }
  
  // Prevent checking the same track multiple times
  if (trackStr === lastCheckedTrack) return;
  lastCheckedTrack = trackStr;
  
  console.log('[Shorts Blocker] Current track:', trackStr);
  
  addTrackButton();

  if (matchesBlocked(trackStr)) {
    console.log('[Shorts Blocker] Track is blocked, processing...');
    
    // Try to dislike first (if enabled)
    if (autoDislike) {
      tryDislike();
      // Small delay before skipping to ensure dislike registers
      setTimeout(() => tryClickNext(), 300);
    } else {
      tryClickNext();
    }
  }
}

function setupObserver() {
  const obs = new MutationObserver(() => checkAndSkip());
  obs.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
}

function loadState() {
  chrome.storage.sync.get({blockedTracks: [], enabled: true, autoDislike: false}, v => {
    blocked = v.blockedTracks || [];
    enabled = v.enabled;
    autoDislike = v.autoDislike;
    checkAndSkip();
  });
}

function onNav() {
  if (!isShortsUrl()) return;
  lastCheckedTrack = null; // Reset for new video
  setTimeout(checkAndSkip, 50);
  setTimeout(checkAndSkip, 500);
  setTimeout(checkAndSkip, 1500);
}

function init() {
  loadState();
  setupObserver();
  window.addEventListener("yt-navigate-finish", onNav, true);
  window.addEventListener("yt-page-data-updated", onNav, true);
  const wrap = (fn) => function() { fn.apply(this, arguments); onNav(); };
  history.pushState = wrap(history.pushState.bind(history));
  history.replaceState = wrap(history.replaceState.bind(history));
  chrome.storage.onChanged.addListener(ch => {
    if (ch.blockedTracks) blocked = ch.blockedTracks.newValue || [];
    if (ch.enabled) enabled = ch.enabled.newValue;
    if (ch.autoDislike) autoDislike = ch.autoDislike.newValue;
    checkAndSkip();
  });
}

init();