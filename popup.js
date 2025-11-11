const enabledEl = document.getElementById("enabled");
const opts = document.getElementById("opts");
const countEl = document.getElementById("count");
const versionEl = document.getElementById("version");

function load() {
  chrome.storage.sync.get({enabled: true, blockedTracks: []}, v => {
    enabledEl.checked = !!v.enabled;
    const count = v.blockedTracks ? v.blockedTracks.length : 0;
    countEl.textContent = count;
  });
  
  // Get version from manifest
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;
}

enabledEl.addEventListener("change", () => {
  chrome.storage.sync.set({enabled: enabledEl.checked});
});

opts.addEventListener("click", e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Listen for storage changes to update count in real-time
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedTracks) {
    const count = changes.blockedTracks.newValue ? changes.blockedTracks.newValue.length : 0;
    countEl.textContent = count;
  }
  if (changes.enabled) {
    enabledEl.checked = changes.enabled.newValue;
  }
});

document.addEventListener("DOMContentLoaded", load);