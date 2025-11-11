const list = document.getElementById("list");
const input = document.getElementById("track");
const addBtn = document.getElementById("add");
const enabledEl = document.getElementById("enabled");
const autoDislikeEl = document.getElementById("autoDislike");
const trackCount = document.getElementById("trackCount");
const autocompleteEl = document.getElementById("autocomplete");
const versionEl = document.getElementById("version");

let searchTimeout = null;
let selectedIndex = -1;
let searchResults = [];

function render(items) {
  // Update track count
  trackCount.textContent = items.length;
  
  list.innerHTML = "";
  
  // Show empty state if no tracks
  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <img src="icons/icon128.png" alt="No tracks">
        </div>
        <div class="empty-state-text">No blocked tracks yet</div>
        <div class="empty-state-hint">Add a track above to get started</div>
      </div>
    `;
    return;
  }
  
  // Render track items
  items.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "track-item";
    
    const infoDiv = document.createElement("div");
    infoDiv.className = "track-info";
    
    const span = document.createElement("span");
    span.className = "track-name";
    span.textContent = t;
    infoDiv.appendChild(span);
    
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "track-actions";
    
    // YouTube preview button
    const ytBtn = document.createElement("a");
    ytBtn.className = "btn-icon";
    ytBtn.title = "Search on YouTube";
    ytBtn.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}`;
    ytBtn.target = "_blank";
    ytBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    `;
    
    // Spotify preview button
    const spotifyBtn = document.createElement("a");
    spotifyBtn.className = "btn-icon";
    spotifyBtn.title = "Search on Spotify";
    spotifyBtn.href = `https://open.spotify.com/search/${encodeURIComponent(t)}`;
    spotifyBtn.target = "_blank";
    spotifyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    `;
    
    // Remove button
    const del = document.createElement("button");
    del.className = "btn-danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => removeAt(i));
    
    actionsDiv.appendChild(ytBtn);
    actionsDiv.appendChild(spotifyBtn);
    actionsDiv.appendChild(del);
    
    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    list.appendChild(li);
  });
}

function load() {
  chrome.storage.sync.get({blockedTracks: [], enabled: true, autoDislike: false}, v => {
    render(v.blockedTracks || []);
    enabledEl.checked = !!v.enabled;
    autoDislikeEl.checked = !!v.autoDislike;
  });
  
  // Get version from manifest
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;
}

function add() {
  const val = input.value.trim();
  if (!val) return;
  chrome.storage.sync.get({blockedTracks: []}, v => {
    const arr = v.blockedTracks || [];
    if (!arr.includes(val)) {
      arr.push(val);
      chrome.storage.sync.set({blockedTracks: arr}, () => {
        input.value = "";
        render(arr);
        // Add a little success feedback
        addBtn.textContent = "✓ Added!";
        setTimeout(() => {
          addBtn.textContent = "Add Track";
        }, 1500);
      });
    } else {
      // Track already exists
      addBtn.textContent = "Already added!";
      setTimeout(() => {
        addBtn.textContent = "Add Track";
      }, 1500);
    }
  });
}

function removeAt(idx) {
  chrome.storage.sync.get({blockedTracks: []}, v => {
    const arr = v.blockedTracks || [];
    arr.splice(idx, 1);
    chrome.storage.sync.set({blockedTracks: arr}, () => render(arr));
  });
}

// Search for tracks using iTunes API
async function searchTracks(query) {
  if (!query || query.trim().length < 2) {
    hideAutocomplete();
    return;
  }
  
  try {
    showAutocompleteLoading();
    
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`
    );
    
    if (!response.ok) throw new Error('Search failed');
    
    const data = await response.json();
    searchResults = data.results || [];
    
    if (searchResults.length === 0) {
      showAutocompleteEmpty();
    } else {
      showAutocompleteResults(searchResults);
    }
  } catch (error) {
    console.error('Search error:', error);
    hideAutocomplete();
  }
}

function showAutocompleteLoading() {
  autocompleteEl.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
  autocompleteEl.classList.add('active');
}

function showAutocompleteEmpty() {
  autocompleteEl.innerHTML = '<div class="autocomplete-empty">No tracks found</div>';
  autocompleteEl.classList.add('active');
}

function showAutocompleteResults(results) {
  selectedIndex = -1;
  autocompleteEl.innerHTML = '';
  
  results.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.dataset.index = index;
    
    const artwork = track.artworkUrl60 || track.artworkUrl100;
    const trackName = track.trackName;
    const artistName = track.artistName;
    
    item.innerHTML = `
      ${artwork ? `<img src="${artwork}" alt="" class="autocomplete-artwork">` : ''}
      <div class="autocomplete-info">
        <div class="autocomplete-track">${trackName}</div>
        <div class="autocomplete-artist">${artistName}</div>
      </div>
    `;
    
    item.addEventListener('click', () => selectTrack(track));
    autocompleteEl.appendChild(item);
  });
  
  autocompleteEl.classList.add('active');
}

function hideAutocomplete() {
  autocompleteEl.classList.remove('active');
  autocompleteEl.innerHTML = '';
  selectedIndex = -1;
}

function selectTrack(track) {
  const trackStr = `${track.trackName} - ${track.artistName}`;
  input.value = trackStr;
  hideAutocomplete();
  input.focus();
}

function handleKeyboardNavigation(e) {
  const items = autocompleteEl.querySelectorAll('.autocomplete-item');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, -1);
    updateSelection(items);
  } else if (e.key === 'Enter') {
    if (selectedIndex >= 0 && searchResults[selectedIndex]) {
      e.preventDefault();
      selectTrack(searchResults[selectedIndex]);
    }
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
}

function updateSelection(items) {
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

addBtn.addEventListener("click", add);
input.addEventListener("keydown", e => { 
  if (e.key === "Enter" && selectedIndex === -1) {
    add();
  } else {
    handleKeyboardNavigation(e);
  }
});

// Debounced search on input
input.addEventListener("input", e => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (query.length < 2) {
    hideAutocomplete();
    return;
  }
  
  searchTimeout = setTimeout(() => {
    searchTracks(query);
  }, 300); // 300ms debounce
});

// Hide autocomplete when clicking outside
document.addEventListener("click", e => {
  if (!input.contains(e.target) && !autocompleteEl.contains(e.target)) {
    hideAutocomplete();
  }
});

enabledEl.addEventListener("change", () => chrome.storage.sync.set({enabled: enabledEl.checked}));
autoDislikeEl.addEventListener("change", () => chrome.storage.sync.set({autoDislike: autoDislikeEl.checked}));
document.addEventListener("DOMContentLoaded", load);